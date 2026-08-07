# -*- coding: utf-8 -*-
"""
실행 위치 기준 경로 유틸.
시스템 전역 TEMP(예: 사용자 PC에서 ESTsoft\\CreatorTemp 등 예상 밖의 위치로 지정된
경우)에 의존하지 않고, 프로그램 자체의 temp/ 폴더를 사용해 작업 파일을 예측 가능한
위치에 둔다.
"""
import os
import sys
import uuid


def base_dir() -> str:
    """EXE로 패키징된 경우와 스크립트로 실행된 경우 모두에서 프로그램 루트 위치를 반환한다."""
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    # app/utils/paths.py -> app/utils -> app -> 프로젝트 루트
    return os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def make_session_temp_dir(prefix: str = "auto_material_") -> str:
    """시스템 TEMP가 아니라 프로그램 자체 temp/ 폴더 아래에 세션별 작업 폴더를 만든다."""
    root = os.path.join(base_dir(), "temp")
    os.makedirs(root, exist_ok=True)
    session_dir = os.path.join(root, f"{prefix}{uuid.uuid4().hex[:10]}")
    os.makedirs(session_dir, exist_ok=True)
    return session_dir
