# -*- coding: utf-8 -*-
"""
분류된 이미지/텍스트 후보 중에서 최종 결과물에 사용할 콘텐츠를 선별한다.
- 카테고리별 대표 이미지 선정
- 공법 시공 순서 교차 검증 (2~3개 PPT 간 공통 단계만 채택)
- 시공 전/후 사례 정리
"""
from collections import defaultdict
from typing import Dict, List

from app.utils.config import PROCESS_MASTER_SEQUENCE
from app.utils.models import BeforeAfterPair, ImageAsset, ProcessStep, SlideRecord, TextRun

CATEGORY_TO_STEP = {
    "세척_작업": "고압 세척",
    "균열_보수": "균열 보수 및 퍼티 작업",
    "퍼티_작업": "균열 보수 및 퍼티 작업",
    "하도": "하도 도장",
    "중도": "중도 도장",
    "상도": "상도 도장",
}

DEFECT_CATEGORIES = [
    "외벽_하자_균열", "외벽_하자_박리", "외벽_하자_오염",
    "외벽_하자_곰팡이", "외벽_하자_변색",
]

METHOD_OVERVIEW_CATEGORIES = ["자재", "도장_작업", "안전_작업", "균열_보수", "세척_작업"]

FEATURE_CATEGORIES = ["상도", "중도", "균열_보수", "도장_작업", "외벽_하자_오염"]

EFFECT_CATEGORIES = ["아파트_전경", "시공_후", "도장_작업"]


def _usable(images: List[ImageAsset]) -> List[ImageAsset]:
    return [i for i in images if not i.banned and not i.is_duplicate_of]


def _pick_by_categories(images: List[ImageAsset], categories: List[str], max_count: int) -> List[str]:
    used_ids = []
    used_categories = set()
    pool = sorted(_usable(images), key=lambda i: i.quality_score, reverse=True)
    for cat in categories:
        for img in pool:
            if img.category == cat and img.id not in used_ids:
                used_ids.append(img.id)
                used_categories.add(cat)
                break
        if len(used_ids) >= max_count:
            break
    return used_ids[:max_count]


COVER_PRIORITY = ["아파트_전경", "시공_후", "상도", "중도", "도장_작업", "자재", "안전_작업"]


def select_cover_image(images: List[ImageAsset]) -> str:
    pool = _usable(images)
    for cat in COVER_PRIORITY:
        candidates = [i for i in pool if i.category == cat]
        if candidates:
            candidates.sort(key=lambda i: i.quality_score, reverse=True)
            return candidates[0].id
    # 표지에 적합한 긍정적 이미지가 없으면(하자 사진 제외) 남은 후보 중 최고 화질 사용
    non_defect = [i for i in pool if i.category not in DEFECT_CATEGORIES]
    fallback_pool = non_defect or pool
    if not fallback_pool:
        return None
    fallback_pool.sort(key=lambda i: i.quality_score, reverse=True)
    return fallback_pool[0].id


def select_defect_images(images: List[ImageAsset], max_count: int = 6) -> List[str]:
    return _pick_by_categories(images, DEFECT_CATEGORIES * 2, max_count)


def select_method_overview_images(images: List[ImageAsset], max_count: int = 5) -> List[str]:
    return _pick_by_categories(images, METHOD_OVERVIEW_CATEGORIES, max_count)


def select_feature_images(images: List[ImageAsset], max_count: int = 5) -> List[str]:
    return _pick_by_categories(images, FEATURE_CATEGORIES, max_count)


def select_effect_images(images: List[ImageAsset], max_count: int = 4) -> List[str]:
    return _pick_by_categories(images, EFFECT_CATEGORIES * 2, max_count)


def build_process_steps(images: List[ImageAsset], text_runs: List[TextRun],
                         source_files: List[str]) -> List[ProcessStep]:
    """PPT 2~3개의 공법 순서도를 비교하여 공통적으로 확인되는 단계만 채택한다.
    한 파일에서만 확인된 단계는 needs_user_confirmation=True로 표시한다.
    """
    text_by_file: Dict[str, str] = defaultdict(str)
    for t in text_runs:
        text_by_file[t.source_file] += "\n" + t.text

    usable_images = _usable(images)

    steps: List[ProcessStep] = []
    for step_name, keywords in PROCESS_MASTER_SEQUENCE:
        files_confirmed = []
        for f in source_files:
            body = text_by_file.get(f, "").replace(" ", "")
            if any(kw.replace(" ", "") in body for kw in keywords):
                files_confirmed.append(f)

        if not files_confirmed:
            continue  # 어떤 입력 자료에서도 확인되지 않은 단계는 생성하지 않는다

        cat = next((c for c, s in CATEGORY_TO_STEP.items() if s == step_name), None)
        step_images = [i.id for i in usable_images if cat and i.category == cat][:2]

        steps.append(ProcessStep(
            name=step_name,
            keywords_matched=keywords,
            files_confirmed=files_confirmed,
            image_ids=step_images,
            description=f"{step_name} 단계입니다.",
            needs_user_confirmation=(len(files_confirmed) < len(source_files)),
        ))

    return steps


def build_before_after_cases(images: List[ImageAsset], max_cases: int = 3) -> List[BeforeAfterPair]:
    groups: Dict[str, Dict[str, str]] = defaultdict(dict)
    for img in images:
        if img.ba_group and img.ba_role:
            groups[img.ba_group][img.ba_role] = img.id
        elif img.ba_group:
            groups[img.ba_group].setdefault("process", []) if False else None

    process_by_group: Dict[str, List[str]] = defaultdict(list)
    for img in images:
        if img.ba_group and not img.ba_role and not img.banned and not img.is_duplicate_of:
            process_by_group[img.ba_group].append(img.id)

    pairs = []
    seen_hash_pairs = set()
    for group_id, roles in groups.items():
        if "before" in roles and "after" in roles:
            source_file, slide_idx = group_id.rsplit("_", 1)
            key = (roles["before"], roles["after"])
            if key in seen_hash_pairs:
                continue
            seen_hash_pairs.add(key)
            pairs.append(BeforeAfterPair(
                before_image_id=roles["before"],
                after_image_id=roles["after"],
                source_file=source_file,
                slide_index=int(slide_idx),
                process_image_ids=process_by_group.get(group_id, [])[:4],
            ))
    return pairs[:max_cases]
