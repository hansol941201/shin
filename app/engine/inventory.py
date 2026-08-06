# -*- coding: utf-8 -*-
"""
원본 자료 인벤토리 생성 (v2 엔진).
PPT 생성 전에 원본 사진/문구가 몇 개 있었고, 몇 개가 최종적으로 쓰였으며 무엇이
제외됐는지 추적 가능한 파일들을 만든다.
"""
import csv
import json
import os
from collections import defaultdict
from typing import Dict, List


def dump_source_slides_csv(slides, out_path: str) -> str:
    with open(out_path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["sourceFile", "sourceSlide", "title", "isPortrait", "hasBeforeAfterLabels",
                     "imageCount", "textCount"])
        img_count = defaultdict(int)
        for s in slides:
            w.writerow([s.source_file, s.index + 1, s.title_text[:60], s.is_portrait,
                         s.has_before_after_labels, len(s.image_ids), len(s.all_text.split("\n"))])
    return out_path


def dump_source_images_csv(images: List, out_path: str) -> str:
    with open(out_path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["imageId", "sourceFile", "sourceSlide", "originalWidth", "originalHeight",
                     "fileSize", "perceptualHash", "nearbyText", "slideTitle", "inferredCategory",
                     "inferredProcess", "inferredDefect", "confidence", "exclusionReason",
                     "selected", "selectedSlide"])
        for img in images:
            try:
                file_size = os.path.getsize(img.path)
            except Exception:
                file_size = 0
            title = img.nearby_text.split("\n")[0][:60] if img.nearby_text else ""
            is_defect = img.category.startswith("외벽_하자") or img.category in ("누수_흔적", "철근_노출")
            is_process = img.category in ("세척_작업", "균열_보수", "퍼티_작업", "바탕_정리", "하도",
                                            "중도", "상도", "방수층", "시트_설치", "지붕_작업",
                                            "코킹_실링", "양생")
            w.writerow([
                img.id, img.source_file, img.slide_index + 1, img.width, img.height, file_size,
                img.phash or "", (img.nearby_text or "")[:120].replace("\n", " / "), title,
                img.category, img.category if is_process else "", img.category if is_defect else "",
                round(img.confidence, 3),
                "; ".join(img.banned_reasons) if img.banned else ("중복" if img.is_duplicate_of else ""),
                img.selected, img.selected_slide or "",
            ])
    return out_path


def dump_source_texts_csv(candidates: List, relationships: Dict[str, List[str]], out_path: str) -> str:
    with open(out_path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["textId", "sourceFile", "sourceSlide", "text", "textType", "nearbyImageIds",
                     "category", "importance", "selected", "selectedSlide"])
        for c in candidates:
            imgs = relationships.get(c.text_id, [])
            w.writerow([c.text_id, c.source_file, c.slide_index + 1, c.cleaned, c.purpose,
                         ";".join(imgs), c.purpose, round(c.importance, 3), c.selected,
                         c.selected_slide or ""])
    return out_path


def build_image_text_relationships(images: List, candidates: List) -> Dict[str, List[str]]:
    """같은 슬라이드에 있는 사진-문구를 서로 연결한다(사진 id -> 관련 텍스트 id 목록)."""
    text_by_slide: Dict[tuple, List] = defaultdict(list)
    for c in candidates:
        if c.usable:
            text_by_slide[(c.source_file, c.slide_index)].append(c)

    rel: Dict[str, List[str]] = {}
    for img in images:
        key = (img.source_file, img.slide_index)
        rel[img.id] = [c.text_id for c in text_by_slide.get(key, [])]
    return rel


def dump_image_text_relationships_csv(rel: Dict[str, List[str]], out_path: str) -> str:
    with open(out_path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["imageId", "relatedTextIds", "relatedTextCount"])
        for iid, tids in rel.items():
            w.writerow([iid, ";".join(tids), len(tids)])
    return out_path


def dump_unused_content_csv(images: List, candidates: List, out_path: str) -> str:
    with open(out_path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["type", "id", "sourceFile", "sourceSlide", "reason"])
        for img in images:
            if not img.selected:
                reason = "; ".join(img.banned_reasons) if img.banned else \
                    ("중복" if img.is_duplicate_of else "미사용(선정 제외)")
                w.writerow(["image", img.id, img.source_file, img.slide_index + 1, reason])
        for c in candidates:
            if not c.selected:
                reason = "민감정보" if c.sensitive else ("사용 가능 기준 미달" if not c.usable else "미사용(선정 제외)")
                w.writerow(["text", c.text_id, c.source_file, c.slide_index + 1, reason])
    return out_path


def dump_content_groups_json(groups: List[dict], out_path: str) -> str:
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(groups, f, ensure_ascii=False, indent=2, default=str)
    return out_path
