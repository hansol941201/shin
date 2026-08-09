# =====================================================================
# run.ps1
# AI 전략회의실을 "AI전략회의실.bat" 더블클릭만으로 실행하기 위한 런처.
#
# 하는 일:
#   1) 이 PC에 Claude Code(claude 명령)가 설치·로그인 되어 있는지 점검
#   2) 문제가 있으면 이해하기 쉬운 한국어 안내를 보여주고 종료 (창은 안 닫힘)
#   3) 문제가 없으면 127.0.0.1:8787 에 로컬 HTTP 서버를 띄움
#        - 정적 파일(index.html/css/js)을 그대로 서빙
#        - POST /api/complete  → 이 PC의 "claude -p" 를 실행해서 응답을 반환
#        - GET  /api/health    → 브라우저(app.js)가 로컬 연결 여부를 확인할 때 사용
#   4) 기본 브라우저로 http://127.0.0.1:8787/index.html 자동 오픈
#
# 브라우저 자바스크립트는 이 PC의 어떤 프로그램도 직접 실행할 수 없다는
# 제약을 그대로 지킨다 — 이 서버가 "브라우저 ↔ claude CLI" 사이의 유일한
# 다리이며, 실행 중인 동안에만 실제 AI 회의가 가능하다(이 창을 닫으면 다시
# 데모 모드로 자동 전환된다).
#
# Python, Node.js 설치가 필요 없다 — Windows에 기본 내장된 PowerShell과
# .NET(System.Net.HttpListener)만 사용한다.
# =====================================================================

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001 > $null

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent $ScriptDir   # ai-strategy-room 폴더
$Port      = 8787
$BaseUrl   = "http://127.0.0.1:$Port"

function Write-Info($msg)  { Write-Host $msg -ForegroundColor Cyan }
function Write-Ok($msg)    { Write-Host $msg -ForegroundColor Green }
function Write-Warn2($msg) { Write-Host $msg -ForegroundColor Yellow }
function Write-Err2($msg)  { Write-Host $msg -ForegroundColor Red }

function Show-FatalAndExit($lines) {
    Write-Host ""
    Write-Err2 "======================================================"
    foreach ($l in $lines) { Write-Err2 $l }
    Write-Err2 "======================================================"
    Write-Host ""
    Write-Host "이 창은 닫아도 되지만, 문제를 해결한 뒤 AI전략회의실.bat 을 다시 실행해주세요."
    exit 1
}

# ---------------------------------------------------------------------
# 0) 프로그램 파일 확인
# ---------------------------------------------------------------------
Write-Info "[1/4] 프로그램 파일 확인 중..."
$requiredFiles = @(
    'index.html', 'css\style.css',
    'js\storage.js', 'js\file-parser.js', 'js\data-analyzer.js', 'js\experts.js',
    'js\ai-provider.js', 'js\report-builder.js', 'js\demo-data.js',
    'js\meeting-engine.js', 'js\app.js'
)
$missing = @()
foreach ($f in $requiredFiles) {
    $p = Join-Path $RootDir $f
    if (-not (Test-Path $p)) { $missing += $f }
}
if ($missing.Count -gt 0) {
    Show-FatalAndExit @(
        "[오류] 필요한 프로그램 파일이 없습니다.",
        "누락된 파일: $($missing -join ', ')",
        "ai-strategy-room 폴더 전체를 통째로 복사했는지 확인해주세요.",
        "(index.html만 따로 옮기면 동작하지 않습니다.)"
    )
}
Write-Ok "      OK"

# ---------------------------------------------------------------------
# 1) claude 명령 존재 확인
# ---------------------------------------------------------------------
Write-Info "[2/4] Claude Code 설치 확인 중..."
$claudeCmd = Get-Command claude -ErrorAction SilentlyContinue
if (-not $claudeCmd) {
    Show-FatalAndExit @(
        "[안내] Claude Code가 설치되어 있지 않습니다.",
        "최초 1회 설치가 필요합니다.",
        "",
        "같은 폴더의 '설치안내.txt' 파일을 열어 설치 방법을 확인해주세요.",
        "설치 후에는 새 터미널(또는 재부팅)에서 다시 이 프로그램을 실행해주세요."
    )
}
Write-Ok "      OK ($($claudeCmd.Source))"

