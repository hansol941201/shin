# -*- coding: utf-8 -*-
"""
v2 콘텐츠 중심 PPTX 렌더러.

[재설계 2 - 2026-08] 모든 페이지를 같은 "사진 그리드 + 문구 박스" 틀로 찍어내지 않는다.
story.py가 각 페이지에 지정한 semantic_type(hero/reason_hero/four_cards/
image_text_split/feature_cards/process_timeline/before_after/two_case_compare/
effects_hero/closing)에 따라 서로 다른 전용 레이아웃을 그린다.
"""
import os
from typing import Dict, List

from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.util import Emu, Mm, Pt

from app.engine.render_utils import (
    MARGIN, CONTENT_W, new_presentation, blank_slide, add_rect, add_text,
    add_picture_contain, header,
)
from app.utils.config import (
    SLIDE_WIDTH, SLIDE_HEIGHT, COLOR_WHITE, COLOR_NAVY, COLOR_NAVY_LIGHT, COLOR_GRAY_LIGHT,
    COLOR_GRAY_MID, COLOR_GOLD, COLOR_TEXT_BODY, COLOR_TEXT_SUB, FONT_SIZE_CAPTION,
    FONT_SIZE_BODY, FONT_SIZE_SECTION_HEAD,
)

MM = Mm(1)


# ------------------------------------------------------------------
# 공통 저수준 조각(여러 semantic_type 레이아웃에서 재사용)
# ------------------------------------------------------------------

def _grid_geometry(n: int):
    if n <= 1:
        return 1, 1
    if n == 2:
        return 2, 1
    if n == 3:
        return 3, 1
    if n == 4:
        return 2, 2
    return 3, (n + 2) // 3


def _photo_grid(slide, images: List, top, area_h, cols=None, rows=None):
    n = len(images)
    if n == 0:
        return
    if cols is None or rows is None:
        cols, rows = _grid_geometry(n)
    gap = Mm(4)
    cap_h = Mm(9)
    cell_w = (CONTENT_W - gap * (cols - 1)) / cols
    cell_h = (area_h - gap * (rows - 1)) / rows
    for idx, img in enumerate(images):
        r, c = divmod(idx, cols)
        x = MARGIN + Emu(int(cell_w + gap) * c)
        y = top + Emu(int(cell_h + gap) * r)
        add_picture_contain(slide, img.path, x, y, int(cell_w), int(cell_h) - cap_h)
        cap = img.real_caption or "현장 시공 상태 참고사진"
        add_text(slide, x, y + int(cell_h) - cap_h, int(cell_w), cap_h, cap,
                  size=FONT_SIZE_CAPTION, color=COLOR_TEXT_SUB, align=PP_ALIGN.CENTER)


def _photo_row(slide, images: List, top, height):
    """가로 한 줄(썸네일 행). support_images 등 보조 사진에 사용."""
    n = len(images)
    if n == 0:
        return
    _photo_grid(slide, images, top, height, cols=n, rows=1)


def _bullets_box(slide, bullets: List[str], left, top, width, height, bg=True):
    if not bullets:
        return
    if bg:
        add_rect(slide, left, top, width, height, COLOR_GRAY_LIGHT)
    pad = Mm(4)
    y = top + pad
    row_h = min(Mm(16), Emu(int((height - pad * 2) / max(len(bullets), 1))))
    for b in bullets:
        add_rect(slide, left + pad, y + Mm(3), Mm(3), Mm(3), COLOR_GOLD)
        add_text(slide, left + pad + Mm(7), y, width - pad * 2 - Mm(7), row_h, b,
                  size=FONT_SIZE_BODY, color=COLOR_TEXT_BODY)
        y += row_h


