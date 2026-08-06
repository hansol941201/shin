# -*- coding: utf-8 -*-
"""
테스트용 가짜 기존 PPT 샘플(2개/3개)을 생성한다.
실제 현장 이름/회사 정보/개인정보가 섞인 상황을 재현하여 파이프라인을 검증하기 위한 픽스처.
"""
import os

from PIL import Image, ImageDraw, ImageFont
from pptx import Presentation
from pptx.util import Cm, Pt, Emu

FIXT_DIR = os.path.join(os.path.dirname(__file__), "fixtures")
IMG_DIR = os.path.join(FIXT_DIR, "gen_images")


def _font(size=28):
    try:
        return ImageFont.truetype("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", size, index=2)
    except Exception:
        try:
            return ImageFont.truetype("DejaVuSans.ttf", size)
        except Exception:
            return ImageFont.load_default()


def make_image(path, w, h, bg, label, burn_text=None, badge=None, seed=0):
    import random
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im = Image.new("RGB", (w, h), bg)
    d = ImageDraw.Draw(im)
    rnd = random.Random(seed or hash(label) or 1)
    # 시드 기반 랜덤 도형을 그려 사진마다 지각적 해시가 뚜렷이 달라지도록 함
    for _ in range(14):
        x1, y1 = rnd.randint(0, w), rnd.randint(0, h)
        x2, y2 = x1 + rnd.randint(10, max(11, w // 3)), y1 + rnd.randint(10, max(11, h // 3))
        color = tuple(max(0, min(255, c + rnd.randint(-60, 60))) for c in bg)
        d.ellipse([x1, y1, x2, y2], fill=color)
    d.text((20, 20), label, fill=(255, 255, 255), font=_font(30))
    if burn_text:
        d.rectangle([10, h - 60, w - 10, h - 10], fill=(0, 0, 0))
        d.text((20, h - 50), burn_text, fill=(255, 255, 0), font=_font(22))
    if badge:
        d.rectangle([w - 160, 10, w - 10, 60], fill=(255, 255, 255))
        d.text((w - 150, 18), badge, fill=(200, 30, 30), font=_font(22))
    im.save(path, quality=90)
    return path


def build_images():
    os.makedirs(IMG_DIR, exist_ok=True)
    imgs = {}
    # 하자 사진
    imgs["crack1"] = make_image(f"{IMG_DIR}/crack1.jpg", 900, 700, (120, 110, 100), "외벽 균열 발생 부위", seed=1)
    imgs["crack2"] = make_image(f"{IMG_DIR}/crack2.jpg", 900, 700, (125, 112, 102), "균열 확대 사진", seed=2)
    imgs["peel1"] = make_image(f"{IMG_DIR}/peel1.jpg", 900, 700, (140, 130, 110), "도장 박리 및 들뜸", seed=3)
    imgs["stain1"] = make_image(f"{IMG_DIR}/stain1.jpg", 900, 700, (110, 115, 100), "외벽 오염 및 얼룩", seed=4)
    imgs["mold1"] = make_image(f"{IMG_DIR}/mold1.jpg", 900, 700, (100, 120, 100), "곰팡이 발생 부위", seed=5)

    # 공정 사진
    imgs["wash1"] = make_image(f"{IMG_DIR}/wash1.jpg", 900, 700, (90, 130, 170), "고압세척 작업 중", seed=6)
    imgs["putty1"] = make_image(f"{IMG_DIR}/putty1.jpg", 900, 700, (150, 140, 120), "균열보수 퍼티 작업", seed=7)
    imgs["primer1"] = make_image(f"{IMG_DIR}/primer1.jpg", 900, 700, (170, 170, 175), "하도 도장 작업", seed=8)
    imgs["mid1"] = make_image(f"{IMG_DIR}/mid1.jpg", 900, 700, (180, 180, 60), "중도 도장 작업", seed=9)
    imgs["top1"] = make_image(f"{IMG_DIR}/top1.jpg", 900, 700, (60, 90, 160), "상도 도장 작업", seed=10)
    imgs["safety1"] = make_image(f"{IMG_DIR}/safety1.jpg", 900, 700, (200, 150, 50), "안전 작업 수칙 준수", seed=11)
    imgs["material1"] = make_image(f"{IMG_DIR}/material1.jpg", 900, 700, (210, 210, 200), "도장 자재", seed=12)

    # 전경 / 전후
    imgs["apt_full"] = make_image(
        f"{IMG_DIR}/apt_full.jpg", 1000, 1300, (80, 140, 190), "행복드림아파트 전경",
        burn_text="행복드림아파트 101동", seed=13)
    imgs["before1"] = make_image(
        f"{IMG_DIR}/before1.jpg", 900, 700, (130, 90, 70), "시공 전", burn_text="시공전", seed=14)
    imgs["after1"] = make_image(
        f"{IMG_DIR}/after1.jpg", 900, 700, (70, 150, 210), "시공 후", burn_text="시공후", seed=15)

    # 회사 로고/현수막(제거 대상 테스트)
    imgs["logo"] = make_image(f"{IMG_DIR}/logo.png", 200, 80, (255, 255, 255), "㈜대한페인트건설", seed=16)
    imgs["banner"] = make_image(
        f"{IMG_DIR}/banner.jpg", 1200, 200, (30, 30, 100), "",
        burn_text="㈜대한페인트건설 문의 010-1234-5678", seed=17)

    return imgs


def _add_pic(slide, path, x, y, w, h):
    return slide.shapes.add_picture(path, Cm(x), Cm(y), Cm(w), Cm(h))


def _add_text(slide, text, x, y, w, h, size=18, title=False):
    box = slide.shapes.add_textbox(Cm(x), Cm(y), Cm(w), Cm(h))
    tf = box.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    run = p.add_run()
    run.text = text
    run.font.size = Pt(size)
    return box


def build_ppt_1(path):
    prs = Presentation()
    prs.slide_width = Cm(19.05)
    prs.slide_height = Cm(25.4)  # 세로형(4:3 portrait)
    imgs = build_images()

    # 표지: 기존 아파트명/회사명 노출
    s = prs.slides.add_slide(prs.slide_layouts[6])
    _add_text(s, "행복드림아파트 재도장 공사 제안서", 1, 1, 17, 2, size=28, title=True)
    _add_text(s, "서울시 강남구 삼성동 123-45", 1, 3, 17, 1, size=14)
    _add_text(s, "㈜대한페인트건설", 1, 4, 17, 1, size=14)
    _add_pic(s, imgs["apt_full"], 2, 6, 13, 15)
    _add_text(s, "담당자: 홍길동 과장 / 010-1234-5678 / hong@daehanpaint.co.kr", 1, 22, 17, 1.5, size=11)

    # 하자 사진
    s = prs.slides.add_slide(prs.slide_layouts[6])
    _add_text(s, "주요 하자 현황", 1, 0.5, 17, 1.5, size=22, title=True)
    _add_pic(s, imgs["crack1"], 1, 2.5, 8.5, 6.5)
    _add_pic(s, imgs["peel1"], 9.5, 2.5, 8.5, 6.5)
    _add_pic(s, imgs["stain1"], 1, 9.5, 8.5, 6.5)
    _add_pic(s, imgs["mold1"], 9.5, 9.5, 8.5, 6.5)

    # 공법 개요
    s = prs.slides.add_slide(prs.slide_layouts[6])
    _add_text(s, "재도장 공법 개요: 사전점검, 고압세척, 균열보수, 퍼티, 하도, 중도, 상도, 최종점검 순으로 진행", 1, 0.5, 17, 2, size=16, title=True)
    _add_pic(s, imgs["material1"], 1, 3, 8.5, 6.5)
    _add_pic(s, imgs["safety1"], 9.5, 3, 8.5, 6.5)

    # 시공 순서 슬라이드들
    for name, img_key in [("1단계 고압세척", "wash1"), ("2단계 균열보수 퍼티", "putty1"),
                            ("3단계 하도", "primer1"), ("4단계 중도", "mid1"), ("5단계 상도", "top1")]:
        s = prs.slides.add_slide(prs.slide_layouts[6])
        _add_text(s, name, 1, 0.5, 17, 1.5, size=20, title=True)
        _add_pic(s, imgs[img_key], 3, 3, 13, 10)

    # 시공 전/후 사례
    s = prs.slides.add_slide(prs.slide_layouts[6])
    _add_text(s, "행복드림아파트 시공 전/후 비교", 1, 0.5, 17, 1.5, size=20, title=True)
    _add_text(s, "시공전", 1, 2, 8, 0.8, size=14)
    _add_pic(s, imgs["before1"], 1, 3, 8.5, 6.5)
    _add_text(s, "시공후", 9.5, 2, 8, 0.8, size=14)
    _add_pic(s, imgs["after1"], 9.5, 3, 8.5, 6.5)

    # 회사 소개 (제거 대상)
    s = prs.slides.add_slide(prs.slide_layouts[6])
    _add_pic(s, imgs["logo"], 1, 1, 6, 2.4)
    _add_text(s, "㈜대한페인트건설 회사 소개", 1, 4, 17, 1.5, size=20, title=True)
    _add_text(s, "홈페이지: www.daehanpaint.co.kr / 사업자등록번호 123-45-67890", 1, 6, 17, 1, size=12)
    _add_pic(s, imgs["banner"], 1, 8, 17, 3)

    prs.save(path)


def build_ppt_2(path):
    prs = Presentation()
    prs.slide_width = Cm(19.05)
    prs.slide_height = Cm(25.4)
    imgs = build_images()

    s = prs.slides.add_slide(prs.slide_layouts[6])
    _add_text(s, "그린빌아파트 외벽 재도장 안내", 1, 1, 17, 2, size=28, title=True)
    _add_text(s, "경기도 성남시 분당구 정자동 88-1 그린빌아파트 관리사무소", 1, 3, 17, 1, size=13)
    _add_pic(s, imgs["apt_full"], 2, 6, 13, 15)

    s = prs.slides.add_slide(prs.slide_layouts[6])
    _add_text(s, "하자 및 문제점", 1, 0.5, 17, 1.5, size=22, title=True)
    _add_pic(s, imgs["crack2"], 1, 2.5, 8.5, 6.5)
    _add_pic(s, imgs["stain1"], 9.5, 2.5, 8.5, 6.5)

    s = prs.slides.add_slide(prs.slide_layouts[6])
    _add_text(s, "공법 순서: 사전점검 -> 고압세척 -> 균열보수 -> 하도 -> 중도 -> 상도 -> 최종점검", 1, 0.5, 17, 2, size=15, title=True)
    for name, img_key, y in [("고압세척", "wash1", 3), ("균열보수", "putty1", 10)]:
        _add_text(s, name, 1, y, 8, 0.8, size=14)
        _add_pic(s, imgs[img_key], 1, y + 1, 8, 6)

    s = prs.slides.add_slide(prs.slide_layouts[6])
    _add_text(s, "하도/중도/상도 도장", 1, 0.5, 17, 1.5, size=20, title=True)
    _add_pic(s, imgs["primer1"], 1, 3, 5.5, 5)
    _add_pic(s, imgs["mid1"], 7, 3, 5.5, 5)
    _add_pic(s, imgs["top1"], 13, 3, 5.5, 5)

    s = prs.slides.add_slide(prs.slide_layouts[6])
    _add_text(s, "그린빌아파트 시공 전/시공 후", 1, 0.5, 17, 1.5, size=20, title=True)
    _add_text(s, "Before", 1, 2, 8, 0.8, size=14)
    _add_pic(s, imgs["before1"], 1, 3, 8.5, 6.5)
    _add_text(s, "After", 9.5, 2, 8, 0.8, size=14)
    _add_pic(s, imgs["after1"], 9.5, 3, 8.5, 6.5)

    s = prs.slides.add_slide(prs.slide_layouts[6])
    _add_pic(s, imgs["logo"], 1, 1, 6, 2.4)
    _add_text(s, "시공사: ㈜대한페인트건설 / 담당 이영희 대리 010-9876-5432", 1, 4, 17, 1, size=12)

    prs.save(path)


def build_ppt_3(path):
    """세 번째 파일: 공정 순서가 다르게 표기되고, 사진이 적은 경우 시뮬레이션."""
    prs = Presentation()
    prs.slide_width = Cm(19.05)
    prs.slide_height = Cm(25.4)
    imgs = build_images()

    s = prs.slides.add_slide(prs.slide_layouts[6])
    _add_text(s, "한빛아파트 재도장 공사", 1, 1, 17, 2, size=26, title=True)
    _add_pic(s, imgs["apt_full"], 2, 6, 13, 12)

    s = prs.slides.add_slide(prs.slide_layouts[6])
    _add_text(s, "균열 및 박리 하자 사례", 1, 0.5, 17, 1.5, size=20, title=True)
    _add_pic(s, imgs["crack1"], 1, 2.5, 8.5, 6.5)
    _add_pic(s, imgs["peel1"], 9.5, 2.5, 8.5, 6.5)

    # 이 파일은 '중도' 공정 표기가 없음 -> 교차검증 시 needs_confirmation 테스트
    s = prs.slides.add_slide(prs.slide_layouts[6])
    _add_text(s, "공법 순서: 사전점검, 고압세척, 균열보수, 하도, 상도, 최종점검", 1, 0.5, 17, 2, size=15, title=True)
    _add_pic(s, imgs["wash1"], 1, 3, 8, 6)
    _add_pic(s, imgs["top1"], 9.5, 3, 8, 6)

    prs.save(path)


def main():
    os.makedirs(FIXT_DIR, exist_ok=True)
    build_ppt_1(os.path.join(FIXT_DIR, "sample1.pptx"))
    build_ppt_2(os.path.join(FIXT_DIR, "sample2.pptx"))
    build_ppt_3(os.path.join(FIXT_DIR, "sample3.pptx"))
    print("샘플 생성 완료:", FIXT_DIR)


if __name__ == "__main__":
    main()
