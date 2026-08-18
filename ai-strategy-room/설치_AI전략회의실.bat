@echo off
setlocal EnableExtensions
chcp 65001 >nul

cd /d "%~dp0"
set "PS1=%~dp0scripts\install.ps1"

if not exist "%PS1%" (
    echo [ERROR] Cannot find scripts\install.ps1
    echo Expected path: "%PS1%"
    echo Please make sure the whole extracted folder was kept together,
    echo not just this .bat file.
    echo.
    pause
    exit /b 1
)

echo ============================================================
echo   AI Strategy Room Installer / AI 전략회의실 설치
echo ============================================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -SourceDir "%~dp0"
set "EXITCODE=%ERRORLEVEL%"

endlocal
exit /b %EXITCODE%
