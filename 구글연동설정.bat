@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title 팀장 일정 조율 캘린더 - Google 연동 설정
set "SELF_DIR=%~dp0"
cd /d "%SELF_DIR%"

call :main
set "MAIN_RC=%errorlevel%"

echo.
echo ============================================
echo   창을 닫으려면 아무 키나 누르세요.
echo ============================================
pause >nul
exit /b %MAIN_RC%

rem ============================================================
rem  이 스크립트는 딱 한 파일만 다룬다:
rem    %SELF_DIR%team-schedule-app\.env.local
rem  이 bat 파일이 있는 폴더 바로 아래의 team-schedule-app으로 경로를
rem  고정한다(다른 위치를 찾아 헤매지 않음). 저장 후에는 5173 포트를 정리하고
rem  "이 창에서 바로" npm run dev를 실행해, Vite가 실제로 어느 폴더에서
rem  뜨는지 로그로 직접 보이게 한다(숨김 프로세스로 뒤에서 띄우지 않음).
rem ============================================================
:main
set "TARGET_DIR=%SELF_DIR%team-schedule-app"
set "ENV_FILE=%TARGET_DIR%\.env.local"

echo ============================================
echo   Google Calendar 연동 설정
echo ============================================
echo.
echo 대상 프로젝트 폴더: %TARGET_DIR%
echo 저장될 파일:        %ENV_FILE%
echo.

if not exist "%TARGET_DIR%\package.json" (
    echo [실패] %TARGET_DIR%\package.json 을 찾을 수 없습니다.
    echo        이 bat 파일이 team-schedule-app 폴더와 같은 위치에 있는지
    echo        확인해주세요. ^(현재 위치: %SELF_DIR%^)
    exit /b 1
)

echo Google Cloud Console에서 발급받은 OAuth 클라이언트 ID를
echo 붙여넣거나 입력한 뒤 Enter를 누르세요.
echo ^(예: 123456789012-abcABC123xyz.apps.googleusercontent.com^)
echo.

