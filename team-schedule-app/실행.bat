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

rem netstat의 상태 표시("LISTENING")는 한글 Windows 등 일부 로캘에서 번역되어
rem 나올 수 있어 findstr로는 못 잡을 수 있다. Get-NetTCPConnection은 로캘과
rem 무관하게 항상 영문 상수(Listen)로 비교하므로 이걸 우선 사용하고,
rem PowerShell을 못 쓰는 예외적인 경우에만 netstat으로 대체한다.
set "BLOCK_PID="
for /f "usebackq delims=" %%A in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "(Get-NetTCPConnection -LocalPort %APP_PORT% -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess)" 2^>nul`) do set "BLOCK_PID=%%A"
if not defined BLOCK_PID (
    for /f "tokens=5" %%A in ('netstat -ano ^| findstr /r /c:":%APP_PORT% .*LISTENING"') do (
        if not defined BLOCK_PID set "BLOCK_PID=%%A"
    )
)

if not defined BLOCK_PID goto port_is_free

rem 주의: "응답이 온다 = 우리 서버니까 재사용해도 된다"고 판단하면 안 된다.
rem 같은 team-schedule-app을 다른 폴더(예: 이전에 압축을 푼 구버전)에서 실행해둔
rem 서버가 5173을 잡고 있을 수도 있는데, 그 서버는 최신 코드가 아니므로 그대로
rem 재사용하면 안 되고 종료 후 지금 이 폴더의 코드로 새로 띄워야 한다.
rem 그래서 응답 여부보다 "이 폴더(%~dp0)에서 실행된 프로세스인가"를 먼저 확인한다.
set "BLOCK_CMDLINE="
for /f "usebackq delims=" %%L in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=%BLOCK_PID%' -ErrorAction SilentlyContinue).CommandLine"`) do set "BLOCK_CMDLINE=%%L"

set "SAME_FOLDER=0"
echo %BLOCK_CMDLINE% | findstr /i /c:"%~dp0" >nul
if not errorlevel 1 set "SAME_FOLDER=1"

rem 1) 지금 이 폴더에서 실행된 프로세스이면서 실제로 정상 응답 중이면
rem    -> 최신 코드 그대로이므로 재시작 없이 재사용
if "%SAME_FOLDER%"=="1" (
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
    echo [정리] 응답 없는 이전 팀장 일정 서버^(PID %BLOCK_PID%^)를 종료하고 새로 시작합니다.
    taskkill /PID %BLOCK_PID% /F >nul 2>nul
    del "%~dp0.server.lock" >nul 2>nul
    timeout /t 1 /nobreak >nul
    goto port_is_free
)

rem 2) 다른 폴더에 있는 team-schedule-app(예: 이전 버전 압축 해제본)이면
rem    응답 여부와 무관하게 종료 후 지금 폴더의 최신 코드로 새로 시작한다.
echo %BLOCK_CMDLINE% | findstr /i /c:"team-schedule-app" >nul
if not errorlevel 1 (
    echo [정리] 다른 폴더의 팀장 일정 서버^(PID %BLOCK_PID%^)가 5173을 사용 중이라 종료하고 이 폴더의 최신 버전으로 새로 시작합니다.
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
