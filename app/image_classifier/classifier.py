# -*- coding: utf-8 -*-
"""
이미지 분류(카테고리), 중복 제거, 시공 전/후 쌍 탐지를 담당한다.
- 분류는 같은 슬라이드의 제목/본문 텍스트 + 이미지 OCR 텍스트에서 키워드를 검색하는 방식이다.
  (내용 기반 딥러닝 인식이 아닌 텍스트 근거 기반 분류이며, 이는 README/보고서에 한계로 명시한다.)
"""
from collections import defaultdict
from typing import Dict, List

import imagehash

from app.utils.config import IMAGE_CATEGORIES, UNCONFIRMED_LABEL
from app.utils.models import ImageAsset, SlideRecord

# 이론상 얻을 수 있는 최대 점수 근사치(신뢰도 정규화용) - 가장 긴 키워드 조합 기준
_MAX_PLAUSIBLE_SCORE = 12.0


def classify_image(img: ImageAsset):
    """카테고리 판정: 키워드 '개수'가 아니라 '매칭된 글자 수 합'으로 점수를 매긴다.
    예) "균열 보수" 슬라이드는 "균열"(외벽 하자)과 "균열보수"(공정)를 동시에 포함하는 경우가
    많은데, 더 구체적이고 긴 키워드가 우선하도록 하여 하자 카테고리로 잘못 쏠리는 것을 막는다.
    매칭되는 키워드가 전혀 없으면 즉시 폐기하지 않고 "미확정_참고사진"으로 보류한다(v2 원칙).
    반환값: (카테고리, 신뢰도 0~1)
    """
    haystack = f"{img.nearby_text}\n{img.ocr_text}\n{img.shape_name}".lower().replace(" ", "")
    best_cat, best_score = UNCONFIRMED_LABEL, 0
    for cat, keywords in IMAGE_CATEGORIES.items():
        matched = [kw for kw in keywords if kw.replace(" ", "").lower() in haystack]
        score = sum(len(kw.replace(" ", "")) for kw in matched)
        if score > best_score:
            best_cat, best_score = cat, score
    confidence = min(1.0, best_score / _MAX_PLAUSIBLE_SCORE) if best_score else 0.0
    return best_cat, confidence


def classify_all(images: List[ImageAsset]) -> None:
    for img in images:
        img.category, img.confidence = classify_image(img)
        # 해상도 기반 품질 점수(선명도 근사치 포함 X, 픽셀 수 기준)
        img.quality_score = float(img.width * img.height)


def dedupe_images(images: List[ImageAsset], hamming_threshold: int = 3) -> None:
    """perceptual hash 기준으로 거의 동일한 사진을 찾아 대표 이미지 1장만 남긴다."""
    valid = [i for i in images if i.phash and not i.banned]
    valid.sort(key=lambda i: i.quality_score, reverse=True)

    kept: List[ImageAsset] = []
    for img in valid:
        h = imagehash.hex_to_hash(img.phash)
        dup_of = None
        for k in kept:
            kh = imagehash.hex_to_hash(k.phash)
            if h - kh <= hamming_threshold:
                dup_of = k.id
                break
        if dup_of:
            img.is_duplicate_of = dup_of
        else:
            kept.append(img)


def detect_before_after_pairs(images: List[ImageAsset], slides: List[SlideRecord]) -> None:
    """같은 슬라이드 내에서 '시공 전/시공 후' 라벨이 함께 발견된 경우에만 짝을 짓는다.
    서로 다른 슬라이드/파일의 사진은 절대 전후 관계로 연결하지 않는다.
    """
    by_slide: Dict[tuple, List[ImageAsset]] = defaultdict(list)
    for img in images:
        if img.is_duplicate_of or img.banned:
            continue
        by_slide[(img.source_file, img.slide_index)].append(img)

    slide_flags = {(s.source_file, s.index): s.has_before_after_labels for s in slides}

    for key, imgs in by_slide.items():
        if not slide_flags.get(key):
            continue
        if len(imgs) < 2:
            continue
        imgs_sorted = sorted(imgs, key=lambda i: (i.top, i.left))
        group_id = f"{key[0]}_{key[1]}"
        # 가장 좌상단 = 시공 전, 그다음 = 시공 후 (같은 슬라이드 내부이므로 동일 현장 보장)
        imgs_sorted[0].ba_role = "before"
        imgs_sorted[0].ba_group = group_id
        imgs_sorted[1].ba_role = "after"
        imgs_sorted[1].ba_group = group_id
        for extra in imgs_sorted[2:]:
            extra.ba_group = group_id  # 추가 공정 사진 후보

        # 같은 슬라이드 내 전/후 라벨이 동시에 존재하면 텍스트 기반 분류가 두 사진을
        # 같은 카테고리로 혼동할 수 있으므로, 위치 기반으로 확정된 역할을 카테고리에 반영한다.
        imgs_sorted[0].category = "시공_전"
        imgs_sorted[1].category = "시공_후"
