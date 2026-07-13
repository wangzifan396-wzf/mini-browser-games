[CmdletBinding()]
param(
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$serverFile = Join-Path $projectRoot "backend\server.mjs"
$gameUrl = "http://127.0.0.1:25555"
$healthUrl = "$gameUrl/api/health"
$refreshRate = 60
try {
  $detectedRefresh = Get-CimInstance Win32_VideoController -ErrorAction Stop |
    Where-Object { $_.CurrentRefreshRate -ge 60 } |
    Measure-Object -Property CurrentRefreshRate -Maximum |
    Select-Object -ExpandProperty Maximum
  if ($detectedRefresh) { $refreshRate = [Math]::Min(240, [Math]::Max(60, [int]$detectedRefresh)) }
} catch {}
$launchUrl = "$gameUrl/?refresh=$refreshRate"
$runtimeRoot = Join-Path $env:LOCALAPPDATA "StarforgeNexus"
$logRoot = Join-Path $runtimeRoot "logs"
$profileRoot = Join-Path $runtimeRoot "EdgeProfile"
$pidFile = Join-Path $runtimeRoot "server.pid"

function Test-BallArenaServer {
  try {
    $health = Invoke-RestMethod -UseBasicParsing -Uri $healthUrl -TimeoutSec 1
    return $health.ok -eq $true -and $health.name -eq "starforge-nexus"
  } catch {
    return $false
  }
}

function Find-EdgeBrowser {
  $candidates = @(
    (Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe"),
    (Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe"),
    (Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe")
  )
  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) { return $candidate }
  }
  return $null
}

try {
  New-Item -ItemType Directory -Force -Path $runtimeRoot, $logRoot | Out-Null

  if (-not (Test-BallArenaServer)) {
    $listener = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 25555 -State Listen -ErrorAction SilentlyContinue
    if ($listener) {
      throw "Port 25555 is occupied by another process (PID $($listener.OwningProcess)). Close it and try again."
    }

    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $node) {
      throw "Node.js was not found. Install Node.js 20 or newer, then run start.cmd again."
    }
    if (-not (Test-Path -LiteralPath $serverFile)) {
      throw "Backend file is missing: $serverFile"
    }

    $stdoutLog = Join-Path $logRoot "server.stdout.log"
    $stderrLog = Join-Path $logRoot "server.stderr.log"
    $server = Start-Process `
      -FilePath $node.Source `
      -ArgumentList "`"$serverFile`"" `
      -WorkingDirectory $projectRoot `
      -WindowStyle Hidden `
      -RedirectStandardOutput $stdoutLog `
      -RedirectStandardError $stderrLog `
      -PassThru
    Set-Content -LiteralPath $pidFile -Value $server.Id -Encoding ASCII

    $ready = $false
    for ($attempt = 0; $attempt -lt 50; $attempt++) {
      if ($server.HasExited) { break }
      if (Test-BallArenaServer) {
        $ready = $true
        break
      }
      Start-Sleep -Milliseconds 200
    }

    if (-not $ready) {
      $detail = ""
      if (Test-Path -LiteralPath $stderrLog) {
        $detail = (Get-Content -LiteralPath $stderrLog -Tail 8 -ErrorAction SilentlyContinue) -join [Environment]::NewLine
      }
      throw "The backend did not start within 10 seconds. Log: $stderrLog`n$detail"
    }
    Write-Host "Local server started: $gameUrl" -ForegroundColor Green
  } else {
    $listener = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 25555 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($listener) { Set-Content -LiteralPath $pidFile -Value $listener.OwningProcess -Encoding ASCII }
    Write-Host "Local server is already running: $gameUrl" -ForegroundColor Green
  }

  if ($NoBrowser) {
    Write-Host "Server check completed (NoBrowser)."
    exit 0
  }

  $browser = Find-EdgeBrowser
  if ($browser) {
    New-Item -ItemType Directory -Force -Path $profileRoot | Out-Null
    $browserArguments = @(
      "--user-data-dir=`"$profileRoot`"",
      "--app=$launchUrl",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-mode",
      "--disable-session-crashed-bubble",
      "--force_high_performance_gpu",
      "--force-high-performance-gpu",
      "--use-angle=d3d11",
      "--enable-gpu-rasterization",
      "--enable-zero-copy",
      "--ignore-gpu-blocklist"
    )
    Start-Process -FilePath $browser -ArgumentList $browserArguments | Out-Null
    Write-Host "Game opened in a dedicated browser process with high-performance RTX GPU flags." -ForegroundColor Cyan
    Write-Host "Detected display refresh: $refreshRate Hz. The renderer targets up to 120 FPS."
    Write-Host "The top-left badge should show RTX 5070 Ti and live FPS."
  } else {
    Start-Process $launchUrl | Out-Null
    Write-Warning "Edge/Chrome was not found. The default browser may not select the discrete GPU."
  }
  exit 0
} catch {
  Write-Host "Starforge Nexus launch failed:" -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  exit 1
}
