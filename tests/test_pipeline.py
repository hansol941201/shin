# -*- coding: utf-8 -*-
"""
파이프라인 통합 테스트. 2개/3개 입력 케이스, 민감정보 미노출을 검증한다.
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
]


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


def _assert_no_leak(pptx_path, run_ocr=False):
    prs = Presentation(pptx_path)
    assert prs.slide_height > prs.slide_width, "세로형이 아닙니다"
    for slide in prs.slides:
        for sh in _walk(slide.shapes):
            if sh.has_text_frame:
                text = sh.text_frame.text
                for w in BANNED_STRINGS:
                    assert w not in text, f"텍스트에 민감정보 잔존: {w}"
            if run_ocr and sh.shape_type == 13:
                try:
                    import pytesseract
                    im = Image.open(io.BytesIO(sh.image.blob))
                    ocr = pytesseract.image_to_string(im, lang="kor+eng")
                except Exception:
                    continue
                for w in BANNED_STRINGS:
                    assert w not in ocr, f"이미지 OCR에 민감정보 잔존: {w}"


def test_two_file_input():
    files = [os.path.join(FIXT_DIR, "sample1.pptx"), os.path.join(FIXT_DIR, "sample2.pptx")]
    result = run_pipeline("테스트2파일아파트", "재도장", files, OUT_DIR)
    assert os.path.exists(result["pptx"])
    _assert_no_leak(result["pptx"])


def test_three_file_input_with_process_mismatch():
    files = [os.path.join(FIXT_DIR, "sample1.pptx"), os.path.join(FIXT_DIR, "sample2.pptx"),
              os.path.join(FIXT_DIR, "sample3.pptx")]
    result = run_pipeline("테스트3파일아파트", "재도장", files, OUT_DIR)
    assert os.path.exists(result["pptx"])
    _assert_no_leak(result["pptx"])
    # sample3 는 '중도' 공정이 없으므로 확인 필요 경고가 있어야 한다
    assert any("중도" in w for w in result["warnings"])


def test_messy_realistic_input_uses_30_plus_photos():
    """캡션이 부실하고 사진이 매우 많은(실제 회사 PPT와 유사한) 입력에서도
    30장 이상의 서로 다른 사진이 후보로 확보되고, 결과물에 다수 삽입되는지 검증한다."""
    files = [os.path.join(FIXT_DIR, "messy1.pptx"), os.path.join(FIXT_DIR, "messy2.pptx")]
    result = run_pipeline("○○아파트", "재도장", files, OUT_DIR)
    assert os.path.exists(result["pptx"])
    _assert_no_leak(result["pptx"])
    assert result["total_usable_image_count"] >= 30, \
        f"사용 가능 이미지가 {result['total_usable_image_count']}장으로 목표(30장) 미달"
    assert result["inserted_image_count"] >= 25, \
        f"실제 삽입된 이미지가 {result['inserted_image_count']}장으로 너무 적음"
    debug_dir = result["debug_dir"]
    for fname in ("extracted_text.csv", "content_library.json", "slide_content_mapping.csv",
                   "이미지분류.csv", "최종후보이미지목록.csv", "슬라이드계획.json"):
        assert os.path.exists(os.path.join(debug_dir, fname)), f"중간 산출물 누락: {fname}"
    assert os.path.isdir(os.path.join(debug_dir, "이미지추출"))


def test_invalid_file_count_rejected():
    files = [os.path.join(FIXT_DIR, "sample1.pptx")]
    with pytest.raises(ValueError):
        run_pipeline("아파트", "재도장", files, OUT_DIR)


def test_empty_apartment_name_rejected():
    files = [os.path.join(FIXT_DIR, "sample1.pptx"), os.path.join(FIXT_DIR, "sample2.pptx")]
    with pytest.raises(ValueError):
        run_pipeline("  ", "재도장", files, OUT_DIR)
