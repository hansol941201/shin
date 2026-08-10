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

for %%P in (5173 5174 5175 5176 5177 5178 5179 5180 5181 5182) do (
    call :kill_port %%P
)

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
for /f "tokens=5" %%A in ('netstat -ano ^| findstr /r /c:":%P% .*LISTENING"') do (
    echo [종료] 포트 %P% 서버 종료 중... ^(PID %%A^)
    taskkill /PID %%A /F >nul 2>nul
    set "FOUND=1"
)
exit /b 0
