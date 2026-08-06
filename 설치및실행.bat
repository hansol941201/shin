@echo off
chcp 65001 > nul
title 입주민 설명자료 자동 제작 - 설치 및 실행
cd /d "%~dp0"

echo ============================================
echo  입주민 설명자료 자동 제작 프로그램
echo  최초 실행 시 자동으로 필요한 구성요소를 설치합니다.
echo  (인터넷 연결이 필요하며, 몇 분 정도 걸릴 수 있습니다)
echo ============================================
echo.

where python >nul 2>nul
if errorlevel 1 (
    echo [오류] Python이 설치되어 있지 않거나 PATH에 등록되어 있지 않습니다.
    echo https://www.python.org/downloads/ 에서 Python 3.10 이상을 설치한 뒤
    echo 설치 화면에서 "Add python.exe to PATH"를 반드시 체크해주세요.
    echo.
    pause
    exit /b 1
)

if not exist ".venv" (
    echo [1/3] 가상환경 생성 중...
    python -m venv .venv
)

echo [2/3] 필요한 라이브러리 설치 확인 중... (최초 1회, 시간이 걸릴 수 있습니다)
call .venv\Scripts\activate.bat
python -m pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt

echo [3/3] 프로그램 실행 중...
echo.
python run_app.py

pause
