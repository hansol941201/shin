# -*- coding: utf-8 -*-
"""
v2 콘텐츠 중심 PPTX 렌더러. 고정 템플릿이 아니라, story.build_pages()가 만든
가변 길이 페이지 스펙(layout: single/compare2/grid3/grid4/flow6/gallery/text/cover)을
그대로 그린다. 사진 비율은 항상 유지하고, 모든 사진에는 캡션을 붙인다.
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
    COLOR_GOLD, COLOR_TEXT_BODY, COLOR_TEXT_SUB, FONT_SIZE_CAPTION, FONT_SIZE_BODY,
)


def _grid_geometry(n: int, area_h):
    """이미지 개수에 따라 열 수와 행 수를 정한다(비율 유지, 과도한 소형 다장 배치 지양)."""
    if n <= 1:
        return 1, 1
    if n == 2:
        return 2, 1
    if n == 3:
        return 3, 1
    if n == 4:
        return 2, 2
    if n <= 6:
        return 3, 2
    return 3, (n + 2) // 3


def _photo_grid(slide, images: List, top, area_h, cols=None, rows=None):
    n = len(images)
    if n == 0:
        return
    if cols is None or rows is None:
        cols, rows = _grid_geometry(n, area_h)
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


def _bullets(slide, bullets: List[str], top, height):
    if not bullets:
        return
    add_rect(slide, MARGIN, top, CONTENT_W, height, COLOR_GRAY_LIGHT)
    y = top + Mm(4)
    row_h = min(Mm(14), Emu(int((height - Mm(8)) / max(len(bullets), 1))))
    for b in bullets:
        add_rect(slide, MARGIN + Mm(4), y + Mm(3), Mm(3), Mm(3), COLOR_GOLD)
        add_text(slide, MARGIN + Mm(11), y, CONTENT_W - Mm(15), row_h, b,
                  size=FONT_SIZE_BODY, color=COLOR_TEXT_BODY)
        y += row_h


def render_cover(prs, page, page_no):
    slide = blank_slide(prs)
    img = page["images"][0] if page["images"] else None
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


def render_content_page(prs, page, page_no):
    slide = blank_slide(prs)
    header(slide, page["title"], page_no)
    images = page.get("images", [])
    bullets = page.get("bullets", [])

    top = Mm(27)
    bottom_margin = Mm(12)
    total_h = SLIDE_HEIGHT - top - bottom_margin

    if images and bullets:
        # 불릿 개수에 맞춰 텍스트 박스 높이를 정하고(과도한 여백 방지), 남는 공간은
        # 사진 영역에 배분한다.
        text_h = min(Emu(int(total_h * 0.42)), Mm(9) * len(bullets) + Mm(8))
        text_h = max(text_h, Mm(20))
        img_h = total_h - text_h - Mm(4)
        _photo_grid(slide, images, top, img_h)
        _bullets(slide, bullets, top + img_h + Mm(4), text_h)
    elif images:
        _photo_grid(slide, images, top, total_h)
    else:
        _bullets(slide, bullets, top, total_h)
    return slide


def render_case(prs, page, page_no):
    slide = blank_slide(prs)
    header(slide, page["title"], page_no)
    pair = page["pair"]
    images_by_id: Dict[str, object] = page["_images_by_id"]
    before = images_by_id.get(pair.before_image_id)
    after = images_by_id.get(pair.after_image_id)
    half_w = (CONTENT_W - Mm(4)) / 2
    top = Mm(29)
    ph = Mm(95)
    if before:
        add_picture_contain(slide, before.path, MARGIN, top, int(half_w), ph)
        add_rect(slide, MARGIN, top + ph + Mm(2), Emu(int(half_w)), Mm(8), COLOR_NAVY)
        add_text(slide, MARGIN, top + ph + Mm(2), Emu(int(half_w)), Mm(8), "시공 전",
                  size=Pt(12), color=COLOR_WHITE, bold=True, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    if after:
        ax = MARGIN + Emu(int(half_w + Mm(4)))
        add_picture_contain(slide, after.path, ax, top, int(half_w), ph)
        add_rect(slide, ax, top + ph + Mm(2), Emu(int(half_w)), Mm(8), COLOR_GOLD)
        add_text(slide, ax, top + ph + Mm(2), Emu(int(half_w)), Mm(8), "시공 후",
                  size=Pt(12), color=COLOR_WHITE, bold=True, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)

    proc_top = top + ph + Mm(14)
    proc_ids = list(pair.process_image_ids or [])
    if proc_ids:
        proc_imgs = [images_by_id[i] for i in proc_ids if i in images_by_id]
        _photo_grid(slide, proc_imgs, proc_top, Mm(55))
        note_top = proc_top + Mm(59)
    else:
        note_top = proc_top

    _bullets(slide, page.get("bullets", []), note_top, Mm(20))
    return slide


def render_closing(prs, page, page_no):
    slide = blank_slide(prs)
    add_rect(slide, 0, 0, SLIDE_WIDTH, SLIDE_HEIGHT, COLOR_NAVY)
    add_rect(slide, MARGIN, Mm(140), CONTENT_W, Pt(2), COLOR_GOLD)
    add_text(slide, MARGIN, Mm(150), CONTENT_W, Mm(40), page["title"],
              size=Pt(20), color=COLOR_WHITE, bold=True, align=PP_ALIGN.CENTER)
    return slide


def generate_pptx_v2(pages: List[dict], images_by_id: Dict[str, object], out_path: str) -> str:
    prs = new_presentation()
    page_no = 0
    for page in pages:
        t = page["type"]
        if t == "cover":
            render_cover(prs, page, None)
            for im in page.get("images", []):
                im.selected_slide = 1
            continue
        page_no += 1
        if t == "closing":
            render_closing(prs, page, page_no)
        elif t == "case":
            page["_images_by_id"] = images_by_id
            render_case(prs, page, page_no)
            pair = page["pair"]
            for iid in [pair.before_image_id, pair.after_image_id] + list(pair.process_image_ids or []):
                im = images_by_id.get(iid)
                if im:
                    im.selected_slide = page_no
        else:
            render_content_page(prs, page, page_no)
            for im in page.get("images", []):
                im.selected_slide = page_no

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    prs.save(out_path)
    return out_path
