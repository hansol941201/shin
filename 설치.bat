@echo off
chcp 65001 >nul
title 팀장 일정 조율 캘린더 - 설치
cd /d "%~dp0"

echo ============================================
echo   팀장 일정 조율 캘린더 - 바탕화면 바로가기 설치
echo ============================================
echo.
echo 이 창은 처음 한 번만 실행하면 됩니다.
echo 완료되면 바탕화면에 "팀장 일정" 아이콘이 생깁니다.
echo.

set "TARGET=%~dp0team-schedule-app\launch_silent.vbs"
set "MAKER=%~dp0team-schedule-app\make_shortcut.vbs"

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

cscript //nologo "%MAKER%" "%TARGET%"
set "MAKE_RESULT=%errorlevel%"

if not "%MAKE_RESULT%"=="0" (
    echo.
    echo [오류] 바탕화면 바로가기 생성 중 오류가 발생했습니다. ^(코드 %MAKE_RESULT%^)
    echo         Windows 바탕화면 위치를 확인할 수 없거나 만들기 권한이 없을 수 있습니다.
    echo.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   [완료] 바탕화면에 "팀장 일정" 바로가기를 만들었습니다.
echo.
echo   이제부터는 이 설치.bat이나 저장소 폴더를 열 필요 없이
echo   바탕화면의 "팀장 일정" 아이콘만 더블클릭하면 됩니다.
echo   ^(검은 창 없이 조용히 서버가 켜지고 브라우저가 자동으로 열립니다^)
echo ============================================
echo.
pause
