# -*- coding: utf-8 -*-
"""
templates/*.pptx 파일을 실제로 만들어내는 빌더. 이 스크립트는 "런타임에 매번
실행"되는 코드가 아니라, 프로젝트에 실제 재사용 가능한 PowerPoint 템플릿
파일을 한 번 만들어 저장소에 커밋해 두기 위한 빌드 스크립트다(디자이너가
PowerPoint에서 직접 만든 것과 동등한 결과물 - 모든 도형/텍스트/사진 자리는
PowerPoint 기본 개체이며, 이후 Placeholder Engine이 이 파일들을 열어
{{TOKEN}}과 PHOTO_N 자리만 실제 값으로 교체한다).

[2026-08 디자인 전면 개편] 기존 템플릿이 "보고서"처럼 딱딱해 보인다는 피드백에
따라, 이 버전은 대기업 제안서/브로슈어 톤(사진 65~75%, 텍스트 25~35%, 넓은
여백, 짧은 문구, 강한 시각적 흐름)으로 다시 그렸다. 바뀐 원칙:
  - 진한 남색 상단 바("보고서 헤더") 대신 얇은 금색 밑줄 하나로 제목 영역을
    가볍게 처리한다("_light_title").
  - 텍스트 뒤 회색 박스(COLOR_GRAY_LIGHT 배경 카드)를 원칙적으로 쓰지 않는다.
    구분은 얇은 금색 룰(경계선)이나 여백만으로 한다.
  - 카드/스텝/포인트처럼 반복되는 항목은 항상 GROUP으로 묶어, 실제 콘텐츠
    개수가 템플릿 슬롯 수보다 적어도 장식 요소(점/번호/구분선)가 텍스트 없이
    혼자 남지 않게 한다.
  - 사진은 항상 페이지의 시각적 중심이 되도록 크게 배치한다.
  - 엔진(Story/Template/Placeholder Engine, design_rules.json)은 이번
    작업에서 건드리지 않는다 - 오직 이 파일(템플릿 디자인)만 바꾼다.

실행: python3 -m app.engine.template_builder
"""
import os

from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.util import Emu, Mm, Pt

from app.engine.render_utils import (
    MARGIN, CONTENT_W, new_presentation, blank_slide, add_rect, add_text,
)
from app.engine.template_engine import TEMPLATES_ROOT
from app.utils.config import (
    SLIDE_WIDTH, SLIDE_HEIGHT, COLOR_WHITE, COLOR_NAVY, COLOR_NAVY_LIGHT, COLOR_GRAY_LIGHT,
    COLOR_GOLD, COLOR_TEXT_BODY, COLOR_TEXT_SUB, FONT_SIZE_CAPTION, FONT_SIZE_BODY,
    FONT_SIZE_SECTION_HEAD,
)

# 제목 영역이 가벼워진 만큼(얇은 밑줄 하나), 본문은 기존 header()의 Mm(27)보다
# 살짝 위(=사진에 더 많은 공간)에서 시작한다.
CONTENT_TOP = Mm(25)
BOTTOM_MARGIN = Mm(12)
GHOST_NUMBER_COLOR = (222, 226, 233)  # 큰 옅은 숫자 타이포(에디토리얼 느낌)의 배경색 계열


# ------------------------------------------------------------------
# 공통 헬퍼
# ------------------------------------------------------------------
def _photo_ph(slide, name, x, y, w, h):
    """사진이 들어갈 자리 표시자(실제 사진으로 교체되면 이 사각형은 사라진다)."""
    rect = add_rect(slide, x, y, w, h, COLOR_GRAY_LIGHT)
    rect.name = name
    return rect


def _tok(slide, token, x, y, w, h, size, color, bold=False, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP,
          line_spacing=1.15):
    return add_text(slide, x, y, w, h, f"{{{{{token}}}}}", size=size, color=color,
                      bold=bold, align=align, anchor=anchor, line_spacing=line_spacing)


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


def _light_title(slide):
    """보고서형 남색 상단 바 대신, 여백 위에 굵은 남색 제목 한 줄 + 얇은 금색
    밑줄만 사용하는 브로슈어형 타이틀. 페이지 번호도 우측 하단에 아주 작게만
    남겨 시각적 무게를 최소화한다."""
    add_text(slide, MARGIN, Mm(9), CONTENT_W, Mm(11), "{{PAGE_TITLE}}",
              size=Pt(19), color=COLOR_NAVY, bold=True)
    add_rect(slide, MARGIN, Mm(20.5), Mm(14), Pt(2.4), COLOR_GOLD)


