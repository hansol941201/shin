# -*- coding: utf-8 -*-
"""
[v3 엔진] 회사 지식자료 Library.

기존에는 사용자가 "매번" 기존 PPT 2~3개를 골라야 했다. 이 모듈은 회사가 보유한
PPT들을 한 번 등록해두면(knowledge_library/<work_type>/*.pptx) 프로그램이 이를
내부 지식자료로 축적해 여러 아파트의 자료 생성에 반복 재사용할 수 있게 한다.

폴더 구조:
    knowledge_library/
        repainting/   *.pptx
        waterproof/   *.pptx
        parking/      *.pptx
        repair/       *.pptx
        asphalt/      *.pptx
        metal_roof/   *.pptx

인덱싱 결과는 knowledge_library/.cache/ 아래에 파일별로 캐시한다(파일 mtime+크기
기준 서명이 바뀌지 않으면 재파싱하지 않음 - 자료가 많아져도 매 실행마다 전체를
다시 읽지 않도록). 자료를 새로 추가/교체하면 다음 실행 시 자동으로 갱신된다.
"""
import json
import os
import shutil
from typing import Dict, List, Optional, Tuple

from PIL import Image as _PILImage

from app.anonymizer.anonymizer import build_blacklist, evaluate_image
from app.content_selector.text_analyzer import build_content_library, build_text_candidates
from app.engine.captions import apply_captions
from app.image_classifier.classifier import classify_all, dedupe_images, detect_before_after_pairs
from app.image_extractor.extractor import extract_images
from app.photo_analyzer.analyzer import analyze_all_photos
from app.ppt_parser.parser import make_workcopy, parse_presentation
from app.utils.config import WORK_TYPE_CODE
from app.utils.models import ImageAsset, KnowledgeEntry

KNOWLEDGE_WORK_TYPES = sorted(set(WORK_TYPE_CODE.values()))
MAX_IMAGES_PER_ROLE_PER_FILE = 6  # 파일 1개당 역할별 대표 지식자료 사진 상한(인덱스 비대화 방지)


def _file_signature(path: str) -> str:
    st = os.stat(path)
    return f"{int(st.st_mtime)}_{st.st_size}"


def _cache_file_paths(cache_dir: str, work_type: str, filename: str) -> Tuple[str, str]:
    stem = os.path.splitext(filename)[0]
    base_dir = os.path.join(cache_dir, work_type, stem)
    return os.path.join(base_dir, "meta.json"), os.path.join(base_dir, "images")


def _ingest_one_file(path: str, work_type: str, cache_dir: str, temp_dir: str,
                       logs: Optional[List[str]] = None) -> Tuple[List[dict], List[dict]]:
    """PPT 1개를 파싱해 (text_entries, image_entries)를 만든다. 캐시가 최신이면 재사용."""
    fname = os.path.basename(path)
    meta_path, img_cache_dir = _cache_file_paths(cache_dir, work_type, fname)
    sig = _file_signature(path)

    if os.path.exists(meta_path):
        try:
            with open(meta_path, "r", encoding="utf-8") as f:
                cached = json.load(f)
            if cached.get("signature") == sig:
                if logs is not None:
                    logs.append(f"[Knowledge] {work_type}/{fname}: 캐시 재사용(변경 없음)")
                return cached["text_entries"], cached["image_entries"]
        except Exception:
            pass

    if logs is not None:
        logs.append(f"[Knowledge] {work_type}/{fname}: 신규/변경 감지 - 재색인 진행")

    work_copy = make_workcopy(path, temp_dir)
    slides, texts, prs = parse_presentation(work_copy, fname)
    blacklist = build_blacklist(texts, [], apartment_name="")
    text_candidates = build_text_candidates(texts, blacklist)
    library = build_content_library(text_candidates, max_per_purpose=30)

    images = extract_images(prs, fname, slides, temp_dir, run_ocr=True)
    for img in images:
        evaluate_image(img, blacklist)
    classify_all(images)
    dedupe_images(images)
    detect_before_after_pairs(images, slides)
    analyze_all_photos(images)
    for img in images:
        img.source_type = "reference_ppt"
        # 사진 자체의 문구만으로 판정한 work_type(휴리스틱)보다, 이 파일이 등록된
        # knowledge_library/<work_type>/ 폴더가 훨씬 신뢰도 높은 근거이므로 덮어쓴다.
        img.work_type = work_type
    apply_captions([i for i in images if not i.is_duplicate_of and not i.banned])

    text_entries = []
    for purpose, phrases in library.items():
        for i, phrase in enumerate(phrases):
            text_entries.append({
                "id": f"{work_type}_{os.path.splitext(fname)[0]}_t{purpose}_{i}",
                "work_type": work_type, "category": purpose,
                "keywords": _extract_keywords(phrase),
                "title": phrase[:20], "text": phrase,
                "source_file": fname, "source_slide": 0,
            })

    os.makedirs(img_cache_dir, exist_ok=True)
    by_role: Dict[str, List[ImageAsset]] = {}
    for img in images:
        if img.banned or img.is_duplicate_of:
            continue
        by_role.setdefault(img.photo_role, []).append(img)

    image_entries = []
    ba_before_ids = {img.id for img in images if img.ba_role == "before"}
    ba_after_ids = {img.id for img in images if img.ba_role == "after"}
    for role, imgs in by_role.items():
        imgs.sort(key=lambda i: i.quality_score, reverse=True)
        for img in imgs[:MAX_IMAGES_PER_ROLE_PER_FILE]:
            cached_path = os.path.join(img_cache_dir, os.path.basename(img.path))
            try:
                shutil.copy2(img.path, cached_path)
            except Exception:
                continue
            ba_tag = "before" if img.id in ba_before_ids else ("after" if img.id in ba_after_ids else None)
            image_entries.append({
                "id": f"{work_type}_{os.path.splitext(fname)[0]}_i{img.id}",
                "work_type": work_type, "category": img.category,
                "keywords": [img.category], "title": img.real_caption or "",
                "text": img.real_caption or "", "source_file": fname,
                "source_slide": img.slide_index + 1,
                "image_path": cached_path, "image_role": ba_tag or role,
            })

    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump({"signature": sig, "text_entries": text_entries,
                    "image_entries": image_entries}, f, ensure_ascii=False)

    if logs is not None:
        logs.append(f"[Knowledge] {work_type}/{fname}: 문구 {len(text_entries)}건, "
                     f"사진 {len(image_entries)}건 색인 완료")
    return text_entries, image_entries


