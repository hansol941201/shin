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

rem ============================================================
rem  0단계: 실제 Vite 프로젝트 루트를 파일 기준으로 확인한다.
rem  (package.json + vite.config.*가 실제로 같이 있는 폴더만 인정한다.
rem   "team-schedule-app"이라는 폴더 이름만 보고 믿지 않는다.)
rem ============================================================
call :find_project_root
if not defined TARGET_DIR (
    echo [실패] package.json과 vite.config가 함께 있는 team-schedule-app
    echo        프로젝트 폴더를 찾지 못했습니다.
    echo        이 bat 파일이 있는 위치^(%SELF_DIR%^) 바로 아래에
    echo        team-schedule-app 폴더가 있는지 확인해주세요.
    exit /b 1
)
echo [0/6] 실제 프로젝트 루트 확인됨: %TARGET_DIR%
echo.

set "ENV_FILE=%TARGET_DIR%\.env.local"

set /p "CLIENT_ID=Google Client ID: "

if "!CLIENT_ID!"=="" (
    echo.
    echo [실패] 입력값이 비어 있어 저장하지 않았습니다.
    exit /b 1
)

rem ---- 앞뒤 공백/따옴표 제거(복사/붙여넣기 과정에서 흔히 섞여 들어옴) ----
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
    exit /b 1
)

echo [1/6] 형식 확인됨 ^(마지막 부분: ...!CLIENT_ID:~-14!^)
echo.

rem ============================================================
rem  2단계: 잘못된 위치/이름으로 만들어진 예전 파일부터 정리한다.
rem  - Windows가 확장자를 숨겨서 실수로 .env.local.txt로 저장된 경우 포함
rem  - 이 단계를 새 파일을 쓰기 "전"에 해서, 두 파일이 동시에 남아
rem    서로 다른 값을 가진 채 헷갈리는 상황을 방지한다.
rem ============================================================
echo [2/6] 잘못된 위치/이름의 이전 설정 파일을 검사합니다...
set "CLEANED=0"

if exist "%TARGET_DIR%\.env.local.txt" (
    del "%TARGET_DIR%\.env.local.txt" >nul 2>nul
    echo   - 삭제^(확장자 숨김 실수^): %TARGET_DIR%\.env.local.txt
    set "CLEANED=1"
)
if exist "%SELF_DIR%.env.local" (
    del "%SELF_DIR%.env.local" >nul 2>nul
    echo   - 삭제^(저장소 루트, 잘못된 위치^): %SELF_DIR%.env.local
    set "CLEANED=1"
)
if exist "%SELF_DIR%.env.local.txt" (
    del "%SELF_DIR%.env.local.txt" >nul 2>nul
    echo   - 삭제^(저장소 루트, 확장자 숨김 실수^): %SELF_DIR%.env.local.txt
    set "CLEANED=1"
)
if exist "%SELF_DIR%team-schedule-app.env.local" (
    del "%SELF_DIR%team-schedule-app.env.local" >nul 2>nul
    echo   - 삭제^(잘못된 파일명^): %SELF_DIR%team-schedule-app.env.local
    set "CLEANED=1"
)

set "DESKTOP_DIR="
for /f "usebackq delims=" %%D in (`powershell -NoProfile -Command "(New-Object -ComObject WScript.Shell).SpecialFolders('Desktop')"`) do set "DESKTOP_DIR=%%D"
if defined DESKTOP_DIR (
    if exist "!DESKTOP_DIR!\team-schedule-app.env.local" (
        del "!DESKTOP_DIR!\team-schedule-app.env.local" >nul 2>nul
        echo   - 삭제^(바탕화면, 잘못된 위치^): team-schedule-app.env.local
        set "CLEANED=1"
    )
    if exist "!DESKTOP_DIR!\.env.local" (
        del "!DESKTOP_DIR!\.env.local" >nul 2>nul
        echo   - 삭제^(바탕화면, 잘못된 위치^): .env.local
        set "CLEANED=1"
    )
    if exist "!DESKTOP_DIR!\.env.local.txt" (
        del "!DESKTOP_DIR!\.env.local.txt" >nul 2>nul
        echo   - 삭제^(바탕화면, 확장자 숨김 실수^): .env.local.txt
        set "CLEANED=1"
    )
)
if "!CLEANED!"=="0" echo   - 잘못된 이전 파일 없음
echo.

echo [3/6] .env.local 파일에 저장하는 중... ^(%ENV_FILE%^)

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
    exit /b 1
)
echo.

rem ============================================================
rem  4단계: 저장 결과를 파일 기준으로 다시 검증한다.
rem  - package.json과 .env.local이 정말 같은 폴더에 있는지
rem  - 저장된 값이 입력값과 일치하고, 올바른 접미사로 끝나는지
rem ============================================================
echo [4/6] 저장 결과를 실제 파일 기준으로 검증하는 중...

if not exist "%TARGET_DIR%\package.json" (
    echo   [실패] %TARGET_DIR%\package.json 이 없습니다. 프로젝트 폴더가 아닙니다.
    exit /b 1
)
if not exist "%ENV_FILE%" (
    echo   [실패] %ENV_FILE% 이 존재하지 않습니다.
    exit /b 1
)
echo   - package.json, .env.local이 같은 폴더에 있음: %TARGET_DIR%