def _title_on_navy(slide, y, title_token="PAGE_TITLE", title_size=Pt(19), extra_tokens=None,
                     align=PP_ALIGN.LEFT):
    """전면 사진 위/아래 남색 영역에 흰 제목(+보조문구)을 올리는 브로슈어 표지/
    마무리용 타이틀 블록. extra_tokens: [(token, size, color, gap_from_title)]."""
    x = MARGIN if align == PP_ALIGN.LEFT else MARGIN
    _tok(slide, title_token, x, y, CONTENT_W, Mm(16), title_size, COLOR_WHITE, bold=True, align=align)
    if extra_tokens:
        gy = y + Mm(18)
        for token, size, color, gap in extra_tokens:
            _tok(slide, token, x, gy, CONTENT_W, Mm(9), size, color, align=align)
            gy += gap


def _thin_rule(slide, x, y, w, color=COLOR_GOLD, thickness=Pt(1.4)):
    return add_rect(slide, x, y, w, thickness, color)


# ==================================================================
# 1. 표지 - 사진 72%, 제목 최소화, 여백 넓게(브로슈어형)
# ==================================================================
def build_cover_a():
    prs = new_presentation()
    slide = blank_slide(prs)
    photo_h = Mm(214)
    _photo_ph(slide, "PHOTO_1", 0, 0, SLIDE_WIDTH, photo_h)
    _thin_rule(slide, 0, photo_h, SLIDE_WIDTH, thickness=Mm(1.2))
    add_rect(slide, 0, photo_h + Mm(1.2), SLIDE_WIDTH, SLIDE_HEIGHT - photo_h - Mm(1.2), COLOR_NAVY)
    text_top = photo_h + Mm(1.2) + (SLIDE_HEIGHT - photo_h - Mm(1.2)) / 2 - Mm(15)
    _tok(slide, "PAGE_TITLE", MARGIN, int(text_top), CONTENT_W, Mm(24), Pt(28), COLOR_WHITE, bold=True)
    _tok(slide, "PAGE_SUBTITLE", MARGIN, int(text_top) + Mm(23), CONTENT_W, Mm(9), Pt(13), (205, 210, 222))
    return _save(prs, "cover", "cover_A.pptx")


# ==================================================================
# 2. 현장사진 - 1장/2장/3~5장 레이아웃을 완전히 분리(장수에 따라 톤이 달라짐)
# ==================================================================
def build_site_photo_1_a():
    """1장: 거의 전면 사진 + 하단 짧은 안내문구 한 줄(여백만으로 구분, 박스 없음)."""
    prs = new_presentation()
    slide = blank_slide(prs)
    _light_title(slide)
    top = CONTENT_TOP
    guide_h = Mm(14)
    area_h = SLIDE_HEIGHT - top - BOTTOM_MARGIN - guide_h - Mm(5)
    _photo_ph(slide, "PHOTO_1", MARGIN, top, CONTENT_W, area_h)
    g_top = top + area_h + Mm(5)
    _thin_rule(slide, MARGIN, g_top, Mm(10))
    _tok(slide, "GUIDANCE", MARGIN, g_top + Mm(3), CONTENT_W, guide_h, FONT_SIZE_CAPTION, COLOR_TEXT_SUB)
    return _save(prs, "site_photo", "site_photo_1_A.pptx")


def build_site_photo_2_a():
    """2장: 좌우 절반씩 크게, 하단 안내문구 한 줄."""
    prs = new_presentation()
    slide = blank_slide(prs)
    _light_title(slide)
    top = CONTENT_TOP
    guide_h = Mm(14)
    area_h = SLIDE_HEIGHT - top - BOTTOM_MARGIN - guide_h - Mm(5)
    half_w = Emu(int((CONTENT_W - Mm(4)) / 2))
    _photo_ph(slide, "PHOTO_1", MARGIN, top, half_w, area_h)
    _photo_ph(slide, "PHOTO_2", MARGIN + half_w + Mm(4), top, half_w, area_h)
    g_top = top + area_h + Mm(5)
    _thin_rule(slide, MARGIN, g_top, Mm(10))
    _tok(slide, "GUIDANCE", MARGIN, g_top + Mm(3), CONTENT_W, guide_h, FONT_SIZE_CAPTION, COLOR_TEXT_SUB)
    return _save(prs, "site_photo", "site_photo_2_A.pptx")