# ---------------------------------------------------------------------
# 2) claude 정상 실행 가능한지 확인
# ---------------------------------------------------------------------
Write-Info "[3/4] Claude Code 상태 확인 중..."
try {
    $verOutput = & claude --version 2>&1
    if ($LASTEXITCODE -ne 0) { throw "exit code $LASTEXITCODE" }
} catch {
    Show-FatalAndExit @(
        "[오류] Claude Code 실행 중 문제가 발생했습니다.",
        "$_",
        "'설치안내.txt' 를 참고해 설치 상태를 확인해주세요."
    )
}

# 로그인 여부 확인 (claude auth status → JSON)
function Test-ClaudeLoggedIn {
    $raw = & claude auth status 2>&1 | Out-String
    try {
        $obj = $raw | ConvertFrom-Json
        return [bool]($obj -and $obj.loggedIn)
    } catch { return $false }
}

if (-not (Test-ClaudeLoggedIn)) {
    # 사용자가 직접 터미널에 명령을 입력할 필요가 없도록, 로그인 명령을 이 스크립트가
    # 대신 실행한다 — 사용자는 잠시 후 뜨는 브라우저 창에서 "로그인/승인"만 누르면 된다.
    Write-Info "[안내] Claude 로그인이 필요합니다. 잠시 후 브라우저 창이 자동으로 열립니다."
    Write-Info "       브라우저에서 로그인/승인만 해주시면 자동으로 이어집니다. (이 창은 그대로 두세요)"
    Write-Host ""

    try {
        & claude auth login --claudeai 2>&1 | ForEach-Object { Write-Host "       $_" }
    } catch {
        # 명령 실행 자체가 실패해도 아래에서 재확인 후 공통 오류 처리로 넘어간다
    }

    Write-Host ""
    Write-Info "       로그인 완료 여부를 확인하는 중..."

    # 브라우저 승인이 창을 닫자마자 반영되지 않는 경우를 대비해 몇 초 간격으로 재확인한다.
    $loggedIn = $false
    for ($i = 0; $i -lt 10; $i++) {
        if (Test-ClaudeLoggedIn) { $loggedIn = $true; break }
        Start-Sleep -Seconds 2
    }

    if (-not $loggedIn) {
        Show-FatalAndExit @(
            "[오류] 로그인을 확인하지 못했습니다.",
            "",
            "브라우저에서 로그인 승인을 완료하지 않았거나, 창을 닫으셨을 수 있습니다.",
            "AI전략회의실.bat 을 다시 실행해 로그인을 다시 시도해주세요.",
            "",
            "* 참고: Claude 구독 계정으로 로그인하면 별도 API 과금 없이 사용됩니다."
        )
    }
    Write-Ok "      OK (로그인 완료)"
} else {
    Write-Ok "      OK (로그인 계정으로 연결됨)"
}

# ---------------------------------------------------------------------
# 3) 로컬 서버 시작
# ---------------------------------------------------------------------
Write-Info "[4/4] 로컬 서버 시작 중... ($BaseUrl)"

