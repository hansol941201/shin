# -*- coding: utf-8 -*-
"""
v2 콘텐츠 중심 파이프라인 오케스트레이터.
고정 템플릿에 내용을 끼워 맞추는 대신, 원본 사진/문구의 실제 분량과 맥락에 따라
페이지 구조를 스스로 결정하고, 품질 점수가 기준(85점) 미만이면 재구성한다.
"""
import datetime
import os
import tempfile
from typing import Callable, List, Optional

from app.anonymizer.anonymizer import build_blacklist, evaluate_image
from app.content_selector import selector as cs
from app.content_selector.text_analyzer import (
    attach_real_captions, build_content_library, build_text_candidates,
)
from app.engine import inventory as inv
from app.utils import debug_dump as dd
from app.engine import quality as qmod
from app.engine import render_check as rc
from app.engine.generator2 import generate_pptx_v2
from app.engine.grouping import build_groups, groups_to_json
from app.engine.story import build_pages
from app.image_classifier.classifier import classify_all, dedupe_images, detect_before_after_pairs
from app.image_extractor.extractor import extract_images
from app.ppt_parser.parser import make_workcopy, parse_presentation
from app.utils.pdf_tools import convert_to_pdf
from app.validator.validator import validate_and_fix

STAGES_V2 = [
    "PPT 분석 중", "이미지 추출 중", "문구 분석 중", "기존 정보 제거 중",
    "사진 분류 중", "사진·문구 관계 분석 중", "스토리 구성 중",
    "PowerPoint 생성 중", "검수 중", "품질 평가 중", "시각 검증 중", "완료",
]


def _log(logs: List[str], msg: str):
    logs.append(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] {msg}")


def _report(cb, stage):
    if cb:
        cb(stage)


