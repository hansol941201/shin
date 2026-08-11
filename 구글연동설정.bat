@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title 팀장 일정 조율 캘린더 - Google 연동 설정
cd /d "%~dp0"

call :main

echo.
echo ============================================
echo   창을 닫으려면 아무 키나 누르세요.
echo ============================================
pause >nul
exit /b

:main
echo ============================================
echo   Google Calendar 연동 설정
echo ============================================
echo.
echo Google Cloud Console에서 발급받은 OAuth 클라이언트 ID를
echo 붙여넣거나 입력한 뒤 Enter를 누르세요.
echo.
echo ^(입력한 값은 team-schedule-app\.env.local 파일에만 저장됩니다.
echo   이 파일은 Git 저장소에 포함되지 않으며, 이 창에도 다시 표시되지
echo   않습니다.^)
echo.

set "TARGET_DIR=%~dp0team-schedule-app"
if not exist "%TARGET_DIR%" (
    echo [실패] team-schedule-app 폴더를 찾을 수 없습니다.
    echo        경로: %TARGET_DIR%
    goto :eof
)

set "ENV_FILE=%TARGET_DIR%\.env.local"

set /p "CLIENT_ID=Google Client ID: "

if "%CLIENT_ID%"=="" (
    echo.
    echo [실패] 입력값이 비어 있어 저장하지 않았습니다.
    goto :eof
)

echo.
echo [1/3] .env.local 파일에 저장하는 중...

set "TMP_ENV=%TEMP%\_env_local_%RANDOM%.tmp"

if exist "%ENV_FILE%" (
    findstr /v /b /i /l /c:"VITE_GOOGLE_CLIENT_ID=" "%ENV_FILE%" > "%TMP_ENV%" 2>nul
) else (
    type nul > "%TMP_ENV%"
)

>> "%TMP_ENV%" echo VITE_GOOGLE_CLIENT_ID=%CLIENT_ID%

move /y "%TMP_ENV%" "%ENV_FILE%" >nul

if not exist "%ENV_FILE%" (
    echo   [실패] .env.local 파일을 저장하지 못했습니다.
    goto :eof
)

findstr /b /i /l /c:"VITE_GOOGLE_CLIENT_ID=" "%ENV_FILE%" >nul
if errorlevel 1 (
    echo   [실패] 저장된 파일에서 값을 확인하지 못했습니다.
    goto :eof
)
echo   - 확인됨: %ENV_FILE%
echo.

echo [2/3] Git에 포함되지 않는 파일인지 확인합니다...
git -C "%~dp0" check-ignore -q "%ENV_FILE%" >nul 2>nul
if errorlevel 1 (
    echo   [주의] git 명령을 사용할 수 없거나 확인에 실패했습니다.
    echo          ^(team-schedule-app\.gitignore에 .env.local이 이미 등록되어
    echo          있으니 정상적으로는 문제가 없습니다^)
) else (
    echo   - 확인됨: 이 파일은 Git에 커밋되지 않습니다.
)
echo.

echo [3/3] 새 설정을 적용하려면 서버를 재시작해야 합니다...
call :restart_server_if_running
echo.

echo ============================================
echo   설정 완료
echo ============================================
echo   이제 바탕화면의 "팀장 일정" 아이콘을 실행하세요.
echo   ^(이미 실행 중이었다면 방금 자동으로 종료했으니 다시 실행하면 됩니다^)
echo   헤더에 "Google 캘린더 연결" 버튼이 나타납니다.
echo ============================================
goto :eof

rem 개발 서버(Vite)는 .env.local 변경을 자동으로 다시 읽지 않으므로,
rem 실행 중인 서버가 있으면 종료.bat과 동일한 방식으로 종료해 다음 실행
rem 시 새 설정이 적용되게 한다.
:restart_server_if_running
set "FOUND=0"
if exist "%TARGET_DIR%\.server.lock" (
    for /f "usebackq tokens=1,2 delims==" %%K in ("%TARGET_DIR%\.server.lock") do (
        if /i "%%K"=="PORT" call :kill_port %%L
    )
)
if exist "%TARGET_DIR%\.last_port" (
    set /p LAST_PORT=<"%TARGET_DIR%\.last_port"
    if defined LAST_PORT call :kill_port !LAST_PORT!
)
for %%P in (5173 5174 5175 5176 5177 5178 5179 5180 5181 5182 5183 5184) do (
    call :kill_port %%P
)
del "%TARGET_DIR%\.server.lock" >nul 2>nul
del "%TARGET_DIR%\.last_port" >nul 2>nul
if "!FOUND!"=="1" (
    echo   - 실행 중이던 서버를 종료했습니다.
) else (
    echo   - 실행 중인 서버는 없었습니다^(그대로 실행하면 됩니다^).
)
exit /b 0

:kill_port
set "P=%~1"
if "%P%"=="" exit /b 0
for /f "tokens=5" %%A in ('netstat -ano ^| findstr /r /c:":%P% .*LISTENING"') do (
    taskkill /PID %%A /F >nul 2>nul
    set "FOUND=1"
)
exit /b 0