set "SAVED_LINE="
for /f "usebackq tokens=1,* delims==" %%K in ("%ENV_FILE%") do (
    if /i "%%K"=="VITE_GOOGLE_CLIENT_ID" set "SAVED_LINE=%%L"
)

if not defined SAVED_LINE (
    echo   [실패] .env.local에서 VITE_GOOGLE_CLIENT_ID 값을 다시 읽지 못했습니다.
    exit /b 1
)
if not "!SAVED_LINE!"=="!CLIENT_ID!" (
    echo   [실패] 저장된 값이 입력값과 다릅니다. 파일을 직접 확인해주세요.
    echo          파일: %ENV_FILE%
    exit /b 1
)
set "SAVED_SUFFIX=!SAVED_LINE:~-27!"
if /i not "!SAVED_SUFFIX!"==".apps.googleusercontent.com" (
    echo   [실패] 저장된 값이 ".apps.googleusercontent.com"으로 끝나지 않습니다.
    exit /b 1
)
echo   - 저장된 값이 입력값과 일치하고 형식도 정상입니다.
echo.

echo ============================================
echo   저장 완료: %ENV_FILE%
echo ============================================
echo.

rem ============================================================
rem  5단계: 서버를 완전히 껐다가 새로 켠다(구버전 서버가 다른 폴더에
rem  있어도 함께 정리한다). 브라우저까지 자동으로 연다.
rem ============================================================
echo [5/6] 새 설정을 적용하기 위해 서버를 재시작합니다...
call :restart_all_servers
echo.

echo [6/6] 팀장 일정 서버를 새로 시작합니다. 잠시만 기다려주세요...
if exist "%TARGET_DIR%\_launch_core.bat" (
    call "%TARGET_DIR%\_launch_core.bat"
    set "LAUNCH_STATUS_FILE=%TARGET_DIR%\.launch_status"
    set "LAUNCH_OK=0"
    if exist "!LAUNCH_STATUS_FILE!" (
        set /p LAUNCH_FIRST_LINE=<"!LAUNCH_STATUS_FILE!"
        if /i "!LAUNCH_FIRST_LINE!"=="OK" set "LAUNCH_OK=1"
    )
    if "!LAUNCH_OK!"=="1" (
        echo   - 서버가 정상적으로 시작되어 브라우저가 자동으로 열립니다.
    ) else (
        echo   [주의] 서버 자동 시작 중 문제가 있었습니다. 아래 내용을 확인해주세요.
        if exist "!LAUNCH_STATUS_FILE!" type "!LAUNCH_STATUS_FILE!"
        echo   바탕화면의 "팀장 일정" 아이콘을 직접 실행해도 됩니다.
    )
) else (
    echo   [주의] %TARGET_DIR%\_launch_core.bat 을 찾을 수 없어 자동 시작을
    echo          건너뜁니다. 바탕화면의 "팀장 일정" 아이콘을 실행해주세요.
)
echo.

echo ============================================
echo   설정 완료
echo ============================================
echo   http://localhost:5173 에서 헤더의 "Google 캘린더 연결"
echo   버튼을 확인하세요. 만약 창이 자동으로 뜨지 않았다면
echo   바탕화면의 "팀장 일정" 아이콘을 실행하면 됩니다.
echo ============================================
exit /b 0

rem ============================================================
rem  :find_project_root — package.json + vite.config.*가 실제로
rem  같이 있는 폴더를 TARGET_DIR로 반환한다. 폴더 이름만 보고
rem  믿지 않고 파일 존재 여부로 판단한다.
rem ============================================================
:find_project_root
set "TARGET_DIR="

rem 1순위: 이 bat 파일 바로 아래의 team-schedule-app (정상적인 경우 항상 여기)
set "CANDIDATE=%SELF_DIR%team-schedule-app"
if exist "%CANDIDATE%\package.json" (
    if exist "%CANDIDATE%\vite.config.js" set "TARGET_DIR=%CANDIDATE%"
    if exist "%CANDIDATE%\vite.config.ts" set "TARGET_DIR=%CANDIDATE%"
    if exist "%CANDIDATE%\vite.config.mjs" set "TARGET_DIR=%CANDIDATE%"
)
if defined TARGET_DIR exit /b 0

rem 2순위(예외 상황 대비): 이 bat 파일 아래 폴더들 중 package.json과
rem vite.config.*가 함께 있는 첫 번째 폴더를 찾는다(node_modules 제외).
for /f "usebackq delims=" %%F in (`dir /s /b /a:-d "%SELF_DIR%vite.config.js" "%SELF_DIR%vite.config.ts" "%SELF_DIR%vite.config.mjs" 2^>nul ^| findstr /v /i "\\node_modules\\"`) do (
    if not defined TARGET_DIR (
        set "CANDIDATE_DIR=%%~dpF"
        if exist "!CANDIDATE_DIR!package.json" set "TARGET_DIR=!CANDIDATE_DIR:~0,-1!"
    )
)
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

rem 개발 서버(Vite)는 .env.local 변경을 자동으로 다시 읽지 않으므로,
rem 실행 중인 서버(어느 폴더의 것이든)를 모두 종료해 다음 실행 시
rem 새 설정이 100% 적용되게 한다.
:restart_all_servers
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
del "%TARGET_DIR%\.launching.lock" >nul 2>nul
if "!FOUND!"=="1" (
    echo   - 실행 중이던 서버를 종료했습니다^(다른 폴더의 서버 포함^).
) else (
    echo   - 실행 중인 서버는 없었습니다.
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
