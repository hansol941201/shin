# -*- coding: utf-8 -*-
"""
templates/*.pptx 파일을 실제로 만들어내는 빌더. 이 스크립트는 "런타임에 매번
실행"되는 코드가 아니라, 프로젝트에 실제 재사용 가능한 PowerPoint 템플릿
파일을 한 번 만들어 저장소에 커밋해 두기 위한 빌드 스크립트다(디자이너가
PowerPoint에서 직접 만든 것과 동등한 결과물 - 모든 도형/텍스트/사진 자리는
PowerPoint 기본 개체이며, 이후 Placeholder Engine이 이 파일들을 열어
{{TOKEN}}과 PHOTO_N 자리만 실제 값으로 교체한다).

실행: python3 -m app.engine.template_builder
"""
import os

from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.util import Emu, Mm, Pt

from app.engine.render_utils import (
    MARGIN, CONTENT_W, new_presentation, blank_slide, add_rect, add_text, header,
)
from app.engine.template_engine import TEMPLATES_ROOT
from app.utils.config import (
    SLIDE_WIDTH, SLIDE_HEIGHT, COLOR_WHITE, COLOR_NAVY, COLOR_NAVY_LIGHT, COLOR_GRAY_LIGHT,
    COLOR_GOLD, COLOR_TEXT_BODY, COLOR_TEXT_SUB, FONT_SIZE_CAPTION, FONT_SIZE_BODY,
    FONT_SIZE_SECTION_HEAD,
)


def _photo_ph(slide, name, x, y, w, h):
    rect = add_rect(slide, x, y, w, h, COLOR_GRAY_LIGHT)
    rect.name = name
    return rect


def _tok(slide, token, x, y, w, h, size, color, bold=False, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP):
    return add_text(slide, x, y, w, h, f"{{{{{token}}}}}", size=size, color=color,
                      bold=bold, align=align, anchor=anchor)


def _group(slide, name, shapes):
    grp = slide.shapes.add_group_shape(shapes)
    grp.name = name
    return grp


def _save(prs, category, filename):
    folder = os.path.join(TEMPLATES_ROOT, category)
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, filename)
    prs.save(path)
    return path


# ------------------------------------------------------------------
# 1. 표지
# ------------------------------------------------------------------
def build_cover_a():
    prs = new_presentation()
    slide = blank_slide(prs)
    _photo_ph(slide, "PHOTO_1", 0, 0, SLIDE_WIDTH, Mm(190))
    add_rect(slide, 0, Mm(178), SLIDE_WIDTH, Mm(2), COLOR_GOLD)
    add_rect(slide, 0, Mm(190), SLIDE_WIDTH, SLIDE_HEIGHT - Mm(190), COLOR_NAVY)
    _tok(slide, "PAGE_TITLE", MARGIN, Mm(200), CONTENT_W, Mm(28), Pt(30), COLOR_WHITE, bold=True)
    _tok(slide, "PAGE_SUBTITLE", MARGIN, Mm(232), CONTENT_W, Mm(10), Pt(14), (230, 232, 236))
    return _save(prs, "cover", "cover_A.pptx")


# ------------------------------------------------------------------
# 2. 현장사진
# ------------------------------------------------------------------
def build_site_photo_a():
    prs = new_presentation()
    slide = blank_slide(prs)
    header(slide, "{{PAGE_TITLE}}", 2)
    top = Mm(27)
    guidance_h = Mm(24)
    area_h = SLIDE_HEIGHT - top - Mm(12) - guidance_h - Mm(6)
    lead_h = area_h * 0.62
    _photo_ph(slide, "PHOTO_1", MARGIN, top, CONTENT_W, Emu(int(lead_h)))
    sup_top = top + Emu(int(lead_h)) + Mm(4)
    sup_h = Emu(int(area_h - lead_h - Mm(4)))
    sup_w = Emu(int((CONTENT_W - Mm(4)) / 2))
    _photo_ph(slide, "PHOTO_2", MARGIN, sup_top, sup_w, sup_h)
    _photo_ph(slide, "PHOTO_3", MARGIN + sup_w + Mm(4), sup_top, sup_w, sup_h)
    g_top = sup_top + sup_h + Mm(6)
    box = add_rect(slide, MARGIN, g_top, CONTENT_W, guidance_h, COLOR_GRAY_LIGHT)
    add_rect(slide, MARGIN, g_top, Mm(3), guidance_h, COLOR_GOLD)
    add_text(slide, MARGIN + Mm(8), g_top, CONTENT_W - Mm(14), guidance_h, "{{GUIDANCE}}",
              size=FONT_SIZE_CAPTION, color=COLOR_TEXT_BODY, anchor=MSO_ANCHOR.MIDDLE)
    return _save(prs, "site_photo", "site_photo_3_A.pptx")


