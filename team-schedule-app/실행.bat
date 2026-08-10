@echo off
chcp 65001 >nul
title 팀장 일정 조율 캘린더
cd /d "%~dp0"

echo ============================================
echo   팀장 일정 조율 캘린더 실행 준비 중...
echo   (이 창을 닫으면 서버도 함께 종료됩니다)
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [오류] Node.js를 찾을 수 없습니다.
    echo         https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행해주세요.
    echo.
    pause
    exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
    echo [오류] npm을 찾을 수 없습니다. Node.js 설치 상태를 확인해주세요.
    echo.
    pause
    exit /b 1
)

if not exist "%~dp0node_modules" (
    echo [설치] node_modules 폴더가 없어 패키지를 설치합니다. 잠시만 기다려주세요...
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo [오류] npm install 중 오류가 발생했습니다. 위 메시지를 확인해주세요.
        echo.
        pause
        exit /b 1
    )
    echo.
    echo [완료] 패키지 설치가 끝났습니다.
) else (
    echo [확인] node_modules가 이미 있어 설치를 건너뜁니다.
)

echo.
echo [포트 확인] 사용 가능한 포트를 찾는 중...

set "APP_PORT="
for %%P in (5173 5174 5175 5176 5177 5178 5179 5180 5181 5182) do (
    if not defined APP_PORT (
        netstat -ano | findstr /r /c:":%%P .*LISTENING" >nul 2>nul
        if errorlevel 1 (
            set "APP_PORT=%%P"
        )
    )
)

if not defined APP_PORT (
    echo [오류] 5173~5182 포트가 모두 사용 중입니다.
    echo         다른 프로그램을 종료한 뒤 다시 시도해주세요.
    echo.
    pause
    exit /b 1
)

echo [포트] %APP_PORT% 번 포트를 사용합니다.
echo %APP_PORT%> "%~dp0.last_port"

start "팀장 일정 조율 캘린더 - 브라우저 대기" /min "%~dp0_wait_and_open.bat" %APP_PORT%

echo.
echo [실행] 개발 서버를 시작합니다. 잠시 후 브라우저가 자동으로 열립니다.
echo         주소: http://localhost:%APP_PORT%/
echo         종료하려면 이 창을 닫거나 종료.bat 을 실행하세요.
echo.

call npm run dev -- --port %APP_PORT% --strictPort
set "DEV_EXIT=%errorlevel%"

echo.
if not "%DEV_EXIT%"=="0" (
    echo [오류] 개발 서버 실행 중 오류가 발생했습니다. ^(종료 코드: %DEV_EXIT%^)
    echo         위쪽의 오류 메시지를 확인해주세요.
) else (
    echo 서버가 종료되었습니다.
)
echo.
pause
