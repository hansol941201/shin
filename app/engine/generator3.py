# -*- coding: utf-8 -*-
"""
Generator3: PowerPoint 템플릿 엔진 기반 렌더러(신규 아키텍처의 ⑤단계).

역할 분리 원칙: "디자인 = 사람이 제작(templates/*.pptx), 콘텐츠 배치 = AI".
이 파일은 새로운 도형/색상/레이아웃을 코드로 그리지 않는다. story.py가 만든
pages(콘텐츠)를 보고 페이지 목적에 맞는 카테고리의 실제 PowerPoint 템플릿
파일을 template_engine에서 고른 뒤, placeholder_engine으로 {{PLACEHOLDER}}만
채우고, pptx_clone으로 그 슬라이드를 최종 출력 Presentation에 그대로 복제한다.

아직 해당 카테고리 템플릿이 없거나(예: 두 사례 비교) 페이지 콘텐츠 양이
템플릿 슬롯 수를 넘는 경우에는 generator2.py의 기존 코드 렌더러로 안전하게
대체(fallback)한다 - 이렇게 하면 templates/ 폴더에 새 템플릿 파일만 추가해도
점진적으로 템플릿 기반 렌더링 비중이 늘어나고, 코드 수정이 필요 없다.
"""
import os
from typing import Dict, List, Optional

from app.engine import generator2 as g2
from app.engine.placeholder_engine import fill_template
from app.engine.pptx_clone import clone_slide_into
from app.engine.render_utils import new_presentation
from app.engine.template_engine import has_templates, pick_template

STEP_TEMPLATE_BY_COUNT = {4: "process_4step", 5: "process_5step"}


def _path_or_none(im) -> Optional[str]:
    return im.path if im else None


def _build_cover(page) -> (Dict[str, str], Dict[str, str]):
    img = page["images"][0] if page.get("images") else None
    text_map = {"PAGE_TITLE": page.get("title", ""), "PAGE_SUBTITLE": page.get("subtitle", "")}
    photo_map = {"PHOTO_1": _path_or_none(img)}
    return text_map, photo_map


def _build_site_photos(page):
    images = page.get("images", [])
    if len(images) > 3:
        return None  # 템플릿 슬롯(3장)을 넘으면 generator2 폴백(사진을 억지로 자르지 않음)
    guidance = (page.get("bullets") or [""])[0]
    text_map = {"PAGE_TITLE": page.get("title", ""), "GUIDANCE": guidance}
    photo_map = {}
    for i, im in enumerate(images):
        photo_map[f"PHOTO_{i+1}"] = im.path
    return text_map, photo_map


def _build_need(page):
    lead = page.get("lead_image")
    support = (page.get("support_images") or [])[:2]
    bullets = (page.get("bullets") or [])[:3]
    text_map = {"PAGE_TITLE": page.get("title", "")}
    for i, b in enumerate(bullets):
        text_map[f"DESC_{i+1}"] = b
    photos = [lead] + support if lead else list(support)
    photo_map = {}
    for i, im in enumerate(photos[:3]):
        photo_map[f"PHOTO_{i+1}"] = _path_or_none(im)
    return text_map, photo_map


def _build_card_grid(page, max_cards: int):
    cards = page.get("cards", [])
    if not cards or len(cards) > max_cards:
        return None
    text_map = {"PAGE_TITLE": page.get("title", "")}
    photo_map = {}
    for i, c in enumerate(cards):
        n = i + 1
        text_map[f"TITLE_{n}"] = c.get("label", "")
        text_map[f"DESC_{n}"] = c.get("caption", "")
        img = c.get("image")
        photo_map[f"PHOTO_{n}"] = _path_or_none(img)
    return text_map, photo_map


def _build_method(page):
    points = page.get("points") or []
    if not points or len(points) > 3:
        return None
    lead = page.get("lead_image")
    support = (page.get("support_images") or [])[:2]
    text_map = {"PAGE_TITLE": page.get("title", "")}
    for i, p in enumerate(points):
        text_map[f"TITLE_{i+1}"] = p.get("title", "")
        text_map[f"DESC_{i+1}"] = p.get("desc", "")
    photo_map = {"PHOTO_1": _path_or_none(lead)}
    for i, im in enumerate(support):
        photo_map[f"PHOTO_{i+2}"] = _path_or_none(im)
    return text_map, photo_map


