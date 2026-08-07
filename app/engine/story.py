# -*- coding: utf-8 -*-
"""
콘텐츠 그룹(사건/공정 단위)과 원본 문구 라이브러리로부터 입주민 설명자료의 스토리를
구성한다.

[핵심 원칙 - 재설계, 2026-08]
사진과 문구를 독립 콘텐츠로 다루지 않는다. 원본 PPT에서 같은 슬라이드(=같은 맥락)에
있던 사진과 문구는 이미 grouping.py 단계에서 하나의 content group으로 묶여 있고,
이 모듈은 그 그룹들을 "입주민이 이해해야 하는 질문 순서"에 맞춰 고정된 스토리
구조(표지 -> 왜 필요한가 -> 하자 -> 공법 핵심 -> 공법 특징 -> 시공 순서 -> 유사 사례
-> 마무리)에 배치한다.

각 본문 페이지는 반드시 "사진 + 문구"가 함께 있는 하나의 정보 단위여야 한다.
- 사진만 있는 일반 페이지: 원칙적으로 생성하지 않는다(시공 전후 비교 case 페이지만 예외).
- 문구만 있는 일반 페이지: 원칙적으로 생성하지 않는다(마지막 마무리 페이지만 예외).
- 사진/문구 중 하나가 아예 없는 섹션은 페이지를 만들지 않고 건너뛴다(억지로 채우지 않음).

전체 페이지 수는 사진을 최대한 많이 쓰기 위해 늘리지 않는다. 권장 8~12페이지,
최대 14페이지를 넘지 않도록 섹션별로 이미지 개수를 캡(cap)한다. 사진 100% 활용은
목표가 아니며, 정보 전달에 도움이 되는 사진만 등급(A/B) 순으로 충분히 사용한다.
"""
from typing import Dict, List

from app.engine.captions import apply_captions
from app.utils.config import PROCESS_MASTER_SEQUENCE

CATEGORY_TO_STEP = {
    "세척_작업": "고압 세척", "바탕_정리": "바탕 정리", "균열_보수": "균열 보수 및 퍼티 작업",
    "퍼티_작업": "균열 보수 및 퍼티 작업", "하도": "하도 도장", "중도": "중도 도장",
    "상도": "상도 도장", "방수층": "방수층 시공", "시트_설치": "방수 시트 설치",
    "지붕_작업": "지붕재 시공", "코킹_실링": "코킹·실링", "양생": "양생",
}

# 공법 핵심(4페이지 예시: 균열보수/퍼티/바탕정리/세척 등 "보수 방법"에 해당하는 초기 공정)에
# 우선 배정할 카테고리. 나머지 공정 카테고리는 뒤의 "시공 순서" 섹션에서 다룬다.
METHOD_CORE_CATEGORIES = {"균열_보수", "퍼티_작업", "바탕_정리", "세척_작업"}

DEFAULT_SETTINGS = {
    "max_total_pages": 14,          # 절대 상한
    "defect_images_per_page": 5,    # 하자 섹션 한 페이지 최대 사진 수
    "defect_pages_cap": 2,
    "method_images_per_page": 4,
    "feature_images_cap": 3,
    "process_images_per_page": 6,   # 시공 순서 한 페이지 최대 사진 수
    "process_pages_cap": 2,
    "case_pairs_cap": 2,
    "min_bullets_per_page": 1,      # 본문 페이지 최소 문구 수(없으면 페이지 자체를 생략)
}


def _sort_grade(imgs: List) -> List:
    """A등급을 항상 먼저 배치해 핵심 사진이 우선적으로 본문에 들어가도록 한다."""
    return sorted(imgs, key=lambda i: (0 if getattr(i, "grade", "B") == "A" else 1))


def _dedup_texts(texts: List[str], limit: int) -> List[str]:
    seen, out = set(), []
    for t in texts:
        t = t.strip()
        if not t or t in seen:
            continue
        seen.add(t)
        out.append(t)
        if len(out) >= limit:
            break
    return out


def _group_text_bullets(groups: List[dict], max_n=6) -> List[str]:
    """그룹 자신의 원본 문구(=같은 슬라이드에 있던 실제 문구)를 우선 사용한다."""
    pool = []
    for g in groups:
        for t in sorted(g["texts"], key=lambda t: -t.importance):
            pool.append(t.cleaned)
    return _dedup_texts(pool, max_n)


def _real_caption_bullets(images: List, limit: int) -> List[str]:
    """그룹 문구가 전혀 없을 때, 사진에 이미 붙어 있는 실제 원본 캡션을 문구로 재사용한다
    (원본에 없는 내용을 새로 만들지 않기 위한 최후의 수단)."""
    caps = [getattr(im, "real_caption", None) for im in images]
    caps = [c for c in caps if c]
    return _dedup_texts(caps, limit)


def _paginate(images: List, per_page: int) -> List[List]:
    return [images[i:i + per_page] for i in range(0, len(images), per_page)] or []


