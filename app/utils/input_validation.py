# -*- coding: utf-8 -*-
"""
입력 PPT 파일 검증 + 구형 .ppt 처리.

실제 사용자 보고: 회사 PPT 2개(그중 하나가 구형 .ppt)로 실행했을 때 python-pptx가
"Package not found" 오류를 내며 파이프라인 중간에서 알아보기 어려운 형태로 죽었다.
python-pptx는 OOXML(.pptx) 컨테이너만 열 수 있고, 구형 바이너리 .ppt는 애초에 열 수
없다(이것이 "Package not found"의 실제 원인이었다). 이 모듈은
1) 파이프라인 시작 "전에" 각 파일의 존재/파일여부/크기를 검사해 사용자가 이해할 수 있는
   한국어 메시지로 실패시키고,
2) .ppt 확장자를 명시적으로 감지해 LibreOffice가 있으면 .pptx로 자동 변환하고,
   없으면 명확한 안내 메시지로 거부한다.
"""
import os
import shutil
import subprocess
from pathlib import Path
from typing import List, Optional, Tuple

SUPPORTED_EXTS = {".pptx", ".ppt"}
LEGACY_EXTS = {".ppt"}


def inspect_file(path: str) -> dict:
    """존재 여부/파일 여부/크기/확장자를 검사해 그대로 보고한다(로그용)."""
    p = Path(path)
    info = {
        "path": str(p),
        "exists": p.exists(),
        "is_file": p.is_file() if p.exists() else False,
        "size_bytes": p.stat().st_size if p.exists() and p.is_file() else 0,
        "ext": p.suffix.lower(),
    }
    return info


def validate_input_paths(paths: List[str]) -> None:
    """파이프라인 진입 직후 가장 먼저 호출한다. 문제가 있으면 사용자 친화적인
    한국어 메시지로 ValueError/FileNotFoundError를 즉시 발생시켜, 처리 중간에서
    알아보기 어려운 라이브러리 예외("Package not found" 등)로 죽는 것을 막는다."""
    for raw_path in paths:
        p = Path(raw_path)
        if not p.exists():
            raise FileNotFoundError("선택한 PPT 파일을 찾을 수 없습니다. 다시 선택해주세요.")
        if not p.is_file():
            raise ValueError(f"선택한 경로가 파일이 아닙니다: {p}")
        size = p.stat().st_size
        if size == 0:
            raise ValueError(f"선택한 파일이 비어 있습니다(0바이트): {p.name}")
        ext = p.suffix.lower()
        if ext not in SUPPORTED_EXTS:
            raise ValueError(f"지원하지 않는 파일 형식입니다: {p.name} "
                              f"(.pptx 또는 .ppt 파일만 지원합니다)")


def is_legacy_ppt(path: str) -> bool:
    return Path(path).suffix.lower() in LEGACY_EXTS


def libreoffice_available() -> bool:
    return shutil.which("soffice") is not None


def convert_legacy_ppt_to_pptx(path: str, work_dir: str) -> Tuple[Optional[str], str]:
    """구형 .ppt를 LibreOffice로 .pptx로 변환한다.
    반환값: (변환된 경로 또는 None, 실패 사유 코드: ""|"no_libreoffice"|"convert_failed")"""
    if not libreoffice_available():
        return None, "no_libreoffice"

    os.makedirs(work_dir, exist_ok=True)
    try:
        subprocess.run(
            ["soffice", "--headless", "--norestore", "--convert-to", "pptx", "--outdir", work_dir, path],
            check=True, timeout=180, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
    except Exception:
        return None, "convert_failed"
    base = os.path.splitext(os.path.basename(path))[0]
    converted = os.path.join(work_dir, f"{base}.pptx")
    if os.path.exists(converted):
        return converted, ""
    return None, "convert_failed"


def resolve_input_file(path: str, temp_dir: str, logs: List[str] = None) -> Tuple[str, bool]:
    """입력 파일을 파이프라인이 실제로 열 수 있는 .pptx 경로로 정리한다.
    반환값: (사용할 경로, 구형 ppt를 변환했는지 여부)
    구형 .ppt인데 변환이 불가능하면 명확한 ValueError를 발생시킨다."""
    if not is_legacy_ppt(path):
        return path, False

    if logs is not None:
        logs.append(f"[안내] 구형 PowerPoint(.ppt) 형식 감지 - LibreOffice로 .pptx 변환을 시도합니다: "
                     f"{os.path.basename(path)}")
    converted, fail_reason = convert_legacy_ppt_to_pptx(path, temp_dir)
    if converted is None:
        if fail_reason == "no_libreoffice":
            detail = ("자동 변환에 필요한 LibreOffice가 설치되어 있지 않아 처리할 수 없습니다.")
        else:
            detail = ("LibreOffice로 변환을 시도했지만 실패했습니다(파일이 손상되었거나 "
                       "올바른 PowerPoint 파일이 아닐 수 있습니다).")
        raise ValueError(
            f"'{os.path.basename(path)}' 파일은 구형 PowerPoint(.ppt) 형식입니다. {detail} "
            f"PowerPoint에서 파일을 열어 '다른 이름으로 저장 > PowerPoint 프레젠테이션(.pptx)'으로 "
            f"변환한 뒤 다시 시도해주세요."
        )
    if logs is not None:
        logs.append(f"[안내] .ppt -> .pptx 변환 완료: {converted}")
    return converted, True