def _build_process(page):
    steps = page.get("steps", [])
    n = len(steps)
    if n not in STEP_TEMPLATE_BY_COUNT:
        return None
    text_map = {"PAGE_TITLE": page.get("title", "")}
    photo_map = {}
    for st in steps:
        i = st["step_no"]
        text_map[f"STEP_{i}"] = st.get("label", "")
        text_map[f"STEP_DESC_{i}"] = st.get("desc", "")
        photo_map[f"PHOTO_{i}"] = _path_or_none(st.get("image"))
    return STEP_TEMPLATE_BY_COUNT[n], text_map, photo_map


def _build_before_after(page, images_by_id: Dict[str, object]):
    pair = page.get("pair")
    if not pair:
        return None
    before = images_by_id.get(pair.before_image_id)
    after = images_by_id.get(pair.after_image_id)
    bullets = page.get("bullets") or []
    text_map = {"PAGE_TITLE": page.get("title", ""), "DESC_1": bullets[0] if bullets else ""}
    photo_map = {"PHOTO_BEFORE": _path_or_none(before), "PHOTO_AFTER": _path_or_none(after)}
    return text_map, photo_map


def _build_effects(page):
    bullets = (page.get("bullets") or [])[:4]
    img = page.get("image") or (page["images"][0] if page.get("images") else None)
    text_map = {"PAGE_TITLE": page.get("title", "")}
    for i, b in enumerate(bullets):
        text_map[f"DESC_{i+1}"] = b
    photo_map = {"PHOTO_1": _path_or_none(img)}
    return text_map, photo_map


def _build_closing(page):
    img = page["images"][0] if page.get("images") else None
    bullets = (page.get("bullets") or [])[:2]
    text_map = {"PAGE_TITLE": page.get("title", "")}
    for i, b in enumerate(bullets):
        text_map[f"DESC_{i+1}"] = b
    photo_map = {"PHOTO_1": _path_or_none(img)} if img else {}
    return text_map, photo_map


def _fallback_slide(page, page_no, images_by_id):
    """generator2.py의 기존 코드 렌더러로 이 페이지 하나만 그려서 슬라이드를
    반환한다(템플릿이 아직 없거나 콘텐츠가 템플릿 슬롯 수를 넘는 경우)."""
    stype = page.get("semantic_type")
    tmp_prs = new_presentation()
    if page.get("type") == "cover":
        g2.render_hero(tmp_prs, page, None)
    elif stype in ("before_after", "two_case_compare"):
        page["_images_by_id"] = images_by_id
        g2.SEMANTIC_RENDERERS[stype](tmp_prs, page, page_no)
    elif stype in g2.SEMANTIC_RENDERERS:
        g2.SEMANTIC_RENDERERS[stype](tmp_prs, page, page_no)
    else:
        g2.render_content_page(tmp_prs, page, page_no)
    return tmp_prs.slides[-1]


def _template_fill_args(page, images_by_id):
    """페이지 종류에 맞는 (카테고리, text_map, photo_map)을 만든다. 이 페이지
    종류에 아직 템플릿이 없거나 콘텐츠가 템플릿 슬롯 수를 넘으면 None을 반환해
    폴백을 유도한다."""
    t = page["type"]
    if t == "cover":
        text_map, photo_map = _build_cover(page)
        return "cover", text_map, photo_map
    if t == "site_photos":
        built = _build_site_photos(page)
        return ("site_photos",) + built if built else None
    if t == "reason":
        return ("reason",) + _build_need(page)
    if t == "defect":
        built = _build_card_grid(page, max_cards=4)
        return ("defect",) + built if built else None
    if t == "method_reason":
        built = _build_method(page)
        return ("method_reason",) + built if built else None
    if t == "features":
        built = _build_card_grid(page, max_cards=3)
        return ("features",) + built if built else None
    if t == "material":
        built = _build_card_grid(page, max_cards=3)
        return ("material",) + built if built else None
    if t == "process":
        built = _build_process(page)
        if not built:
            return None
        step_cat, text_map, photo_map = built
        return (step_cat, text_map, photo_map)
    if t == "case" and page.get("semantic_type") == "before_after":
        built = _build_before_after(page, images_by_id)
        return ("case", *built) if built else None
    if t == "effects":
        return ("effects",) + _build_effects(page)
    if t == "closing":
        return ("closing",) + _build_closing(page)
    return None