# --- claude -p 호출 헬퍼 -------------------------------------------------
function Invoke-ClaudeComplete {
    param(
        [string]$SystemText,
        [string]$UserText,
        [bool]$AllowWebSearch
    )

    $tempDir = Join-Path $env:TEMP 'ai-strategy-room'
    if (-not (Test-Path $tempDir)) { New-Item -ItemType Directory -Path $tempDir | Out-Null }
    $sysFile = Join-Path $tempDir ("sys-" + [guid]::NewGuid().ToString('N') + ".txt")

    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($sysFile, $SystemText, $utf8NoBom)

    try {
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = $claudeCmd.Source
        $argParts = @(
            '-p',
            '--output-format', 'json',
            '--system-prompt-file', $sysFile,
            '--no-session-persistence'
        )
        if ($AllowWebSearch) {
            $argParts += @('--allowedTools', 'WebSearch,WebFetch')
        } else {
            $argParts += @('--tools', '')
        }
        # ProcessStartInfo.Arguments 는 문자열 하나이므로 각 인자를 안전하게 따옴표 처리한다
        $psi.Arguments = ($argParts | ForEach-Object {
            if ($_ -eq '') { '""' } else { '"' + ($_ -replace '"', '""') + '"' }
        }) -join ' '
        $psi.RedirectStandardInput = $true
        $psi.RedirectStandardOutput = $true
        $psi.RedirectStandardError = $true
        $psi.StandardOutputEncoding = [System.Text.Encoding]::UTF8
        $psi.StandardErrorEncoding = [System.Text.Encoding]::UTF8
        $psi.UseShellExecute = $false
        $psi.CreateNoWindow = $true

        # stdout/stderr를 동시에 비동기로 읽는다 (둘 중 하나만 순서대로 ReadToEnd 하면
        # 다른 쪽 버퍼가 가득 찼을 때 서로 멈춰버리는 교착상태가 생길 수 있어 이렇게 처리한다)
        $proc = New-Object System.Diagnostics.Process
        $proc.StartInfo = $psi
        $outSb = New-Object System.Text.StringBuilder
        $errSb = New-Object System.Text.StringBuilder
        $outAction = { if ($null -ne $EventArgs.Data) { [void]$Event.MessageData.AppendLine($EventArgs.Data) } }
        $outSub = Register-ObjectEvent -InputObject $proc -EventName OutputDataReceived -Action $outAction -MessageData $outSb
        $errSub = Register-ObjectEvent -InputObject $proc -EventName ErrorDataReceived -Action $outAction -MessageData $errSb

        [void]$proc.Start()
        $proc.BeginOutputReadLine()
        $proc.BeginErrorReadLine()

        $writer = New-Object System.IO.StreamWriter($proc.StandardInput.BaseStream, $utf8NoBom)
        $writer.Write($UserText)
        $writer.Flush()
        $writer.Close()

        $timeoutMs = if ($AllowWebSearch) { 240000 } else { 180000 }  # 웹검색 라운드는 더 오래 걸릴 수 있어 여유를 둠
        $finished = $proc.WaitForExit($timeoutMs)
        Unregister-Event -SourceIdentifier $outSub.Name -ErrorAction SilentlyContinue
        Unregister-Event -SourceIdentifier $errSub.Name -ErrorAction SilentlyContinue

        if (-not $finished) {
            try { $proc.Kill() } catch {}
            return @{ ok = $false; message = 'Claude 응답 시간이 너무 오래 걸려 중단했습니다. 잠시 후 다시 시도해주세요.' }
        }

        $stdout = $outSb.ToString()
        $stderr = $errSb.ToString()

        if ($proc.ExitCode -ne 0) {
            return @{ ok = $false; message = "Claude 실행 오류 (종료 코드 $($proc.ExitCode)): $stderr" }
        }

        $resultObj = $null
        try { $resultObj = $stdout | ConvertFrom-Json } catch {
            return @{ ok = $false; message = "Claude 응답을 해석하지 못했습니다: $stdout" }
        }

        if ($resultObj.is_error) {
            return @{ ok = $false; message = "Claude 오류: $($resultObj.result)" }
        }

        return @{ ok = $true; text = [string]$resultObj.result }
    } finally {
        Remove-Item $sysFile -ErrorAction SilentlyContinue
    }
}

# --- 정적 파일 MIME 매핑 -------------------------------------------------
$MimeMap = @{
    '.html' = 'text/html; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.js'   = 'text/javascript; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.svg'  = 'image/svg+xml'
    '.png'  = 'image/png'
    '.txt'  = 'text/plain; charset=utf-8'
}

function Send-Json($response, $statusCode, $obj) {
    $json = ($obj | ConvertTo-Json -Depth 10 -Compress)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $response.StatusCode = $statusCode
    $response.ContentType = 'application/json; charset=utf-8'
    $response.Headers.Add('Access-Control-Allow-Origin', '*')
    $response.ContentLength64 = $bytes.Length
    $response.OutputStream.Write($bytes, 0, $bytes.Length)
    $response.OutputStream.Close()
}

