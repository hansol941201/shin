# =====================================================================
# 입주민 설명자료 자동 제작 프로그램 - Windows EXE 빌드 스크립트
# 사용법 (PowerShell):
#   1) py -3 -m venv .venv
#   2) .\.venv\Scripts\Activate.ps1
#   3) pip install -r requirements.txt
#   4) .\build_exe.ps1
# 빌드 결과: dist\ResidentPPTMaker\ResidentPPTMaker.exe
# =====================================================================

$ErrorActionPreference = "Stop"

Write-Host "[1/4] 이전 빌드 산출물 정리 중..." -ForegroundColor Cyan
Remove-Item -Recurse -Force build, dist, __pycache__ -ErrorAction SilentlyContinue

Write-Host "[2/4] PyInstaller 설치 확인 중..." -ForegroundColor Cyan
pip show pyinstaller > $null 2>&1
if ($LASTEXITCODE -ne 0) {
    pip install pyinstaller
}

Write-Host "[3/4] EXE 빌드 중..." -ForegroundColor Cyan
pyinstaller run_app.py `
    --name "ResidentPPTMaker" `
    --noconsole `
    --onedir `
    --clean `
    --add-data "assets;assets" `
    --hidden-import "PIL._tkinter_finder" `
    --collect-all "customtkinter"

Write-Host "[4/4] 빌드 완료" -ForegroundColor Green
Write-Host "결과물 위치: dist\ResidentPPTMaker\ResidentPPTMaker.exe"
Write-Host ""
Write-Host "참고: PDF 미리보기 생성을 사용하려면 실행 PC에 LibreOffice가 설치되어 있어야 합니다."
Write-Host "참고: 이미지 내 문구(OCR) 인식을 사용하려면 실행 PC에 Tesseract-OCR(한국어 데이터 포함)이 설치되어 있어야 합니다."
Write-Host "두 프로그램이 없어도 PowerPoint 기본 생성 기능은 정상 동작합니다."
