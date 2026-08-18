# -*- coding: utf-8 -*-
"""
실행 위치 기준 경로 유틸.

[중요 - 실제 장애 원인]
이전 버전은 프로그램 자체 temp/ 폴더를 "EXE가 실행되고 있는 위치(sys.executable의
디렉터리)" 기준으로 만들었다. 그런데 Windows에서 백신(예: 이스트소프트 알약)이나
압축 프로그램이 새로 받은 EXE를 실행할 때 원본 위치가 아니라 자체 스캔/캐시 폴더
(예: C:\\Users\\Public\\Documents\\ESTsoft\\CreatorTemp)로 복사한 뒤 그 복사본을
실행하는 경우가 있다. 이 경우 sys.executable 자체가 이미 ESTsoft\\CreatorTemp
아래를 가리키므로, "EXE 위치 기준 temp/" 전략은 그대로 ESTsoft 임시폴더를 다시
가리키게 되어 이전 수정이 무력화됐다.

그래서 이제는 EXE가 물리적으로 어디서 실행되든 상관없이 항상 동일한, OS 표준
사용자 데이터 폴더를 작업 폴더로 사용한다(Windows: %LOCALAPPDATA%).
"""
import os
import sys
import uuid

APP_DIR_NAME = "AutoMaterialCollector"


def base_dir() -> str:
    """EXE로 패키징된 경우와 스크립트로 실행된 경우 모두에서 프로그램 루트 위치를 반환한다.
    주의: 이 값은 로그 등 "EXE 옆에 두면 사용자가 찾기 편한" 용도로만 사용하고,
    입력 파일 작업 복사본처럼 안정성이 중요한 경로에는 stable_app_data_dir()을 사용한다."""
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def stable_app_data_dir() -> str:
    """실행 파일이 어디서 구동되든(백신 샌드박스/압축프로그램 임시폴더 포함) 항상
    동일하게 찾을 수 있는, OS 표준 사용자 데이터 폴더를 반환한다."""
    if sys.platform.startswith("win"):
        root = os.environ.get("LOCALAPPDATA") or os.environ.get("APPDATA") or os.path.expanduser("~")
    elif sys.platform == "darwin":
        root = os.path.join(os.path.expanduser("~"), "Library", "Application Support")
    else:
        root = os.environ.get("XDG_DATA_HOME") or os.path.join(os.path.expanduser("~"), ".local", "share")
    path = os.path.join(root, APP_DIR_NAME)
    os.makedirs(path, exist_ok=True)
    return path


def work_root() -> str:
    """입력 파일 작업 복사본을 두는 최상위 폴더. 스크립트/개발 모드에서는 저장소
    안의 temp/ 폴더(테스트 예측 가능성을 위해), EXE로 패키징된 경우에는 항상
    stable_app_data_dir()/work 를 사용한다(실행 위치와 무관하게 안정적)."""
    if getattr(sys, "frozen", False):
        root = os.path.join(stable_app_data_dir(), "work")
    else:
        root = os.path.join(base_dir(), "temp")
    os.makedirs(root, exist_ok=True)
    return root


def make_session_temp_dir(prefix: str = "auto_material_") -> str:
    """세션(1회 실행)별 작업 폴더를 만든다. 시스템 전역 TEMP나 EXE의 실행 위치에
    의존하지 않는다."""
    root = work_root()
    session_dir = os.path.join(root, f"{prefix}{uuid.uuid4().hex[:10]}")
    os.makedirs(session_dir, exist_ok=True)
    return session_dir


def logs_dir() -> str:
    """오류 로그 등을 남길 폴더. EXE 실행 위치가 불안정할 수 있으므로 stable_app_data_dir
    을 우선 사용하되, 개발/스크립트 모드에서는 저장소 안의 logs/ 폴더를 사용한다."""
    if getattr(sys, "frozen", False):
        path = os.path.join(stable_app_data_dir(), "logs")
    else:
        path = os.path.join(base_dir(), "logs")
    os.makedirs(path, exist_ok=True)
    return path


def knowledge_library_dir() -> str:
    """[v3 엔진] 회사 지식자료(Knowledge Library) 최상위 폴더.
    EXE 업데이트(새 버전 ZIP 재설치)에도 회사가 등록한 자료가 사라지지 않도록,
    항상 stable_app_data_dir() 아래에 둔다(개발/스크립트 모드에서는 저장소 안의
    knowledge_library/ 폴더를 사용해 테스트 픽스처와 함께 관리하기 쉽게 한다)."""
    if getattr(sys, "frozen", False):
        path = os.path.join(stable_app_data_dir(), "knowledge_library")
    else:
        path = os.path.join(base_dir(), "knowledge_library")
    os.makedirs(path, exist_ok=True)
    return path


def default_output_dir() -> str:
    """GUI 기본 출력 폴더. os.getcwd()는 EXE가 어디서 실행됐는지에 따라 예상 밖의
    위치(백신 샌드박스 등)일 수 있으므로 사용하지 않는다. 항상 사용자 문서 폴더
    아래 Documents\\자동화자료취합\\Output 에 고정한다(출력 폴더 입력란이 비어있을
    때 자동으로 이 경로를 만들어 사용)."""
    docs = os.path.join(os.path.expanduser("~"), "Documents")
    base = docs if os.path.isdir(docs) else os.path.expanduser("~")
    path = os.path.join(base, "자동화자료취합", "Output")
    return path
