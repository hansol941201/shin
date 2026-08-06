# -*- coding: utf-8 -*-
"""
선별된 콘텐츠를 바탕으로 최종 PPT의 슬라이드 구조(8~12페이지 내외)를 계획한다.
입력 자료의 양에 따라 유동적으로 페이지 수를 조정한다(부족하면 축소, 사례가 많으면 확장하지 않고 상한 유지).
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
    "기대 효과",
]


def build_content_plan(apartment_name: str, work_type: str, cover_image_id,
                        defect_ids: List[str], method_ids: List[str], feature_ids: List[str],
                        process_steps: List[ProcessStep], ba_pairs: List[BeforeAfterPair],
                        effect_ids: List[str], warnings: List[str]) -> ContentPlan:
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
    )


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

    slides.append({
        "type": "toc",
        "items": TOC_ITEMS,
    })

    if plan.defect_image_ids:
        slides.append({
            "type": "reasons",
            "title": "공사가 필요한 이유",
            "image_ids": plan.defect_image_ids,
            "note": "외벽 노후화는 미관 저하뿐 아니라 균열과 수분 침투를 유발할 수 있으므로 "
                    "적절한 보수와 공사가 필요합니다.",
        })

    if plan.method_image_ids:
        slides.append({
            "type": "method_overview",
            "title": "공법 개요",
            "image_ids": plan.method_image_ids,
            "items": [
                "내구성 높은 시공 시스템",
                "체계적인 시공 관리",
                "균열 및 손상부 선보수",
                "안전한 작업 절차",
                "외벽 미관 개선",
            ],
        })

    if plan.feature_image_ids:
        slides.append({
            "type": "features",
            "title": "공법 특징",
            "image_ids": plan.feature_image_ids,
            "items": [
                ("우수한 내구성", "오랜 기간 성능이 유지되는 시공 시스템을 적용합니다."),
                ("뛰어난 방수성", "표면을 보호하여 수분 침투를 최소화합니다."),
                ("균열 및 손상부 보수", "선보수를 통해 하자 부위를 안정적으로 정리합니다."),
                ("미관 개선", "깨끗하고 균일한 외관으로 마감합니다."),
                ("유지관리 용이", "표면 관리가 쉬운 마감으로 시공합니다."),
            ],
        })

    if plan.process_steps:
        slides.append({
            "type": "process",
            "title": "시공 순서",
            "steps": plan.process_steps,
        })

    for i, pair in enumerate(plan.ba_pairs, start=1):
        slides.append({
            "type": "case",
            "title": f"유사 시공 사례 {['①','②','③','④','⑤'][min(i-1,4)]}",
            "work_desc": f"외벽 전면 {plan.work_type}",
            "pair": pair,
            "note": "노후화되고 오염된 외벽을 보수한 후 재시공하여 건물 외관과 내구성을 개선한 사례입니다.",
        })

    if plan.effect_image_ids:
        slides.append({
            "type": "effects",
            "title": "기대 효과",
            "image_ids": plan.effect_image_ids,
            "items": ["건물 가치 향상", "외벽 수명 연장", "주거 만족도 향상",
                       "미관 개선", "유지관리 비용 절감", "안전성 향상"],
        })

    slides.append({
        "type": "closing",
        "message": "안전하고 쾌적한 우리 아파트를 위해 체계적인 공사를 제안합니다.",
    })

    return slides