def run_pipeline_v2(apartment_name: str, work_type: str, input_paths: List[str], output_dir: str,
                     progress_cb: Optional[Callable[[str], None]] = None) -> dict:
    logs: List[str] = []
    _log(logs, f"[v2 엔진] 입력 검증 - 아파트명='{apartment_name}', 공종='{work_type}', 파일수={len(input_paths)}")

    if not apartment_name or not apartment_name.strip():
        raise ValueError("새 아파트명을 입력해야 합니다.")
    if len(input_paths) < 2 or len(input_paths) > 3:
        raise ValueError("기존 PPT 파일은 2개 또는 3개를 입력해야 합니다.")
    for p in input_paths:
        if not os.path.exists(p):
            raise FileNotFoundError(f"파일을 찾을 수 없습니다: {p}")

    os.makedirs(output_dir, exist_ok=True)
    temp_root = tempfile.mkdtemp(prefix="auto_material_")
    safe_name = "".join(c for c in apartment_name if c not in '\\/:*?"<>|').strip() or "새아파트"

    # ---------- 1. PPT 분석 ----------
    _report(progress_cb, STAGES_V2[0])
    all_slides, all_texts, source_files, prs_objects = [], [], [], []
    for i, path in enumerate(input_paths):
        label = f"입력파일{i+1}"
        source_files.append(label)
        work_copy = make_workcopy(path, temp_root)
        slides, texts, prs = parse_presentation(work_copy, label)
        all_slides.extend(slides)
        all_texts.extend(texts)
        prs_objects.append((label, prs))
        _log(logs, f"{label}({os.path.basename(path)}) - 슬라이드 {len(slides)}개, 텍스트조각 {len(texts)}건")
    _log(logs, f"[집계] 입력 PPT 전체 슬라이드 수: {len(all_slides)}장")

    # ---------- 2. 이미지 추출 ----------
    _report(progress_cb, STAGES_V2[1])
    all_images = []
    for label, prs in prs_objects:
        slides_for_file = [s for s in all_slides if s.source_file == label]
        imgs = extract_images(prs, label, slides_for_file, temp_root, run_ocr=True)
        all_images.extend(imgs)
        _log(logs, f"[집계] {label} 추출 이미지 수: {len(imgs)}장")
    _log(logs, f"[집계] 전체 추출 이미지 수: {len(all_images)}장")

    # ---------- 3. 문구 분석 ----------
    _report(progress_cb, STAGES_V2[2])
    blacklist = build_blacklist(all_texts, all_images, apartment_name)
    text_candidates = build_text_candidates(all_texts, blacklist)
    _log(logs, f"[집계] 전체 텍스트 조각 {len(text_candidates)}개 중 재사용 가능 "
               f"{sum(1 for c in text_candidates if c.usable)}개")
    content_library = build_content_library(text_candidates, max_per_purpose=20)

    # ---------- 4. 민감정보 제거 ----------
    _report(progress_cb, STAGES_V2[3])
    for img in all_images:
        evaluate_image(img, blacklist)
    banned_count = sum(1 for i in all_images if i.banned)
    _log(logs, f"[집계] 민감정보로 배제된 이미지: {banned_count}장")

    # ---------- 5. 분류 + 중복 제거 + 전후 탐지 ----------
    _report(progress_cb, STAGES_V2[4])
    classify_all(all_images)
    dedupe_images(all_images)
    dup_count = sum(1 for i in all_images if i.is_duplicate_of)
    _log(logs, f"[집계] 중복으로 제외된 이미지: {dup_count}장")
    detect_before_after_pairs(all_images, all_slides)
    attach_real_captions(all_images, text_candidates)

    images_by_id = {i.id: i for i in all_images}
    valid_images = [i for i in all_images if not i.banned and not i.is_duplicate_of]
    _log(logs, f"[집계] 유효(사용 가능) 이미지 수: {len(valid_images)}장")

    # ---------- 6. 관계 분석 + 그룹핑 ----------
    _report(progress_cb, STAGES_V2[5])
    relationships = inv.build_image_text_relationships(all_images, text_candidates)
    groups = build_groups(all_images, text_candidates)
    _log(logs, f"[집계] 콘텐츠 그룹(공정/사건 단위) 수: {len(groups)}개")

    cover_id = cs.select_cover_image(all_images)
    cover_image = images_by_id.get(cover_id) if cover_id else None
    ba_pairs = cs.build_before_after_cases(all_images, max_cases=10)

    # ---------- 7. 스토리 구성 (품질 미달 시 1회 재구성) ----------
    _report(progress_cb, STAGES_V2[6])
    attempt = 0
    quality_report = None
    pages = None
    while attempt < 2:
        attempt += 1
        for img in all_images:
            img.selected = False
            img.selected_slide = None
            img.caption_is_original = False
        used_ids = set()
        pages = build_pages(apartment_name, work_type, groups, content_library, ba_pairs,
                              cover_image, used_ids, images_by_id)
        _log(logs, f"[시도 {attempt}] 스토리 구성 완료 - 총 {len(pages)}페이지")

        out_pptx = os.path.join(output_dir, f"{safe_name}_{work_type}_입주민설명자료.pptx")
        generate_pptx_v2(pages, images_by_id, out_pptx)

        report = validate_and_fix(out_pptx, blacklist, apartment_name)

        used_original_phrases = set()
        for p in pages:
            for b in p.get("bullets", []):
                used_original_phrases.add(b)

        quality_report = qmod.compute_quality(all_images, pages, content_library,
                                                used_original_phrases, report)
        _log(logs, f"[시도 {attempt}] 품질 점수: {quality_report.total}/100 "
                   f"({'PASS' if quality_report.passed else 'FAIL'})")
        if quality_report.passed or attempt >= 2:
            break
        _log(logs, f"[시도 {attempt}] 기준 미달 - 재구성: {', '.join(quality_report.fail_reasons)}")

    _report(progress_cb, STAGES_V2[7])

    # ---------- 8. 검수 (이미 위 루프에서 수행됨, 최종본 재검수) ----------
    _report(progress_cb, STAGES_V2[8])
    final_validation = validate_and_fix(out_pptx, blacklist, apartment_name)

    # ---------- 9. 품질 평가 결과 저장 ----------
    _report(progress_cb, STAGES_V2[9])
    debug_dir = os.path.join(output_dir, f"{safe_name}_중간산출물")
    os.makedirs(debug_dir, exist_ok=True)
    for img in all_images:
        pass
    dd.dump_image_extraction_folder(all_images, debug_dir)
    inv.dump_source_slides_csv(all_slides, os.path.join(debug_dir, "source_slides.csv"))
    inv.dump_source_images_csv(all_images, os.path.join(debug_dir, "source_images.csv"))
    inv.dump_source_texts_csv(text_candidates, relationships, os.path.join(debug_dir, "source_texts.csv"))
    inv.dump_image_text_relationships_csv(relationships,
                                            os.path.join(debug_dir, "image_text_relationships.csv"))
    inv.dump_unused_content_csv(all_images, text_candidates, os.path.join(debug_dir, "unused_content.csv"))
    inv.dump_content_groups_json(groups_to_json(groups), os.path.join(debug_dir, "content_groups.json"))

    with open(os.path.join(debug_dir, "품질점수.txt"), "w", encoding="utf-8") as f:
        f.write(qmod.report_text(quality_report))

    # ---------- 10. 시각 검증 ----------
    _report(progress_cb, STAGES_V2[10])
    pdf_path = convert_to_pdf(out_pptx, output_dir)
    contact_sheet_path, slide_png_paths = (None, [])
    visual = None
    if pdf_path:
        wanted_pdf = os.path.join(output_dir, f"{safe_name}_{work_type}_입주민설명자료.pdf")
        if pdf_path != wanted_pdf:
            os.replace(pdf_path, wanted_pdf)
            pdf_path = wanted_pdf
        render_dir = os.path.join(debug_dir, "슬라이드렌더링")
        os.makedirs(render_dir, exist_ok=True)
        contact_sheet_path, slide_png_paths = rc.render_slides_and_contact_sheet(pdf_path, render_dir, safe_name)
        visual = rc.visual_validation(out_pptx)
        rc.dump_visual_validation_json(visual, os.path.join(debug_dir, "visual_validation.json"))
        _log(logs, f"시각 검증 완료 - contact_sheet: {contact_sheet_path}")
    else:
        _log(logs, "LibreOffice를 찾을 수 없어 PDF/시각 검증을 건너뛰었습니다.")

    # ---------- 최종 집계 로그 ----------
    inserted_count = sum(s["picture_count"] for s in visual["slides"]) if visual else \
        sum(1 for i in all_images if i.selected)
    _log(logs, f"[집계] 실제 PPT 삽입 이미지 수(재오픈 검증): {inserted_count}장 / {len(pages)-1}페이지")
    _log(logs, f"[집계] 사진 활용률: {quality_report.metrics.get('photo_utilization', 0)*100:.1f}%")
    _log(logs, f"[집계] 원본 문구 활용률: {quality_report.metrics.get('text_utilization', 0)*100:.1f}%")
    _log(logs, f"[집계] 최종 품질 점수: {quality_report.total}/100 ({'PASS' if quality_report.passed else 'FAIL'})")

    report_path = os.path.join(output_dir, f"{safe_name}_검수결과.txt")
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(final_validation.as_text())
        f.write("\n\n")
        f.write(qmod.report_text(quality_report))

    log_path = os.path.join(output_dir, f"{safe_name}_처리로그.txt")
    with open(log_path, "w", encoding="utf-8") as f:
        f.write("\n".join(logs))

    _report(progress_cb, STAGES_V2[11])

    warnings = list(quality_report.fail_reasons)

    return {
        "pptx": out_pptx,
        "pdf": pdf_path,
        "preview_png": contact_sheet_path,
        "log": log_path,
        "validation_report": report_path,
        "debug_dir": debug_dir,
        "inserted_image_count": inserted_count,
        "total_usable_image_count": len(valid_images),
        "quality_score": quality_report.total,
        "quality_passed": quality_report.passed,
        "warnings": warnings,
        "validation": final_validation,
        "temp_dir": temp_root,
        "page_count": len(pages) - 1,
    }