def build_site_photo_multi_a():
    """3~5장: 대표 1장 크게 + 보조 사진 최대 4장 그리드(실제 장수가 적으면
    PHOTO_4/5는 값이 없어 자동으로 사라지고 여백으로 남는다)."""
    prs = new_presentation()
    slide = blank_slide(prs)
    _light_title(slide)
    top = CONTENT_TOP
    guide_h = Mm(14)
    area_h = SLIDE_HEIGHT - top - BOTTOM_MARGIN - guide_h - Mm(5)
    lead_h = Emu(int(area_h * 0.6))
    _photo_ph(slide, "PHOTO_1", MARGIN, top, CONTENT_W, lead_h)
    sup_top = top + lead_h + Mm(4)
    sup_h = Emu(int(area_h - lead_h - Mm(4)))
    gap = Mm(4)
    cell_w = Emu(int((CONTENT_W - gap * 3) / 4))
    for i in range(4):
        x = MARGIN + Emu(int(cell_w + gap) * i)
        _photo_ph(slide, f"PHOTO_{i+2}", x, sup_top, cell_w, sup_h)
    g_top = sup_top + sup_h + Mm(5)
    _thin_rule(slide, MARGIN, g_top, Mm(10))
    _tok(slide, "GUIDANCE", MARGIN, g_top + Mm(3), CONTENT_W, guide_h, FONT_SIZE_CAPTION, COLOR_TEXT_SUB)
    return _save(prs, "site_photo", "site_photo_multi_A.pptx")


# ==================================================================
# 3. 공사 필요성(need) - 대표사진 1장 크게 + 핵심 메시지 2~3개(긴 문단 금지)
# ==================================================================
def build_need_a():
    prs = new_presentation()
    slide = blank_slide(prs)
    _light_title(slide)
    top = CONTENT_TOP
    photo_h = Mm(168)
    _photo_ph(slide, "PHOTO_1", MARGIN, top, CONTENT_W, photo_h)
    b_top = top + photo_h + Mm(10)
    b_h = Emu(int(SLIDE_HEIGHT - b_top - BOTTOM_MARGIN))
    n = 3
    row_h = Emu(int(b_h / n))
    for i in range(n):
        ry = b_top + Emu(int(row_h * i))
        num = add_text(slide, MARGIN, ry, Mm(14), row_h, f"{i+1:02d}", size=Pt(24),
                         color=GHOST_NUMBER_COLOR, bold=True)
        desc = _tok(slide, f"DESC_{i+1}", MARGIN + Mm(16), ry + Mm(2), Emu(int(CONTENT_W - Mm(16))),
                     Emu(int(row_h - Mm(4))), FONT_SIZE_BODY, COLOR_TEXT_BODY)
        rule = _thin_rule(slide, MARGIN + Mm(16), ry + row_h - Mm(2), Emu(int(CONTENT_W - Mm(16))),
                            color=COLOR_GRAY_LIGHT, thickness=Pt(0.75)) if i < n - 1 else None
        members = [num, desc] + ([rule] if rule is not None else [])
        _group(slide, f"GROUP_POINT_{i+1}", members)
    return _save(prs, "need", "need_A.pptx")


# ==================================================================
# 4. 주요 하자(defect) - 고정 4카드 폐기 -> 대표사진형 / 2분할형 / 3카드형
# ==================================================================
def build_defect_hero_a():
    """대표사진형(하자 1건 강조): 큰 사진 1장 + 짧은 설명 1~2줄."""
    prs = new_presentation()
    slide = blank_slide(prs)
    _light_title(slide)
    top = CONTENT_TOP
    photo_h = Mm(200)
    _photo_ph(slide, "PHOTO_1", MARGIN, top, CONTENT_W, photo_h)
    t_top = top + photo_h + Mm(8)
    _tok(slide, "TITLE_1", MARGIN, t_top, CONTENT_W, Mm(10), FONT_SIZE_SECTION_HEAD, COLOR_NAVY, bold=True)
    _tok(slide, "DESC_1", MARGIN, t_top + Mm(11), CONTENT_W, Mm(16), FONT_SIZE_BODY, COLOR_TEXT_BODY)
    return _save(prs, "defect", "defect_hero_A.pptx")


def build_defect_split_a():
    """2분할형(하자 2건 비교): 좌우로 큰 사진 2장, 각각 짧은 라벨."""
    prs = new_presentation()
    slide = blank_slide(prs)
    _light_title(slide)
    top = CONTENT_TOP
    photo_h = Mm(190)
    half_w = Emu(int((CONTENT_W - Mm(6)) / 2))
    for i, x in enumerate([MARGIN, MARGIN + half_w + Mm(6)]):
        n = i + 1
        photo = _photo_ph(slide, f"PHOTO_{n}", x, top, half_w, photo_h)
        ty = top + photo_h + Mm(6)
        title = _tok(slide, f"TITLE_{n}", x, ty, half_w, Mm(9), FONT_SIZE_SECTION_HEAD, COLOR_NAVY, bold=True)
        desc = _tok(slide, f"DESC_{n}", x, ty + Mm(10), half_w, Mm(22), FONT_SIZE_CAPTION, COLOR_TEXT_SUB)
        _group(slide, f"GROUP_CARD_{n}", [photo, title, desc])
    return _save(prs, "defect", "defect_split_A.pptx")