# ------------------------------------------------------------------
# 3. 공사 필요성(need)
# ------------------------------------------------------------------
def build_need_a():
    prs = new_presentation()
    slide = blank_slide(prs)
    header(slide, "{{PAGE_TITLE}}", 2)
    top = Mm(27)
    lead_h = Mm(128)
    _photo_ph(slide, "PHOTO_1", MARGIN, top, CONTENT_W, lead_h)
    sup_top = top + lead_h + Mm(6)
    sup_h = Mm(36)
    sup_w = Emu(int((CONTENT_W - Mm(4)) / 2))
    _photo_ph(slide, "PHOTO_2", MARGIN, sup_top, sup_w, sup_h)
    _photo_ph(slide, "PHOTO_3", MARGIN + sup_w + Mm(4), sup_top, sup_w, sup_h)
    b_top = sup_top + sup_h + Mm(6)
    b_h = SLIDE_HEIGHT - b_top - Mm(12)
    add_rect(slide, MARGIN, b_top, CONTENT_W, b_h, COLOR_GRAY_LIGHT)
    row_h = Emu(int(b_h / 3))
    for i in range(3):
        ry = b_top + Emu(int(row_h * i)) + Mm(4)
        add_rect(slide, MARGIN + Mm(4), ry + Mm(3), Mm(3), Mm(3), COLOR_GOLD)
        _tok(slide, f"DESC_{i+1}", MARGIN + Mm(11), ry, CONTENT_W - Mm(15), row_h,
              FONT_SIZE_BODY, COLOR_TEXT_BODY)
    return _save(prs, "need", "need_A.pptx")


# ------------------------------------------------------------------
# 4. 주요 하자(defect) - 2x2 카드
# ------------------------------------------------------------------
def _build_card_grid_template(category, filename, n, accent, title_head=None):
    prs = new_presentation()
    slide = blank_slide(prs)
    header(slide, "{{PAGE_TITLE}}", 2)
    top = Mm(27)
    area_h = SLIDE_HEIGHT - top - Mm(12)
    cols = 2 if n != 3 else 3
    rows = (n + cols - 1) // cols
    gap = Mm(6)
    cell_w = Emu(int((CONTENT_W - gap * (cols - 1)) / cols))
    cell_h = Emu(int((area_h - gap * (rows - 1)) / rows))
    pad = Mm(4)
    label_h = Mm(14)  # 제목이 카드 폭 안에서 2줄로 줄바꿈돼도 아래 설명과 겹치지 않도록 여유를 둔다.
    cap_h = Mm(16)
    img_h = Emu(int(cell_h - label_h - cap_h - pad * 2))
    for idx in range(n):
        r, c = divmod(idx, cols)
        x = MARGIN + Emu(int(cell_w + gap) * c)
        y = top + Emu(int(cell_h + gap) * r)
        bg = add_rect(slide, x, y, cell_w, cell_h, COLOR_GRAY_LIGHT)
        bar = add_rect(slide, x, y, cell_w, Mm(2), accent)
        photo = _photo_ph(slide, f"PHOTO_{idx+1}", x + pad, y + pad, Emu(int(cell_w - pad * 2)), img_h)
        ty = y + pad + img_h
        title = _tok(slide, f"TITLE_{idx+1}", x + pad, ty, Emu(int(cell_w - pad * 2)), label_h,
                      FONT_SIZE_SECTION_HEAD, accent, bold=True)
        desc = _tok(slide, f"DESC_{idx+1}", x + pad, ty + label_h, Emu(int(cell_w - pad * 2)), cap_h,
                     FONT_SIZE_CAPTION, COLOR_TEXT_SUB)
        _group(slide, f"GROUP_CARD_{idx+1}", [bg, bar, photo, title, desc])
    return _save(prs, category, filename)