def _layout_for(n_images: int) -> str:
    if n_images <= 0:
        return "text"
    if n_images == 1:
        return "single"
    if n_images == 2:
        return "compare2"
    if n_images == 3:
        return "grid3"
    if n_images == 4:
        return "grid4"
    return "gallery"


def build_pages(apartment_name: str, work_type: str, groups: List[dict],
                 content_library: Dict[str, List[str]], ba_pairs: List, cover_image,
                 used_ids: set, images_by_id: Dict[str, object],
                 settings: Dict = None, change_log: List[str] = None) -> List[dict]:
    s = {**DEFAULT_SETTINGS, **(settings or {})}
    change_log = change_log if change_log is not None else []

    pages: List[dict] = []
    used_titles = set()

    def unique_title(base: str) -> str:
        if base not in used_titles:
            used_titles.add(base)
            return base
        n = 2
        while f"{base} ({n})" in used_titles:
            n += 1
        t = f"{base} ({n})"
        used_titles.add(t)
        return t

    def take_unused(imgs, limit=None):
        """미사용 이미지만 골라 사용 처리한다(A등급 우선). limit을 넘는 나머지는
        used_ids에 추가하지 않고 남겨 다른 섹션에서 계속 쓸 수 있게 한다."""
        out = []
        for im in imgs:
            if limit is not None and len(out) >= limit:
                break
            if im.id not in used_ids:
                out.append(im)
                used_ids.add(im.id)
        return out

    def release(imgs):
        for im in imgs:
            used_ids.discard(im.id)

    def add_combo_page(page_type, base_title, images, bullets, layout=None):
        """사진 + 문구가 함께 있는 하나의 정보 단위 페이지. 어느 한쪽이 완전히 없으면
        (그리고 min_bullets_per_page 기준을 못 채우면) 페이지 자체를 생성하지 않는다."""
        if not images or len(bullets) < s["min_bullets_per_page"]:
            release(images)
            return False
        pages.append({
            "type": page_type, "title": unique_title(base_title), "subtitle": "",
            "images": images, "bullets": bullets,
            "layout": layout or _layout_for(len(images)),
        })
        return True

    # ---------- 1. 표지 ----------
    pages.append({
        "type": "cover", "title": f"{apartment_name} {work_type} 제안서",
        "subtitle": f"{work_type} 공사 안내 자료", "images": [cover_image] if cover_image else [],
        "bullets": [], "layout": "cover",
    })
    if cover_image:
        used_ids.add(cover_image.id)

    defect_groups = [g for g in groups if g["family"] == "defect"]
    process_groups = [g for g in groups if g["family"] == "process"]
    material_groups = [g for g in groups if g["family"] == "material"]
    overview_groups = [g for g in groups if g["family"] == "overview"]

    # ---------- 2. 왜 공사가 필요한가 + 현재 발생 가능한 주요 하자 ----------
    # (사용자 예시: "재도장이 필요한 이유" 한 페이지에 하자 유형별 사진 + 원본 설명 문구)
    defect_pool = _sort_grade([im for g in defect_groups for im in g["images"]])
    defect_bullet_pool = _group_text_bullets(defect_groups, max_n=8)
    if not defect_bullet_pool:
        defect_bullet_pool = _dedup_texts(
            content_library.get("필요성", []) + content_library.get("하자_현상", []) +
            content_library.get("하자_원인", []), 8)
    defect_chunks = _paginate(defect_pool, s["defect_images_per_page"])[:s["defect_pages_cap"]]
    for idx, chunk in enumerate(defect_chunks):
        chunk_used = take_unused(chunk)
        bullets = defect_bullet_pool[idx * 3: idx * 3 + 4] or defect_bullet_pool[:4] or \
            _real_caption_bullets(chunk_used, 3)
        title = "재도장이 필요한 이유" if idx == 0 else "현재 확인되는 주요 하자"
        add_combo_page("defect", title, chunk_used, bullets, layout="gallery")

    # ---------- 3. 어떻게 보수하는가 / 공법 핵심 ----------
    method_groups = [g for g in process_groups if g["category"] in METHOD_CORE_CATEGORIES]
    method_images = take_unused(_sort_grade([im for g in method_groups for im in g["images"]]),
                                  limit=s["method_images_per_page"])
    method_bullets = _group_text_bullets(method_groups, max_n=4) or \
        _dedup_texts(content_library.get("공법_설명", []) + content_library.get("필요성", []), 4) or \
        _real_caption_bullets(method_images, 3)
    add_combo_page("method_reason", "주요 보수 방법", method_images, method_bullets)

    # ---------- 4. 공법의 특징 ----------
    feature_bullets = _dedup_texts(content_library.get("공법_특징", []), 4)
    feature_pool = _sort_grade([im for g in (process_groups + material_groups) for im in g["images"]
                                  if im.id not in used_ids])
    feature_images = take_unused(feature_pool, limit=s["feature_images_cap"])
    if not add_combo_page("features", "공법 특징", feature_images, feature_bullets):
        # 사진이 없어 페이지를 만들지 못한 경우, 문구를 버리지 않고 마무리 섹션에서 재활용한다.
        content_library.setdefault("_leftover_features", [])
        content_library["_leftover_features"] = feature_bullets

    # ---------- 5. 시공 순서 (남은 공정을 표준 순서대로, 최대 process_pages_cap 페이지로 압축) ----------
    order_index = {name: i for i, (name, _) in enumerate(PROCESS_MASTER_SEQUENCE)}
    remaining_process = [g for g in process_groups if g["category"] not in METHOD_CORE_CATEGORIES]
    remaining_process.sort(key=lambda g: order_index.get(CATEGORY_TO_STEP.get(g["category"], ""), 999))
    process_pool = []
    for g in remaining_process:
        process_pool.extend(_sort_grade(g["images"]))
    process_chunks = _paginate([im for im in process_pool if im.id not in used_ids],
                                 s["process_images_per_page"])[:s["process_pages_cap"]]
    for idx, chunk in enumerate(process_chunks):
        chunk_used = take_unused(chunk)
        cats_in_chunk = _dedup_texts([CATEGORY_TO_STEP.get(im.category, im.category) for im in chunk_used], 6)
        groups_in_chunk = [g for g in remaining_process if any(im in chunk_used for im in g["images"])]
        bullets = _group_text_bullets(groups_in_chunk, max_n=4)
        if not bullets and cats_in_chunk:
            bullets = [f"{i+1}. {name}" for i, name in enumerate(cats_in_chunk)][:4]
        title = "시공 순서" if len(process_chunks) == 1 else f"시공 순서 {idx+1}"
        add_combo_page("process", title, chunk_used, bullets, layout="gallery")

    # ---------- 6. 유사 시공 전후 사례 ----------
    case_note_pool = (content_library.get("사례_설명", []) + content_library.get("시공_후_효과", [])) or \
        ["보수 및 재도장 시공 전후 비교입니다."]
    for i, pair in enumerate(ba_pairs[:s["case_pairs_cap"]], start=1):
        before, after = pair.before_image_id, pair.after_image_id
        title = "유사 시공 전후 사례" if s["case_pairs_cap"] == 1 else f"유사 시공 전후 사례 {i}"
        pages.append({
            "type": "case", "title": unique_title(title), "subtitle": "",
            "pair": pair, "bullets": [case_note_pool[(i - 1) % len(case_note_pool)]],
            "layout": "compare2",
        })
        used_ids.add(before)
        used_ids.add(after)
        used_ids.update(pair.process_image_ids or [])

    # ---------- 7. 기대 효과 / 마무리 ----------
    effect_bullets = _dedup_texts(
        content_library.get("기대_효과", []) + content_library.get("시공_후_효과", []) +
        content_library.get("_leftover_features", []), 5)
    if not effect_bullets:
        effect_bullets = ["안전하고 쾌적한 주거환경 조성을 위해 이번 공사를 진행합니다."]
    effect_pool = _sort_grade([im for g in overview_groups for im in g["images"] if im.id not in used_ids])
    effect_image = take_unused(effect_pool, limit=1)
    pages.append({
        "type": "closing", "title": unique_title("기대 효과 및 마무리 안내"), "subtitle": "",
        "images": effect_image, "bullets": effect_bullets,
        "layout": _layout_for(len(effect_image)) if effect_image else "text",
    })

    # ---------- 8. 전체 페이지 수 상한 강제 (낮은 우선순위부터 정리) ----------
    def _content_index(p_type):
        # 뒤쪽 섹션일수록 먼저 정리 대상(핵심 정보인 표지/하자/방법/특징/공법은 보존)
        order = ["gallery_legacy", "case", "process", "defect", "closing"]
        return order.index(p_type) if p_type in order else -1

    while len(pages) > s["max_total_pages"]:
        # case > process > defect 순으로 초과분(2번째 이후 페이지)을 제거
        removable = [p for p in pages if p["type"] in ("case", "process", "defect")]
        # 같은 타입이 여러 장이면 마지막(중요도가 낮은) 것부터 제거
        by_type: Dict[str, List[dict]] = {}
        for p in removable:
            by_type.setdefault(p["type"], []).append(p)
        target = None
        for t in ("case", "process", "defect"):
            if len(by_type.get(t, [])) > 1:
                target = by_type[t][-1]
                break
        if target is None:
            break
        for im in target.get("images", []):
            used_ids.discard(im.id)
        pages.remove(target)

    all_selected = []
    for p in pages:
        for im in p.get("images", []):
            if im:
                im.selected = True
                all_selected.append(im)
        if p["type"] == "case":
            pair = p["pair"]
            for iid in [pair.before_image_id, pair.after_image_id] + list(pair.process_image_ids or []):
                im = images_by_id.get(iid)
                if im:
                    im.selected = True
                    all_selected.append(im)

    apply_captions(all_selected)

    return pages
