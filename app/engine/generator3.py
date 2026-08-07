# -*- coding: utf-8 -*-
"""
Generator3: PowerPoint 템플릿 엔진 기반 렌더러(신규 아키텍처의 ⑤단계).

역할 분리 원칙: "디자인 = 사람이 제작(templates/*.pptx), 콘텐츠 배치 = AI".
이 파일은 새로운 도형/색상/레이아웃을 코드로 그리지 않는다. story.py가 만든
pages(콘텐츠)를 보고 페이지 목적 + 콘텐츠 개수(사진/카드/스텝 수)에 맞는 실제
PowerPoint 템플릿 파일을 template_engine에서 고른 뒤, placeholder_engine으로
{{PLACEHOLDER}}만 채우고, pptx_clone으로 그 슬라이드를 최종 출력 Presentation에
그대로 복제한다.

[2026-08 디자인 개편] 하나의 카테고리 폴더(예: templates/process/) 안에 콘텐츠
개수별로 서로 다른 실제 구성(3/4/5/6 STEP, 대표사진형/2분할형/3카드형 등)의
템플릿이 여러 개 들어있으므로, 파일명 접두어로 "이 페이지 콘텐츠 개수에 정확히
맞는 템플릿"만 후보로 좁힌 뒤 고른다(무작위로아무 파일이나 고르지 않음).

아직 해당 콘텐츠 개수에 맞는 템플릿이 없거나 콘텐츠 양이 가장 큰 템플릿의
슬롯 수도 넘는 경우에는 generator2.py의 기존 코드 렌더러로 안전하게 대체
(fallback)한다 - 이렇게 하면 templates/ 폴더에 새 템플릿 파일만 추가해도
점진적으로 템플릿 기반 렌더링 비중이 늘어나고, 코드 수정이 필요 없다.
"""
import os
from typing import Dict, List, Optional

from app.engine import generator2 as g2
from app.engine.placeholder_engine import fill_template
from app.engine.pptx_clone import clone_slide_into
from app.engine.render_utils import new_presentation
from app.engine.template_engine import list_templates

STEP_CATEGORY_BY_COUNT = {3: "process_3step", 4: "process_4step", 5: "process_5step", 6: "process_6step"}
DEFECT_CATEGORY_BY_COUNT = {1: "defect_hero", 2: "defect_split", 3: "defect_3card"}
REPAIR_CATEGORY_BY_COUNT = {2: "repair_2point", 3: "repair_3point", 4: "repair_4point"}


def _path_or_none(im) -> Optional[str]:
    return im.path if im else None


def _build_cover(page) -> (Dict[str, str], Dict[str, str]):
    img = page["images"][0] if page.get("images") else None
    text_map = {"PAGE_TITLE": page.get("title", ""), "PAGE_SUBTITLE": page.get("subtitle", "")}
    photo_map = {"PHOTO_1": _path_or_none(img)}
    return text_map, photo_map


def _build_site_photos(page):
    """사진 장수에 따라 1장/2장/3~5장 중 정확히 맞는 카테고리를 고른다(장수가
    다른 템플릿에 억지로 끼워 맞추지 않음)."""
    images = page.get("images", [])
    n = len(images)
    if n == 1:
        category = "site_photo_1"
    elif n == 2:
        category = "site_photo_2"
    elif 3 <= n <= 5:
        category = "site_photo_multi"
    else:
        return None
    guidance = (page.get("bullets") or [""])[0]
    text_map = {"PAGE_TITLE": page.get("title", ""), "GUIDANCE": guidance}
    photo_map = {f"PHOTO_{i+1}": im.path for i, im in enumerate(images)}
    return category, text_map, photo_map


def _build_need(page):
    lead = page.get("lead_image")
    support = (page.get("support_images") or [])[:2]
    bullets = (page.get("bullets") or [])[:3]
    text_map = {"PAGE_TITLE": page.get("title", "")}
    for i, b in enumerate(bullets):
        text_map[f"DESC_{i+1}"] = b
    photo_map = {"PHOTO_1": _path_or_none(lead)}
    return text_map, photo_map


def _build_defect(page):
    cards = page.get("cards", [])
    n = len(cards)
    category = DEFECT_CATEGORY_BY_COUNT.get(n)
    if not category:
        return None
    text_map = {"PAGE_TITLE": page.get("title", "")}
    photo_map = {}
    for i, c in enumerate(cards):
        k = i + 1
        text_map[f"TITLE_{k}"] = c.get("label", "")
        text_map[f"DESC_{k}"] = c.get("caption", "")
        photo_map[f"PHOTO_{k}"] = _path_or_none(c.get("image"))
    return category, text_map, photo_map


