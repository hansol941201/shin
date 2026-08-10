@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title 팀장 일정 조율 캘린더 - 설치
cd /d "%~dp0"

echo ============================================
echo   팀장 일정 조율 캘린더 - 바탕화면 바로가기 설치
echo ============================================
echo.
echo 이 창은 처음 한 번만 실행하면 됩니다.
echo.

set "TARGET=%~dp0team-schedule-app\launch_silent.vbs"
set "MAKER=%~dp0team-schedule-app\make_shortcut.vbs"
set "STATUSFILE=%~dp0team-schedule-app\.install_status"

if not exist "%TARGET%" (
    echo [오류] 다음 파일을 찾을 수 없습니다:
    echo         %TARGET%
    echo         저장소가 올바르게 받아졌는지^( team-schedule-app 폴더 포함 ^) 확인해주세요.
    echo.
    pause
    exit /b 1
)
if not exist "%MAKER%" (
    echo [오류] 다음 파일을 찾을 수 없습니다:
    echo         %MAKER%
    echo.
    pause
    exit /b 1
)

del "%STATUSFILE%" >nul 2>nul

echo [1/3] 실제 바탕화면 경로를 확인하고 바로가기 생성을 시도합니다...
echo       ^(OneDrive로 리디렉션된 바탕화면도 자동으로 인식합니다^)
cscript //nologo "%MAKER%" "%TARGET%" "%STATUSFILE%"
set "CSCRIPT_RESULT=%errorlevel%"

set "ST_STATUS="
set "ST_DESKTOP="
set "ST_SHORTCUT="
set "ST_REASON="
if exist "%STATUSFILE%" (
    for /f "usebackq tokens=1,* delims==" %%K in ("%STATUSFILE%") do (
        if /i "%%K"=="STATUS"   set "ST_STATUS=%%L"
        if /i "%%K"=="DESKTOP"  set "ST_DESKTOP=%%L"
        if /i "%%K"=="SHORTCUT" set "ST_SHORTCUT=%%L"
        if /i "%%K"=="REASON"   set "ST_REASON=%%L"
    )
)

echo.
if defined ST_DESKTOP (
    echo   확인된 바탕화면 경로: !ST_DESKTOP!
) else (
    echo   [주의] 바탕화면 경로를 확인하지 못했습니다. ^(cscript 종료 코드: %CSCRIPT_RESULT%^)
)
echo.

rem ---------- 바로가기가 실제로 만들어졌는지 다시 검증 ----------
set "SHORTCUT_OK=0"
if /i "!ST_STATUS!"=="OK" (
    if defined ST_SHORTCUT (
        if exist "!ST_SHORTCUT!" set "SHORTCUT_OK=1"
    )
)

if "!SHORTCUT_OK!"=="1" (
    echo [2/3] 바로가기 파일 존재 재확인... 정상적으로 존재합니다.
    echo.
    echo ============================================
    echo   바탕화면에 팀장 일정 아이콘을 만들었습니다
    echo ============================================
    echo   위치: !ST_SHORTCUT!
    echo   이제부터는 바탕화면의 "팀장 일정" 아이콘만 더블클릭하면 됩니다.
    echo ============================================
    echo.
    pause
    exit /b 0
)

echo [2/3] 바로가기 생성에 실패했거나, 생성됐다고 나왔지만 실제 파일이 없습니다.
if defined ST_REASON (
    echo       원인: !ST_REASON!
) else (
    echo       원인: 알 수 없음 ^(cscript 종료 코드: %CSCRIPT_RESULT%^)
)
echo.
echo [3/3] 대신 바탕화면에 바로 실행되는 "팀장 일정.bat" 파일을 직접 만듭니다...

if not defined ST_DESKTOP (
    echo.
    echo ============================================
    echo   [실패] 바탕화면 경로 자체를 확인하지 못해
    echo          대체 방법도 진행할 수 없습니다.
    echo ============================================
    echo   Windows 바탕화면 위치^(OneDrive 리디렉션 여부 포함^)를 확인한 뒤
    echo   다시 시도해주세요.
    echo.
    pause
    exit /b 1
)

set "FALLBACK_BAT=!ST_DESKTOP!\팀장 일정.bat"
> "!FALLBACK_BAT!" echo @echo off
>> "!FALLBACK_BAT!" echo chcp 65001 ^>nul
>> "!FALLBACK_BAT!" echo start "" wscript.exe "%TARGET%"

if exist "!FALLBACK_BAT!" (
    echo.
    echo ============================================
    echo   바탕화면에 팀장 일정 아이콘을 만들었습니다 ^(대체 방식^)
    echo ============================================
    echo   위치: !FALLBACK_BAT!
    echo   이제부터는 바탕화면의 "팀장 일정" 파일만 더블클릭하면 됩니다.
    echo   ^(바로가기 대신 실행 파일 자체를 바탕화면에 만든 방식입니다^)
    echo ============================================
    echo.
    pause
    exit /b 0
) else (
    echo.
    echo ============================================
    echo   [실패] 대체 실행 파일도 바탕화면에 만들지 못했습니다.
    echo ============================================
    echo   바탕화면^(!ST_DESKTOP!^) 쓰기 권한을 확인해주세요.
    echo.
    pause
    exit /b 1
)
