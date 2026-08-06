# -*- coding: utf-8 -*-
"""
콘텐츠 그룹(사건/공정 단위)과 원본 문구 라이브러리로부터 입주민 설명자료의 스토리를
구성한다. 페이지 수는 고정하지 않고 실제로 확보된 콘텐츠 양에 따라 결정한다.
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

MIN_IMAGES_PER_PAGE = 2
MAX_IMAGES_PER_PAGE = 4
FLOW_MAX_IMAGES_PER_PAGE = 6
MIN_TEXT_BULLETS_FOR_TEXT_PAGE = 3


def _paginate(images: List, min_per=MIN_IMAGES_PER_PAGE, max_per=MAX_IMAGES_PER_PAGE, hard_max=None):
    hard_max = hard_max or max_per
    chunks, i, n = [], 0, len(images)
    while i < n:
        remaining = n - i
        take = min(max_per, remaining)
        if 0 < remaining - take < min_per:
            take = min(remaining, hard_max)
        chunks.append(images[i:i + take])
        i += take
    return chunks


def _group_images(groups: List[dict], families) -> List:
    out = []
    for g in groups:
        if g["family"] in families:
            out.extend(g["images"])
    return out


def _group_text_bullets(groups: List[dict], max_n=6) -> List[str]:
    seen, out = set(), []
    for g in groups:
        for t in sorted(g["texts"], key=lambda t: -t.importance):
            if t.cleaned not in seen:
                seen.add(t.cleaned)
                out.append(t.cleaned)
            if len(out) >= max_n:
                return out
    return out


def _page_ok(images: List, bullets: List[str]) -> bool:
    """페이지 생성 최소 기준(요청 스펙 9): 사진 2장 이상, 또는 사진1장+구체설명2개 이상,
    또는 핵심 설명 문구 3개 이상."""
    if len(images) >= 2:
        return True
    if len(images) == 1 and len(bullets) >= 2:
        return True
    if len(bullets) >= MIN_TEXT_BULLETS_FOR_TEXT_PAGE:
        return True
    return False


def _layout_for(n_images: int, is_flow=False) -> str:
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
    return "flow6" if is_flow else "grid4"


def build_pages(apartment_name: str, work_type: str, groups: List[dict],
                 content_library: Dict[str, List[str]], ba_pairs: List, cover_image,
                 used_ids: set, images_by_id: Dict[str, object]) -> List[dict]:
    pages: List[dict] = []

    # ---------- 표지 ----------
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
    safety_groups = [g for g in groups if g["family"] == "safety"]
    overview_groups = [g for g in groups if g["family"] == "overview"]
    other_groups = [g for g in groups if g["family"] == "other"]

    def take_unused(imgs, limit=None):
        """미사용 이미지만 골라 사용 처리한다. limit을 넘는 나머지는 여기서 소비하지
        않고 그대로 남겨두어(used_ids에 추가하지 않음) 다른 섹션/갤러리에서 계속 쓸 수
        있게 한다(중요: limit으로 자르기 전에 전부 used 처리해버리면 사진이 조용히
        유실되는 버그가 생기므로 반드시 limit 자체를 여기서 적용해야 한다)."""
        out = []
        for im in imgs:
            if limit is not None and len(out) >= limit:
                break
            if im.id not in used_ids:
                out.append(im)
                used_ids.add(im.id)
        return out

    # ---------- 우리 아파트에서 확인된 문제 (하자 현황) ----------
    defect_images = take_unused(_group_images(defect_groups, {"defect"}))
    defect_bullets = _group_text_bullets(defect_groups, max_n=4) or content_library.get("하자_현상", [])[:4]
    if defect_images or len(defect_bullets) >= MIN_TEXT_BULLETS_FOR_TEXT_PAGE:
        chunks = _paginate(defect_images, hard_max=MAX_IMAGES_PER_PAGE) or [[]]
        for idx, chunk in enumerate(chunks):
            if not _page_ok(chunk, defect_bullets):
                for im in chunk:
                    used_ids.discard(im.id)
                continue
            pages.append({
                "type": "defect",
                "title": "제공된 자료에서 확인된 주요 보수 대상"
                          + (f" ({idx+1}/{len(chunks)})" if len(chunks) > 1 else ""),
                "subtitle": "", "images": chunk, "bullets": defect_bullets if idx == 0 else [],
                "layout": _layout_for(len(chunk)),
            })

    # ---------- 공법 선정 이유 / 핵심 원리 (문구 중심 + 대표 사진 1장) ----------
    reason_bullets = (content_library.get("필요성", []) + content_library.get("공법_설명", []))[:4]
    method_lead_img = None
    for g in process_groups:
        cand = [i for i in g["images"] if i.id not in used_ids]
        if cand:
            method_lead_img = cand[0]
            break
    if reason_bullets or method_lead_img:
        imgs = [method_lead_img] if method_lead_img else []
        if imgs and _page_ok(imgs, reason_bullets) or (not imgs and len(reason_bullets) >= MIN_TEXT_BULLETS_FOR_TEXT_PAGE):
            if method_lead_img:
                used_ids.add(method_lead_img.id)
            pages.append({
                "type": "method_reason", "title": "보수 방향과 공법 선정 이유", "subtitle": "",
                "images": imgs, "bullets": reason_bullets, "layout": _layout_for(len(imgs)),
            })

    # ---------- 공법 특징 ----------
    feature_bullets = content_library.get("공법_특징", [])[:6]
    feature_images = take_unused(_group_images(process_groups + material_groups, {"process", "material"}), limit=4)
    if feature_bullets or feature_images:
        if _page_ok(feature_images, feature_bullets):
            pages.append({
                "type": "features", "title": "적용 공법의 핵심 원리", "subtitle": "",
                "images": feature_images, "bullets": feature_bullets,
                "layout": _layout_for(len(feature_images)),
            })
        else:
            for im in feature_images:
                used_ids.discard(im.id)

    # ---------- 세부 시공 순서 (공정 그룹을 표준 순서대로 배치) ----------
    order_index = {name: i for i, (name, _) in enumerate(PROCESS_MASTER_SEQUENCE)}
    process_groups_sorted = sorted(
        process_groups,
        key=lambda g: order_index.get(CATEGORY_TO_STEP.get(g["category"], ""), 999),
    )
    for g in process_groups_sorted:
        imgs = take_unused(g["images"])
        bullets = _group_text_bullets([g], max_n=3)
        if not _page_ok(imgs, bullets):
            for im in imgs:
                used_ids.discard(im.id)
            continue
        step_name = CATEGORY_TO_STEP.get(g["category"], g["category"].replace("_", " "))
        chunks = _paginate(imgs, max_per=FLOW_MAX_IMAGES_PER_PAGE, hard_max=FLOW_MAX_IMAGES_PER_PAGE) or [[]]
        for idx, chunk in enumerate(chunks):
            pages.append({
                "type": "process", "title": step_name
                          + (f" ({idx+1}/{len(chunks)})" if len(chunks) > 1 else ""),
                "subtitle": "", "images": chunk, "bullets": bullets if idx == 0 else [],
                "layout": _layout_for(len(chunk), is_flow=True),
            })

    # ---------- 품질관리 및 안전관리 ----------
    safety_images = take_unused(_group_images(safety_groups, {"safety"}), limit=4)
    safety_bullets = _group_text_bullets(safety_groups, max_n=3)
    if _page_ok(safety_images, safety_bullets):
        pages.append({
            "type": "safety", "title": "품질관리 및 안전관리", "subtitle": "",
            "images": safety_images, "bullets": safety_bullets,
            "layout": _layout_for(len(safety_images)),
        })
    else:
        for im in safety_images:
            used_ids.discard(im.id)

    # ---------- 시공 전후 / 유사 사례 ----------
    case_note_pool = (content_library.get("사례_설명", []) + content_library.get("시공_후_효과", [])) or \
        ["보수 및 재도장 시공 전후 비교입니다."]
    for i, pair in enumerate(ba_pairs, start=1):
        before, after = pair.before_image_id, pair.after_image_id
        pages.append({
            "type": "case", "title": f"시공 전후 비교 {i}", "subtitle": "",
            "pair": pair, "bullets": [case_note_pool[(i - 1) % len(case_note_pool)]],
            "layout": "compare2",
        })
        used_ids.add(before)
        used_ids.add(after)
        used_ids.update(pair.process_image_ids or [])

    # ---------- 공사 후 기대되는 변화 ----------
    effect_bullets = (content_library.get("기대_효과", []) + content_library.get("시공_후_효과", []))[:6]
    effect_images = take_unused(_group_images(overview_groups, {"overview"}), limit=4)
    if effect_bullets or effect_images:
        if _page_ok(effect_images, effect_bullets) or len(effect_bullets) >= MIN_TEXT_BULLETS_FOR_TEXT_PAGE:
            pages.append({
                "type": "effects", "title": "공사 후 기대되는 변화", "subtitle": "",
                "images": effect_images, "bullets": effect_bullets,
                "layout": _layout_for(len(effect_images)),
            })
        else:
            for im in effect_images:
                used_ids.discard(im.id)

    # ---------- 남은 사진: 참고 시공 사진 갤러리 (버리지 않고 최대한 활용) ----------
    leftover = take_unused(_group_images(other_groups + defect_groups + process_groups +
                                           material_groups + safety_groups + overview_groups,
                                           {"other", "defect", "process", "material", "safety", "overview"}))
    if leftover:
        chunks = _paginate(leftover, min_per=2, max_per=6, hard_max=6)
        for idx, chunk in enumerate(chunks):
            if len(chunk) < 2:
                for im in chunk:
                    used_ids.discard(im.id)
                continue
            pages.append({
                "type": "gallery", "title": "참고 시공 사진"
                          + (f" ({idx+1}/{len(chunks)})" if len(chunks) > 1 else ""),
                "subtitle": "", "images": chunk, "bullets": [], "layout": "gallery",
            })

    # ---------- 마무리 ----------
    pages.append({
        "type": "closing", "title": "안전하고 쾌적한 우리 아파트를 위한 제안", "subtitle": "",
        "images": [], "bullets": [], "layout": "text",
    })

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