# template_engine의 CATEGORY_FOLDERS는 story.py의 semantic_type 기준이라 process를
# 세부적으로 구분하지 못한다. generator3는 카테고리를 직접 폴더명으로 다룬다.
CATEGORY_FOLDER_OVERRIDE = {
    "cover": "cover", "site_photos": "site_photo", "reason": "need", "defect": "defect",
    "method_reason": "method", "features": "feature", "material": "material",
    "process_4step": "process", "process_5step": "process", "case": "before_after",
    "effects": "effect", "closing": "closing",
}


def _pick_template_for(category: str, prev_by_folder: Dict[str, str]):
    folder = CATEGORY_FOLDER_OVERRIDE.get(category, category)
    if not has_templates(folder):
        return None
    prev = prev_by_folder.get(folder)
    path = pick_template(folder, prev_path=prev)
    if path:
        prev_by_folder[folder] = path
    return path


def generate_pptx_v3(pages: List[dict], images_by_id: Dict[str, object], out_path: str,
                       log_fn=None) -> str:
    """템플릿 엔진(우선) + generator2 폴백을 함께 사용해 PPTX를 생성한다. 저장
    직후 반드시 파일이 실제로 존재하고 크기가 0보다 큰지 확인한다."""
    def _log(msg):
        if log_fn:
            log_fn(msg)
        else:
            print(msg, flush=True)

    out_prs = new_presentation()
    prev_by_folder: Dict[str, str] = {}
    page_no = 0
    render_log = []

    for page in pages:
        is_cover = page.get("type") == "cover"
        if not is_cover:
            page_no += 1
        args = _template_fill_args(page, images_by_id)
        used_template = None
        if args:
            category, text_map, photo_map = args
            template_path = _pick_template_for(category, prev_by_folder)
            if template_path:
                try:
                    filled_prs = fill_template(template_path, text_map, photo_map)
                    src_slide = filled_prs.slides[0]
                    clone_slide_into(out_prs, src_slide)
                    used_template = os.path.basename(template_path)
                except Exception as e:
                    _log(f"[generator3] 템플릿 채우기 실패({template_path}): {e} - generator2 폴백 사용")
                    used_template = None

        if not used_template:
            src_slide = _fallback_slide(page, page_no, images_by_id)
            clone_slide_into(out_prs, src_slide)

        for im in page.get("images", []):
            if im:
                im.selected_slide = page_no if not is_cover else 1
        if page.get("pair"):
            for iid in [page["pair"].before_image_id, page["pair"].after_image_id] + \
                    list(page["pair"].process_image_ids or []):
                im = images_by_id.get(iid)
                if im:
                    im.selected_slide = page_no
        for c in page.get("cases", []):
            for iid in [c["pair"].before_image_id, c["pair"].after_image_id] + \
                    list(c["pair"].process_image_ids or []):
                im = images_by_id.get(iid)
                if im:
                    im.selected_slide = page_no

        render_log.append(
            f"{page_no if not is_cover else 1}:{page.get('title','')}="
            f"{'template:' + used_template if used_template else 'generator2_fallback'}"
        )

    _log("[generator3] 페이지별 렌더링 방식 선택 결과 - " + " / ".join(render_log))
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    _log(f"[generator3] Presentation.save() 호출 직전 - 총 {len(out_prs.slides)}슬라이드, 저장 경로={out_path}")
    out_prs.save(out_path)

    saved_ok = os.path.exists(out_path)
    size = os.path.getsize(out_path) if saved_ok else 0
    if not saved_ok or size == 0:
        _log(f"[generator3] PPT 저장 실패 - 경로={out_path}, 존재={saved_ok}, 크기={size} bytes")
        raise RuntimeError(
            f"PPTX 저장에 실패했습니다(파일이 생성되지 않았거나 비어 있음): {out_path}"
        )
    _log(f"[generator3] PPT 저장 완료 - 경로={out_path}, 파일크기={size:,} bytes")
    return out_path
