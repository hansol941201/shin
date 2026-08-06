@echo off
setlocal enabledelayedexpansion
chcp 65001 > nul
title 자동화 자료취합
cd /d "%~dp0"

if not exist "logs" mkdir "logs"
REM 로케일에 상관없이 안정적인 타임스탬프를 얻기 위해 PowerShell 사용
for /f "usebackq delims=" %%t in (`powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"`) do set TIMESTAMP=%%t
if "%TIMESTAMP%"=="" set TIMESTAMP=run
set RUNLOG=logs\실행로그_%TIMESTAMP%.txt

echo ============================================
echo  자동화 자료취합 - 실행 스크립트
echo ============================================
echo(
echo [기록 파일] %RUNLOG%
echo.>> "%RUNLOG%"
echo ===== %date% %time% 실행 시작 ===== >> "%RUNLOG%"

REM ---------------------------------------------------------------
REM 1) Python 설치 확인
REM ---------------------------------------------------------------
where python >nul 2>>"%RUNLOG%"
if errorlevel 1 (
    echo [오류] Python이 설치되어 있지 않거나 PATH에 등록되어 있지 않습니다.
    echo [오류] Python이 설치되어 있지 않거나 PATH에 등록되어 있지 않습니다. >> "%RUNLOG%"
    echo.
    echo https://www.python.org/downloads/ 에서 Python 3.10 이상을 설치한 뒤
    echo 설치 화면에서 "Add python.exe to PATH"를 반드시 체크해주세요.
    echo.
    echo 이 창을 닫지 말고, 위 안내에 따라 설치 후 run.bat 을 다시 실행해주세요.
    echo.
    pause
    exit /b 1
)

python --version >> "%RUNLOG%" 2>&1
echo [확인] Python 설치 확인됨:
python --version

REM ---------------------------------------------------------------
REM 2) 가상환경 준비
REM ---------------------------------------------------------------
if not exist ".venv" (
    echo [1/4] 가상환경(.venv) 생성 중...
    echo [1/4] 가상환경(.venv) 생성 중... >> "%RUNLOG%"
    python -m venv .venv >> "%RUNLOG%" 2>&1
    if errorlevel 1 (
        echo [오류] 가상환경 생성에 실패했습니다. logs 폴더의 로그 파일을 확인해주세요.
        echo [오류] 가상환경 생성 실패 >> "%RUNLOG%"
        pause
        exit /b 1
    )
) else (
    echo [1/4] 기존 가상환경(.venv) 사용
    echo [1/4] 기존 가상환경(.venv) 사용 >> "%RUNLOG%"
)

call ".venv\Scripts\activate.bat" >> "%RUNLOG%" 2>&1
if errorlevel 1 (
    echo [오류] 가상환경 활성화에 실패했습니다. logs 폴더의 로그 파일을 확인해주세요.
    echo [오류] 가상환경 활성화 실패 >> "%RUNLOG%"
    pause
    exit /b 1
)

REM ---------------------------------------------------------------
REM 3) 필요한 패키지 자동 설치 (이미 설치된 경우 빠르게 통과)
REM ---------------------------------------------------------------
echo [2/4] 필요한 라이브러리 확인/설치 중... (최초 실행 시 몇 분 걸릴 수 있습니다)
echo [2/4] 필요한 라이브러리 확인/설치 중... >> "%RUNLOG%"
python -m pip install --upgrade pip >> "%RUNLOG%" 2>&1
python -m pip install -r requirements.txt >> "%RUNLOG%" 2>&1
if errorlevel 1 (
    echo [오류] 라이브러리 설치 중 오류가 발생했습니다.
    echo [오류] 라이브러리 설치 실패 - 자세한 내용: %RUNLOG% >> "%RUNLOG%"
    echo 자세한 내용은 다음 파일을 확인해주세요: %RUNLOG%
    echo.
    echo 인터넷 연결 상태를 확인하시거나, 사내망이라면 방화벽/프록시 설정을 확인해주세요.
    pause
    exit /b 1
)
echo [3/4] 라이브러리 준비 완료
echo [3/4] 라이브러리 준비 완료 >> "%RUNLOG%"

REM ---------------------------------------------------------------
REM 4) 프로그램 실행
REM ---------------------------------------------------------------
echo [4/4] 프로그램을 실행합니다...
echo [4/4] 프로그램 실행 시작 >> "%RUNLOG%"
echo(
python run_app.py
set APP_EXIT=%errorlevel%
echo 프로그램 종료 코드: %APP_EXIT% >> "%RUNLOG%"

if not "%APP_EXIT%"=="0" (
    echo(
    echo [오류] 프로그램이 오류와 함께 종료되었습니다. ^(종료 코드: %APP_EXIT%^)
    echo 자세한 오류 내용은 logs 폴더 안의 오류로그 파일을 확인해주세요.
    echo   - 실행 기록: %RUNLOG%
    echo   - 프로그램 오류 상세: logs\오류로그_*.txt ^(가장 최근 파일^)
    echo(
    pause
    exit /b %APP_EXIT%
)

echo(
echo 프로그램이 정상적으로 종료되었습니다.
pause
exit /b 0
