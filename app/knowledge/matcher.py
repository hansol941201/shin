# -*- coding: utf-8 -*-
"""
[v3 엔진] 사진 -> 회사 지식자료 자동 연결.

photo_analyzer의 분석 결과(work_type/photo_role/defect_type/process_type)를 가지고
Knowledge Library에서 관련 문구/사진을 찾는다. 인터넷 정보를 추가하지 않고, 회사가
실제로 보유한 자료(KnowledgeEntry)에서만 고른다.
"""
from typing import Dict, List, Optional

from app.utils.config import TEXT_PURPOSE_KEYWORDS
from app.utils.models import ImageAsset, KnowledgeEntry

# defect_type/process_type(영문 슬러그) -> 검색에 사용할 한글 키워드(카테고리 slug와
# 무관하게, 회사 자료 문구 안에서 실제로 쓰였을 법한 표현으로 넓게 잡는다).
DEFECT_TYPE_SEARCH_TERMS = {
    "crack": ["균열", "크랙", "갈라짐"], "peeling": ["박리", "들뜸", "탈락"],
    "staining": ["오염", "얼룩"], "mold": ["곰팡이", "백태"], "discoloration": ["변색", "백화"],
    "water_leak": ["누수"], "rebar_exposure": ["철근노출"], "aged_surface": ["노후", "기존상태"],
    "parking_surface_damage": ["주차장", "바닥파손"], "roof_damage": ["지붕누수", "지붕파손"],
}
PROCESS_TYPE_SEARCH_TERMS = {
    "washing": ["세척", "고압세척"], "crack_repair": ["균열보수"], "putty_work": ["퍼티"],
    "surface_prep": ["바탕정리"], "primer_coat": ["하도"], "mid_coat": ["중도"], "top_coat": ["상도"],
    "painting": ["도장"], "waterproof_layer": ["방수층"], "sheet_waterproofing": ["시트방수"],
    "urethane_waterproofing": ["우레탄방수", "도막방수"], "roof_work": ["지붕"], "caulking": ["코킹", "실링"],
    "curing": ["양생"], "safety_work": ["안전"], "structural_reinforcement": ["보강", "탄소섬유"],
    "parking_floor_work": ["에폭시", "주차장바닥"], "asphalt_paving": ["아스콘", "포장"],
}

# Story Engine 섹션(요청사항 11) -> 검색 대상 지식자료 category(TEXT_PURPOSE_KEYWORDS 키와 동일 축)
SECTION_TO_CATEGORY = {
    "reason": ["필요성", "하자_원인"],
    "defect": ["하자_현상", "하자_원인"],
    "repair": ["공법_설명", "시공_순서"],
    "method": ["공법_설명"],
    "feature": ["공법_특징"],
    "material": ["자재_설명"],
    "process": ["시공_순서", "공법_설명"],
    "case": ["사례_설명", "시공_후_효과"],
    "effect": ["기대_효과", "시공_후_효과"],
}


def _score_entry(entry: KnowledgeEntry, work_type: str, search_terms: List[str]) -> float:
    if entry.work_type != work_type:
        return 0.0
    haystack = f"{entry.title}\n{entry.text}\n{' '.join(entry.keywords)}".replace(" ", "")
    score = 0.0
    for term in search_terms:
        if term.replace(" ", "") in haystack:
            score += len(term)
    return score


def search_text_knowledge(entries: List[KnowledgeEntry], work_type: str, section: str,
                            extra_terms: Optional[List[str]] = None, top_n: int = 4) -> List[KnowledgeEntry]:
    """Story Engine 섹션 하나에 쓸 문구 후보를 지식자료에서 찾는다(사진과 무관하게
    work_type + 섹션 카테고리만으로도 동작 - 요청사항 9의 "관련 문구" 검색 단계)."""
    categories = SECTION_TO_CATEGORY.get(section, [])
    if not categories:
        return []
    terms = list(extra_terms or [])
    for cat in categories:
        terms.extend(TEXT_PURPOSE_KEYWORDS.get(cat, []))
    candidates = [e for e in entries if e.work_type == work_type and e.category in categories]
    if not candidates:
        return []
    scored = [(e, _score_entry(e, work_type, terms) + 1.0) for e in candidates]  # +1: 카테고리 일치 자체에 기본점수
    scored.sort(key=lambda t: t[1], reverse=True)
    return [e for e, _ in scored[:top_n]]


def search_terms_for_photo(img: ImageAsset) -> List[str]:
    terms = []
    if img.defect_type:
        terms.extend(DEFECT_TYPE_SEARCH_TERMS.get(img.defect_type, []))
    if img.process_type:
        terms.extend(PROCESS_TYPE_SEARCH_TERMS.get(img.process_type, []))
    return terms


def find_reference_images(knowledge_images: List[ImageAsset], work_type: str, role: str,
                            exclude_ids: Optional[set] = None, top_n: int = 4) -> List[ImageAsset]:
    """지식자료 사진 중 work_type + photo_role 이 일치하는 것을 품질 순으로 반환한다.
    이 사진들은 반드시 source_type=reference_ppt 로 유지되며, story_photos.py가
    "유사 시공 사례" 등으로 명확히 표시한다(요청사항 12, 현장사진과 섞지 않음)."""
    exclude_ids = exclude_ids or set()
    pool = [i for i in knowledge_images
            if i.work_type == work_type and i.photo_role == role and i.id not in exclude_ids]
    # work_type 필드가 비어 있는(순수 이미지 category 기반) 지식자료 사진도 있을 수 있으므로
    # work_type 매칭이 전혀 없으면 role만으로 완화 검색한다(그래도 지식자료 전체는 이미
    # 폴더 단위로 work_type이 나뉘어 있으므로 실제로는 role 필터만으로도 대체로 정확하다).
    if not pool:
        pool = [i for i in knowledge_images if i.photo_role == role and i.id not in exclude_ids]
    pool.sort(key=lambda i: i.quality_score, reverse=True)
    return pool[:top_n]