def build_defect_a():
    return _build_card_grid_template("defect", "defect_4card_A.pptx", 4, COLOR_NAVY)


# ------------------------------------------------------------------
# 5. 보수 방법(method): 좌 55% 대표사진 + 우 45% 핵심 포인트 3개 + 하단 보조사진 2장
# ------------------------------------------------------------------
def build_method_a():
    prs = new_presentation()
    slide = blank_slide(prs)
    header(slide, "{{PAGE_TITLE}}", 2)
    top = Mm(27)
    left_w = Emu(int(CONTENT_W * 0.55))
    right_w = Emu(int(CONTENT_W - left_w - Mm(6)))
    support_h = Mm(55)
    main_h = Emu(int(SLIDE_HEIGHT - top - Mm(12) - support_h - Mm(6)))
    _photo_ph(slide, "PHOTO_1", MARGIN, top, left_w, main_h)
    rx = MARGIN + left_w + Mm(6)
    add_rect(slide, rx, top, right_w, main_h, COLOR_GRAY_LIGHT)
    heading = add_text(slide, rx + Mm(6), top + Mm(6), Emu(int(right_w - Mm(12))), Mm(9),
                         "핵심 보수 방법", size=FONT_SIZE_SECTION_HEAD, color=COLOR_NAVY, bold=True)
    n_points = 3
    y0 = top + Mm(19)
    avail_h = Emu(int(main_h - Mm(19) - Mm(6)))
    row_h = Emu(int(avail_h / n_points))
    for i in range(n_points):
        ry = y0 + Emu(int(row_h * i))
        dot = add_rect(slide, rx + Mm(6), ry + Mm(1.5), Mm(3), Mm(3), COLOR_GOLD)
        title = _tok(slide, f"TITLE_{i+1}", rx + Mm(13), ry, Emu(int(right_w - Mm(19))), Mm(8),
                      FONT_SIZE_BODY, COLOR_NAVY, bold=True)
        desc = _tok(slide, f"DESC_{i+1}", rx + Mm(13), ry + Mm(9), Emu(int(right_w - Mm(19))),
                     Emu(int(row_h - Mm(11))), FONT_SIZE_CAPTION, COLOR_TEXT_BODY)
        _group(slide, f"GROUP_POINT_{i+1}", [dot, title, desc])
    sup_top = top + main_h + Mm(6)
    sup_w = Emu(int((CONTENT_W - Mm(4)) / 2))
    _photo_ph(slide, "PHOTO_2", MARGIN, sup_top, sup_w, support_h)
    _photo_ph(slide, "PHOTO_3", MARGIN + sup_w + Mm(4), sup_top, sup_w, support_h)
    return _save(prs, "repair", "repair_3point_A.pptx")


# ------------------------------------------------------------------
# 6. 공법 특징(feature) - 3카드, 금색 강조
# ------------------------------------------------------------------
def build_feature_a():
    return _build_card_grid_template("feature", "feature_3card_A.pptx", 3, COLOR_GOLD)


# ------------------------------------------------------------------
# 7. 사용 자재(material) - 3카드, 남색(연) 강조
# ------------------------------------------------------------------
def build_material_a():
    return _build_card_grid_template("material", "material_3card_A.pptx", 3, COLOR_NAVY_LIGHT)