def build_defect_3card_a():
    """3카드형(하자 2~3건): 가로 3분할, 얇은 금색 밑줄만으로 구분(회색 박스 없음)."""
    prs = new_presentation()
    slide = blank_slide(prs)
    _light_title(slide)
    top = CONTENT_TOP
    photo_h = Mm(120)
    gap = Mm(6)
    cell_w = Emu(int((CONTENT_W - gap * 2) / 3))
    for i in range(3):
        n = i + 1
        x = MARGIN + Emu(int(cell_w + gap) * i)
        photo = _photo_ph(slide, f"PHOTO_{n}", x, top, cell_w, photo_h)
        ty = top + photo_h + Mm(6)
        rule = _thin_rule(slide, x, ty, Mm(10))
        title = _tok(slide, f"TITLE_{n}", x, ty + Mm(4), cell_w, Mm(9), FONT_SIZE_SECTION_HEAD,
                      COLOR_NAVY, bold=True)
        desc = _tok(slide, f"DESC_{n}", x, ty + Mm(14), cell_w, Mm(38), FONT_SIZE_CAPTION, COLOR_TEXT_SUB)
        _group(slide, f"GROUP_CARD_{n}", [photo, rule, title, desc])
    return _save(prs, "defect", "defect_3card_A.pptx")


# ==================================================================
# 5. 주요 보수 방법(repair) - 좌우 분할형, 핵심 포인트 2~4개(개수별 정확한 배치)
# ==================================================================
def _build_repair_template(n_points, filename):
    prs = new_presentation()
    slide = blank_slide(prs)
    _light_title(slide)
    top = CONTENT_TOP
    left_w = Emu(int(CONTENT_W * 0.56))
    right_w = Emu(int(CONTENT_W - left_w - Mm(10)))
    main_h = Emu(int(SLIDE_HEIGHT - top - BOTTOM_MARGIN))
    _photo_ph(slide, "PHOTO_1", MARGIN, top, left_w, main_h)
    rx = MARGIN + left_w + Mm(10)
    row_h = Emu(int(main_h / n_points))
    for i in range(n_points):
        n = i + 1
        ry = top + Emu(int(row_h * i))
        num = add_text(slide, rx, ry, Mm(13), Mm(11), f"{n:02d}", size=Pt(20),
                         color=COLOR_GOLD, bold=True)
        title = _tok(slide, f"TITLE_{n}", rx + Mm(14), ry, Emu(int(right_w - Mm(14))), Mm(9),
                      FONT_SIZE_BODY, COLOR_NAVY, bold=True)
        desc = _tok(slide, f"DESC_{n}", rx + Mm(14), ry + Mm(9), Emu(int(right_w - Mm(14))),
                     Emu(int(row_h - Mm(13))), FONT_SIZE_CAPTION, COLOR_TEXT_BODY)
        members = [num, title, desc]
        if i < n_points - 1:
            members.append(_thin_rule(slide, rx, ry + row_h - Mm(3), Emu(int(right_w)),
                                        color=COLOR_GRAY_LIGHT, thickness=Pt(0.75)))
        _group(slide, f"GROUP_POINT_{n}", members)
    return _save(prs, "repair", filename)


def build_repair_2point_a():
    return _build_repair_template(2, "repair_2point_A.pptx")


def build_repair_3point_a():
    return _build_repair_template(3, "repair_3point_A.pptx")


def build_repair_4point_a():
    return _build_repair_template(4, "repair_4point_A.pptx")


# ==================================================================
# 6. 공법 특징(feature) - 사진+특징 카드형, 3개/4개 변형
# ==================================================================
def build_feature_3card_a():
    prs = new_presentation()
    slide = blank_slide(prs)
    _light_title(slide)
    top = CONTENT_TOP
    photo_h = Mm(150)
    gap = Mm(6)
    cell_w = Emu(int((CONTENT_W - gap * 2) / 3))
    for i in range(3):
        n = i + 1
        x = MARGIN + Emu(int(cell_w + gap) * i)
        photo = _photo_ph(slide, f"PHOTO_{n}", x, top, cell_w, photo_h)
        ty = top + photo_h + Mm(6)
        rule = _thin_rule(slide, x, ty, Mm(10))
        title = _tok(slide, f"TITLE_{n}", x, ty + Mm(4), cell_w, Mm(9), FONT_SIZE_SECTION_HEAD,
                      COLOR_GOLD, bold=True)
        desc = _tok(slide, f"DESC_{n}", x, ty + Mm(14), cell_w, Mm(46), FONT_SIZE_CAPTION, COLOR_TEXT_BODY)
        _group(slide, f"GROUP_CARD_{n}", [photo, rule, title, desc])
    return _save(prs, "feature", "feature_3card_A.pptx")


