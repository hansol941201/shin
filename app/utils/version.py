# -*- coding: utf-8 -*-
"""
빌드 버전(커밋 해시) 조회.
패키징된 EXE 안에는 .git 폴더가 없어 런타임에 git 명령으로 커밋을 알아낼 수 없다.
그래서 CI가 EXE를 빌드하기 직전에 이 파일 옆에 `_build_version.py`를 생성해 커밋
해시를 정적으로 박아 넣는다(app/_build_version.py, .gitignore 대상 - 저장소에는
커밋되지 않고 빌드 시점에만 생성됨). 그런 파일이 없으면(개발/스크립트 실행) git
명령으로 조회하고, 그마저 실패하면 "알수없음"으로 표시한다.
"""
import os
import subprocess


def get_build_commit() -> str:
    try:
        from app import _build_version  # type: ignore
        if getattr(_build_version, "COMMIT", None):
            return _build_version.COMMIT
    except Exception:
        pass

    try:
        repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        out = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=repo_root,
                               capture_output=True, text=True, timeout=5)
        if out.returncode == 0 and out.stdout.strip():
            return out.stdout.strip()
    except Exception:
        pass
    return "알수없음"
