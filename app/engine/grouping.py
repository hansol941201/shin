# -*- coding: utf-8 -*-
"""
사진과 문구를 '사건/공정 단위(content group)'로 묶는다.
기본 단위는 원본 슬라이드(같은 슬라이드에 있던 사진·문구는 저자가 같은 맥락으로 배치한 것으로
간주)이며, 인접한 슬라이드가 같은 계열(하자/공정)을 다루면 하나의 그룹으로 합쳐 자연스러운
"공정 흐름"을 복원한다.
"""
from collections import defaultdict
from typing import Dict, List

from app.utils.config import UNCONFIRMED_LABEL

FAMILY_MAP = {
    "외벽_하자_균열": "defect", "외벽_하자_박리": "defect", "외벽_하자_오염": "defect",
    "외벽_하자_곰팡이": "defect", "외벽_하자_변색": "defect", "누수_흔적": "defect",
    "철근_노출": "defect", "기존_상태": "defect",
    "세척_작업": "process", "균열_보수": "process", "퍼티_작업": "process", "바탕_정리": "process",
    "하도": "process", "중도": "process", "상도": "process", "방수층": "process",
    "시트_설치": "process", "지붕_작업": "process", "코킹_실링": "process", "양생": "process",
    "도장_작업": "process",
    "시공_전": "beforeafter", "시공_후": "beforeafter",
    "아파트_전경": "overview", "완료_상태": "overview", "공법_순서도": "overview",
    "자재": "material", "장비": "material", "안전_작업": "safety",
    "로고_회사이미지": "exclude",
}


def family_of(category: str) -> str:
    return FAMILY_MAP.get(category, "other")


def _slide_dominant_category(images: List, texts: List) -> str:
    tally = defaultdict(float)
    for img in images:
        tally[img.category] += max(img.confidence, 0.2)
    if tally:
        return max(tally.items(), key=lambda x: x[1])[0]
    if texts:
        return texts[0].purpose
    return UNCONFIRMED_LABEL


def build_groups(images: List, text_candidates: List) -> List[dict]:
    """슬라이드 단위 -> 인접 병합 순으로 콘텐츠 그룹을 만든다."""
    imgs_by_slide: Dict[tuple, List] = defaultdict(list)
    for img in images:
        if img.banned or img.is_duplicate_of:
            continue
        imgs_by_slide[(img.source_file, img.slide_index)].append(img)

    texts_by_slide: Dict[tuple, List] = defaultdict(list)
    for c in text_candidates:
        if c.usable:
            texts_by_slide[(c.source_file, c.slide_index)].append(c)

    all_keys = sorted(set(imgs_by_slide.keys()) | set(texts_by_slide.keys()),
                       key=lambda k: (k[0], k[1]))

    slide_units = []
    for key in all_keys:
        imgs = imgs_by_slide.get(key, [])
        texts = texts_by_slide.get(key, [])
        if not imgs and not texts:
            continue
        dom_cat = _slide_dominant_category(imgs, texts)
        slide_units.append({
            "source_file": key[0], "slide_index": key[1],
            "images": imgs, "texts": texts,
            "category": dom_cat, "family": family_of(dom_cat),
        })

    # 인접 슬라이드 병합 (같은 파일, 연속 인덱스, 같은 계열이 defect/process인 경우)
    groups = []
    cur = None
    for unit in slide_units:
        if unit["family"] == "exclude":
            continue
        if (cur and cur["source_file"] == unit["source_file"]
                and unit["slide_index"] - cur["slide_indices"][-1] <= 1
                and cur["category"] == unit["category"]
                and unit["family"] in ("defect", "process")):
            cur["slide_indices"].append(unit["slide_index"])
            cur["images"].extend(unit["images"])
            cur["texts"].extend(unit["texts"])
        else:
            if cur:
                groups.append(cur)
            cur = {
                "id": f"g{len(groups)}_{unit['source_file']}_{unit['slide_index']}",
                "source_file": unit["source_file"],
                "slide_indices": [unit["slide_index"]],
                "family": unit["family"],
                "category": unit["category"],
                "images": list(unit["images"]),
                "texts": list(unit["texts"]),
            }
    if cur:
        groups.append(cur)

    for img in images:
        pass
    # group_id 를 이미지/텍스트 객체에 기록해 추적 가능하게 함
    for g in groups:
        for img in g["images"]:
            img.group_id = g["id"]
        for t in g["texts"]:
            pass

    return groups


def groups_to_json(groups: List[dict]) -> List[dict]:
    out = []
    for g in groups:
        out.append({
            "id": g["id"], "source_file": g["source_file"],
            "slide_indices": [i + 1 for i in g["slide_indices"]],
            "family": g["family"], "category": g["category"],
            "image_ids": [i.id for i in g["images"]],
            "text_ids": [t.text_id for t in g["texts"]],
            "image_count": len(g["images"]), "text_count": len(g["texts"]),
        })
    return out