def build_feature_4card_a():
    prs = new_presentation()
    slide = blank_slide(prs)
    _light_title(slide)
    top = CONTENT_TOP
    area_h = Emu(int(SLIDE_HEIGHT - top - BOTTOM_MARGIN))
    gap = Mm(8)
    cell_w = Emu(int((CONTENT_W - gap) / 2))
    cell_h = Emu(int((area_h - gap) / 2))
    photo_h = Emu(int(cell_h * 0.62))
    for i in range(4):
        n = i + 1
        r, c = divmod(i, 2)
        x = MARGIN + Emu(int(cell_w + gap) * c)
        y = top + Emu(int(cell_h + gap) * r)
        photo = _photo_ph(slide, f"PHOTO_{n}", x, y, cell_w, photo_h)
        ty = y + photo_h + Mm(4)
        rule = _thin_rule(slide, x, ty, Mm(10))
        title = _tok(slide, f"TITLE_{n}", x, ty + Mm(3), cell_w, Mm(8), FONT_SIZE_SECTION_HEAD,
                      COLOR_GOLD, bold=True)
        desc = _tok(slide, f"DESC_{n}", x, ty + Mm(11), cell_w, Emu(int(cell_h - photo_h - Mm(15))),
                     FONT_SIZE_CAPTION, COLOR_TEXT_BODY)
        _group(slide, f"GROUP_CARD_{n}", [photo, rule, title, desc])
    return _save(prs, "feature", "feature_4card_A.pptx")


# ==================================================================
# 7. 사용 자재(material) - 제품사진 중심, 제품명+짧은 특징(기술자료 스타일,
#    쇼핑몰 카드처럼 보이지 않도록 배경 박스/가격표 느낌 요소를 쓰지 않는다)
# ==================================================================
def build_material_4card_a():
    prs = new_presentation()
    slide = blank_slide(prs)
    _light_title(slide)
    top = CONTENT_TOP
    area_h = Emu(int(SLIDE_HEIGHT - top - BOTTOM_MARGIN))
    gap = Mm(8)
    cell_w = Emu(int((CONTENT_W - gap) / 2))
    cell_h = Emu(int((area_h - gap) / 2))
    photo_h = Emu(int(cell_h * 0.68))
    for i in range(4):
        n = i + 1
        r, c = divmod(i, 2)
        x = MARGIN + Emu(int(cell_w + gap) * c)
        y = top + Emu(int(cell_h + gap) * r)
        photo = _photo_ph(slide, f"PHOTO_{n}", x, y, cell_w, photo_h)
        ty = y + photo_h + Mm(4)
        title = _tok(slide, f"TITLE_{n}", x, ty, cell_w, Mm(8), FONT_SIZE_SECTION_HEAD,
                      COLOR_NAVY, bold=True)
        desc = _tok(slide, f"DESC_{n}", x, ty + Mm(8), cell_w, Emu(int(cell_h - photo_h - Mm(12))),
                     FONT_SIZE_CAPTION, COLOR_TEXT_SUB)
        _group(slide, f"GROUP_CARD_{n}", [photo, title, desc])
    return _save(prs, "material", "material_4card_A.pptx")


# ==================================================================
# 8. 시공 순서(process) - 3/4/5/6 STEP, 번호+화살표로 흐름이 한눈에 보이게
# ==================================================================
def _step_card(slide, n, x, y, w, h, photo_h_ratio=0.6):
    photo_h = Emu(int(h * photo_h_ratio))
    photo = _photo_ph(slide, f"PHOTO_{n}", x, y, w, photo_h)
    num = add_text(slide, x, y + photo_h + Mm(2), Mm(16), Mm(12), f"{n:02d}", size=Pt(19),
                     color=GHOST_NUMBER_COLOR, bold=True)
    label = _tok(slide, f"STEP_{n}", x + Mm(15), y + photo_h + Mm(3), Emu(int(w - Mm(15))), Mm(9),
                  FONT_SIZE_SECTION_HEAD, COLOR_NAVY, bold=True)
    desc = _tok(slide, f"STEP_DESC_{n}", x + Mm(15), y + photo_h + Mm(12),
                 Emu(int(w - Mm(15))), Emu(int(h - photo_h - Mm(14))), FONT_SIZE_CAPTION, COLOR_TEXT_BODY)
    return [photo, num, label, desc]


