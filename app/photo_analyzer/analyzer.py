# -*- coding: utf-8 -*-
"""
[v3 엔진] 사진 자동분석 Engine.

사용자가 올린 현장사진을 단순 파일명/주변 문구만으로 분류하지 않고, 사진마다
- 어떤 공종(work_type)인지
- 사진이 어떤 역할(photo_role: 하자/보수/공정/자재/전후/완료/전경/참고/미확정)인지
- (하자/공정 사진이면) 세부 유형(defect_type/process_type)
을 판정해 스키마화된 분석 결과를 만든다.

한계(정직하게 명시): 이 프로그램은 인터넷 연결 없이 동작하는 Windows 오프라인
EXE이므로 대형 비전(vision) 모델을 내장하지 않는다. "사진 내용 분석"은 사진에서
추출한 OCR 문구 + 같은 슬라이드/파일의 주변 문구 + 도형 이름(alt-text)을 사진의
"내용에 대한 근거"로 삼는 키워드 기반 판정이며, 픽셀을 직접 이해하는 딥러닝
비전 분류는 아니다(app/image_classifier/classifier.py에 이미 명시된 기존 한계와
동일한 방식을 work_type/photo_role 축으로 확장한 것).

절대 하지 않는 것(요청사항 13):
- "구조적 균열", "방수층 파괴", "즉시 보강 필요" 같은 확정적 전문 진단 생성
- 시각적으로 확인 불가능한 결론(누수 원인, 균열 깊이, 보수 등급 등) 서술
허용하는 것: "표면 균열이 확인됩니다", "도장면 일부 박리가 보입니다" 같은
시각적으로 관찰 가능한 상태 서술.

절대 하지 않는 것(요청사항 6):
- 분류에 실패했다고 사진/문구를 버리는 것. 모든 사진은 반드시
  classified / reference / unknown / unused_with_reason 중 하나의 content_status를
  가지며, 사용되지 않으면 반드시 이유가 unused_reason 에 남는다.
"""
from collections import defaultdict
from typing import Dict, List, Tuple

from app.image_classifier.classifier import classify_image
from app.utils.config import (
    CATEGORY_TO_DEFECT_TYPE, CATEGORY_TO_PROCESS_TYPE, CATEGORY_TO_ROLE,
    UNCONFIRMED_LABEL, WORK_TYPE_KEYWORDS, work_type_label,
)
from app.utils.models import ImageAsset

# 시각적으로 관찰 가능한 상태 서술로만 구성된 role별 최소 설명(확정 진단 문구 없음).
# CATEGORY_FALLBACK_CAPTION이 이미 이 원칙으로 작성되어 있으므로 role 판정에는
# 그대로 재사용하고, 여기서는 role 자체의 중립 라벨만 정의한다.
ROLE_LABEL = {
    "site_overview": "현장 전경", "defect": "하자 의심 부위(시각적 확인)", "repair": "보수 작업",
    "process": "시공 공정", "material": "자재/장비", "before": "시공 전", "after": "시공 후",
    "completed": "완료 상태", "reference": "참고 자료", "unknown": "분류 보류",
}


def _work_type_score(haystack: str) -> Dict[str, float]:
    scores: Dict[str, float] = {}
    for wt, keywords in WORK_TYPE_KEYWORDS.items():
        matched = [kw for kw in keywords if kw.replace(" ", "") in haystack]
        if matched:
            scores[wt] = sum(len(kw.replace(" ", "")) for kw in matched)
    return scores


