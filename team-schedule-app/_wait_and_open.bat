@echo off
rem 내부 보조 스크립트입니다. 직접 실행하지 말고 실행.bat을 사용하세요.
rem 서버(production build + vite preview)가 준비될 때까지 기다렸다가
rem 주소창/탭바 없는 앱 창(Edge --app 모드)으로 자동 접속합니다.
setlocal
set "PORT=%~1"
if "%PORT%"=="" exit /b 1
set "URL=http://localhost:%PORT%/"

where curl >nul 2>nul
if errorlevel 1 (
    rem curl이 없는 경우: 빌드+서버가 뜰 시간을 넉넉히 준 뒤 그냥 열기 시도(최선 노력 방식)
    timeout /t 8 /nobreak >nul
    call :open_app_window
    endlocal
    exit /b 0
)

set /a TRIES=0
:wait_loop
curl --max-time 2 --silent --output NUL --fail "%URL%" >nul 2>nul
if not errorlevel 1 goto ready
set /a TRIES+=1
rem production build 시간까지 포함해야 하므로 넉넉하게 90초까지 기다린다.
if %TRIES% GEQ 90 goto give_up
timeout /t 1 /nobreak >nul
goto wait_loop

:ready
call :open_app_window
endlocal
exit /b 0

:give_up
rem 90초 넘게 응답이 없어도 혹시 몰라 마지막으로 한 번 열어본다
call :open_app_window
endlocal
exit /b 0

:open_app_window
set "EDGE_EXE="
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "EDGE_EXE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined EDGE_EXE if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "EDGE_EXE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not defined EDGE_EXE if exist "%LocalAppData%\Microsoft\Edge\Application\msedge.exe" set "EDGE_EXE=%LocalAppData%\Microsoft\Edge\Application\msedge.exe"
if defined EDGE_EXE (
    start "" "%EDGE_EXE%" --app=%URL% --window-size=1360,860
    exit /b 0
)
where msedge >nul 2>nul
if not errorlevel 1 (
    start "" msedge --app=%URL% --window-size=1360,860
    exit /b 0
)
where chrome >nul 2>nul
if not errorlevel 1 (
    start "" chrome --app=%URL% --window-size=1360,860
    exit /b 0
)
start "" "%URL%"
exit /b 0