def _build_card_grid(page, category_by_count: Dict[int, str], max_cards: int):
    """공법 특징/사용 자재처럼 그리드형 카드 페이지. 실제 카드 수가 그리드
    슬롯 수보다 적어도(예: 4칸 템플릿에 3장) 남는 칸은 그냥 여백으로 남는다
    (플레이스홀더 그룹째 제거 - 프리미엄 브로슈어는 여백도 디자인 요소)."""
    cards = page.get("cards", [])
    n = len(cards)
    if n == 0 or n > max_cards:
        return None
    category = next((c for count, c in sorted(category_by_count.items()) if n <= count), None)
    if not category:
        return None
    text_map = {"PAGE_TITLE": page.get("title", "")}
    photo_map = {}
    for i, c in enumerate(cards):
        k = i + 1
        text_map[f"TITLE_{k}"] = c.get("label", "")
        text_map[f"DESC_{k}"] = c.get("caption", "")
        photo_map[f"PHOTO_{k}"] = _path_or_none(c.get("image"))
    return category, text_map, photo_map


def _build_repair(page):
    points = page.get("points") or []
    n = len(points)
    category = REPAIR_CATEGORY_BY_COUNT.get(n)
    if not category:
        return None
    lead = page.get("lead_image")
    text_map = {"PAGE_TITLE": page.get("title", "")}
    for i, p in enumerate(points):
        text_map[f"TITLE_{i+1}"] = p.get("title", "")
        text_map[f"DESC_{i+1}"] = p.get("desc", "")
    photo_map = {"PHOTO_1": _path_or_none(lead)}
    return category, text_map, photo_map


def _build_process(page):
    steps = page.get("steps", [])
    n = len(steps)
    category = STEP_CATEGORY_BY_COUNT.get(n)
    if not category:
        return None
    text_map = {"PAGE_TITLE": page.get("title", "")}
    photo_map = {}
    for st in steps:
        i = st["step_no"]
        text_map[f"STEP_{i}"] = st.get("label", "")
        text_map[f"STEP_DESC_{i}"] = st.get("desc", "")
        photo_map[f"PHOTO_{i}"] = _path_or_none(st.get("image"))
    return category, text_map, photo_map


def _build_before_after_1case(page, images_by_id: Dict[str, object]):
    pair = page.get("pair")
    if not pair:
        return None
    before = images_by_id.get(pair.before_image_id)
    after = images_by_id.get(pair.after_image_id)
    bullets = page.get("bullets") or []
    text_map = {"PAGE_TITLE": page.get("title", ""), "DESC_1": bullets[0] if bullets else ""}
    photo_map = {"PHOTO_BEFORE": _path_or_none(before), "PHOTO_AFTER": _path_or_none(after)}
    return text_map, photo_map


def _build_before_after_2case(page, images_by_id: Dict[str, object]):
    cases = (page.get("cases") or [])[:2]
    if not cases:
        return None
    text_map = {"PAGE_TITLE": page.get("title", "")}
    photo_map = {}
    for i, c in enumerate(cases):
        k = i + 1
        pair = c["pair"]
        before = images_by_id.get(pair.before_image_id)
        after = images_by_id.get(pair.after_image_id)
        text_map[f"DESC_{k}"] = c.get("note", "")
        photo_map[f"PHOTO_BEFORE_{k}"] = _path_or_none(before)
        photo_map[f"PHOTO_AFTER_{k}"] = _path_or_none(after)
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
    category = "closing_with_photo" if img else "closing_no_photo"
    text_map = {"PAGE_TITLE": page.get("title", "")}
    for i, b in enumerate(bullets):
        text_map[f"DESC_{i+1}"] = b
    photo_map = {"PHOTO_1": _path_or_none(img)} if img else {}
    return category, text_map, photo_map


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
    """페이지 종류/콘텐츠 개수에 정확히 맞는 (카테고리, text_map, photo_map)을
    만든다. 맞는 템플릿이 없으면 None을 반환해 폴백을 유도한다."""
    t = page["type"]
    if t == "cover":
        text_map, photo_map = _build_cover(page)
        return "cover", text_map, photo_map
    if t == "site_photos":
        return _build_site_photos(page)
    if t == "reason":
        return ("need",) + _build_need(page)
    if t == "defect":
        return _build_defect(page)
    if t == "method_reason":
        return _build_repair(page)
    if t == "features":
        built = _build_card_grid(page, {3: "feature_3card", 4: "feature_4card"}, max_cards=4)
        return built
    if t == "material":
        built = _build_card_grid(page, {4: "material_4card"}, max_cards=4)
        return built
    if t == "process":
        return _build_process(page)
    if t == "case" and page.get("semantic_type") == "before_after":
        built = _build_before_after_1case(page, images_by_id)
        return ("before_after_1case", *built) if built else None
    if t == "case" and page.get("semantic_type") == "two_case_compare":
        built = _build_before_after_2case(page, images_by_id)
        return ("before_after_2case", *built) if built else None
    if t == "effects":
        return ("effect",) + _build_effects(page)
    if t == "closing":
        return _build_closing(page)
    return None