set /p "CLIENT_ID=Google Client ID: "
if "!CLIENT_ID!"=="" (
    echo.
    echo [실패] 입력값이 비어 있어 저장하지 않았습니다.
    exit /b 1
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
set "CID_SUFFIX=!CLIENT_ID:~-27!"
call :strlen CLIENT_ID CID_LEN
set "VALID=0"
if /i "!CID_SUFFIX!"==".apps.googleusercontent.com" if !CID_LEN! GTR 35 set "VALID=1"

if "!VALID!"=="0" (
    echo.
    echo [실패] Client ID 형식이 올바르지 않습니다.
    echo        ".apps.googleusercontent.com"으로 끝나는 값이어야 합니다.
    exit /b 1
)
echo.

rem Windows 확장자 숨김 실수로 .env.local.txt가 만들어져 있으면 정리한다
rem (그대로 두면 두 파일이 남아 어느 쪽이 진짜인지 헷갈릴 수 있음).
if exist "%TARGET_DIR%\.env.local.txt" (
    del "%TARGET_DIR%\.env.local.txt" >nul 2>nul
    echo [정리] %TARGET_DIR%\.env.local.txt 삭제됨^(확장자 숨김 실수로 보임^)
)

set "TMP_ENV=%TEMP%\_env_local_%RANDOM%.tmp"
if exist "%ENV_FILE%" (
    findstr /v /b /i /l /c:"VITE_GOOGLE_CLIENT_ID=" "%ENV_FILE%" > "%TMP_ENV%" 2>nul
) else (
    type nul > "%TMP_ENV%"
)
>> "%TMP_ENV%" echo VITE_GOOGLE_CLIENT_ID=!CLIENT_ID!
move /y "%TMP_ENV%" "%ENV_FILE%" >nul

rem ---- 검증 1: 파일이 정말 그 경로에 존재하는가 ----
if not exist "%ENV_FILE%" (
    echo [실패] .env.local 파일을 저장하지 못했습니다: %ENV_FILE%
    exit /b 1
)
echo [확인] .env.local 생성 성공

rem ---- 검증 2: VITE_GOOGLE_CLIENT_ID= 키가 실제로 존재하고 값이 일치하는가 ----
set "SAVED_LINE="
for /f "usebackq tokens=1,* delims==" %%K in ("%ENV_FILE%") do (
    if /i "%%K"=="VITE_GOOGLE_CLIENT_ID" set "SAVED_LINE=%%L"
)
if not defined SAVED_LINE (
    echo [실패] .env.local에서 VITE_GOOGLE_CLIENT_ID 값을 다시 읽지 못했습니다.
    exit /b 1
)
if not "!SAVED_LINE!"=="!CLIENT_ID!" (
    echo [실패] 저장된 값이 입력값과 다릅니다. 파일을 직접 확인해주세요: %ENV_FILE%
    exit /b 1
)
echo [확인] VITE_GOOGLE_CLIENT_ID 저장 성공

rem ---- 검증 3: .apps.googleusercontent.com으로 끝나는가 ----
set "SAVED_SUFFIX=!SAVED_LINE:~-27!"
if /i not "!SAVED_SUFFIX!"==".apps.googleusercontent.com" (
    echo [실패] 저장된 값이 ".apps.googleusercontent.com"으로 끝나지 않습니다.
    exit /b 1
)
echo [확인] Client ID 형식 정상
echo.
echo 저장된 파일: %ENV_FILE%
echo.

echo ============================================
echo   서버 재시작
echo ============================================
echo 5173 포트에서 실행 중인 서버를 종료합니다...
call :kill_port 5173
del "%TARGET_DIR%\.server.lock" >nul 2>nul
del "%TARGET_DIR%\.last_port" >nul 2>nul
del "%TARGET_DIR%\.launching.lock" >nul 2>nul
timeout /t 1 /nobreak >nul
echo.

echo 아래 폴더에서 새 서버를 이 창에 직접 띄웁니다
echo ^(숨겨진 창이 아니라 바로 이 창에 Vite 로그가 그대로 표시됩니다^):
echo   %TARGET_DIR%
echo.
echo 잠시 후 브라우저가 자동으로 열립니다. 열리면 ⚙^(설정^) 클릭 후
echo "개발자 진단"에서 아래가 모두 "예"로 보이는지 확인해주세요:
echo   - 환경변수 로드됨
echo   - Client ID 형식 정상
echo   - VITE_GOOGLE_CLIENT_ID 존재
echo   - 실행 프로젝트 경로가 위 폴더와 일치하는지
echo.
echo ^(이 창을 닫으면 서버도 함께 종료됩니다^)
echo ============================================
echo.

if exist "%TARGET_DIR%\_wait_and_open.bat" (
    start "팀장 일정 조율 캘린더 - 브라우저 대기" /min "%TARGET_DIR%\_wait_and_open.bat" 5173
)

cd /d "%TARGET_DIR%"
call npm run dev -- --port 5173 --strictPort
set "DEV_EXIT=%errorlevel%"
cd /d "%SELF_DIR%"

echo.
if not "%DEV_EXIT%"=="0" (
    echo [오류] 개발 서버 실행 중 오류가 발생했습니다^(종료 코드: %DEV_EXIT%^).
    echo        위쪽의 오류 메시지를 확인해주세요.
    exit /b 1
)
echo 서버가 종료되었습니다.
exit /b 0

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

:kill_port
set "P=%~1"
if "%P%"=="" exit /b 0
rem netstat의 상태 표시("LISTENING")는 한글 Windows 등 일부 로캘에서 번역되어
rem 나올 수 있어 findstr로는 못 잡을 수 있다. Get-NetTCPConnection을 우선
rem 사용하고(로캘 무관), 안 되면 netstat으로 대체한다.
set "KP_ANY=0"
for /f "usebackq delims=" %%A in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "(Get-NetTCPConnection -LocalPort %P% -State Listen -ErrorAction SilentlyContinue).OwningProcess" 2^>nul`) do (
    if not "%%A"=="" (
        echo   - 포트 %P%에서 이전 서버 종료 중... ^(PID %%A^)
        taskkill /PID %%A /F >nul 2>nul
        set "KP_ANY=1"
    )
)
if "!KP_ANY!"=="0" (
    for /f "tokens=5" %%A in ('netstat -ano ^| findstr /r /c:":%P% .*LISTENING"') do (
        echo   - 포트 %P%에서 이전 서버 종료 중... ^(PID %%A^)
        taskkill /PID %%A /F >nul 2>nul
    )
)
exit /b 0
