# -*- coding: utf-8 -*-
"""
사진을 A/B/C 3등급으로 분류한다(요청 스펙).
- A: 본문 핵심 사진(카테고리가 명확히 확인된 하자/공정/전후 사진) - 반드시 사용
- B: 갤러리/사례 등에서 선택적으로 사용 가능한 사진(카테고리 불명확하지만 결함 없음)
- C: 제외 대상(민감정보/중복/저해상도) - 사유를 기록하고 결과물에서 제외

주의: "의미가 불명확하다"는 이유만으로 즉시 C로 강등하지 않는다. 실사 PPT는 캡션이
부실한 경우가 흔하므로, 명확한 결함(민감정보/중복/저해상도)이 없는 한 최소 B로 보존해
사진이 조용히 사라지는 이전 버그를 재발시키지 않는다.
"""
from dataclasses import dataclass
from typing import List, Tuple

MIN_PIXELS = 400 * 300  # 이보다 작으면 저해상도로 간주해 C등급 처리
CORE_FAMILIES = {"defect", "process", "beforeafter"}
A_CONFIDENCE_THRESHOLD = 0.2


@dataclass
class GradeResult:
    grade: str
    reason: str


def grade_image(img, family: str) -> GradeResult:
    if img.banned:
        return GradeResult("C", "; ".join(img.banned_reasons) or "민감정보 추정")
    if img.is_duplicate_of:
        return GradeResult("C", f"중복(대표 이미지: {img.is_duplicate_of})")
    if img.width * img.height < MIN_PIXELS:
        return GradeResult("C", f"저해상도({img.width}x{img.height})")

    if family in CORE_FAMILIES and img.confidence >= A_CONFIDENCE_THRESHOLD:
        return GradeResult("A", "")
    return GradeResult("B", "")


def grade_all(images: List, family_of) -> Tuple[List, List, List]:
    """전체 이미지를 등급별로 나누고, 각 이미지 객체에 grade/grade_reason을 기록한다."""
    a_list, b_list, c_list = [], [], []
    for img in images:
        fam = family_of(img.category)
        result = grade_image(img, fam)
        img.grade = result.grade
        img.grade_reason = result.reason
        if result.grade == "A":
            a_list.append(img)
        elif result.grade == "B":
            b_list.append(img)
        else:
            c_list.append(img)
    return a_list, b_list, c_list