def _arrow(slide, x, y, w, h, text="→", size=Pt(20)):
    return add_text(slide, x, y, w, h, text, size=size, color=COLOR_GOLD, bold=True,
                      align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)


def build_process_3step_a():
    """3STEP: 가로 한 줄, 카드 사이에 금색 화살표로 흐름을 명확히 보여준다."""
    prs = new_presentation()
    slide = blank_slide(prs)
    _light_title(slide)
    top = CONTENT_TOP
    area_h = Emu(int(SLIDE_HEIGHT - top - BOTTOM_MARGIN))
    arrow_w = Mm(10)
    gap = Mm(3)
    cell_w = Emu(int((CONTENT_W - arrow_w * 2 - gap * 4) / 3))
    x = MARGIN
    for i in range(3):
        n = i + 1
        members = _step_card(slide, n, x, top, cell_w, area_h, photo_h_ratio=0.42)
        _group(slide, f"GROUP_STEP_{n}", members)
        x += cell_w + gap
        if i < 2:
            _arrow(slide, x, top + Emu(int(area_h * 0.42 * 0.5)) - Mm(6), arrow_w, Mm(12))
            x += arrow_w + gap
    return _save(prs, "process", "process_3step_A.pptx")


def _vertical_steps(n_steps, filename):
    """4/5STEP: 세로 리스트. 옅은 큰 번호(에디토리얼 타이포) + 정사각 사진 +
    스텝명 1줄 + 설명 1줄, 스텝 사이는 얇은 금색 화살표(↓)로 흐름을 표시한다."""
    prs = new_presentation()
    slide = blank_slide(prs)
    _light_title(slide)
    top = CONTENT_TOP
    area_h = Emu(int(SLIDE_HEIGHT - top - BOTTOM_MARGIN))
    row_h = Emu(int(area_h / n_steps))
    img_w = Mm(46)
    for i in range(n_steps):
        n = i + 1
        y = top + Emu(int(row_h * i))
        num = add_text(slide, MARGIN, y, Mm(15), Mm(13), f"{n:02d}", size=Pt(22),
                         color=GHOST_NUMBER_COLOR, bold=True)
        img_x = MARGIN + Mm(15)
        img_h = Emu(int(row_h - Mm(6)))
        photo = _photo_ph(slide, f"PHOTO_{n}", img_x, y + Mm(1), img_w, img_h)
        text_x = img_x + img_w + Mm(7)
        text_w = Emu(int(CONTENT_W - (text_x - MARGIN)))
        label = _tok(slide, f"STEP_{n}", text_x, y + Mm(2), text_w, Mm(9), FONT_SIZE_SECTION_HEAD,
                      COLOR_NAVY, bold=True)
        desc = _tok(slide, f"STEP_DESC_{n}", text_x, y + Mm(12), text_w, Emu(int(row_h - Mm(15))),
                     FONT_SIZE_CAPTION, COLOR_TEXT_BODY)
        members = [num, photo, label, desc]
        if i < n_steps - 1:
            # 화살표가 다음 스텝의 옅은 번호 타이포와 겹치지 않도록, 반드시 이번
            # 행의 영역(row_h) 안에서 끝나게 한다(다음 행 시작선을 넘지 않음).
            arrow_h = Mm(5)
            arrow_y = y + row_h - arrow_h
            members.append(_arrow(slide, MARGIN + Mm(2), arrow_y, Mm(11), arrow_h, text="↓", size=Pt(12)))
        _group(slide, f"GROUP_STEP_{n}", members)
    return _save(prs, "process", filename)


def build_process_4step_a():
    return _vertical_steps(4, "process_4step_A.pptx")


def build_process_5step_a():
    return _vertical_steps(5, "process_5step_A.pptx")


def build_process_6step_a():
    """6STEP: 2열 x 3행 그리드. 같은 행은 금색 → 로, 다음 행으로 넘어갈 때는
    왼쪽 끝에 작은 ↓ 로 흐름을 이어준다(지그재그 진행 흐름이 한눈에 보이게)."""
    prs = new_presentation()
    slide = blank_slide(prs)
    _light_title(slide)
    top = CONTENT_TOP
    area_h = Emu(int(SLIDE_HEIGHT - top - BOTTOM_MARGIN))
    rows = 3
    gap_y = Mm(6)
    cell_h = Emu(int((area_h - gap_y * (rows - 1)) / rows))
    arrow_w = Mm(9)
    gap_x = Mm(3)
    cell_w = Emu(int((CONTENT_W - arrow_w - gap_x * 2) / 2))
    for i in range(6):
        n = i + 1
        r, c = divmod(i, 2)
        x = MARGIN + Emu(int(cell_w + arrow_w + gap_x * 2) * c) if c == 1 else MARGIN
        y = top + Emu(int(cell_h + gap_y) * r)
        members = _step_card(slide, n, x, y, cell_w, cell_h, photo_h_ratio=0.5)
        if c == 0 and n < 6:
            ay = y + Emu(int(cell_h * 0.5 * 0.5)) - Mm(6)
            members.append(_arrow(slide, x + cell_w + gap_x, ay, arrow_w, Mm(12)))
        _group(slide, f"GROUP_STEP_{n}", members)
    return _save(prs, "process", "process_6step_A.pptx")


