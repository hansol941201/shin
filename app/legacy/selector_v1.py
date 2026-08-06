# -*- coding: utf-8 -*-
"""
분류된 이미지/텍스트 후보 중에서 최종 결과물에 사용할 콘텐츠를 선별한다.
- 카테고리별 대표 이미지 선정 (가능한 한 많은 서로 다른 사진을 활용)
- 공법 시공 순서 교차 검증 (2~3개 PPT 간 공통 단계만 채택)
- 시공 전/후 사례 정리
- 실제 원본 문구(content_library)를 우선 사용하고, 없을 때만 기본 문구로 대체
"""
from collections import defaultdict
from typing import Dict, List, Optional, Tuple

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

METHOD_OVERVIEW_CATEGORIES = ["자재", "도장_작업", "안전_작업", "균열_보수", "세척_작업", "퍼티_작업", "하도"]

FEATURE_CATEGORIES = ["상도", "중도", "균열_보수", "도장_작업", "외벽_하자_오염", "세척_작업"]

EFFECT_CATEGORIES = ["아파트_전경", "시공_후", "도장_작업", "상도"]

DEFAULT_METHOD_ITEMS = [
    "내구성 높은 시공 시스템", "체계적인 시공 관리", "균열 및 손상부 선보수",
    "안전한 작업 절차", "외벽 미관 개선",
]
DEFAULT_FEATURE_ITEMS = [
    ("우수한 내구성", "오랜 기간 성능이 유지되는 시공 시스템을 적용합니다."),
    ("뛰어난 방수성", "표면을 보호하여 수분 침투를 최소화합니다."),
    ("균열 및 손상부 보수", "선보수를 통해 하자 부위를 안정적으로 정리합니다."),
    ("미관 개선", "깨끗하고 균일한 외관으로 마감합니다."),
    ("유지관리 용이", "표면 관리가 쉬운 마감으로 시공합니다."),
]
DEFAULT_EFFECT_ITEMS = ["건물 가치 향상", "외벽 수명 연장", "주거 만족도 향상",
                          "미관 개선", "유지관리 비용 절감", "안전성 향상"]


def _usable(images: List[ImageAsset]) -> List[ImageAsset]:
    return [i for i in images if not i.banned and not i.is_duplicate_of]


def _pick_by_categories(images: List[ImageAsset], categories: List[str], max_count: int,
                          exclude_ids: Optional[set] = None) -> List[str]:
    """카테고리 순서대로 이미지를 채우되, 카테고리 하나당 여러 장을 허용하여
    실제 사진 활용량을 최대화한다(이전 버전은 카테고리당 1장만 골라 과도하게 적었음)."""
    exclude_ids = exclude_ids or set()
    used_ids: List[str] = []
    pool = sorted(_usable(images), key=lambda i: i.quality_score, reverse=True)
    for cat in categories:
        cat_imgs = [i for i in pool if i.category == cat and i.id not in used_ids and i.id not in exclude_ids]
        for img in cat_imgs:
            used_ids.append(img.id)
            if len(used_ids) >= max_count:
                return used_ids
    return used_ids[:max_count]


COVER_PRIORITY = ["아파트_전경", "시공_후", "상도", "중도", "도장_작업", "자재", "안전_작업"]


def select_cover_image(images: List[ImageAsset]) -> str:
    pool = _usable(images)
    for cat in COVER_PRIORITY:
        candidates = [i for i in pool if i.category == cat]
        if candidates:
            candidates.sort(key=lambda i: i.quality_score, reverse=True)
            return candidates[0].id
    non_defect = [i for i in pool if i.category not in DEFECT_CATEGORIES]
    fallback_pool = non_defect or pool
    if not fallback_pool:
        return None
    fallback_pool.sort(key=lambda i: i.quality_score, reverse=True)
    return fallback_pool[0].id


def select_defect_images(images: List[ImageAsset], max_count: int = 9,
                           exclude_ids: Optional[set] = None) -> List[str]:
    return _pick_by_categories(images, DEFECT_CATEGORIES, max_count, exclude_ids)


def select_method_overview_images(images: List[ImageAsset], max_count: int = 8,
                                    exclude_ids: Optional[set] = None) -> List[str]:
    return _pick_by_categories(images, METHOD_OVERVIEW_CATEGORIES, max_count, exclude_ids)


def select_feature_images(images: List[ImageAsset], max_count: int = 8,
                            exclude_ids: Optional[set] = None) -> List[str]:
    return _pick_by_categories(images, FEATURE_CATEGORIES, max_count, exclude_ids)


def select_effect_images(images: List[ImageAsset], max_count: int = 8,
                           exclude_ids: Optional[set] = None) -> List[str]:
    return _pick_by_categories(images, EFFECT_CATEGORIES, max_count, exclude_ids)


