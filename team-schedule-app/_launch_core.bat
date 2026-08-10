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

> "%STATUS%" echo OK

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

rem ---------- 이미 실행 중인 서버가 있으면 그대로 재사용 ----------
set "REUSE=0"
set "OLD_PORT="
if exist "%LOCK%" (
    for /f "usebackq tokens=1,2 delims==" %%K in ("%LOCK%") do (
        if /i "%%K"=="PORT" set "OLD_PORT=%%L"
    )
    if defined OLD_PORT (
        if "!HAS_CURL!"=="1" (
            curl --max-time 2 --silent --output NUL --fail "http://localhost:!OLD_PORT!/" >nul 2>nul
            if not errorlevel 1 set "REUSE=1"
        )
    )
)

if "!REUSE!"=="1" (
    start "" "http://localhost:!OLD_PORT!/"
    > "%STATUS%" echo OK
    exit /b 0
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

rem ---------- 사용 가능한 포트 탐색 ----------
set "APP_PORT="
for %%P in (5173 5174 5175 5176 5177 5178 5179 5180 5181 5182 5183 5184) do (
    if not defined APP_PORT (
        netstat -ano | findstr /r /c:":%%P .*LISTENING" >nul 2>nul
        if errorlevel 1 set "APP_PORT=%%P"
    )
)
if not defined APP_PORT (
    > "%STATUS%" echo ERROR
    >> "%STATUS%" echo 5173~5184 포트가 모두 사용 중입니다.
    >> "%STATUS%" echo 다른 프로그램을 종료한 뒤 다시 시도해주세요.
    exit /b 1
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

> "%LOCK%" echo PORT=%APP_PORT%
>> "%LOCK%" echo PID=%SERVER_PID%

rem ---------- 서버가 준비될 때까지 대기 후 브라우저 자동 실행 ----------
set /a TRIES=0
:wait_loop
if "%HAS_CURL%"=="1" (
    curl --max-time 2 --silent --output NUL --fail "http://localhost:%APP_PORT%/" >nul 2>nul
    if not errorlevel 1 goto ready
) else (
    if !TRIES! GEQ 5 goto ready
)
set /a TRIES+=1
if !TRIES! GEQ 60 goto timeout_err
timeout /t 1 /nobreak >nul
goto wait_loop

:ready
start "" "http://localhost:%APP_PORT%/"
> "%STATUS%" echo OK
exit /b 0

:timeout_err
> "%STATUS%" echo ERROR
>> "%STATUS%" echo 서버가 60초 안에 준비되지 않았습니다.
>> "%STATUS%" echo team-schedule-app\.server.log 파일에서 원인을 확인해주세요.
exit /b 1