def analyze_photo(img: ImageAsset) -> None:
    """이미지 하나를 분석해 ImageAsset의 v3 필드(work_type/photo_role/...)를 채운다.
    사전에 img.category/img.confidence 가 채워져 있지 않으면 먼저 계산한다."""
    if not img.category or img.category == "기타":
        img.category, img.confidence = classify_image(img)

    haystack = f"{img.nearby_text}\n{img.ocr_text}\n{img.shape_name}".lower().replace(" ", "")
    wt_scores = _work_type_score(haystack)
    reasons = []
    if wt_scores:
        best_wt = max(wt_scores.items(), key=lambda kv: kv[1])
        img.work_type = best_wt[0]
        img.work_type_confidence = min(1.0, best_wt[1] / 12.0)
        reasons.append(f"공종 판정 근거: '{work_type_label(best_wt[0])}' 관련 표현 감지")
    else:
        img.work_type = ""
        img.work_type_confidence = 0.0
        reasons.append("공종 판정 근거 없음(주변 문구/OCR에서 공종을 특정할 표현을 찾지 못함)")

    img.photo_role = CATEGORY_TO_ROLE.get(img.category, "unknown")
    if img.category in CATEGORY_TO_DEFECT_TYPE:
        img.defect_type = CATEGORY_TO_DEFECT_TYPE[img.category]
    if img.category in CATEGORY_TO_PROCESS_TYPE:
        img.process_type = CATEGORY_TO_PROCESS_TYPE[img.category]

    if img.category == UNCONFIRMED_LABEL:
        reasons.append("카테고리 판정 근거 없음(키워드 미매칭) - 사진은 삭제하지 않고 'unknown'으로 보존")
        img.content_status = "unknown"
    else:
        reasons.append(f"카테고리='{img.category}'(신뢰도 {img.confidence:.2f}), "
                        f"역할='{ROLE_LABEL.get(img.photo_role, img.photo_role)}'")
        img.content_status = "classified"
    img.analysis_reason = " / ".join(reasons)
    img.photo_id = img.id


def analyze_all_photos(images: List[ImageAsset]) -> None:
    for img in images:
        analyze_photo(img)


def aggregate_work_types(images: List[ImageAsset]) -> Tuple[str, List[Tuple[str, float]], Dict[str, int]]:
    """공종별 사진 수를 집계해 주 공종과 비중을 계산한다(요청사항 3/4).
    사진 한 장이 아니라 전체 사진을 종합해서 판정하며, 여러 공종이 섞인 현장도
    허용한다(주 공종 + 비중 15% 이상인 보조 공종 목록을 함께 반환)."""
    counts: Dict[str, int] = defaultdict(int)
    for img in images:
        if img.banned or img.is_duplicate_of:
            continue
        if img.work_type:
            counts[img.work_type] += 1
    total = sum(counts.values())
    if total == 0:
        return "", [], dict(counts)
    ranked = sorted(counts.items(), key=lambda kv: kv[1], reverse=True)
    percentages = [(wt, round(n / total * 100, 1)) for wt, n in ranked]
    primary = percentages[0][0]
    return primary, percentages, dict(counts)


def aggregate_roles(images: List[ImageAsset]) -> Dict[str, int]:
    counts: Dict[str, int] = defaultdict(int)
    for img in images:
        if img.banned or img.is_duplicate_of:
            continue
        counts[img.photo_role] += 1
    return dict(counts)


def build_analysis_summary(images: List[ImageAsset]) -> dict:
    """요청사항 19 "분석 결과 확인 기능"에 쓰이는 요약 JSON을 만든다."""
    primary, percentages, wt_counts = aggregate_work_types(images)
    role_counts = aggregate_roles(images)
    defect_counts: Dict[str, int] = defaultdict(int)
    process_counts: Dict[str, int] = defaultdict(int)
    unknown = 0
    duplicate = 0
    for img in images:
        if img.is_duplicate_of:
            duplicate += 1
            continue
        if img.banned:
            continue
        if img.photo_role == "unknown":
            unknown += 1
        if img.defect_type:
            defect_counts[img.defect_type] += 1
        if img.process_type:
            process_counts[img.process_type] += 1
    return {
        "total_photos": len([i for i in images if not i.banned]),
        "duplicate_photos": duplicate,
        "unknown_photos": unknown,
        "work_type_counts": wt_counts,
        "work_type_percentages": percentages,
        "primary_work_type": primary,
        "primary_work_type_label": work_type_label(primary) if primary else "미판정",
        "role_counts": role_counts,
        "defect_type_counts": dict(defect_counts),
        "process_type_counts": dict(process_counts),
    }