def select_gallery_images(images: List[ImageAsset], exclude_ids: set, max_count: int = 40) -> List[str]:
    """다른 섹션에서 쓰이지 않은 사용 가능 사진을 최대한 활용하기 위한 '참고 시공 사진' 후보.
    카테고리가 무엇이든(미분류 포함) 회사/현장 정보가 없는 사진이면 후보로 삼는다.
    중립적인 캡션으로만 표기되므로 의미를 왜곡하지 않는다.
    """
    pool = [i for i in _usable(images) if i.id not in exclude_ids]
    pool.sort(key=lambda i: i.quality_score, reverse=True)
    return [i.id for i in pool[:max_count]]


def build_method_overview_items(library: Dict[str, List[str]], count: int = 8) -> List[str]:
    phrases = []
    for purpose in ("공법_설명", "공법_특징", "자재_설명", "시공_순서"):
        for p in library.get(purpose, []):
            if p not in phrases:
                phrases.append(p)
    if len(phrases) >= count:
        return phrases[:count]
    # 라이브러리가 부족한 만큼만 기본 문구로 보충(전량 대체 금지)
    return (phrases + DEFAULT_METHOD_ITEMS)[:count]


def build_feature_items(library: Dict[str, List[str]], count: int = 8) -> List[Tuple[str, str]]:
    phrases = []
    for purpose in ("공법_특징", "공법_설명"):
        for p in library.get(purpose, []):
            if p not in phrases:
                phrases.append(p)
    items = []
    for p in phrases[:count]:
        title = p.split(".")[0][:16]
        items.append((title, p))
    if len(items) >= count:
        return items[:count]
    return (items + DEFAULT_FEATURE_ITEMS)[:count]


def build_effect_items(library: Dict[str, List[str]], count: int = 6) -> List[str]:
    phrases = []
    for purpose in ("기대_효과", "시공_후_효과"):
        for p in library.get(purpose, []):
            if p not in phrases:
                phrases.append(p)
    if len(phrases) >= count:
        return phrases[:count]
    return (phrases + DEFAULT_EFFECT_ITEMS)[:count]


def build_reason_note(library: Dict[str, List[str]]) -> str:
    for purpose in ("필요성", "하자_원인"):
        phrases = library.get(purpose, [])
        if phrases:
            return " ".join(phrases[:2])
    return ("외벽 노후화는 미관 저하뿐 아니라 균열과 수분 침투를 유발할 수 있으므로 "
            "적절한 보수와 공사가 필요합니다.")


def build_case_notes(library: Dict[str, List[str]]) -> List[str]:
    """사례 페이지마다 가능하면 서로 다른 실제 문구를 순환 배치한다."""
    phrases = []
    for purpose in ("사례_설명", "시공_후_효과", "기대_효과"):
        for p in library.get(purpose, []):
            if p not in phrases:
                phrases.append(p)
    if not phrases:
        phrases = ["노후화되고 오염된 외벽을 보수한 후 재시공하여 건물 외관과 내구성을 개선한 사례입니다."]
    return phrases


def build_process_steps(images: List[ImageAsset], text_runs: List[TextRun],
                         source_files: List[str], text_candidates=None,
                         exclude_ids: Optional[set] = None) -> List[ProcessStep]:
    """PPT 2~3개의 공법 순서도를 비교하여 공통적으로 확인되는 단계만 채택한다.
    한 파일에서만 확인된 단계는 needs_user_confirmation=True로 표시한다.
    설명 문구는 가능하면 해당 단계 사진이 있던 슬라이드의 실제 원본 문구를 사용한다.
    """
    text_by_file: Dict[str, str] = defaultdict(str)
    for t in text_runs:
        text_by_file[t.source_file] += "\n" + t.text

    usable_images = _usable(images)
    exclude_ids = exclude_ids or set()

    candidates_by_slide: Dict[tuple, list] = defaultdict(list)
    if text_candidates:
        for c in text_candidates:
            if c.usable:
                candidates_by_slide[(c.source_file, c.slide_index)].append(c)

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
        step_images = [i.id for i in usable_images if cat and i.category == cat and i.id not in exclude_ids][:3]
        exclude_ids.update(step_images)

        description = f"{step_name} 단계입니다."
        for iid in step_images:
            img = next((i for i in usable_images if i.id == iid), None)
            if img:
                slide_texts = candidates_by_slide.get((img.source_file, img.slide_index))
                if slide_texts:
                    best = max(slide_texts, key=lambda c: len(c.cleaned))
                    if len(best.cleaned) >= 6:
                        description = best.cleaned
                        break

        steps.append(ProcessStep(
            name=step_name,
            keywords_matched=keywords,
            files_confirmed=files_confirmed,
            image_ids=step_images,
            description=description,
            needs_user_confirmation=(len(files_confirmed) < len(source_files)),
        ))

    return steps


def build_before_after_cases(images: List[ImageAsset], max_cases: int = 6) -> List[BeforeAfterPair]:
    """같은 슬라이드 내에서 확인된 전/후 쌍을 모두 사용한다(상한은 페이지 수 조절용일 뿐,
    서로 다른 현장 사진을 임의로 짝짓지 않는다는 원칙은 변하지 않는다)."""
    groups: Dict[str, Dict[str, str]] = defaultdict(dict)
    for img in images:
        if img.ba_group and img.ba_role:
            groups[img.ba_group][img.ba_role] = img.id

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
