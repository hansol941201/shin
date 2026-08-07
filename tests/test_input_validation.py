# -*- coding: utf-8 -*-
"""
실제 보고된 장애("선택한 PPT가 있는데도 임시경로에서 Package not found") 재현/검증.
- 존재하지 않는 파일 -> 파이프라인 중간이 아니라 시작 즉시 명확한 한국어 메시지로 실패
- 공백/괄호/한글이 섞인 경로(Windows 스타일 폴더명 모사)에서도 정상 동작
- 구형 .ppt(OOXML이 아닌 파일)를 넣었을 때 "Package not found" 같은 원시 예외가 아니라
  명확한 안내 메시지로 실패
- 입력 파일마다 존재/크기/확장자가 로그에 기록되는지 확인
"""
import os
import shutil
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.main import run_pipeline
from app.utils.input_validation import inspect_file, validate_input_paths
from tests.make_samples import main as make_samples_main

FIXT_DIR = os.path.join(os.path.dirname(__file__), "fixtures")
OUT_DIR = os.path.join(os.path.dirname(__file__), "_test_output")


@pytest.fixture(scope="module", autouse=True)
def fixtures():
    if not os.path.exists(os.path.join(FIXT_DIR, "sample1.pptx")):
        make_samples_main()
    yield


def test_missing_file_gives_clear_message_not_deep_crash():
    files = [os.path.join(FIXT_DIR, "sample1.pptx"), "/tmp/이파일은_존재하지않음_12345.pptx"]
    with pytest.raises(FileNotFoundError) as exc:
        run_pipeline("테스트아파트", "재도장", files, OUT_DIR)
    assert "찾을 수 없습니다" in str(exc.value)
    assert "다시 선택" in str(exc.value)


def test_zero_byte_file_rejected_clearly():
    empty = os.path.join(OUT_DIR, "빈파일.pptx")
    os.makedirs(OUT_DIR, exist_ok=True)
    open(empty, "wb").close()
    files = [os.path.join(FIXT_DIR, "sample1.pptx"), empty]
    with pytest.raises(ValueError) as exc:
        run_pipeline("테스트아파트", "재도장", files, OUT_DIR)
    assert "비어" in str(exc.value)


def test_invalid_legacy_ppt_gives_clear_message():
    """OOXML이 아닌 더미 바이너리를 .ppt 확장자로 넣었을 때, python-pptx의 원시
    "Package not found" 예외가 아니라 사용자가 이해할 수 있는 안내 메시지로 실패해야 한다."""
    fake_ppt = os.path.join(OUT_DIR, "구형파일.ppt")
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(fake_ppt, "wb") as f:
        f.write(b"\xd0\xcf\x11\xe0" + b"NOT_A_REAL_OOXML_PACKAGE" * 20)  # OLE 헤더 흉내 + 쓰레기
    files = [os.path.join(FIXT_DIR, "sample1.pptx"), fake_ppt]
    with pytest.raises((ValueError, FileNotFoundError)) as exc:
        run_pipeline("테스트아파트", "재도장", files, OUT_DIR)
    msg = str(exc.value)
    # "Package not found" 같은 원시 라이브러리 예외 텍스트만 그대로 노출되면 안 되고,
    # 사용자가 다음 행동을 알 수 있는 한국어 안내가 포함되어야 한다.
    assert ("PowerPoint" in msg) or (".ppt" in msg) or ("변환" in msg) or ("확인" in msg)


def test_tricky_windows_style_path_with_space_paren_unicode():
    """공백/괄호/한글이 섞인 폴더명(Windows 환경에서 흔함)에서도 정상 동작해야 한다."""
    tricky_dir = os.path.join(OUT_DIR, "다운로드 (재도장 자료) - 최종본")
    os.makedirs(tricky_dir, exist_ok=True)
    src1 = os.path.join(FIXT_DIR, "sample1.pptx")
    src2 = os.path.join(FIXT_DIR, "sample2.pptx")
    dst1 = os.path.join(tricky_dir, "우리 아파트 재도장(초안) v2.pptx")
    dst2 = os.path.join(tricky_dir, "참고자료 [현장사진 포함].pptx")
    shutil.copy2(src1, dst1)
    shutil.copy2(src2, dst2)

    result = run_pipeline("경로테스트아파트", "재도장", [dst1, dst2], OUT_DIR)
    assert os.path.exists(result["pptx"])


def test_inspect_file_reports_existence_size_ext():
    info = inspect_file(os.path.join(FIXT_DIR, "sample1.pptx"))
    assert info["exists"] is True
    assert info["is_file"] is True
    assert info["size_bytes"] > 0
    assert info["ext"] == ".pptx"

    missing = inspect_file("/tmp/없는파일_xyz.pptx")
    assert missing["exists"] is False


def test_validate_input_paths_rejects_unsupported_extension():
    bogus = os.path.join(OUT_DIR, "문서.docx")
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(bogus, "wb") as f:
        f.write(b"not a presentation")
    with pytest.raises(ValueError) as exc:
        validate_input_paths([os.path.join(FIXT_DIR, "sample1.pptx"), bogus])
    assert "지원하지 않는" in str(exc.value)
