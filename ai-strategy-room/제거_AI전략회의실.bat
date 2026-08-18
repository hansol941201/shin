@echo off
setlocal EnableExtensions
chcp 65001 >nul

cd /d "%~dp0"
set "PS1=%~dp0scripts\uninstall.ps1"

if not exist "%PS1%" (
    echo [ERROR] Cannot find scripts\uninstall.ps1
    echo Expected path: "%PS1%"
    echo.
    pause
    exit /b 1
)

echo ============================================================
echo   AI Strategy Room Uninstaller / AI 전략회의실 제거
echo ============================================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PS1%"
set "EXITCODE=%ERRORLEVEL%"

endlocal
exit /b %EXITCODE%
