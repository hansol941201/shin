# -*- coding: utf-8 -*-
"""
최종 PPTX 생성 전에 검증 가능한 중간 산출물을 저장한다.
- 이미지 추출 폴더, 이미지 분류 CSV, 최종 후보 이미지 목록
- 추출 문구 CSV, 콘텐츠 라이브러리 JSON
- 슬라이드 구성 계획 JSON, 슬라이드-원본 매핑표 CSV
"""
import csv
import json
import os
import shutil
from typing import Dict, List


def dump_image_extraction_folder(images: List, debug_dir: str) -> str:
    """PPT별 전체 추출 이미지를 보존용 폴더로 복사한다(회사/현장정보로 배제된 것도 포함,
    사유를 파일명에 남겨 검증 가능하게 한다)."""
    root = os.path.join(debug_dir, "이미지추출")
    for img in images:
        sub = os.path.join(root, img.source_file)
        os.makedirs(sub, exist_ok=True)
        flag = "배제_" if img.banned else ("중복_" if img.is_duplicate_of else "")
        ext = os.path.splitext(img.path)[1]
        dst = os.path.join(sub, f"{flag}slide{img.slide_index+1:03d}_{img.category}_{img.id}{ext}")
        try:
            shutil.copy2(img.path, dst)
        except Exception:
            pass
    return root


def dump_image_classification_csv(images: List, out_path: str) -> str:
    with open(out_path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["이미지ID", "원본파일", "슬라이드번호", "카테고리", "가로", "세로",
                     "배제여부", "배제사유", "중복여부", "중복원본ID", "실제캡션"])
        for img in images:
            w.writerow([
                img.id, img.source_file, img.slide_index + 1, img.category,
                img.width, img.height,
                "Y" if img.banned else "N", "; ".join(img.banned_reasons),
                "Y" if img.is_duplicate_of else "N", img.is_duplicate_of or "",
                img.real_caption or "",
            ])
    return out_path


def dump_final_candidates_csv(images_by_id: Dict, selected_ids: Dict[str, List[str]], out_path: str) -> str:
    with open(out_path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["섹션", "이미지ID", "원본파일", "슬라이드번호", "카테고리"])
        for section, ids in selected_ids.items():
            for iid in ids:
                img = images_by_id.get(iid)
                if not img:
                    continue
                w.writerow([section, iid, img.source_file, img.slide_index + 1, img.category])
    return out_path


def dump_slide_plan_json(slide_plan: List[Dict], out_path: str) -> str:
    def serialize(obj):
        if hasattr(obj, "__dict__"):
            return obj.__dict__
        return str(obj)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(slide_plan, f, ensure_ascii=False, indent=2, default=serialize)
    return out_path


def dump_extracted_text_csv(text_candidates: List, out_path: str) -> str:
    with open(out_path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["원본파일", "슬라이드번호", "원본문구", "문구유형", "민감정보여부", "사용가능여부", "정리된문구"])
        for c in text_candidates:
            w.writerow([c.source_file, c.slide_index + 1, c.original, c.purpose,
                         "Y" if c.sensitive else "N", "Y" if c.usable else "N", c.cleaned])
    return out_path


def dump_content_library_json(library: Dict[str, List[str]], out_path: str) -> str:
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(library, f, ensure_ascii=False, indent=2)
    return out_path


def dump_slide_content_mapping_csv(slide_plan: List[Dict], images_by_id: Dict, out_path: str) -> str:
    """결과 슬라이드 번호별로 어떤 원본 PPT/슬라이드의 사진·문구를 사용했는지 추적표."""
    rows = []
    for page_no, item in enumerate(slide_plan, start=1):
        t = item.get("type")
        img_ids = []
        if "image_id" in item and item["image_id"]:
            img_ids = [item["image_id"]]
        elif "image_ids" in item:
            img_ids = item["image_ids"]
        elif t == "case" and item.get("pair"):
            p = item["pair"]
            img_ids = [p.before_image_id, p.after_image_id] + list(p.process_image_ids or [])
        elif t == "process":
            for step in item.get("steps", []):
                img_ids.extend(step.image_ids)

        text_used = ""
        if t == "reasons":
            text_used = item.get("note", "")
        elif t in ("method_overview",):
            text_used = " / ".join(item.get("items", []))
        elif t == "features":
            text_used = " / ".join(f"{a}:{b}" for a, b in item.get("items", []))
        elif t == "effects":
            text_used = " / ".join(item.get("items", []))
        elif t == "case":
            text_used = item.get("note", "")
        elif t == "process":
            text_used = " | ".join(s.description for s in item.get("steps", []))

        if not img_ids:
            rows.append([page_no, t, "", "", "", text_used])
        for iid in img_ids:
            img = images_by_id.get(iid)
            rows.append([
                page_no, t,
                img.source_file if img else "", (img.slide_index + 1) if img else "",
                iid, text_used,
            ])

    with open(out_path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["결과슬라이드번호", "슬라이드유형", "원본PPT", "원본슬라이드번호", "사용이미지ID", "사용문구(최종)"])
        w.writerows(rows)
    return out_path
