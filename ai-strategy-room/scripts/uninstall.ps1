# =====================================================================
# uninstall.ps1
# "제거_AI전략회의실.bat"이 호출하는 실제 제거 로직.
#
# 설치 폴더(%LOCALAPPDATA%\AI전략회의실)와 바탕화면 바로가기를 지운다.
# 어디서 실행되든(압축을 풀었던 폴더든, 설치된 폴더든) 항상 같은 고정된
# 위치(%LOCALAPPDATA%\AI전략회의실 / 바탕화면)를 대상으로 하므로 결과는
# 동일하다 — install.ps1이 항상 이 위치에 설치하기 때문이다.
#
# 회의 중간저장/과거 회의 기억은 프로그램 폴더가 아니라 브라우저
# localStorage에 저장되므로, 이 제거로 지워지지 않는다(그대로 안내한다).
# =====================================================================

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
try { chcp 65001 > $null } catch {}

$InstallDir = Join-Path $env:LOCALAPPDATA 'AI전략회의실'
$ShortcutName = 'AI 전략회의실.lnk'

function Write-Info($msg) { Write-Host $msg -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host $msg -ForegroundColor Green }
function Write-Err2($msg) { Write-Host $msg -ForegroundColor Red }

function Wait-KeyThenClose {
    Write-Host ''
    Write-Host '아무 키나 누르면 이 창을 닫습니다.'
    try { [void][System.Console]::ReadKey($true) } catch { Start-Sleep -Seconds 5 }
}

Write-Info '============================================================'
Write-Info '  AI 전략회의실 제거'
Write-Info '============================================================'
Write-Host ''
Write-Host '삭제 대상:'
Write-Host "  - 프로그램 폴더: $InstallDir"
Write-Host "  - 바탕화면 바로가기: $ShortcutName"
Write-Host ''
Write-Host '※ 회의 중간저장/과거 회의 기억은 브라우저에 저장되어 있어 이 제거로 지워지지 않습니다.'
Write-Host ''

$answer = Read-Host '정말 제거하시겠습니까? (y/N)'
if ($answer -notin @('y', 'Y')) {
    Write-Host ''
    Write-Host '제거를 취소했습니다.'
    Wait-KeyThenClose
    exit 0
}

$hadError = $false

try {
    if (Test-Path $InstallDir) {
        Remove-Item -Path $InstallDir -Recurse -Force
        Write-Ok '프로그램 폴더를 삭제했습니다.'
    } else {
        Write-Host '프로그램 폴더가 이미 없습니다(건너뜀).'
    }
} catch {
    $hadError = $true
    Write-Err2 "[ERROR] 프로그램 폴더 삭제 중 문제가 발생했습니다: $($_.Exception.Message)"
    Write-Host '  (프로그램이 실행 중이면 먼저 검은 창을 닫고 다시 시도해주세요.)'
}

try {
    $shell = New-Object -ComObject WScript.Shell
    $desktopPath = $shell.SpecialFolders('Desktop')
    $shortcutPath = Join-Path $desktopPath $ShortcutName
    if (Test-Path $shortcutPath) {
        Remove-Item -Path $shortcutPath -Force
        Write-Ok '바탕화면 바로가기를 삭제했습니다.'
    } else {
        Write-Host '바탕화면 바로가기가 이미 없습니다(건너뜀).'
    }
} catch {
    $hadError = $true
    Write-Err2 "[ERROR] 바탕화면 바로가기 삭제 중 문제가 발생했습니다: $($_.Exception.Message)"
}

Write-Host ''
if ($hadError) {
    Write-Err2 '일부 항목을 제거하지 못했습니다. 위 내용을 확인해주세요.'
} else {
    Write-Ok '제거가 완료되었습니다.'
}

Wait-KeyThenClose
exit ([int]$hadError)
