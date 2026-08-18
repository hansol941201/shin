# =====================================================================
# install.ps1
# "설치_AI전략회의실.bat"이 호출하는 실제 설치 로직.
#
# 하는 일:
#   1) 압축을 푼 폴더(SourceDir)의 프로그램 파일 전체를 전용 설치 폴더
#      (%LOCALAPPDATA%\AI전략회의실)로 복사한다.
#   2) 바탕화면에 "AI 전략회의실" 바로가기(.lnk) 하나만 만든다 — 바로가기의
#      대상은 설치 폴더 안의 AI전략회의실.bat이므로, 이후 사용자는 압축을
#      풀었던 원본 폴더를 지워도 프로그램은 계속 정상 동작한다.
#
# run.ps1은 이미 자기 자신의 실제 위치($MyInvocation.MyCommand.Path)를
# 기준으로 RootDir/로그 경로를 계산하므로, 이 설치 스크립트는 "파일을
# 통째로 옮겨도 되는 폴더"로 복사만 해주면 된다 — run.ps1/AI전략회의실.bat
# 자체는 수정하지 않는다.
# =====================================================================

param(
    [Parameter(Mandatory = $true)]
    [string]$SourceDir
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
try { chcp 65001 > $null } catch {}

$InstallDir = Join-Path $env:LOCALAPPDATA 'AI전략회의실'
$ShortcutName = 'AI 전략회의실.lnk'

function Write-Info($msg) { Write-Host $msg -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host $msg -ForegroundColor Green }
function Write-Err2($msg) { Write-Host $msg -ForegroundColor Red }

# run.ps1의 Show-FatalAndExit과 같은 원칙 — 오류가 나도 창이 바로 닫히지
# 않고 안내를 보여준 뒤 키 입력을 기다린다.
function Show-FatalAndExit($lines) {
    Write-Host ''
    foreach ($l in $lines) { Write-Err2 $l }
    Write-Host ''
    Write-Host '아무 키나 누르면 종료합니다.'
    try { [void][System.Console]::ReadKey($true) } catch { Start-Sleep -Seconds 20 }
    exit 1
}

try {
    Write-Info '============================================================'
    Write-Info '  AI 전략회의실 설치를 시작합니다'
    Write-Info '============================================================'
    Write-Host ''
    Write-Host "설치 위치: $InstallDir"
    Write-Host ''

    $sourceRunPs1 = Join-Path $SourceDir 'scripts\run.ps1'
    if (-not (Test-Path $sourceRunPs1)) {
        Show-FatalAndExit @(
            '[ERROR] 원본 프로그램 파일을 찾을 수 없습니다.',
            "예상 경로: $sourceRunPs1",
            '압축을 푼 폴더 전체가 그대로 있는 상태에서 설치_AI전략회의실.bat을 실행해주세요.',
            '(설치_AI전략회의실.bat 파일만 따로 옮기면 이 오류가 납니다.)'
        )
    }

    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

    # logs(이전 실행 기록)는 재설치/업데이트 때도 보존한다 — 프로그램
    # 파일만 새로 덮어쓴다.
    $excludeNames = @('logs', '.git')
    Get-ChildItem -Path $SourceDir -Force |
        Where-Object { $excludeNames -notcontains $_.Name } |
        ForEach-Object {
            $dest = Join-Path $InstallDir $_.Name
            if ($_.PSIsContainer) {
                Copy-Item -Path $_.FullName -Destination $dest -Recurse -Force
            } else {
                Copy-Item -Path $_.FullName -Destination $dest -Force
            }
        }
    Write-Ok '[1/2] 프로그램 파일 복사 완료'

    $shell = New-Object -ComObject WScript.Shell
    # SpecialFolders('Desktop')로 구하면 OneDrive로 바탕화면이 옮겨진
    # 환경(Windows 11에서 흔함)에서도 실제 바탕화면 경로를 정확히 찾는다.
    $desktopPath = $shell.SpecialFolders('Desktop')
    $shortcutPath = Join-Path $desktopPath $ShortcutName
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = Join-Path $InstallDir 'AI전략회의실.bat'
    $shortcut.WorkingDirectory = $InstallDir
    $shortcut.Description = 'AI 전략회의실 실행'
    $shortcut.Save()
    Write-Ok '[2/2] 바탕화면 바로가기 생성 완료'

    Write-Host ''
    Write-Info '============================================================'
    Write-Ok   '  설치가 완료되었습니다!'
    Write-Info '============================================================'
    Write-Host ''
    Write-Host "이제부터는 바탕화면의 '$([IO.Path]::GetFileNameWithoutExtension($ShortcutName))' 아이콘을 더블클릭해서 실행하세요."
    Write-Host '(방금 압축을 풀었던 이 폴더는 더 이상 필요 없습니다 — 지워도 프로그램은 계속 정상 동작합니다.)'
    Write-Host ''
    Write-Host '나중에 제거하려면:'
    Write-Host "  - 설치 폴더($InstallDir) 안의 '제거_AI전략회의실.bat'을 실행하거나"
    Write-Host '  - 압축을 다시 풀어서 그 안의 제거_AI전략회의실.bat을 실행하면 됩니다.'
    Write-Host ''
    Write-Host '아무 키나 누르면 이 창을 닫습니다.'
    try { [void][System.Console]::ReadKey($true) } catch { Start-Sleep -Seconds 5 }
    exit 0
}
catch {
    Show-FatalAndExit @(
        '[FATAL ERROR] 설치 중 오류가 발생했습니다.',
        "$($_.Exception.GetType().FullName): $($_.Exception.Message)"
    )
}