function Send-StaticFile($response, $path) {
    $safeRelative = $path.TrimStart('/').Replace('/', [System.IO.Path]::DirectorySeparatorChar)
    if ([string]::IsNullOrWhiteSpace($safeRelative)) { $safeRelative = 'index.html' }
    $fullPath = Join-Path $RootDir $safeRelative
    $fullPath = [System.IO.Path]::GetFullPath($fullPath)

    # 폴더 밖 경로 접근 차단
    if (-not $fullPath.StartsWith([System.IO.Path]::GetFullPath($RootDir))) {
        $response.StatusCode = 403
        $response.OutputStream.Close()
        return
    }
    if (-not (Test-Path $fullPath -PathType Leaf)) {
        $response.StatusCode = 404
        $response.OutputStream.Close()
        return
    }
    $ext = [System.IO.Path]::GetExtension($fullPath).ToLower()
    $mime = $MimeMap[$ext]
    if (-not $mime) { $mime = 'application/octet-stream' }
    $bytes = [System.IO.File]::ReadAllBytes($fullPath)
    $response.StatusCode = 200
    $response.ContentType = $mime
    $response.ContentLength64 = $bytes.Length
    $response.OutputStream.Write($bytes, 0, $bytes.Length)
    $response.OutputStream.Close()
}

# --- HTTP 리스너 시작 -----------------------------------------------------
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("$BaseUrl/")
try {
    $listener.Start()
} catch {
    Show-FatalAndExit @(
        "[오류] 로컬 서버($BaseUrl)를 시작하지 못했습니다.",
        "$_",
        "",
        "이미 AI전략회의실이 다른 창에서 실행 중일 수 있습니다 — 그 창을 확인해주세요.",
        "그래도 안 되면 PC를 재시작한 뒤 다시 시도해주세요."
    )
}

Write-Ok "      OK — 서버가 시작되었습니다."
Write-Host ""
Write-Ok "브라우저에서 AI 전략회의실을 엽니다..."
Start-Process $BaseUrl

Write-Host ""
Write-Host "----------------------------------------------------------"
Write-Host " AI 전략회의실이 실행 중입니다."
Write-Host " 이 창을 닫으면 프로그램이 종료됩니다 (브라우저는 데모 모드로 전환됩니다)."
Write-Host "----------------------------------------------------------"
Write-Host ""

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
    } catch {
        break
    }
    $request = $context.Request
    $response = $context.Response

    try {
        if ($request.HttpMethod -eq 'OPTIONS') {
            $response.Headers.Add('Access-Control-Allow-Origin', '*')
            $response.Headers.Add('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            $response.Headers.Add('Access-Control-Allow-Headers', 'Content-Type')
            $response.StatusCode = 204
            $response.OutputStream.Close()
            continue
        }

        if ($request.HttpMethod -eq 'GET' -and $request.Url.AbsolutePath -eq '/api/health') {
            Send-Json $response 200 @{ ok = $true }
            continue
        }

        if ($request.HttpMethod -eq 'POST' -and $request.Url.AbsolutePath -eq '/api/complete') {
            $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
            $bodyText = $reader.ReadToEnd()
            $reader.Close()

            $body = $null
            try { $body = $bodyText | ConvertFrom-Json } catch { $body = $null }

            if (-not $body -or -not $body.prompt) {
                Send-Json $response 400 @{ ok = $false; message = '잘못된 요청입니다 (prompt 누락).' }
                continue
            }

            Write-Info ("  · 회의 요청 처리 중" + ($(if ($body.webSearch) { ' (웹검색 포함)' } else { '' })) + "...")
            $result = Invoke-ClaudeComplete -SystemText ([string]$body.system) -UserText ([string]$body.prompt) -AllowWebSearch ([bool]$body.webSearch)

            if ($result.ok) {
                Send-Json $response 200 @{ ok = $true; text = $result.text }
            } else {
                Write-Warn2 ("    ! 실패: " + $result.message)
                Send-Json $response 200 @{ ok = $false; message = $result.message }
            }
            continue
        }

        if ($request.HttpMethod -eq 'GET') {
            Send-StaticFile $response $request.Url.AbsolutePath
            continue
        }

        $response.StatusCode = 404
        $response.OutputStream.Close()
    } catch {
        try {
            Send-Json $response 500 @{ ok = $false; message = "서버 내부 오류: $_" }
        } catch {}
    }
}

$listener.Stop()