def _card_grid(slide, cards: List[dict], top, area_h, cols=2, accent=COLOR_NAVY):
    n = len(cards)
    if n == 0:
        return
    cols = min(cols, n)
    rows = (n + cols - 1) // cols
    gap = Mm(6)
    cell_w = (CONTENT_W - gap * (cols - 1)) / cols
    cell_h = (area_h - gap * (rows - 1)) / rows
    pad = Mm(4)
    label_h = Mm(9)
    cap_h = Mm(16)
    img_h = cell_h - label_h - cap_h - pad * 2
    for idx, card in enumerate(cards):
        r, c = divmod(idx, cols)
        x = MARGIN + Emu(int(cell_w + gap) * c)
        y = top + Emu(int(cell_h + gap) * r)
        add_rect(slide, x, y, Emu(int(cell_w)), Emu(int(cell_h)), COLOR_GRAY_LIGHT)
        add_rect(slide, x, y, Emu(int(cell_w)), Mm(2), accent)
        img = card.get("image")
        if img:
            add_picture_contain(slide, img.path, x + pad, y + pad, int(cell_w - pad * 2), int(img_h), frame=False)
        ty = y + pad + img_h
        add_text(slide, x + pad, ty, int(cell_w - pad * 2), label_h, card.get("label", ""),
                  size=FONT_SIZE_SECTION_HEAD, color=accent, bold=True)
        add_text(slide, x + pad, ty + label_h, int(cell_w - pad * 2), cap_h, card.get("caption", ""),
                  size=FONT_SIZE_CAPTION, color=COLOR_TEXT_SUB)


def _mark_pair_images(pair, images_by_id: Dict[str, object], page_no: int):
    for iid in [pair.before_image_id, pair.after_image_id] + list(pair.process_image_ids or []):
        im = images_by_id.get(iid)
        if im:
            im.selected_slide = page_no


# ------------------------------------------------------------------
# semantic_type별 전용 레이아웃
# ------------------------------------------------------------------

def render_hero(prs, page, page_no):
    """표지: 대표 사진 1장 크게 + 최소한의 문구, 여백 넓게."""
    slide = blank_slide(prs)
    img = page["images"][0] if page.get("images") else None
    if img:
        add_picture_contain(slide, img.path, 0, 0, SLIDE_WIDTH, Mm(190), frame=False)
        add_rect(slide, 0, Mm(178), SLIDE_WIDTH, Mm(2), COLOR_GOLD)
    add_rect(slide, 0, Mm(190), SLIDE_WIDTH, SLIDE_HEIGHT - Mm(190), COLOR_NAVY)
    add_text(slide, MARGIN, Mm(200), CONTENT_W, Mm(28), page["title"],
              size=Pt(30), color=COLOR_WHITE, bold=True)
    if page.get("subtitle"):
        add_text(slide, MARGIN, Mm(232), CONTENT_W, Mm(10), page["subtitle"],
                  size=Pt(14), color=(230, 232, 236))
    return slide


def render_reason_hero(prs, page, page_no):
    """공사가 필요한 이유: 대표 하자사진 1장 크게 + 보조 사진 + 핵심 문구 2~3개."""
    slide = blank_slide(prs)
    header(slide, page["title"], page_no)
    top = Mm(27)
    lead = page.get("lead_image")
    support = page.get("support_images") or []
    lead_h = Mm(128) if support else Mm(150)
    if lead:
        add_picture_contain(slide, lead.path, MARGIN, top, int(CONTENT_W), int(lead_h))
    y = top + lead_h + Mm(6)
    if support:
        sup_h = Mm(36)
        _photo_row(slide, support, y, sup_h)
        y += sup_h + Mm(6)
    remaining_h = SLIDE_HEIGHT - y - Mm(12)
    _bullets_box(slide, page.get("bullets", []), MARGIN, y, CONTENT_W, remaining_h)
    return slide


def render_four_cards(prs, page, page_no):
    """주요 하자: 하자 유형별 사진+캡션 카드(2x2)."""
    slide = blank_slide(prs)
    header(slide, page["title"], page_no)
    top = Mm(27)
    area_h = SLIDE_HEIGHT - top - Mm(12)
    _card_grid(slide, page.get("cards", []), top, area_h, cols=2, accent=COLOR_NAVY)
    return slide


