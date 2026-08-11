@echo off
rem ============================================================
rem  내부 스크립트입니다. 직접 실행하지 마세요.
rem  launch_silent.vbs가 창 없이 이 스크립트를 호출합니다.
rem  결과는 .launch_status 파일에 OK / ERROR + 메시지로 기록합니다.
rem ============================================================
chcp 65001 >nul
setlocal EnableDelayedExpansion
cd /d "%~dp0"

set "LOCK=%~dp0.server.lock"
set "STATUS=%~dp0.launch_status"
set "LOG=%~dp0.server.log"
set "LAUNCHLOCK=%~dp0.launching.lock"

call :main
set "MAIN_RC=%errorlevel%"

rem 실행 도중 상태와 무관하게 "실행 중" 표시 락은 항상 정리한다.
del "%LAUNCHLOCK%" >nul 2>nul
exit /b %MAIN_RC%

:main
where node >nul 2>nul
if errorlevel 1 (
    > "%STATUS%" echo ERROR
    >> "%STATUS%" echo Node.js가 설치되어 있지 않습니다.
    >> "%STATUS%" echo https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행해주세요.
    exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
    > "%STATUS%" echo ERROR
    >> "%STATUS%" echo npm을 찾을 수 없습니다. Node.js 설치 상태를 확인해주세요.
    exit /b 1
)

where curl >nul 2>nul
set "HAS_CURL=1"
if errorlevel 1 set "HAS_CURL=0"

rem ---------- 중복 실행 방지: 다른 실행이 막 시작됐다면 잠깐 양보 ----------
if exist "%LAUNCHLOCK%" (
    timeout /t 3 /nobreak >nul
)
type nul > "%LAUNCHLOCK%"

rem ---------- 5173 포트 상태 판별 ----------
rem PORT_STATE: FREE(비어있음) / REUSE(우리 서버가 이미 응답 중) /
rem             KILLED_STALE(우리 프로젝트의 오래된 프로세스, 정리하고 새로 시작) /
rem             BLOCKED_OTHER(전혀 다른 프로그램, 중단)
call :port_guard

if "!PORT_STATE!"=="REUSE" (
    start "" "http://localhost:5173/"
    > "%STATUS%" echo OK
    exit /b 0
)

if "!PORT_STATE!"=="BLOCKED_OTHER" (
    > "%STATUS%" echo ERROR
    >> "%STATUS%" echo 5173 포트를 다른 프로그램이 사용 중입니다.
    >> "%STATUS%" echo 프로세스: !BLOCK_NAME! ^(PID !BLOCK_PID!^)
    >> "%STATUS%" echo Google 로그인이 깨지지 않도록 다른 포트로 자동 전환하지 않으며,
    >> "%STATUS%" echo 팀장 일정과 무관한 프로그램이라 임의로 종료하지도 않습니다.
    >> "%STATUS%" echo 위 프로그램을 직접 종료한 뒤 다시 실행해주세요.
    exit /b 1
)

rem ---------- 패키지 설치(없을 때만) ----------
if not exist "%~dp0node_modules" (
    > "%LOG%" echo [npm install 시작]
    call npm install >> "%LOG%" 2>&1
    if errorlevel 1 (
        > "%STATUS%" echo ERROR
        >> "%STATUS%" echo 패키지 설치^(npm install^) 중 오류가 발생했습니다.
        >> "%STATUS%" echo 자세한 내용: team-schedule-app\.server.log 파일을 확인해주세요.
        exit /b 1
    )
)

rem ---------- 완전히 분리된 숨김 프로세스로 서버 시작 ----------
rem (리다이렉션은 _run_server.bat 파일 안에서 처리하여, 여러 겹의
rem  따옴표 안에 >> / 2^>^&1 같은 기호가 섞여 잘못 해석되는 것을 방지)
del "%LOG%" >nul 2>nul
set "SERVER_PID="
for /f "usebackq delims=" %%I in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$p = Start-Process -FilePath '%~dp0_run_server.bat' -WorkingDirectory '%~dp0' -WindowStyle Hidden -PassThru; Write-Output $p.Id"`) do set "SERVER_PID=%%I"

if not defined SERVER_PID (
    > "%STATUS%" echo ERROR
    >> "%STATUS%" echo 서버 프로세스를 시작하지 못했습니다. ^(PowerShell 실행 확인 필요^)
    exit /b 1
)

> "%LOCK%" echo PORT=5173
>> "%LOCK%" echo PID=%SERVER_PID%

rem ---------- 서버가 준비될 때까지 대기 후 브라우저 자동 실행 ----------
set /a TRIES=0
:wait_loop
if "%HAS_CURL%"=="1" (
    curl --max-time 2 --silent --output NUL --fail "http://localhost:5173/" >nul 2>nul
    if not errorlevel 1 goto ready
) else (
    if !TRIES! GEQ 5 goto ready
)
set /a TRIES+=1
if !TRIES! GEQ 60 goto timeout_err
timeout /t 1 /nobreak >nul
goto wait_loop

:ready
start "" "http://localhost:5173/"
> "%STATUS%" echo OK
exit /b 0

:timeout_err
> "%STATUS%" echo ERROR
>> "%STATUS%" echo 서버가 60초 안에 준비되지 않았습니다.
>> "%STATUS%" echo team-schedule-app\.server.log 파일에서 원인을 확인해주세요.
exit /b 1

rem ============================================================
rem  :port_guard — 5173 포트를 누가 쓰고 있는지 판별해 PORT_STATE로 반환
rem ============================================================
:port_guard
set "PORT_STATE=FREE"
set "BLOCK_PID="
set "BLOCK_NAME="
set "BLOCK_CMDLINE="

for /f "tokens=5" %%A in ('netstat -ano ^| findstr /r /c:":5173 .*LISTENING"') do (
    if not defined BLOCK_PID set "BLOCK_PID=%%A"
)
if not defined BLOCK_PID exit /b 0

rem 1) 이미 우리 서버가 5173에서 정상 응답 중이면 그대로 재사용
if "!HAS_CURL!"=="1" (
    curl --max-time 2 --silent --output NUL --fail "http://localhost:5173/" >nul 2>nul
    if not errorlevel 1 (
        set "PORT_STATE=REUSE"
        exit /b 0
    )
)

rem 2) 응답은 없지만 그 프로세스가 team-schedule-app 프로젝트 소속인지
rem    명령줄(실행 경로)로 확인 -> 맞으면 멈춰버린 우리 서버로 간주하고 정리
for /f "usebackq delims=" %%L in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=!BLOCK_PID!' -ErrorAction SilentlyContinue).CommandLine"`) do set "BLOCK_CMDLINE=%%L"

echo !BLOCK_CMDLINE! | findstr /i /c:"team-schedule-app" >nul
if not errorlevel 1 (
    taskkill /PID !BLOCK_PID! /F >nul 2>nul
    timeout /t 1 /nobreak >nul
    del "%LOCK%" >nul 2>nul
    set "PORT_STATE=KILLED_STALE"
    exit /b 0
)

rem 3) 우리 프로젝트와 무관한 다른 프로그램 -> 이름을 확인해 보고만 하고 중단
for /f "usebackq delims=" %%N in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "(Get-Process -Id !BLOCK_PID! -ErrorAction SilentlyContinue).ProcessName"`) do set "BLOCK_NAME=%%N"
if not defined BLOCK_NAME set "BLOCK_NAME=알 수 없는 프로세스"
set "PORT_STATE=BLOCKED_OTHER"
exit /b 0
