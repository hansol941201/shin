# -*- coding: utf-8 -*-
"""
모든 사진에 의미 있는 캡션을 부여한다.
우선순위: 1) 같은 슬라이드의 실제 원본 문구  2) 카테고리 기반 최소 설명 캡션
"사진1", "IMG_001", "작업 완료" 같은 무의미한 문구는 절대 사용하지 않는다(build_text_candidates
단계에서 이미 걸러지므로, 여기서는 실제 문구가 없을 때의 대체 캡션만 담당한다).
"""
from app.engine.grouping import family_of
from app.utils.config import CATEGORY_FALLBACK_CAPTION, UNCONFIRMED_LABEL

NEUTRAL_BY_FAMILY = {
    "defect": "외벽 하자 상태 참고사진",
    "process": "외벽 보수 공정 참고사진",
    "beforeafter": "시공 전후 참고사진",
    "overview": "현장 시공 상태 참고사진",
    "material": "시공 자재/장비 참고사진",
    "safety": "안전관리 참고사진",
    "other": "현장 시공 상태 참고사진",
}


def caption_for_image(img) -> str:
    if img.real_caption:
        return img.real_caption
    if img.category in CATEGORY_FALLBACK_CAPTION:
        return CATEGORY_FALLBACK_CAPTION[img.category]
    if img.category == UNCONFIRMED_LABEL:
        return "현장 시공 상태 참고사진"
    return NEUTRAL_BY_FAMILY.get(family_of(img.category), "현장 시공 상태 참고사진")


def apply_captions(images) -> None:
    for img in images:
        was_original = bool(img.real_caption)
        img.real_caption = caption_for_image(img)
        img.caption_is_original = was_original