# template_engine의 CATEGORY_FOLDERS는 story.py의 semantic_type 기준이라 콘텐츠
# 개수별 세부 카테고리(예: process_4step)를 다루지 못한다. generator3는 세부
# 카테고리 -> 실제 폴더명을 직접 매핑하고, 폴더 안에서는 파일명이 카테고리
# 이름으로 시작하는 파일만 후보로 삼는다(같은 폴더에 여러 콘텐츠-개수용
# 템플릿이 섞여 있어도 정확히 맞는 것만 고르기 위함).
CATEGORY_FOLDER_OVERRIDE = {
    "cover": "cover",
    "site_photo_1": "site_photo", "site_photo_2": "site_photo", "site_photo_multi": "site_photo",
    "need": "need",
    "defect_hero": "defect", "defect_split": "defect", "defect_3card": "defect",
    "repair_2point": "repair", "repair_3point": "repair", "repair_4point": "repair",
    "feature_3card": "feature", "feature_4card": "feature",
    "material_4card": "material",
    "process_3step": "process", "process_4step": "process", "process_5step": "process",
    "process_6step": "process",
    "before_after_1case": "before_after", "before_after_2case": "before_after",
    "effect": "effect",
    "closing_with_photo": "closing", "closing_no_photo": "closing",
}


def _pick_template_for(category: str, prev_by_category: Dict[str, str]):
    """category(콘텐츠 개수까지 반영된 세부 카테고리)와 파일명이 정확히 일치하는
    접두어를 가진 템플릿만 후보로 삼는다. 후보가 여러 개면 직전에 쓴 것과 다른
    파일을 우선 선택(연속 반복 방지)."""
    folder = CATEGORY_FOLDER_OVERRIDE.get(category, category)
    candidates = [c for c in list_templates(folder) if os.path.basename(c).startswith(category)]
    if not candidates:
        return None
    prev = prev_by_category.get(category)
    if prev in candidates and len(candidates) > 1:
        candidates = [c for c in candidates if c != prev]
    path = candidates[0]
    prev_by_category[category] = path
    return path


def generate_pptx_v3(pages: List[dict], images_by_id: Dict[str, object], out_path: str,
                       log_fn=None) -> dict:
    """템플릿 엔진(우선) + generator2 폴백을 함께 사용해 PPTX를 생성한다. 저장
    직후 반드시 파일이 실제로 존재하고 크기가 0보다 큰지 확인한다.

    반환값은 GUI/보고용으로 "실제 몇 페이지가 디자이너 템플릿을 썼고 몇 페이지가
    코드 폴백을 썼는지"까지 담은 dict다(단순 경로 문자열이 아님) - "템플릿 기반"이
    실제로 얼마나 지켜졌는지 사용자가 확인할 수 있어야 한다는 원칙에 따른 것."""
    def _log(msg):
        if log_fn:
            log_fn(msg)
        else:
            print(msg, flush=True)

    out_prs = new_presentation()
    prev_by_category: Dict[str, str] = {}
    page_no = 0
    render_log = []
    template_page_count = 0
    fallback_page_count = 0
    used_templates_by_category: Dict[str, str] = {}

    for page in pages:
        is_cover = page.get("type") == "cover"
        if not is_cover:
            page_no += 1
        args = _template_fill_args(page, images_by_id)
        used_template = None
        if args:
            category, text_map, photo_map = args
            template_path = _pick_template_for(category, prev_by_category)
            if template_path:
                try:
                    filled_prs = fill_template(template_path, text_map, photo_map)
                    src_slide = filled_prs.slides[0]
                    clone_slide_into(out_prs, src_slide)
                    used_template = os.path.basename(template_path)
                except Exception as e:
                    _log(f"[generator3] 템플릿 채우기 실패({template_path}): {e} - generator2 폴백 사용")
                    used_template = None

        if used_template:
            template_page_count += 1
            used_templates_by_category[category] = used_template
        else:
            fallback_page_count += 1
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

    total_content_pages = template_page_count + fallback_page_count
    template_ratio = (template_page_count / total_content_pages) if total_content_pages else 0.0
    _log("[generator3] 페이지별 렌더링 방식 선택 결과 - " + " / ".join(render_log))
    _log(f"[generator3] 템플릿 엔진 사용 현황 - 디자이너 템플릿 {template_page_count}페이지 / "
         f"코드 폴백 {fallback_page_count}페이지 (템플릿 사용률 {template_ratio*100:.0f}%)")
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
    return {
        "pptx": out_path,
        "template_page_count": template_page_count,
        "fallback_page_count": fallback_page_count,
        "total_content_pages": total_content_pages,
        "template_usage_ratio": round(template_ratio, 3),
        "used_templates_by_category": used_templates_by_category,
        "render_log": render_log,
    }