# ==================================================================
# 9. 시공 전후(before_after) - Before/After 사진이 페이지의 중심, 1~2사례
# ==================================================================
def build_before_after_1case_a():
    """Before/After를 좌우 2분할 대신 위/아래로 쌓는다. 실제 시공사진은 대부분
    가로형(landscape)이라, 세로로 아주 긴 좁은 박스(좌우 분할)에 넣으면 비율
    유지 규칙(왜곡 금지) 때문에 사진이 위아래로 크게 레터박싱되어 작아 보인다.
    가로 폭을 CONTENT_W 전체로 주면 가로형 사진이 훨씬 크게 채워진다."""
    prs = new_presentation()
    slide = blank_slide(prs)
    _light_title(slide)
    top = CONTENT_TOP
    label_h = Mm(7)
    gap = Mm(6)
    desc_h = Mm(14)
    photo_h = Emu(int((SLIDE_HEIGHT - top - BOTTOM_MARGIN - desc_h - label_h * 2 - gap) / 2))
    photo_before = _photo_ph(slide, "PHOTO_BEFORE", MARGIN, top, CONTENT_W, photo_h)
    label_before = add_text(slide, MARGIN, top + photo_h + Mm(2), CONTENT_W, label_h, "BEFORE",
                              size=Pt(12), color=COLOR_TEXT_SUB, bold=True)
    y2 = top + photo_h + label_h + gap
    photo_after = _photo_ph(slide, "PHOTO_AFTER", MARGIN, y2, CONTENT_W, photo_h)
    label_after = add_text(slide, MARGIN, y2 + photo_h + Mm(2), CONTENT_W, label_h, "AFTER",
                             size=Pt(12), color=COLOR_GOLD, bold=True)
    note_top = y2 + photo_h + label_h + Mm(4)
    desc = _tok(slide, "DESC_1", MARGIN, note_top, CONTENT_W, desc_h, FONT_SIZE_BODY, COLOR_TEXT_BODY)
    return _save(prs, "before_after", "before_after_1case_A.pptx")


def build_before_after_2case_a():
    """2사례: 각 사례를 위/아래로 배치, 사례별로 독립 GROUP이라 실제로 1건만
    있어도(예: 두번째 사례 페이지에 사례가 1개뿐인 경우) 나머지 절반이 빈 채로
    남지 않고 통째로 제거된다."""
    prs = new_presentation()
    slide = blank_slide(prs)
    _light_title(slide)
    top = CONTENT_TOP
    area_h = Emu(int(SLIDE_HEIGHT - top - BOTTOM_MARGIN))
    gap = Mm(8)
    row_h = Emu(int((area_h - gap) / 2))
    half_w = Emu(int((CONTENT_W - Mm(5)) / 2))
    ph = Emu(int(row_h - Mm(11)))
    for i in range(2):
        n = i + 1
        y = top + Emu(int(row_h + gap) * i)
        pb = _photo_ph(slide, f"PHOTO_BEFORE_{n}", MARGIN, y, half_w, ph)
        pa = _photo_ph(slide, f"PHOTO_AFTER_{n}", MARGIN + half_w + Mm(5), y, half_w, ph)
        lb = add_text(slide, MARGIN, y + ph + Mm(2), half_w, Mm(7), "BEFORE", size=Pt(10),
                        color=COLOR_TEXT_SUB, bold=True, align=PP_ALIGN.CENTER)
        la = add_text(slide, MARGIN + half_w + Mm(5), y + ph + Mm(2), half_w, Mm(7), "AFTER", size=Pt(10),
                        color=COLOR_GOLD, bold=True, align=PP_ALIGN.CENTER)
        desc = _tok(slide, f"DESC_{n}", MARGIN, y + ph + Mm(9), CONTENT_W, Mm(8), FONT_SIZE_CAPTION,
                     COLOR_TEXT_BODY, align=PP_ALIGN.CENTER)
        _group(slide, f"GROUP_CASE_{n}", [pb, pa, lb, la, desc])
    return _save(prs, "before_after", "before_after_2case_A.pptx")


