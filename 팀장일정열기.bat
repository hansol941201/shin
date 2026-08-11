@echo off
rem ============================================================
rem  팀장 일정 조율 캘린더 - 더블클릭 실행 (프로젝트 루트용)
rem  이 파일만 더블클릭하면 team-schedule-app 폴더를 찾아
rem  자동으로 서버를 켜고 준비되면 브라우저를 엽니다.
rem  (기존 업무 가이드 앱(index.html)에는 영향을 주지 않습니다)
rem ============================================================
chcp 65001 >nul
title 팀장 일정 조율 캘린더
cd /d "%~dp0"

echo [경로 확인] 팀장일정열기.bat 위치: %~dp0
echo [경로 확인] 실행할 프로젝트 폴더: %~dp0team-schedule-app
echo.

if not exist "%~dp0team-schedule-app\실행.bat" (
    echo [오류] team-schedule-app\실행.bat 을 찾을 수 없습니다.
    echo         이 파일이 프로젝트 루트에 있는지 확인해주세요.
    echo         ^(현재 위치: %~dp0^)
    echo.
    pause
    exit /b 1
)

call "%~dp0team-schedule-app\실행.bat"
