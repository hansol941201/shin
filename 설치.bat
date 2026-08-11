@echo off
chcp 65001 >nul
title 팀장 일정 조율 캘린더 - 설치
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
echo   팀장 일정 조율 캘린더 - 바탕화면 바로가기 설치
echo ============================================
echo.

echo [단계 1/6] 필요한 파일이 있는지 확인합니다...
set "TARGET=%CD%\team-schedule-app\launch_silent.vbs"
set "MAKER=%CD%\team-schedule-app\make_shortcut.vbs"
set "STATUSFILE=%CD%\team-schedule-app\.install_status"

if not exist "%TARGET%" (
    echo   [실패] 다음 파일을 찾을 수 없습니다: %TARGET%
    echo          저장소가 올바르게 받아졌는지^(team-schedule-app 폴더 포함^) 확인해주세요.
    goto :eof
)
echo   - launch_silent.vbs 확인됨
echo     경로: %TARGET%

if not exist "%MAKER%" (
    echo   [실패] 다음 파일을 찾을 수 없습니다: %MAKER%
    goto :eof
)
echo   - make_shortcut.vbs 확인됨
echo     경로: %MAKER%
echo.

echo [단계 2/6] cscript^(스크립트 실행기^)가 있는지 확인합니다...
where cscript >nul 2>nul
if errorlevel 1 (
    echo   [실패] cscript.exe를 찾을 수 없습니다.
    echo          Windows Script Host가 비활성화되어 있을 수 있습니다.
    goto fallback
)
echo   - 확인됨
echo.

echo [단계 3/6] 이전 설치 기록을 정리하고 바로가기 생성을 시도합니다...
if exist "%STATUSFILE%" del "%STATUSFILE%" >nul 2>nul
echo   - 실행: cscript //nologo make_shortcut.vbs
echo     ^(대상 파일: %TARGET%^)
cscript //nologo "%MAKER%" "%TARGET%" "%STATUSFILE%"
set "CSCRIPT_RC=%ERRORLEVEL%"
echo   - cscript 종료 코드^(ERRORLEVEL^): %CSCRIPT_RC%
echo.

echo [단계 4/6] 결과 파일^(.install_status^)을 확인합니다...
set "ST_STATUS=UNKNOWN"
set "ST_DESKTOP="
set "ST_SHORTCUT="
set "ST_REASON="

if not exist "%STATUSFILE%" (
    echo   [실패] 결과 파일이 생성되지 않았습니다.
    echo          cscript 실행 자체에 문제가 있었을 수 있습니다.
    goto fallback
)

for /f "usebackq tokens=1,* delims==" %%K in ("%STATUSFILE%") do (
    if "%%K"=="STATUS"   set "ST_STATUS=%%L"
    if "%%K"=="DESKTOP"  set "ST_DESKTOP=%%L"
    if "%%K"=="SHORTCUT" set "ST_SHORTCUT=%%L"
    if "%%K"=="REASON"   set "ST_REASON=%%L"
)

echo   - 상태^(STATUS^): %ST_STATUS%
echo   - 확인된 바탕화면 실제 경로: %ST_DESKTOP%
echo   - 바로가기 생성 대상 경로: %ST_SHORTCUT%
if not "%ST_REASON%"=="" echo   - 메시지: %ST_REASON%
echo.

echo [단계 5/6] 바로가기 파일이 실제로 존재하는지 재검증합니다...
if not "%ST_STATUS%"=="OK" (
    echo   [실패] 바로가기 생성 단계에서 오류가 발생했습니다.
    goto fallback
)
if not exist "%ST_SHORTCUT%" (
    echo   [실패] 상태는 OK였지만, 실제로는 파일이 존재하지 않습니다.
    echo          경로: %ST_SHORTCUT%
    goto fallback
)
echo   - 확인됨: 바로가기 파일이 실제로 존재합니다.
echo.
echo ============================================
echo   설치 완료 - 바탕화면의 팀장 일정 아이콘을 실행하세요
echo ============================================
goto :eof

:fallback
echo.
echo [단계 6/6] 바로가기 생성이 실패하여 대체 방법을 시도합니다...
echo            ^(바탕화면에 바로가기 대신 실행 파일 자체를 직접 만듭니다^)

if "%ST_DESKTOP%"=="" (
    echo   - 바탕화면 경로를 확인하지 못해 기본 경로로 다시 시도합니다.
    set "ST_DESKTOP=%USERPROFILE%\Desktop"
)
echo   - 사용할 바탕화면 경로: %ST_DESKTOP%

if not exist "%ST_DESKTOP%" (
    echo   [실패] 이 경로도 실제로 존재하지 않습니다: %ST_DESKTOP%
    echo          Windows 바탕화면 위치^(OneDrive 리디렉션 여부 포함^)를 직접 확인해주세요.
    echo.
    echo ============================================
    echo   설치 실패
    echo ============================================
    goto :eof
)

set "FALLBACK_BAT=%ST_DESKTOP%\팀장 일정.bat"
echo   - 생성 대상: %FALLBACK_BAT%

> "%FALLBACK_BAT%" echo @echo off
>> "%FALLBACK_BAT%" echo chcp 65001 ^>nul
>> "%FALLBACK_BAT%" echo start "" wscript.exe "%TARGET%"

if exist "%FALLBACK_BAT%" (
    echo   - 확인됨: 대체 실행 파일이 실제로 생성되었습니다.
    echo.
    echo ============================================
    echo   설치 완료 - 바탕화면의 팀장 일정 아이콘을 실행하세요
    echo   ^(바로가기 대신 실행 파일 자체가 만들어졌습니다^)
    echo ============================================
    goto :eof
)

echo   [실패] 대체 실행 파일도 만들지 못했습니다.
echo.
echo ============================================
echo   설치 실패
echo ============================================
echo   바탕화면^(%ST_DESKTOP%^) 쓰기 권한을 확인하거나
echo   관리자 권한으로 다시 실행해보세요.
goto :eof
