# -*- coding: utf-8 -*-
"""EXE/데스크톱 실행 진입점. PyInstaller가 이 파일을 빌드 대상으로 사용한다."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.ui.gui import main

if __name__ == "__main__":
    main()
