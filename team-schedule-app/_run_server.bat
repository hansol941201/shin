@echo off
rem 내부 스크립트입니다. _launch_core.bat이 PowerShell을 통해
rem 완전히 분리된 숨김 프로세스로 이 파일을 실행합니다.
rem 포트는 인자가 아니라 상속된 환경변수 APP_PORT로 전달받습니다
rem (여러 겹의 따옴표 안에 리다이렉션 기호를 넣지 않기 위함).
cd /d "%~dp0"
npm run dev -- --port %APP_PORT% --strictPort >> ".server.log" 2>&1
