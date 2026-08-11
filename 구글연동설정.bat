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
echo ^(예: 123456789012-abcABC123xyz.apps.googleusercontent.com^)
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

if "!CLIENT_ID!"=="" (
    echo.
    echo [실패] 입력값이 비어 있어 저장하지 않았습니다.
    goto :eof
)

rem ---- 앞뒤 공백 제거(복사/붙여넣기 과정에서 흔히 섞여 들어옴) ----
:trim_leading
if "!CLIENT_ID:~0,1!"==" " (
    set "CLIENT_ID=!CLIENT_ID:~1!"
    goto trim_leading
)
:trim_trailing
if "!CLIENT_ID:~-1!"==" " (
    set "CLIENT_ID=!CLIENT_ID:~0,-1!"
    goto trim_trailing
)

rem ---- 형식 검증: 반드시 .apps.googleusercontent.com 으로 끝나야 함 ----
rem (이메일 주소, client secret, 앞뒤 따옴표가 섞인 값 등은 여기서 걸러진다)
set "CID_LEN=0"
set "CID_SUFFIX=!CLIENT_ID:~-27!"
call :strlen CLIENT_ID CID_LEN

set "VALID=0"
if /i "!CID_SUFFIX!"==".apps.googleusercontent.com" if !CID_LEN! GTR 35 set "VALID=1"

if "!VALID!"=="0" (
    echo.
    echo ============================================
    echo   [실패] Client ID 형식이 올바르지 않습니다
    echo ============================================
    echo   ".apps.googleusercontent.com" 으로 끝나는 값이어야 합니다.
    echo   ^(Google Cloud Console의 사용자 인증 정보 화면에 표시된 값을
    echo     앞뒤 공백/따옴표 없이 그대로 복사했는지 확인해주세요^)
    echo   저장하지 않았습니다. 이 창을 닫고 다시 실행해주세요.
    goto :eof
)

echo.
echo [1/4] 형식 확인됨 ^(마지막 부분: ...!CLIENT_ID:~-14!^)
echo.

echo [2/4] .env.local 파일에 저장하는 중...

set "TMP_ENV=%TEMP%\_env_local_%RANDOM%.tmp"

if exist "%ENV_FILE%" (
    findstr /v /b /i /l /c:"VITE_GOOGLE_CLIENT_ID=" "%ENV_FILE%" > "%TMP_ENV%" 2>nul
) else (
    type nul > "%TMP_ENV%"
)

>> "%TMP_ENV%" echo VITE_GOOGLE_CLIENT_ID=!CLIENT_ID!

move /y "%TMP_ENV%" "%ENV_FILE%" >nul

if not exist "%ENV_FILE%" (
    echo   [실패] .env.local 파일을 저장하지 못했습니다.
    goto :eof
)

rem ---- 실제로 디스크에 저장된 내용을 다시 읽어 검증(쓰기 중 손상 방지) ----
set "SAVED_LINE="
for /f "usebackq tokens=1,* delims==" %%K in ("%ENV_FILE%") do (
    if /i "%%K"=="VITE_GOOGLE_CLIENT_ID" set "SAVED_LINE=%%L"
)
if "!SAVED_LINE!"=="!CLIENT_ID!" (
    echo   - 확인됨: 저장된 값이 입력값과 일치합니다.
) else (
    echo   [주의] 저장된 값이 입력값과 다르게 보입니다. 파일을 직접 확인해주세요.
    echo          파일: %ENV_FILE%
)
echo   위치: %ENV_FILE%
echo.

echo [3/4] 잘못된 위치에 생성된 파일이 있는지 확인합니다...
if exist "%~dp0team-schedule-app.env.local" (
    del "%~dp0team-schedule-app.env.local" >nul 2>nul
    echo   - 잘못된 파일을 삭제했습니다^(루트^): team-schedule-app.env.local
)
set "DESKTOP_DIR="
for /f "usebackq delims=" %%D in (`powershell -NoProfile -Command "(New-Object -ComObject WScript.Shell).SpecialFolders('Desktop')"`) do set "DESKTOP_DIR=%%D"
if defined DESKTOP_DIR (
    if exist "!DESKTOP_DIR!\team-schedule-app.env.local" (
        del "!DESKTOP_DIR!\team-schedule-app.env.local" >nul 2>nul
        echo   - 잘못된 파일을 삭제했습니다^(바탕화면^): team-schedule-app.env.local
    )
    if exist "!DESKTOP_DIR!\.env.local" (
        del "!DESKTOP_DIR!\.env.local" >nul 2>nul
        echo   - 잘못된 파일을 삭제했습니다^(바탕화면^): .env.local
    )
)
echo   - 확인 완료
echo.

echo [4/4] 새 설정을 적용하려면 서버를 재시작해야 합니다...
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

rem 문자열 길이 계산: call :strlen <변수이름> <결과를_담을_변수이름>
:strlen
setlocal EnableDelayedExpansion
set "S=!%~1!"
set "LEN=0"
:strlen_loop
if defined S (
    set "S=!S:~1!"
    set /a "LEN+=1"
    goto strlen_loop
)
endlocal & set "%~2=%LEN%"
exit /b 0

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
