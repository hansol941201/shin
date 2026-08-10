@echo off
rem 내부 보조 스크립트입니다. 직접 실행하지 말고 실행.bat을 사용하세요.
rem 개발 서버가 준비될 때까지 기다렸다가 기본 브라우저로 자동 접속합니다.
setlocal
set "PORT=%~1"
if "%PORT%"=="" exit /b 1
set "URL=http://localhost:%PORT%/"

where curl >nul 2>nul
if errorlevel 1 (
    rem curl이 없는 경우: 서버가 뜰 시간을 넉넉히 준 뒤 그냥 열기 시도(최선 노력 방식)
    timeout /t 4 /nobreak >nul
    start "" "%URL%"
    endlocal
    exit /b 0
)

set /a TRIES=0
:wait_loop
curl --max-time 2 --silent --output NUL --fail "%URL%" >nul 2>nul
if not errorlevel 1 goto ready
set /a TRIES+=1
if %TRIES% GEQ 60 goto give_up
timeout /t 1 /nobreak >nul
goto wait_loop

:ready
start "" "%URL%"
endlocal
exit /b 0

:give_up
rem 60초 넘게 응답이 없어도 혹시 몰라 마지막으로 한 번 열어본다
start "" "%URL%"
endlocal
exit /b 0