def render_feature_cards(prs, page, page_no):
    """공법 특징: 특징별 사진+제목+설명 카드."""
    slide = blank_slide(prs)
    header(slide, page["title"], page_no)
    top = Mm(27)
    area_h = SLIDE_HEIGHT - top - Mm(12)
    cards = page.get("cards", [])
    cols = 2 if len(cards) != 3 else 3
    _card_grid(slide, cards, top, area_h, cols=cols, accent=COLOR_GOLD)
    return slide


def render_image_text_split(prs, page, page_no):
    """보수 방법/공법 핵심: 좌측 대표 시공사진 + 우측 원본 기술 문구, 하단 보조 사진."""
    slide = blank_slide(prs)
    header(slide, page["title"], page_no)
    top = Mm(27)
    left_w = Mm(82)
    right_w = CONTENT_W - left_w - Mm(6)
    lead = page.get("lead_image")
    support = page.get("support_images") or []
    support_h = Mm(42) if support else Mm(0)
    gap_before_support = Mm(6) if support else Mm(0)
    main_h = SLIDE_HEIGHT - top - Mm(12) - support_h - gap_before_support
    if lead:
        add_picture_contain(slide, lead.path, MARGIN, top, int(left_w), int(main_h))
    rx = MARGIN + left_w + Mm(6)
    add_rect(slide, rx, top, Emu(int(right_w)), int(main_h), COLOR_GRAY_LIGHT)
    _bullets_box(slide, page.get("bullets", []), rx, top, int(right_w), int(main_h), bg=False)
    if support:
        _photo_row(slide, support, top + main_h + gap_before_support, support_h)
    return slide


