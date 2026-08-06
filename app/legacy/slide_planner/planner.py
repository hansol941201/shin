# -*- coding: utf-8 -*-
"""
선별된 콘텐츠를 바탕으로 최종 PPT의 슬라이드 구조(10~15페이지 내외)를 계획한다.
입력 자료의 양에 따라 유동적으로 페이지 수를 조정하되, 원본 사진을 최대한 활용하기 위해
분량이 많으면 하자/갤러리 페이지를 여러 장으로 나눈다.
"""
from typing import Dict, List

from app.utils.models import BeforeAfterPair, ContentPlan, ProcessStep

WORK_TYPE_TITLE = {
    "재도장": "재도장 제안서",
    "방수": "방수 공사 제안서",
    "보수·보강": "보수·보강 공사 제안서",
    "아스콘": "아스콘 포장 제안서",
    "기타": "공사 제안서",
}

WORK_TYPE_SUBTITLE = {
    "재도장": "깨끗하고 안전한 주거환경을 위한 재도장 안내",
    "방수": "안전하고 쾌적한 주거환경을 위한 방수공사 안내",
    "보수·보강": "안전한 주거환경을 위한 보수·보강 공사 안내",
    "아스콘": "쾌적한 단지 환경을 위한 아스콘 포장 안내",
    "기타": "쾌적한 주거환경을 위한 공사 안내",
}

TOC_ITEMS = [
    "공사가 필요한 이유",
    "주요 하자 및 문제점",
    "공법 개요",
    "공법 특징",
    "시공 순서",
    "유사 시공 사례",
    "참고 시공 사진",
    "기대 효과",
]

DEFECT_PAGE_SIZE = 6      # 하자 사진 한 페이지당 최대 장 수 (6~9장 요구 시 2페이지로 분할)
GALLERY_PAGE_SIZE = 6
MAX_TOTAL_PAGES = 15


def build_content_plan(apartment_name: str, work_type: str, cover_image_id,
                        defect_ids: List[str], method_ids: List[str], feature_ids: List[str],
                        process_steps: List[ProcessStep], ba_pairs: List[BeforeAfterPair],
                        effect_ids: List[str], warnings: List[str],
                        gallery_ids: List[str] = None, method_items: List[str] = None,
                        feature_items=None, effect_items: List[str] = None,
                        reason_note: str = "", case_notes: List[str] = None) -> ContentPlan:
    return ContentPlan(
        apartment_name=apartment_name,
        work_type=work_type,
        cover_image_id=cover_image_id,
        defect_image_ids=defect_ids,
        method_image_ids=method_ids,
        feature_image_ids=feature_ids,
        process_steps=process_steps,
        ba_pairs=ba_pairs,
        effect_image_ids=effect_ids,
        warnings=warnings,
        gallery_image_ids=gallery_ids or [],
        method_items=method_items or [],
        feature_items=feature_items or [],
        effect_items=effect_items or [],
        reason_note=reason_note,
        case_notes=case_notes or [],
    )


def _chunk(lst: List[str], size: int) -> List[List[str]]:
    return [lst[i:i + size] for i in range(0, len(lst), size)] or [[]]


def plan_slides(plan: ContentPlan) -> List[Dict]:
    slides: List[Dict] = []

    slides.append({
        "type": "cover",
        "apartment_name": plan.apartment_name,
        "title": f"{plan.apartment_name} {WORK_TYPE_TITLE.get(plan.work_type, '공사 제안서')}",
        "subtitle": WORK_TYPE_SUBTITLE.get(plan.work_type, WORK_TYPE_SUBTITLE["기타"]),
        "image_id": plan.cover_image_id,
        "highlights": ["안전성 향상", "건물 수명 연장", "미관 개선", "자산 가치 향상"],
    })

    slides.append({"type": "toc", "items": TOC_ITEMS})

    # 재도장이 필요한 이유: 6~9장 목표 -> 페이지당 6장씩 분할
    defect_chunks = _chunk(plan.defect_image_ids, DEFECT_PAGE_SIZE)
    for idx, chunk in enumerate(defect_chunks):
        if not chunk:
            continue
        slides.append({
            "type": "reasons",
            "title": "공사가 필요한 이유" + (f" ({idx+1}/{len(defect_chunks)})" if len(defect_chunks) > 1 else ""),
            "image_ids": chunk,
            "note": plan.reason_note,
        })

    if plan.method_image_ids or plan.method_items:
        slides.append({
            "type": "method_overview",
            "title": "공법 개요",
            "image_ids": plan.method_image_ids,
            "items": plan.method_items,
        })

    if plan.feature_image_ids or plan.feature_items:
        slides.append({
            "type": "features",
            "title": "공법 특징",
            "image_ids": plan.feature_image_ids,
            "items": plan.feature_items,
        })

    if plan.process_steps:
        slides.append({
            "type": "process",
            "title": "시공 순서",
            "steps": plan.process_steps,
        })

    notes_pool = plan.case_notes or ["노후화되고 오염된 외벽을 보수한 후 재시공하여 건물 외관과 내구성을 개선한 사례입니다."]
    for i, pair in enumerate(plan.ba_pairs, start=1):
        slides.append({
            "type": "case",
            "title": f"유사 시공 사례 {['①','②','③','④','⑤','⑥'][min(i-1,5)]}",
            "work_desc": f"외벽 전면 {plan.work_type}",
            "pair": pair,
            "note": notes_pool[(i - 1) % len(notes_pool)],
        })

    # 남은 사진을 최대한 활용하는 참고 시공 사진 갤러리 페이지(중립 캡션)
    gallery_chunks = _chunk(plan.gallery_image_ids, GALLERY_PAGE_SIZE)
    remaining_page_budget = max(0, MAX_TOTAL_PAGES - len(slides) - 2)  # 효과/마무리 페이지 몫 확보
    for idx, chunk in enumerate(gallery_chunks[:remaining_page_budget]):
        if not chunk:
            continue
        slides.append({
            "type": "gallery",
            "title": "참고 시공 사진" + (f" ({idx+1}/{len(gallery_chunks)})" if len(gallery_chunks) > 1 else ""),
            "image_ids": chunk,
        })

    if plan.effect_image_ids or plan.effect_items:
        slides.append({
            "type": "effects",
            "title": "기대 효과",
            "image_ids": plan.effect_image_ids,
            "items": plan.effect_items,
        })

    slides.append({
        "type": "closing",
        "message": "안전하고 쾌적한 우리 아파트를 위해 체계적인 공사를 제안합니다.",
    })

    return slides