# ==================================================================
# 10. 기대 효과(effect) - 완료사진 크게 + 효과 3~4개만 짧게(긴 목록 금지)
# ==================================================================
def build_effect_a():
    prs = new_presentation()
    slide = blank_slide(prs)
    _light_title(slide)
    top = CONTENT_TOP
    photo_h = Mm(160)
    _photo_ph(slide, "PHOTO_1", MARGIN, top, CONTENT_W, photo_h)
    y = top + photo_h + Mm(10)
    n = 4
    col_w = Emu(int((CONTENT_W - Mm(6) * (n - 1)) / n))
    for i in range(n):
        num_x = MARGIN + Emu(int(col_w + Mm(6)) * i)
        num = add_text(slide, num_x, y, col_w, Mm(11), f"0{i+1}", size=Pt(18),
                         color=COLOR_GOLD, bold=True)
        rule = _thin_rule(slide, num_x, y + Mm(11), Mm(8), color=COLOR_GRAY_LIGHT, thickness=Pt(1.2))
        desc = _tok(slide, f"DESC_{i+1}", num_x, y + Mm(14), col_w, Mm(20), FONT_SIZE_CAPTION,
                     COLOR_TEXT_BODY)
        _group(slide, f"GROUP_CHIP_{i+1}", [num, rule, desc])
    return _save(prs, "effect", "effect_A.pptx")


# ==================================================================
# 11. 마무리(closing) - 사진/여백 중심, 문구 최소화
# ==================================================================
def build_closing_with_photo_a():
    prs = new_presentation()
    slide = blank_slide(prs)
    photo_h = Mm(190)
    _photo_ph(slide, "PHOTO_1", 0, 0, SLIDE_WIDTH, photo_h)
    add_rect(slide, 0, photo_h, SLIDE_WIDTH, SLIDE_HEIGHT - photo_h, COLOR_NAVY)
    text_top = photo_h + (SLIDE_HEIGHT - photo_h) / 2 - Mm(16)
    _thin_rule(slide, MARGIN + Mm(70), int(text_top) - Mm(10), CONTENT_W - Mm(140))
    _tok(slide, "PAGE_TITLE", MARGIN, int(text_top), CONTENT_W, Mm(20), Pt(20), COLOR_WHITE, bold=True,
          align=PP_ALIGN.CENTER)
    _tok(slide, "DESC_1", MARGIN, int(text_top) + Mm(21), CONTENT_W, Mm(9), Pt(12), (205, 210, 222),
          align=PP_ALIGN.CENTER)
    _tok(slide, "DESC_2", MARGIN, int(text_top) + Mm(30), CONTENT_W, Mm(9), Pt(12), (205, 210, 222),
          align=PP_ALIGN.CENTER)
    return _save(prs, "closing", "closing_with_photo_A.pptx")


def build_closing_no_photo_a():
    prs = new_presentation()
    slide = blank_slide(prs)
    add_rect(slide, 0, 0, SLIDE_WIDTH, SLIDE_HEIGHT, COLOR_NAVY)
    text_top = SLIDE_HEIGHT / 2 - Mm(16)
    _thin_rule(slide, MARGIN + Mm(70), int(text_top) - Mm(10), CONTENT_W - Mm(140))
    _tok(slide, "PAGE_TITLE", MARGIN, int(text_top), CONTENT_W, Mm(20), Pt(20), COLOR_WHITE, bold=True,
          align=PP_ALIGN.CENTER)
    _tok(slide, "DESC_1", MARGIN, int(text_top) + Mm(21), CONTENT_W, Mm(9), Pt(12), (205, 210, 222),
          align=PP_ALIGN.CENTER)
    _tok(slide, "DESC_2", MARGIN, int(text_top) + Mm(30), CONTENT_W, Mm(9), Pt(12), (205, 210, 222),
          align=PP_ALIGN.CENTER)
    return _save(prs, "closing", "closing_no_photo_A.pptx")


def build_all():
    paths = [
        build_cover_a(),
        build_site_photo_1_a(),
        build_site_photo_2_a(),
        build_site_photo_multi_a(),
        build_need_a(),
        build_defect_hero_a(),
        build_defect_split_a(),
        build_defect_3card_a(),
        build_repair_2point_a(),
        build_repair_3point_a(),
        build_repair_4point_a(),
        build_feature_3card_a(),
        build_feature_4card_a(),
        build_material_4card_a(),
        build_process_3step_a(),
        build_process_4step_a(),
        build_process_5step_a(),
        build_process_6step_a(),
        build_before_after_1case_a(),
        build_before_after_2case_a(),
        build_effect_a(),
        build_closing_with_photo_a(),
        build_closing_no_photo_a(),
    ]
    return paths


if __name__ == "__main__":
    for p in build_all():
        print(p)