def render_process_timeline(prs, page, page_no):
    """시공 순서: 단계별 사진 + 단계명 + 실제 원본 설명(공정 흐름 디자인)."""
    slide = blank_slide(prs)
    header(slide, page["title"], page_no)
    top = Mm(27)
    area_h = SLIDE_HEIGHT - top - Mm(12)
    steps = page.get("steps", [])
    n = len(steps)
    if n == 0:
        return slide
    row_h = area_h / n
    img_w = Mm(58)
    badge_d = Mm(11)
    if n > 1:
        line_x = MARGIN + Emu(int(badge_d / 2)) - Mm(0.4)
        add_rect(slide, line_x, top + Mm(6), Mm(0.8), Emu(int(row_h * n - Mm(12))), COLOR_GRAY_LIGHT)
    for i, st in enumerate(steps):
        y = top + Emu(int(row_h * i))
        add_rect(slide, MARGIN, y + Mm(2), badge_d, badge_d, COLOR_NAVY)
        add_text(slide, MARGIN, y + Mm(2), badge_d, badge_d, str(st["step_no"]),
                  size=Pt(13), color=COLOR_WHITE, bold=True, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
        img_x = MARGIN + badge_d + Mm(5)
        img_h = row_h - Mm(6)
        add_picture_contain(slide, st["image"].path, img_x, y + Mm(1), int(img_w), int(img_h), frame=False)
        text_x = img_x + img_w + Mm(6)
        text_w = CONTENT_W - (text_x - MARGIN)
        add_text(slide, text_x, y + Mm(2), int(text_w), Mm(9), st["label"],
                  size=FONT_SIZE_SECTION_HEAD, color=COLOR_NAVY, bold=True)
        add_text(slide, text_x, y + Mm(12), int(text_w), Emu(int(row_h - Mm(14))), st["desc"],
                  size=FONT_SIZE_BODY, color=COLOR_TEXT_BODY)
    return slide


def render_before_after(prs, page, page_no):
    """시공 전후 사례: 화면 대부분을 BEFORE/AFTER 큰 사진에 사용, 하단 짧은 설명."""
    slide = blank_slide(prs)
    header(slide, page["title"], page_no)
    pair = page["pair"]
    images_by_id: Dict[str, object] = page["_images_by_id"]
    before = images_by_id.get(pair.before_image_id)
    after = images_by_id.get(pair.after_image_id)
    half_w = (CONTENT_W - Mm(4)) / 2
    top = Mm(29)
    ph = Mm(215)
    if before:
        add_picture_contain(slide, before.path, MARGIN, top, int(half_w), ph)
        add_rect(slide, MARGIN, top + ph + Mm(2), Emu(int(half_w)), Mm(9), COLOR_NAVY)
        add_text(slide, MARGIN, top + ph + Mm(2), Emu(int(half_w)), Mm(9), "시공 전",
                  size=Pt(13), color=COLOR_WHITE, bold=True, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    if after:
        ax = MARGIN + Emu(int(half_w + Mm(4)))
        add_picture_contain(slide, after.path, ax, top, int(half_w), ph)
        add_rect(slide, ax, top + ph + Mm(2), Emu(int(half_w)), Mm(9), COLOR_GOLD)
        add_text(slide, ax, top + ph + Mm(2), Emu(int(half_w)), Mm(9), "시공 후",
                  size=Pt(13), color=COLOR_WHITE, bold=True, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    note_top = top + ph + Mm(15)
    bullets = page.get("bullets", [])
    if bullets:
        add_text(slide, MARGIN, note_top, CONTENT_W, Mm(14), bullets[0],
                  size=FONT_SIZE_BODY, color=COLOR_TEXT_BODY, align=PP_ALIGN.CENTER)
    return slide


def render_two_case_compare(prs, page, page_no):
    """여러 시공 전후 사례를 한 페이지에 압축 비교(최대 2사례)."""
    slide = blank_slide(prs)
    header(slide, page["title"], page_no)
    images_by_id: Dict[str, object] = page["_images_by_id"]
    cases = page.get("cases", [])
    n = len(cases)
    if n == 0:
        return slide
    top = Mm(27)
    area_h = SLIDE_HEIGHT - top - Mm(12)
    row_h = area_h / n
    for i, c in enumerate(cases):
        y = top + Emu(int(row_h * i))
        pair = c["pair"]
        before = images_by_id.get(pair.before_image_id)
        after = images_by_id.get(pair.after_image_id)
        half_w = (CONTENT_W - Mm(4)) / 2
        img_h = row_h - Mm(20)
        add_text(slide, MARGIN, y, CONTENT_W, Mm(8), f"사례 {i+1}",
                  size=FONT_SIZE_SECTION_HEAD, color=COLOR_GOLD, bold=True)
        if before:
            add_picture_contain(slide, before.path, MARGIN, y + Mm(9), int(half_w), int(img_h), frame=False)
        if after:
            add_picture_contain(slide, after.path, MARGIN + Emu(int(half_w + Mm(4))), y + Mm(9),
                                  int(half_w), int(img_h), frame=False)
        add_text(slide, MARGIN, y + Mm(9) + img_h + Mm(1), CONTENT_W, Mm(9), c.get("note", ""),
                  size=FONT_SIZE_CAPTION, color=COLOR_TEXT_SUB)
    return slide


def render_effects_hero(prs, page, page_no):
    """기대 효과: 완료사진 1장 크게 + 핵심 효과 문구를 짧은 카드(칩)로."""
    slide = blank_slide(prs)
    header(slide, page["title"], page_no)
    top = Mm(27)
    img = page.get("image") or (page["images"][0] if page.get("images") else None)
    img_h = Mm(145)
    if img:
        add_picture_contain(slide, img.path, MARGIN, top, int(CONTENT_W), int(img_h))
    y = top + img_h + Mm(8)
    bullets = page.get("bullets", [])
    chip_h = Mm(17)
    gap = Mm(5)
    for i, b in enumerate(bullets):
        by = y + Emu(int((chip_h + gap) * i))
        add_rect(slide, MARGIN, by, CONTENT_W, chip_h, COLOR_GRAY_LIGHT)
        add_rect(slide, MARGIN, by, Mm(3), chip_h, COLOR_GOLD)
        add_text(slide, MARGIN + Mm(8), by, CONTENT_W - Mm(12), chip_h, b,
                  size=FONT_SIZE_BODY, color=COLOR_TEXT_BODY, anchor=MSO_ANCHOR.MIDDLE)
    return slide


def render_closing(prs, page, page_no):
    """마무리: 여백 중심, 문구 최소화, 회사정보 없음."""
    slide = blank_slide(prs)
    img = page["images"][0] if page.get("images") else None
    if img:
        add_picture_contain(slide, img.path, 0, 0, SLIDE_WIDTH, Mm(170), frame=False)
        add_rect(slide, 0, Mm(170), SLIDE_WIDTH, SLIDE_HEIGHT - Mm(170), COLOR_NAVY)
        text_top = Mm(170) + (SLIDE_HEIGHT - Mm(170)) / 2 - Mm(14)
    else:
        add_rect(slide, 0, 0, SLIDE_WIDTH, SLIDE_HEIGHT, COLOR_NAVY)
        text_top = SLIDE_HEIGHT / 2 - Mm(14)
    add_rect(slide, MARGIN, int(text_top) - Mm(8), CONTENT_W, Pt(2), COLOR_GOLD)
    add_text(slide, MARGIN, int(text_top), CONTENT_W, Mm(24), page["title"],
              size=Pt(19), color=COLOR_WHITE, bold=True, align=PP_ALIGN.CENTER)
    for i, b in enumerate(page.get("bullets", [])[:2]):
        add_text(slide, MARGIN, int(text_top) + Mm(24) + Emu(int(Mm(9) * i)), CONTENT_W, Mm(9), b,
                  size=Pt(12), color=(220, 222, 228), align=PP_ALIGN.CENTER)
    return slide


def render_site_photo_gallery(prs, page, page_no):
    """현장사진: 사용자가 추가한 이 아파트의 실제 현장사진. 장수에 따라 배치를
    바꾸고, 억지로 작게 축소해 한 페이지에 전부 넣지 않는다(크게 보여주는 것이 원칙)."""
    slide = blank_slide(prs)
    header(slide, page["title"], page_no)
    top = Mm(27)
    area_h = SLIDE_HEIGHT - top - Mm(12)
    images = page.get("images", [])
    n = len(images)
    if n == 0:
        return slide
    if n == 1:
        add_picture_contain(slide, images[0].path, MARGIN, top, int(CONTENT_W), int(area_h))
    elif n == 2:
        half_h = (area_h - Mm(4)) / 2
        add_picture_contain(slide, images[0].path, MARGIN, top, int(CONTENT_W), int(half_h))
        add_picture_contain(slide, images[1].path, MARGIN, top + half_h + Mm(4), int(CONTENT_W), int(half_h))
    elif n == 3:
        lead_h = area_h * 0.62
        add_picture_contain(slide, images[0].path, MARGIN, top, int(CONTENT_W), int(lead_h))
        sup_h = area_h - lead_h - Mm(4)
        _photo_row(slide, images[1:3], top + lead_h + Mm(4), sup_h)
    elif n == 4:
        _photo_grid(slide, images, top, area_h, cols=2, rows=2)
    else:
        lead_h = area_h * 0.55
        add_picture_contain(slide, images[0].path, MARGIN, top, int(CONTENT_W), int(lead_h))
        rest = images[1:6]
        sup_h = area_h - lead_h - Mm(4)
        cols = min(len(rest), 3) or 1
        rows = (len(rest) + cols - 1) // cols
        _photo_grid(slide, rest, top + lead_h + Mm(4), sup_h, cols=cols, rows=rows)
    return slide


def render_material_cards(prs, page, page_no):
    """사용 재료: 자재별 사진+명칭+원본 설명 카드."""
    slide = blank_slide(prs)
    header(slide, page["title"], page_no)
    top = Mm(27)
    area_h = SLIDE_HEIGHT - top - Mm(12)
    cards = page.get("cards", [])
    cols = 2 if len(cards) != 3 else 3
    _card_grid(slide, cards, top, area_h, cols=cols, accent=COLOR_NAVY_LIGHT)
    return slide


def render_content_page(prs, page, page_no):
    """폴백 레이아웃(semantic_type이 없는 예외적인 경우에만 사용)."""
    slide = blank_slide(prs)
    header(slide, page["title"], page_no)
    images = page.get("images", [])
    bullets = page.get("bullets", [])
    top = Mm(27)
    bottom_margin = Mm(12)
    total_h = SLIDE_HEIGHT - top - bottom_margin
    if images and bullets:
        text_h = min(Emu(int(total_h * 0.42)), Mm(9) * len(bullets) + Mm(8))
        text_h = max(text_h, Mm(20))
        img_h = total_h - text_h - Mm(4)
        _photo_grid(slide, images, top, img_h)
        _bullets_box(slide, bullets, MARGIN, top + img_h + Mm(4), CONTENT_W, text_h)
    elif images:
        _photo_grid(slide, images, top, total_h)
    else:
        _bullets_box(slide, bullets, MARGIN, top, CONTENT_W, total_h)
    return slide


SEMANTIC_RENDERERS = {
    "hero": render_hero,
    "site_photo_gallery": render_site_photo_gallery,
    "reason_hero": render_reason_hero,
    "four_cards": render_four_cards,
    "feature_cards": render_feature_cards,
    "material_cards": render_material_cards,
    "image_text_split": render_image_text_split,
    "process_timeline": render_process_timeline,
    "before_after": render_before_after,
    "two_case_compare": render_two_case_compare,
    "effects_hero": render_effects_hero,
    "closing": render_closing,
}


def generate_pptx_v2(pages: List[dict], images_by_id: Dict[str, object], out_path: str,
                       log_fn=None) -> str:
    """PPTX를 생성해 out_path에 저장한다. 저장 직후 반드시 파일이 실제로 존재하고
    크기가 0보다 큰지 확인한 뒤 로그를 남긴다 - "저장했다고 believe"하는 대신
    os.path.exists()로 실제 결과를 확인한다. 저장이 실패했으면 예외를 던져
    호출자(pipeline.py)가 "정상 완료"로 처리하지 못하게 한다."""
    def _log(msg):
        if log_fn:
            log_fn(msg)
        else:
            print(msg, flush=True)

    prs = new_presentation()
    page_no = 0
    for page in pages:
        t = page["type"]
        stype = page.get("semantic_type")

        if t == "cover":
            render_hero(prs, page, None)
            for im in page.get("images", []):
                im.selected_slide = 1
            continue

        page_no += 1

        if stype == "before_after":
            page["_images_by_id"] = images_by_id
            render_before_after(prs, page, page_no)
            _mark_pair_images(page["pair"], images_by_id, page_no)
        elif stype == "two_case_compare":
            page["_images_by_id"] = images_by_id
            render_two_case_compare(prs, page, page_no)
            for c in page.get("cases", []):
                _mark_pair_images(c["pair"], images_by_id, page_no)
        elif stype in SEMANTIC_RENDERERS:
            SEMANTIC_RENDERERS[stype](prs, page, page_no)
            for im in page.get("images", []):
                im.selected_slide = page_no
        else:
            render_content_page(prs, page, page_no)
            for im in page.get("images", []):
                im.selected_slide = page_no

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    _log(f"[generator2] Presentation.save() 호출 직전 - 총 {len(prs.slides)}슬라이드, 저장 경로={out_path}")
    prs.save(out_path)

    saved_ok = os.path.exists(out_path)
    size = os.path.getsize(out_path) if saved_ok else 0
    if not saved_ok or size == 0:
        _log(f"[generator2] PPT 저장 실패 - 경로={out_path}, 존재={saved_ok}, 크기={size} bytes")
        raise RuntimeError(
            f"PPTX 저장에 실패했습니다(파일이 생성되지 않았거나 비어 있음): {out_path}"
        )
    _log(f"[generator2] PPT 저장 완료 - 경로={out_path}, 파일크기={size:,} bytes")
    return out_path