# ------------------------------------------------------------------
# 8. 시공 순서(process) - N STEP 세로 타임라인
# ------------------------------------------------------------------
def _build_process_template(n_steps, filename):
    prs = new_presentation()
    slide = blank_slide(prs)
    header(slide, "{{PAGE_TITLE}}", 2)
    top = Mm(27)
    area_h = Emu(int(SLIDE_HEIGHT - top - Mm(12)))
    row_h = Emu(int(area_h / n_steps))
    img_w = Mm(58)
    badge_d = Mm(11)
    if n_steps > 1:
        line_x = MARGIN + Emu(int(badge_d / 2)) - Mm(0.4)
        add_rect(slide, line_x, top + Mm(6), Mm(0.8), Emu(int(row_h * n_steps - Mm(12))), COLOR_GRAY_LIGHT)
    for i in range(n_steps):
        y = top + Emu(int(row_h * i))
        badge = add_rect(slide, MARGIN, y + Mm(2), badge_d, badge_d, COLOR_NAVY)
        num = add_text(slide, MARGIN, y + Mm(2), badge_d, badge_d, str(i + 1), size=Pt(13),
                         color=COLOR_WHITE, bold=True, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
        img_x = MARGIN + badge_d + Mm(5)
        img_h = Emu(int(row_h - Mm(6)))
        photo = _photo_ph(slide, f"PHOTO_{i+1}", img_x, y + Mm(1), img_w, img_h)
        text_x = img_x + img_w + Mm(6)
        text_w = Emu(int(CONTENT_W - (text_x - MARGIN)))
        label = _tok(slide, f"STEP_{i+1}", text_x, y + Mm(2), text_w, Mm(9),
                      FONT_SIZE_SECTION_HEAD, COLOR_NAVY, bold=True)
        desc = _tok(slide, f"STEP_DESC_{i+1}", text_x, y + Mm(12), text_w, Emu(int(row_h - Mm(14))),
                     FONT_SIZE_CAPTION, COLOR_TEXT_BODY)
        _group(slide, f"GROUP_STEP_{i+1}", [badge, num, photo, label, desc])
    return _save(prs, "process", filename)


def build_process_4step_a():
    return _build_process_template(4, "process_4step_A.pptx")


def build_process_5step_a():
    return _build_process_template(5, "process_5step_A.pptx")


# ------------------------------------------------------------------
# 9. 시공 전후(before_after)
# ------------------------------------------------------------------
def build_before_after_a():
    prs = new_presentation()
    slide = blank_slide(prs)
    header(slide, "{{PAGE_TITLE}}", 2)
    top = Mm(29)
    half_w = Emu(int((CONTENT_W - Mm(4)) / 2))
    ph = Mm(205)
    _photo_ph(slide, "PHOTO_BEFORE", MARGIN, top, half_w, ph)
    add_rect(slide, MARGIN, top, Mm(30), Mm(9), COLOR_NAVY)
    add_text(slide, MARGIN, top, Mm(30), Mm(9), "BEFORE", size=Pt(11), color=COLOR_WHITE,
              bold=True, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    ax = MARGIN + half_w + Mm(4)
    _photo_ph(slide, "PHOTO_AFTER", ax, top, half_w, ph)
    add_rect(slide, ax, top, Mm(30), Mm(9), COLOR_GOLD)
    add_text(slide, ax, top, Mm(30), Mm(9), "AFTER", size=Pt(11), color=COLOR_WHITE,
              bold=True, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    note_top = top + ph + Mm(8)
    _tok(slide, "DESC_1", MARGIN, note_top, CONTENT_W, Mm(14), FONT_SIZE_BODY, COLOR_TEXT_BODY,
          align=PP_ALIGN.CENTER)
    return _save(prs, "before_after", "before_after_A.pptx")


# ------------------------------------------------------------------
# 10. 기대 효과(effect)
# ------------------------------------------------------------------
def build_effect_a():
    prs = new_presentation()
    slide = blank_slide(prs)
    header(slide, "{{PAGE_TITLE}}", 2)
    top = Mm(27)
    img_h = Mm(145)
    _photo_ph(slide, "PHOTO_1", MARGIN, top, CONTENT_W, img_h)
    y = top + img_h + Mm(8)
    chip_h = Mm(17)
    gap = Mm(5)
    for i in range(4):
        by = y + Emu(int((chip_h + gap) * i))
        bg = add_rect(slide, MARGIN, by, CONTENT_W, chip_h, COLOR_GRAY_LIGHT)
        bar = add_rect(slide, MARGIN, by, Mm(3), chip_h, COLOR_GOLD)
        desc = _tok(slide, f"DESC_{i+1}", MARGIN + Mm(8), by, Emu(int(CONTENT_W - Mm(12))), chip_h,
                     FONT_SIZE_BODY, COLOR_TEXT_BODY, anchor=MSO_ANCHOR.MIDDLE)
        _group(slide, f"GROUP_CHIP_{i+1}", [bg, bar, desc])
    return _save(prs, "effect", "effect_A.pptx")


# ------------------------------------------------------------------
# 11. 마무리(closing) - 사진 있는 버전 / 없는 버전 2종
# ------------------------------------------------------------------
def build_closing_with_photo_a():
    prs = new_presentation()
    slide = blank_slide(prs)
    _photo_ph(slide, "PHOTO_1", 0, 0, SLIDE_WIDTH, Mm(170))
    add_rect(slide, 0, Mm(170), SLIDE_WIDTH, SLIDE_HEIGHT - Mm(170), COLOR_NAVY)
    text_top = Mm(170) + (SLIDE_HEIGHT - Mm(170)) // 2 - Mm(14)
    add_rect(slide, MARGIN + Mm(60), text_top - Mm(8), CONTENT_W - Mm(120), Pt(1.5), COLOR_GOLD)
    _tok(slide, "PAGE_TITLE", MARGIN, text_top, CONTENT_W, Mm(24), Pt(19), COLOR_WHITE, bold=True,
          align=PP_ALIGN.CENTER)
    _tok(slide, "DESC_1", MARGIN, text_top + Mm(24), CONTENT_W, Mm(9), Pt(12), (220, 222, 228),
          align=PP_ALIGN.CENTER)
    _tok(slide, "DESC_2", MARGIN, text_top + Mm(33), CONTENT_W, Mm(9), Pt(12), (220, 222, 228),
          align=PP_ALIGN.CENTER)
    return _save(prs, "closing", "closing_with_photo_A.pptx")


def build_closing_no_photo_a():
    prs = new_presentation()
    slide = blank_slide(prs)
    add_rect(slide, 0, 0, SLIDE_WIDTH, SLIDE_HEIGHT, COLOR_NAVY)
    text_top = SLIDE_HEIGHT // 2 - Mm(14)
    add_rect(slide, MARGIN + Mm(60), text_top - Mm(8), CONTENT_W - Mm(120), Pt(1.5), COLOR_GOLD)
    _tok(slide, "PAGE_TITLE", MARGIN, text_top, CONTENT_W, Mm(24), Pt(19), COLOR_WHITE, bold=True,
          align=PP_ALIGN.CENTER)
    _tok(slide, "DESC_1", MARGIN, text_top + Mm(24), CONTENT_W, Mm(9), Pt(12), (220, 222, 228),
          align=PP_ALIGN.CENTER)
    _tok(slide, "DESC_2", MARGIN, text_top + Mm(33), CONTENT_W, Mm(9), Pt(12), (220, 222, 228),
          align=PP_ALIGN.CENTER)
    return _save(prs, "closing", "closing_no_photo_A.pptx")


def build_all():
    paths = [
        build_cover_a(),
        build_site_photo_a(),
        build_need_a(),
        build_defect_a(),
        build_method_a(),
        build_feature_a(),
        build_material_a(),
        build_process_4step_a(),
        build_process_5step_a(),
        build_before_after_a(),
        build_effect_a(),
        build_closing_with_photo_a(),
        build_closing_no_photo_a(),
    ]
    return paths


if __name__ == "__main__":
    for p in build_all():
        print(p)
