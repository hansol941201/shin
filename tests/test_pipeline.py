# -*- coding: utf-8 -*-
"""
v2 콘텐츠 중심 파이프라인 통합 테스트. 2개/3개 입력 케이스, 민감정보 미노출,
사진/문구 활용률, 품질 점수, 중간 산출물 생성을 검증한다.
실행: pytest tests/test_pipeline.py -v
(사전에 tests/make_samples.py 로 픽스처를 생성해야 한다)
"""
import io
import os
import sys

import pytest
from PIL import Image
from pptx import Presentation

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.main import run_pipeline
from tests.make_samples import main as make_samples_main

FIXT_DIR = os.path.join(os.path.dirname(__file__), "fixtures")
OUT_DIR = os.path.join(os.path.dirname(__file__), "_test_output")

BANNED_STRINGS = [
    "행복드림아파트", "그린빌아파트", "한빛아파트", "대한페인트건설",
    "010-1234-5678", "010-9876-5432", "hong@daehanpaint.co.kr",
    "daehanpaint.co.kr", "123-45-67890", "홍길동", "이영희",
    "무지개마을아파트", "코스모스아파트", "서울외벽방수", "동양건업", "김철수",
    "010-2222-3333", "seoulwp.co.kr", "dongyang.co.kr", "321-45-11111", "555-22-33333",
]

DEBUG_ARTIFACTS = (
    "source_slides.csv", "source_images.csv", "source_texts.csv",
    "image_text_relationships.csv", "unused_content.csv", "content_groups.json",
    "품질점수.txt",
)


@pytest.fixture(scope="module", autouse=True)
def fixtures():
    if not os.path.exists(os.path.join(FIXT_DIR, "sample1.pptx")):
        make_samples_main()
    yield


def _walk(shapes):
    for sh in shapes:
        yield sh
        if sh.shape_type == 6:
            yield from _walk(sh.shapes)


def _assert_no_leak(pptx_path):
    prs = Presentation(pptx_path)
    assert prs.slide_height > prs.slide_width, "세로형이 아닙니다"
    for slide in prs.slides:
        for sh in _walk(slide.shapes):
            if sh.has_text_frame:
                text = sh.text_frame.text
                for w in BANNED_STRINGS:
                    assert w not in text, f"텍스트에 민감정보 잔존: {w}"
            if sh.shape_type == 13:
                try:
                    import pytesseract
                    im = Image.open(io.BytesIO(sh.image.blob))
                    ocr = pytesseract.image_to_string(im, lang="kor+eng")
                except Exception:
                    continue
                for w in BANNED_STRINGS:
                    assert w not in ocr, f"이미지 OCR에 민감정보 잔존: {w}"


def _assert_debug_artifacts(debug_dir):
    for fname in DEBUG_ARTIFACTS:
        assert os.path.exists(os.path.join(debug_dir, fname)), f"중간 산출물 누락: {fname}"
    assert os.path.isdir(os.path.join(debug_dir, "이미지추출"))


def test_two_file_input():
    files = [os.path.join(FIXT_DIR, "sample1.pptx"), os.path.join(FIXT_DIR, "sample2.pptx")]
    result = run_pipeline("테스트2파일아파트", "재도장", files, OUT_DIR)
    assert os.path.exists(result["pptx"])
    _assert_no_leak(result["pptx"])
    _assert_debug_artifacts(result["debug_dir"])


def test_three_file_input():
    files = [os.path.join(FIXT_DIR, "sample1.pptx"), os.path.join(FIXT_DIR, "sample2.pptx"),
              os.path.join(FIXT_DIR, "sample3.pptx")]
    result = run_pipeline("테스트3파일아파트", "재도장", files, OUT_DIR)
    assert os.path.exists(result["pptx"])
    _assert_no_leak(result["pptx"])


def test_messy_realistic_input_quality_and_utilization():
    """캡션이 부실하고 사진이 매우 많은(실제 회사 PPT와 유사한) 입력에서
    사진 활용률·품질 점수·중간 산출물이 실제로 기준을 충족하는지 검증한다."""
    files = [os.path.join(FIXT_DIR, "messy1.pptx"), os.path.join(FIXT_DIR, "messy2.pptx")]
    result = run_pipeline("○○아파트", "재도장", files, OUT_DIR)
    assert os.path.exists(result["pptx"])
    _assert_no_leak(result["pptx"])

    assert result["total_usable_image_count"] >= 30, \
        f"사용 가능 이미지가 {result['total_usable_image_count']}장으로 목표(30장) 미달"

    utilization = result["inserted_image_count"] / result["total_usable_image_count"]
    assert utilization >= 0.75, f"사진 활용률 {utilization*100:.1f}%로 기준(75%) 미달"

    assert result["quality_score"] >= 85, f"품질 점수 {result['quality_score']}로 기준(85) 미달"
    assert result["quality_passed"] is True

    _assert_debug_artifacts(result["debug_dir"])
    assert os.path.exists(os.path.join(result["debug_dir"], "source_texts.csv"))


def test_invalid_file_count_rejected():
    files = [os.path.join(FIXT_DIR, "sample1.pptx")]
    with pytest.raises(ValueError):
        run_pipeline("아파트", "재도장", files, OUT_DIR)


def test_empty_apartment_name_rejected():
    files = [os.path.join(FIXT_DIR, "sample1.pptx"), os.path.join(FIXT_DIR, "sample2.pptx")]
    with pytest.raises(ValueError):
        run_pipeline("  ", "재도장", files, OUT_DIR)
