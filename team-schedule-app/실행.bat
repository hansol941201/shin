@echo off
chcp 65001 >nul
title 팀장 일정 조율 캘린더
cd /d "%~dp0"

echo ============================================
echo   팀장 일정 조율 캘린더 실행 준비 중...
echo   (이 창을 닫으면 서버도 함께 종료됩니다)
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [오류] Node.js를 찾을 수 없습니다.
    echo         https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행해주세요.
    echo.
    pause
    exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
    echo [오류] npm을 찾을 수 없습니다. Node.js 설치 상태를 확인해주세요.
    echo.
    pause
    exit /b 1
)

if not exist "%~dp0node_modules" (
    echo [설치] node_modules 폴더가 없어 패키지를 설치합니다. 잠시만 기다려주세요...
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo [오류] npm install 중 오류가 발생했습니다. 위 메시지를 확인해주세요.
        echo.
        pause
        exit /b 1
    )
    echo.
    echo [완료] 패키지 설치가 끝났습니다.
) else (
    echo [확인] node_modules가 이미 있어 설치를 건너뜁니다.
)

echo.
echo [포트 확인] 5173 포트를 확인하는 중...
rem Google OAuth 승인된 자바스크립트 원본이 포트까지 등록되어 있으므로,
rem 항상 5173으로 고정한다(다른 포트로 자동 전환하지 않음).
set "APP_PORT=5173"

where curl >nul 2>nul
set "HAS_CURL=1"
if errorlevel 1 set "HAS_CURL=0"

set "BLOCK_PID="
for /f "tokens=5" %%A in ('netstat -ano ^| findstr /r /c:":%APP_PORT% .*LISTENING"') do (
    if not defined BLOCK_PID set "BLOCK_PID=%%A"
)

if not defined BLOCK_PID goto port_is_free

rem 1) 이미 우리 서버가 5173에서 정상 응답 중이면 그대로 재사용
if "%HAS_CURL%"=="1" (
    curl --max-time 2 --silent --output NUL --fail "http://localhost:%APP_PORT%/" >nul 2>nul
    if not errorlevel 1 (
        echo [확인] 이미 5173에서 팀장 일정 서버가 실행 중입니다. 새로 켜지 않고 그 주소를 엽니다.
        echo %APP_PORT%> "%~dp0.last_port"
        start "" "http://localhost:%APP_PORT%/"
        echo.
        pause
        exit /b 0
    )
)

rem 2) 응답은 없지만 team-schedule-app 프로젝트 소속 프로세스라면 멈춰버린
rem    우리 서버로 보고 정리한 뒤 이어서 새로 시작한다.
set "BLOCK_CMDLINE="
for /f "usebackq delims=" %%L in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=%BLOCK_PID%' -ErrorAction SilentlyContinue).CommandLine"`) do set "BLOCK_CMDLINE=%%L"

echo %BLOCK_CMDLINE% | findstr /i /c:"team-schedule-app" >nul
if not errorlevel 1 (
    echo [정리] 응답 없는 이전 팀장 일정 서버^(PID %BLOCK_PID%^)를 종료하고 새로 시작합니다.
    taskkill /PID %BLOCK_PID% /F >nul 2>nul
    del "%~dp0.server.lock" >nul 2>nul
    timeout /t 1 /nobreak >nul
    goto port_is_free
)

rem 3) 우리 프로젝트와 무관한 다른 프로그램 -> 중단, 이름/PID 안내
set "BLOCK_NAME="
for /f "usebackq delims=" %%N in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "(Get-Process -Id %BLOCK_PID% -ErrorAction SilentlyContinue).ProcessName"`) do set "BLOCK_NAME=%%N"
if not defined BLOCK_NAME set "BLOCK_NAME=알 수 없는 프로세스"

echo [오류] 5173 포트를 다른 프로그램이 사용 중입니다.
echo         프로세스: %BLOCK_NAME% ^(PID %BLOCK_PID%^)
echo         Google 로그인이 깨지지 않도록 다른 포트로 자동 전환하지 않으며,
echo         팀장 일정과 무관한 프로그램이라 임의로 종료하지도 않습니다.
echo         위 프로그램을 직접 종료한 뒤 다시 실행해주세요.
echo.
pause
exit /b 1

:port_is_free
echo [포트] %APP_PORT% 번 포트를 사용합니다.
echo %APP_PORT%> "%~dp0.last_port"

start "팀장 일정 조율 캘린더 - 브라우저 대기" /min "%~dp0_wait_and_open.bat" %APP_PORT%

echo.
echo [실행] 개발 서버를 시작합니다. 잠시 후 브라우저가 자동으로 열립니다.
echo         주소: http://localhost:%APP_PORT%/
echo         종료하려면 이 창을 닫거나 종료.bat 을 실행하세요.
echo.

call npm run dev -- --port %APP_PORT% --strictPort
set "DEV_EXIT=%errorlevel%"

echo.
if not "%DEV_EXIT%"=="0" (
    echo [오류] 개발 서버 실행 중 오류가 발생했습니다. ^(종료 코드: %DEV_EXIT%^)
    echo         위쪽의 오류 메시지를 확인해주세요.
) else (
    echo 서버가 종료되었습니다.
)
echo.
pause