def _extract_keywords(phrase: str, max_n: int = 6) -> List[str]:
    import re
    tokens = re.split(r"[\s,·./()·\-]+", phrase)
    return [t for t in tokens if len(t) >= 2][:max_n]


def build_knowledge_index(knowledge_dir: str, cache_dir: Optional[str] = None,
                            temp_dir: Optional[str] = None,
                            logs: Optional[List[str]] = None) -> Tuple[List[KnowledgeEntry], List[ImageAsset]]:
    """knowledge_dir 아래 <work_type>/*.pptx 를 모두 색인해 KnowledgeEntry/ImageAsset 목록을 만든다.
    폴더/파일이 없으면 빈 목록을 반환한다(오류로 취급하지 않음 - 회사 자료가 아직 없을 수도 있음)."""
    cache_dir = cache_dir or os.path.join(knowledge_dir, ".cache")
    temp_dir = temp_dir or os.path.join(cache_dir, "_tmp")
    os.makedirs(temp_dir, exist_ok=True)

    all_text_entries: List[dict] = []
    all_image_entries: List[dict] = []

    if not os.path.isdir(knowledge_dir):
        if logs is not None:
            logs.append(f"[Knowledge] 지식자료 폴더가 없습니다: {knowledge_dir} (빈 라이브러리로 진행)")
        return [], []

    for work_type in KNOWLEDGE_WORK_TYPES:
        wt_dir = os.path.join(knowledge_dir, work_type)
        if not os.path.isdir(wt_dir):
            continue
        files = sorted(f for f in os.listdir(wt_dir) if f.lower().endswith((".pptx", ".ppt")))
        if not files:
            continue
        if logs is not None:
            logs.append(f"[Knowledge] {work_type}: 등록된 자료 {len(files)}개 발견")
        for fname in files:
            fpath = os.path.join(wt_dir, fname)
            try:
                t_entries, i_entries = _ingest_one_file(fpath, work_type, cache_dir, temp_dir, logs)
                all_text_entries.extend(t_entries)
                all_image_entries.extend(i_entries)
            except Exception as e:
                if logs is not None:
                    logs.append(f"[Knowledge] {work_type}/{fname}: 색인 실패({type(e).__name__}: {e}) - 건너뜀")

    entries = [KnowledgeEntry(**e) for e in all_text_entries]
    images: List[ImageAsset] = []
    for e in all_image_entries:
        try:
            with _PILImage.open(e["image_path"]) as im:
                w, h = im.size
        except Exception:
            w, h = 1600, 1200
        images.append(ImageAsset(
            id=e["id"], source_file=e["source_file"], slide_index=e["source_slide"],
            shape_name=e["category"], path=e["image_path"], width=w, height=h,
            category=e["category"], real_caption=e.get("text") or None,
            source_type="reference_ppt", photo_role=e.get("image_role", "reference"),
            work_type=e.get("work_type", ""), quality_score=float(w * h),
        ))

    if logs is not None:
        logs.append(f"[Knowledge] 색인 완료 - 문구 {len(entries)}건, 사진 {len(images)}장 "
                     f"(공종 {sum(1 for wt in KNOWLEDGE_WORK_TYPES if os.path.isdir(os.path.join(knowledge_dir, wt)))}개 폴더 스캔)")
    return entries, images
