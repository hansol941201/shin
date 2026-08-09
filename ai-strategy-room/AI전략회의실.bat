@echo off
setlocal EnableExtensions
chcp 65001 >nul

cd /d "%~dp0"
set "PS1=%~dp0scripts\run.ps1"

if not exist "%PS1%" (
    echo [ERROR] Cannot find scripts\run.ps1
    echo Expected path: "%PS1%"
    echo Please make sure the whole ai-strategy-room folder was copied together,
    echo not just this .bat file.
    echo.
    pause
    exit /b 1
)

echo ============================================================
echo   AI Strategy Room - Starting...
echo   (Keep this window open while the program is running)
echo ============================================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PS1%"
set "EXITCODE=%ERRORLEVEL%"

echo.
echo ============================================================
echo   Program stopped. (exit code: %EXITCODE%)
echo   Press any key to close this window.
echo ============================================================
pause >nul
endlocal
exit /b %EXITCODE%
