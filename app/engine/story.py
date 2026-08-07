# -*- coding: utf-8 -*-
"""
콘텐츠 그룹(사건/공정 단위)과 원본 문구 라이브러리로부터 입주민 설명자료의 스토리를
구성한다.

[재설계 2 - 2026-08] 이제 story.py는 "페이지에 무슨 사진/문구를 넣을지"뿐 아니라
"이 페이지가 어떤 종류의 정보인지(semantic_type)"까지 결정한다. generator2.py는
semantic_type에 맞는 전용 레이아웃(hero/reason_hero/four_cards/image_text_split/
feature_cards/process_timeline/before_after/two_case_compare/effects_hero/closing)을
사용해 페이지마다 다른 디자인으로 그린다 - 모든 페이지를 같은 틀로 찍어내지 않는다.

각 페이지는 "하나의 메시지"만 전달해야 하므로, 카드/타임라인의 각 항목은 사진과
그 사진을 설명하는 실제 원본 문구가 1:1로 짝지어진다(가능하면 attach_real_captions가
이미 붙여 놓은 이미지별 실제 캡션을 그대로 사용 - 여러 슬라이드의 문구를 뭉뚱그려
붙이지 않는다).
"""
from typing import Dict, List

from app.engine.captions import apply_captions
from app.utils.config import (
    CATEGORY_FALLBACK_CAPTION, PROCESS_MASTER_SEQUENCE, SITE_PHOTO_GUIDANCE_BY_WORK_TYPE,
)

CATEGORY_TO_STEP = {
    "세척_작업": "고압 세척", "바탕_정리": "바탕 정리", "균열_보수": "균열 보수 및 퍼티 작업",
    "퍼티_작업": "균열 보수 및 퍼티 작업", "하도": "하도 도장", "중도": "중도 도장",
    "상도": "상도 도장", "방수층": "방수층 시공", "시트_설치": "방수 시트 설치",
    "지붕_작업": "지붕재 시공", "코킹_실링": "코킹·실링", "양생": "양생",
}

DEFECT_LABELS = {
    "외벽_하자_균열": "균열", "외벽_하자_박리": "박리", "외벽_하자_오염": "오염",
    "외벽_하자_곰팡이": "곰팡이·백태", "외벽_하자_변색": "변색·백화",
    "누수_흔적": "누수", "철근_노출": "철근 노출", "기존_상태": "기존 상태",
}

# 공법 핵심(4페이지: 균열보수/퍼티/바탕정리/세척 등 "보수 방법"에 해당하는 초기 공정)에
# 우선 배정할 카테고리. 나머지 공정 카테고리는 뒤의 "시공 순서" 섹션에서 다룬다.
METHOD_CORE_CATEGORIES = {"균열_보수", "퍼티_작업", "바탕_정리", "세척_작업"}
# "주요 보수 방법" 페이지의 핵심 포인트 제목(카테고리별 짧은 명사형) + 표시 순서
METHOD_POINT_LABELS = {
    "세척_작업": "고압 세척", "바탕_정리": "바탕면 정리",
    "균열_보수": "균열부 보수", "퍼티_작업": "표면 정리 및 퍼티 작업",
}
METHOD_POINT_ORDER = ["세척_작업", "바탕_정리", "균열_보수", "퍼티_작업"]

