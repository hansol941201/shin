@echo off
rem 내부 스크립트입니다. _launch_core.bat이 PowerShell을 통해
rem 완전히 분리된 숨김 프로세스로 이 파일을 실행합니다.
rem 포트는 인자가 아니라 상속된 환경변수 APP_PORT로 전달받습니다
rem (여러 겹의 따옴표 안에 리다이렉션 기호를 넣지 않기 위함).
rem
rem 실사용 모드: 개발 서버(vite dev / HMR)가 아니라 production build를
rem 만든 뒤 그 정적 파일을 vite preview로 서빙한다. 매 실행마다 새로
rem build하므로 항상 최신 코드가 반영되고(오래된 빌드가 남아 옛 화면이
rem 보이는 문제 방지), 개발자 도구/디버그 코드가 섞이지 않는다.
cd /d "%~dp0"
call npm run build >> ".server.log" 2>&1
if errorlevel 1 exit /b 1
call npm run preview -- --port %APP_PORT% --strictPort >> ".server.log" 2>&1
