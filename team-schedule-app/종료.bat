@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul
title 팀장 일정 조율 캘린더 종료
cd /d "%~dp0"

echo ============================================
echo   팀장 일정 조율 캘린더 서버 종료
echo ============================================
echo.

set "FOUND=0"

if exist "%~dp0.last_port" (
    set /p LAST_PORT=<"%~dp0.last_port"
    if defined LAST_PORT call :kill_port !LAST_PORT!
)

if exist "%~dp0.server.lock" (
    for /f "usebackq tokens=1,2 delims==" %%K in ("%~dp0.server.lock") do (
        if /i "%%K"=="PORT" call :kill_port %%L
    )
)

for %%P in (5173 5174 5175 5176 5177 5178 5179 5180 5181 5182 5183 5184) do (
    call :kill_port %%P
)

rem 바탕화면 아이콘의 "이미 실행 중이면 재사용" 판단이 꼬이지 않도록 정리
del "%~dp0.server.lock" >nul 2>nul
del "%~dp0.last_port" >nul 2>nul
del "%~dp0.launching.lock" >nul 2>nul

echo.
if "!FOUND!"=="0" (
    echo 실행 중인 팀장 일정 조율 캘린더 서버를 찾지 못했습니다.
    echo ^(이미 종료되었거나, 다른 포트에서 실행 중일 수 있습니다.^)
) else (
    echo 서버를 종료했습니다.
)

echo.
pause
endlocal
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
        echo [종료] 포트 %P% 서버 종료 중... ^(PID %%A^)
        taskkill /PID %%A /F >nul 2>nul
        set "FOUND=1"
        set "KP_ANY=1"
    )
)
if "!KP_ANY!"=="0" (
    for /f "tokens=5" %%A in ('netstat -ano ^| findstr /r /c:":%P% .*LISTENING"') do (
        echo [종료] 포트 %P% 서버 종료 중... ^(PID %%A^)
        taskkill /PID %%A /F >nul 2>nul
        set "FOUND=1"
    )
)
exit /b 0