DEFAULT_SETTINGS = {
    "max_total_pages": 14,
    "max_site_photo_pages": 3,      # 현장사진 최대 페이지 수
    "defect_images_per_page": 4,    # 하자 카드 최대 개수
    "method_images_per_page": 3,    # 대표 1 + 보조 최대 2
    "feature_images_cap": 4,        # 특징 카드 최대 개수
    "material_images_cap": 4,       # 사용 재료 카드 최대 개수
    "process_images_per_page": 4,   # 시공 순서 타임라인 한 페이지 최대 단계 수
    "process_pages_cap": 2,
    "case_pairs_cap": 2,            # 시공 전후 사례 최대 개수(첫 1개는 전체화면, 나머지는 압축 비교)
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


def _short(text: str, limit: int = 44) -> str:
    text = (text or "").strip()
    return text if len(text) <= limit else text[:limit - 1].rstrip() + "…"


def _caption_for(im, fallback: str = "") -> str:
    """이미지별 실제 원본 캡션(같은 슬라이드에서 나온 문구)을 우선 사용한다.
    여러 슬라이드의 문구를 뭉뚱그린 값이 아니라, 이 사진 하나에 대응하는 문구다."""
    real = getattr(im, "real_caption", None)
    if real:
        return _short(real)
    if im.category in CATEGORY_FALLBACK_CAPTION:
        return _short(CATEGORY_FALLBACK_CAPTION[im.category])
    return _short(fallback) if fallback else ""


def _site_photo_chunks(photos: List, max_pages: int) -> List[List]:
    """현장사진을 페이지 단위로 나눈다. 6장 이하면 한 페이지(레이아웃 함수가 장수에
    따라 내부적으로 배치를 바꾼다), 7장 이상이면 페이지당 6장씩 최대 max_pages까지."""
    if len(photos) <= 6:
        return [photos] if photos else []
    chunks = [photos[i:i + 6] for i in range(0, len(photos), 6)]
    return chunks[:max_pages]


def build_pages(apartment_name: str, work_type: str, groups: List[dict],
                 content_library: Dict[str, List[str]], ba_pairs: List, cover_image,
                 used_ids: set, images_by_id: Dict[str, object],
                 settings: Dict = None, change_log: List[str] = None,
                 site_photos: List = None) -> List[dict]:
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

    # ---------- 1. 표지 (hero: 대표 사진 1장 + 최소한의 문구) ----------
    pages.append({
        "type": "cover", "semantic_type": "hero",
        "title": f"{apartment_name} {work_type} 제안서",
        "subtitle": f"{work_type} 공사 안내 자료", "images": [cover_image] if cover_image else [],
        "bullets": [],
    })
    if cover_image:
        used_ids.add(cover_image.id)

    # ---------- 1-1. 현장사진 (site_photo_gallery: 사용자가 추가한 "이 아파트"의 실제
    #            현장사진, 최대 3페이지. 개별 사진을 AI가 분석해 균열/누수/박리 등
    #            특정 하자를 단정하는 캡션은 절대 만들지 않는다. 대신 사용자가 이미
    #            선택한 공종을 기준으로 한 공통 안내문구 하나만 페이지에 넣는다) ----------
    if site_photos:
        chunks = _site_photo_chunks(list(site_photos), s["max_site_photo_pages"])
        base_title = f"{apartment_name} 현장사진"
        guidance_template = SITE_PHOTO_GUIDANCE_BY_WORK_TYPE.get(
            work_type, SITE_PHOTO_GUIDANCE_BY_WORK_TYPE["기타"])
        guidance_text = guidance_template.format(apt=apartment_name)
        for chunk_idx, chunk in enumerate(chunks):
            for im in chunk:
                im.real_caption = None  # 개별 사진에는 어떤 캡션도(중립 번호조차) 붙이지 않는다.
            title = base_title if len(chunks) == 1 else f"{base_title} {chunk_idx+1}"
            pages.append({
                "type": "site_photos", "semantic_type": "site_photo_gallery",
                "title": unique_title(title),
                "images": chunk, "bullets": [guidance_text],
            })

    defect_groups = [g for g in groups if g["family"] == "defect"]
    process_groups = [g for g in groups if g["family"] == "process"]
    material_groups = [g for g in groups if g["family"] == "material"]
    overview_groups = [g for g in groups if g["family"] == "overview"]

    defect_pool_all = _sort_grade([im for g in defect_groups for im in g["images"]])
    defect_bullet_pool = _group_text_bullets(defect_groups, max_n=8) or _dedup_texts(
        content_library.get("필요성", []) + content_library.get("하자_현상", []) +
        content_library.get("하자_원인", []), 8)

    # ---------- 2. 공사가 필요한 이유 (reason_hero: 대표 하자사진 1장 크게 + 보조 2~3장 + 핵심 문구) ----------
    lead = take_unused(defect_pool_all, limit=1)
    support = take_unused(defect_pool_all, limit=3) if lead else []
    reason_bullets = defect_bullet_pool[:3]
    if lead and reason_bullets:
        pages.append({
            "type": "reason", "semantic_type": "reason_hero",
            "title": unique_title("공사가 필요한 이유"),
            "images": lead + support, "bullets": reason_bullets,
            "lead_image": lead[0], "support_images": support,
        })
    else:
        release(lead + support)

    # ---------- 3. 주요 하자 (four_cards: 하자 유형별 사진+캡션 카드) ----------
    remaining_defect = [im for im in defect_pool_all if im.id not in used_ids]
    seen_cat = set()
    cards = []
    # 서로 다른 하자 유형을 우선 한 장씩(다양성), 모자라면 같은 유형에서 추가로 채운다.
    for im in remaining_defect:
        if len(cards) >= s["defect_images_per_page"]:
            break
        if im.category in seen_cat:
            continue
        seen_cat.add(im.category)
        used_ids.add(im.id)
        cards.append(im)
    if len(cards) < s["defect_images_per_page"]:
        for im in remaining_defect:
            if len(cards) >= s["defect_images_per_page"]:
                break
            if im.id in used_ids:
                continue
            used_ids.add(im.id)
            cards.append(im)
    if cards:
        defect_cards = [{
            "image": im, "label": DEFECT_LABELS.get(im.category, im.category.replace("_", " ")),
            "caption": _caption_for(im, "하자 상태 참고사진"),
        } for im in cards]
        pages.append({
            "type": "defect", "semantic_type": "four_cards",
            "title": unique_title("주요 하자"),
            "images": cards, "bullets": [c["caption"] for c in defect_cards],
            "cards": defect_cards,
        })

    # ---------- 4. 보수 방법 / 공법 핵심 (image_text_split: 대표 시공사진 + 핵심
    #            포인트 2~4개. 원본 문구를 그대로 길게 붙이지 않고, 공정 카테고리별로
    #            "제목 1줄 + 설명 최대 2줄"로 축약한다 - 입주민이 한눈에 이해하도록) ----------
    method_groups = [g for g in process_groups if g["category"] in METHOD_CORE_CATEGORIES]
    method_groups_by_cat: Dict[str, List[dict]] = {}
    for g in method_groups:
        method_groups_by_cat.setdefault(g["category"], []).append(g)

    method_points = []
    for cat in METHOD_POINT_ORDER:
        glist = method_groups_by_cat.get(cat)
        if not glist:
            continue
        texts = _group_text_bullets(glist, max_n=1)
        if texts:
            desc = _short(texts[0], limit=70)
        else:
            rep_img = next((im for g in glist for im in g["images"]), None)
            desc = _caption_for(rep_img) if rep_img else ""
        if not desc:
            continue
        method_points.append({"title": METHOD_POINT_LABELS.get(cat, cat.replace("_", " ")), "desc": desc})
        if len(method_points) >= 4:
            break

    # 카테고리 기반 포인트가 너무 적으면(2개 미만) 일반 공법 설명 문구로 보강한다
    # (여전히 원본 문구만 사용 - 새로운 사실을 만들지 않음).
    if len(method_points) < 2:
        need = 4 - len(method_points)
        fallback_texts = _dedup_texts(
            content_library.get("공법_설명", []) + content_library.get("필요성", []), need)
        for i, t in enumerate(fallback_texts):
            method_points.append({"title": f"공법 개요 {i+1}", "desc": _short(t, limit=70)})

    method_pool = take_unused(_sort_grade([im for g in method_groups for im in g["images"]]),
                                limit=s["method_images_per_page"])
    if method_pool and method_points:
        pages.append({
            "type": "method_reason", "semantic_type": "image_text_split",
            "title": unique_title("주요 보수 방법"),
            "images": method_pool, "bullets": [p["desc"] for p in method_points],
            "lead_image": method_pool[0], "support_images": method_pool[1:3],
            "points": method_points,
        })
    else:
        release(method_pool)

    # ---------- 5. 공법 특징 (feature_cards: 특징 문구 + 관련 사진 카드) ----------
    feature_bullets = _dedup_texts(content_library.get("공법_특징", []), s["feature_images_cap"])
    feature_pool = _sort_grade([im for g in process_groups for im in g["images"] if im.id not in used_ids])
    if feature_bullets and feature_pool:
        n = min(len(feature_bullets), max(len(feature_pool), 1), s["feature_images_cap"])
        feature_imgs = []
        for i in range(n):
            im = feature_pool[i % len(feature_pool)]
            if im.id not in used_ids:
                used_ids.add(im.id)
            feature_imgs.append(im)
        feature_cards = [{
            "image": feature_imgs[i], "label": f"특징 {i+1}", "caption": _short(feature_bullets[i]),
        } for i in range(n)]
        pages.append({
            "type": "features", "semantic_type": "feature_cards",
            "title": unique_title("공법 특징"),
            "images": feature_imgs, "bullets": feature_bullets[:n],
            "cards": feature_cards,
        })

    # ---------- 5-1. 사용 재료 (material_cards: 원본 자료에 자재 콘텐츠가 실제로 있을
    #            때만 생성 - 고정 템플릿으로 억지로 만들지 않는다) ----------
    material_pool = _sort_grade([im for g in material_groups for im in g["images"] if im.id not in used_ids])
    material_bullets = _dedup_texts(content_library.get("자재_설명", []), s["material_images_cap"])
    if material_pool:
        n = min(max(len(material_bullets), 1), len(material_pool), s["material_images_cap"])
        material_imgs = take_unused(material_pool, limit=n)
        material_cards = [{
            "image": material_imgs[i],
            # 카드 제목은 한 줄(카드 폭 기준 약 9~10자)에 들어가도록 문장 중간을 자르지
            # 않고 짧게 축약한다 - 원본 문구 전체는 caption에 그대로 담는다.
            "label": _short(material_bullets[i], limit=9) if i < len(material_bullets) else "사용 자재",
            "caption": _short(material_bullets[i]) if i < len(material_bullets)
                        else _caption_for(material_imgs[i], "시공 자재/장비 참고사진"),
        } for i in range(len(material_imgs))]
        page_bullets = [c["caption"] for c in material_cards]
        if material_imgs and page_bullets:
            pages.append({
                "type": "material", "semantic_type": "material_cards",
                "title": unique_title("사용 재료"),
                "images": material_imgs, "bullets": page_bullets,
                "cards": material_cards,
            })
        else:
            release(material_imgs)

    # ---------- 6. 시공 순서 (process_timeline: 단계별 사진+단계명+설명) ----------
    order_index = {name: i for i, (name, _) in enumerate(PROCESS_MASTER_SEQUENCE)}
    remaining_process = [g for g in process_groups if g["category"] not in METHOD_CORE_CATEGORIES]
    remaining_process.sort(key=lambda g: order_index.get(CATEGORY_TO_STEP.get(g["category"], ""), 999))
    process_pool = []
    for g in remaining_process:
        process_pool.extend(_sort_grade(g["images"]))
    process_pool = [im for im in process_pool if im.id not in used_ids]
    per_page = s["process_images_per_page"]
    process_chunks = [process_pool[i:i + per_page] for i in range(0, len(process_pool), per_page)]
    process_chunks = process_chunks[:s["process_pages_cap"]]
    for idx, chunk in enumerate(process_chunks):
        chunk_used = take_unused(chunk)
        steps = [{
            "image": im, "step_no": i + 1,
            "label": CATEGORY_TO_STEP.get(im.category, im.category.replace("_", " ")),
            "desc": _caption_for(im, "시공 공정 참고사진"),
        } for i, im in enumerate(chunk_used)]
        title = "시공 순서" if len(process_chunks) == 1 else f"시공 순서 {idx+1}"
        pages.append({
            "type": "process", "semantic_type": "process_timeline",
            "title": unique_title(title),
            "images": chunk_used, "bullets": [st["desc"] for st in steps],
            "steps": steps,
        })

    # ---------- 7~8. 시공 전후 사례 (첫 1건: before_after 전체화면 / 나머지: two_case_compare 압축) ----------
    case_note_pool = (content_library.get("사례_설명", []) + content_library.get("시공_후_효과", [])) or \
        ["보수 및 재도장 시공 전후 비교입니다."]
    usable_pairs = ba_pairs[:s["case_pairs_cap"]]
    if usable_pairs:
        first = usable_pairs[0]
        pages.append({
            "type": "case", "semantic_type": "before_after",
            "title": unique_title("유사 시공 전후 사례"),
            "pair": first, "bullets": [case_note_pool[0]], "images": [],
        })
        used_ids.add(first.before_image_id)
        used_ids.add(first.after_image_id)
        used_ids.update(first.process_image_ids or [])

        rest = usable_pairs[1:]
        if rest:
            cases = []
            for i, pair in enumerate(rest, start=1):
                cases.append({"pair": pair, "note": case_note_pool[i % len(case_note_pool)]})
                used_ids.add(pair.before_image_id)
                used_ids.add(pair.after_image_id)
                used_ids.update(pair.process_image_ids or [])
            pages.append({
                "type": "case", "semantic_type": "two_case_compare",
                "title": unique_title("추가 시공 전후 사례"),
                "cases": cases, "bullets": [c["note"] for c in cases], "images": [],
            })

    # ---------- 9. 기대 효과 (effects_hero: 완료사진 1장 + 짧은 효과 문구들) ----------
    effect_bullets = _dedup_texts(
        content_library.get("기대_효과", []) + content_library.get("시공_후_효과", []), 4)
    effect_pool = _sort_grade([im for g in overview_groups for im in g["images"] if im.id not in used_ids])
    effect_image = take_unused(effect_pool, limit=1)
    if effect_image and effect_bullets:
        pages.append({
            "type": "effects", "semantic_type": "effects_hero",
            "title": unique_title("기대 효과"),
            "images": effect_image, "bullets": effect_bullets,
            "image": effect_image[0],
        })
    else:
        release(effect_image)
        # 사진이 없으면 페이지를 억지로 만들지 않고 문구를 마무리 페이지로 넘긴다.
        content_library.setdefault("_leftover_effects", [])
        content_library["_leftover_effects"] = effect_bullets

    # ---------- 10. 마무리 (closing: 여백 중심, 문구 최소화) ----------
    closing_bullets = [] if (effect_image and effect_bullets) else content_library.get("_leftover_effects", [])
    closing_bullets = closing_bullets[:2] if closing_bullets else \
        ([] if effect_image else ["안전하고 쾌적한 주거환경 조성을 위해 이번 공사를 진행합니다."])
    closing_pool = _sort_grade([im for g in overview_groups for im in g["images"] if im.id not in used_ids])
    closing_image = take_unused(closing_pool, limit=1)
    pages.append({
        "type": "closing", "semantic_type": "closing",
        "title": unique_title("끝까지 안전한 시공을 약속드립니다"),
        "images": closing_image, "bullets": closing_bullets,
    })

    # ---------- 11. 전체 페이지 수 상한 강제 (낮은 우선순위부터 정리) ----------
    def _all_images(p):
        if p.get("cases"):
            out = []
            for c in p["cases"]:
                for iid in [c["pair"].before_image_id, c["pair"].after_image_id] + \
                        list(c["pair"].process_image_ids or []):
                    im = images_by_id.get(iid)
                    if im:
                        out.append(im)
            return out
        if p.get("pair"):
            out = []
            for iid in [p["pair"].before_image_id, p["pair"].after_image_id] + \
                    list(p["pair"].process_image_ids or []):
                im = images_by_id.get(iid)
                if im:
                    out.append(im)
            return out
        return p.get("images", [])

    droppable_order = ("effects", "material", "case", "process", "defect")
    while len(pages) > s["max_total_pages"]:
        removed = False
        for t in droppable_order:
            candidates = [p for p in pages if p["type"] == t]
            if len(candidates) >= 1:
                target = candidates[-1]
                release(_all_images(target))
                pages.remove(target)
                removed = True
                break
        if not removed:
            break

    all_selected = []
    for p in pages:
        for im in p.get("images", []):
            if im:
                im.selected = True
                all_selected.append(im)
        case_pairs = [p["pair"]] if p.get("pair") else [c["pair"] for c in p.get("cases", [])]
        for pair in case_pairs:
            for iid in [pair.before_image_id, pair.after_image_id] + list(pair.process_image_ids or []):
                im = images_by_id.get(iid)
                if im:
                    im.selected = True
                    all_selected.append(im)

    # 현장사진(source_type=current_site)은 apply_captions 대상에서 제외한다 - 개별
    # 사진에 대해 어떤 캡션도(중립적인 자동 생성 문구조차) 붙이지 않기 위함이다.
    captionable = [im for im in all_selected if getattr(im, "source_type", "reference_ppt") != "current_site"]
    apply_captions(captionable)

    return pages
