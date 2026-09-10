# =============================================================
# run-deploy-server.ps1
# Start / Stop / Restart / Status for zhengbao.work portfolio app
# Usage:
#   .\run-deploy-server.ps1 -Start
#   .\run-deploy-server.ps1 -Stop
#   .\run-deploy-server.ps1 -Restart
#   .\run-deploy-server.ps1 -Status
# =============================================================
param(
    [switch]$Start,
    [switch]$Stop,
    [switch]$Restart,
    [switch]$Status
)

$DeployDir = "C:\deploy-zhengbao"
$AppPort = 3002
$AppName = "zhengbao-portfolio"
$LogDir = Join-Path $DeployDir "logs"
$LogFile = Join-Path $LogDir "server.log"
$ErrFile = Join-Path $LogDir "server-error.log"
$PidFile = Join-Path $LogDir "server.pid"
$NodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $NodeExe) {
    # Try common install paths for SYSTEM account
    $candidates = @(
        "C:\Program Files\nodejs\node.exe",
        "C:\Program Files (x86)\nodejs\node.exe"
    )
    $found = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
    if ($found) { $NodeExe = $found }
}
if (-not $NodeExe) {
    Write-Host "ERROR: node.exe not found. Install Node.js or add to system PATH." -ForegroundColor Red
    exit 1
}

# Ensure log directory exists
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

# ---- Helper: Find process by PID file ----
function Get-AppProcess {
    if (Test-Path $PidFile) {
        $savedPid = (Get-Content $PidFile -Raw).Trim()
        if ($savedPid -match '^\d+$') {
            try {
                $proc = Get-Process -Id ([int]$savedPid) -ErrorAction SilentlyContinue
                if ($proc) { return $proc }
            } catch { }
        }
    }
    # Fallback: find by port
    $conn = Get-NetTCPConnection -LocalPort $AppPort -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn) {
        try {
            return Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
        } catch { }
    }
    return $null
}

# ---- Helper: Start the app ----
function Start-App {
    $existing = Get-AppProcess
    if ($existing) {
        Write-Host "App is already running (PID: $($existing.Id), Port: $AppPort)" -ForegroundColor Yellow
        return
    }

    Write-Host "Starting $AppName on port $AppPort..." -ForegroundColor Cyan

    # Ensure we are in the deploy directory
    Set-Location $DeployDir

    # Verify server file exists
    $ServerFile = Join-Path $DeployDir "server\server.cjs"
    if (-not (Test-Path $ServerFile)) {
        Write-Host "ERROR: $ServerFile not found" -ForegroundColor Red
        exit 1
    }

    # Use cmd /c to set env vars isolated from current PowerShell session,
    # preventing PORT=3002 from leaking to luzhougo via inherited env.
    $cmdArgs = "/c `"set NODE_ENV=production&&set PORT=$AppPort&&`"$NodeExe`" `"$ServerFile`"`""
    $proc = Start-Process -FilePath "cmd.exe" `
        -ArgumentList $cmdArgs `
        -WorkingDirectory $DeployDir `
        -NoNewWindow `
        -PassThru `
        -RedirectStandardOutput $LogFile `
        -RedirectStandardError $ErrFile

    # Save PID
    $proc.Id | Out-File -FilePath $PidFile -NoNewline

    # Wait a moment and verify it started
    Start-Sleep -Seconds 3
    $verify = Get-AppProcess
    if ($verify) {
        Write-Host "App started successfully (PID: $($verify.Id))" -ForegroundColor Green
        Write-Host "  Port: $AppPort" -ForegroundColor White
        Write-Host "  Log:  $LogFile" -ForegroundColor White
        Write-Host "  Health check: http://localhost:$AppPort/health" -ForegroundColor White
    } else {
        Write-Host "WARNING: Process started but health check failed. Check $LogFile" -ForegroundColor Yellow
        if (Test-Path $LogFile) {
            Write-Host "Last 5 log lines:" -ForegroundColor Gray
            Get-Content $LogFile -Tail 5 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
        }
    }
}

# ---- Helper: Stop the app ----
function Stop-App {
    $proc = Get-AppProcess
    if (-not $proc) {
        Write-Host "App is not running (no process found on port $AppPort)" -ForegroundColor Yellow
        if (Test-Path $PidFile) { Remove-Item $PidFile -Force }
        return
    }

    Write-Host "Stopping $AppName (PID: $($proc.Id))..." -ForegroundColor Cyan

    # Graceful stop first
    $proc.CloseMainWindow() | Out-Null
    Start-Sleep -Seconds 2

    if (-not $proc.HasExited) {
        Write-Host "  Force killing process..." -ForegroundColor Yellow
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    }

    # Verify port is freed
    Start-Sleep -Seconds 1
    $check = Get-NetTCPConnection -LocalPort $AppPort -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $check) {
        Write-Host "App stopped successfully" -ForegroundColor Green
    } else {
        Write-Host "WARNING: Port $AppPort still in use. Manual cleanup may be needed." -ForegroundColor Red
    }

    if (Test-Path $PidFile) { Remove-Item $PidFile -Force }
}

# ---- Helper: Show status ----
function Show-Status {
    $proc = Get-AppProcess
    if ($proc) {
        $cpu = [math]::Round($proc.CPU, 1)
        $mem = [math]::Round($proc.WorkingSet64 / 1MB, 1)
        Write-Host "============================================" -ForegroundColor Cyan
        Write-Host " $AppName - RUNNING" -ForegroundColor Green
        Write-Host "============================================" -ForegroundColor Cyan
        Write-Host "  PID:       $($proc.Id)" -ForegroundColor White
        Write-Host "  Port:      $AppPort" -ForegroundColor White
        Write-Host "  CPU:       ${cpu}s" -ForegroundColor White
        Write-Host "  Memory:    ${mem} MB" -ForegroundColor White
        Write-Host "  Started:   $($proc.StartTime)" -ForegroundColor White
        Write-Host "  Directory: $DeployDir" -ForegroundColor White
        Write-Host "  Log:       $LogFile" -ForegroundColor White

        # Quick health check
        try {
            $health = Invoke-RestMethod -Uri "http://localhost:$AppPort/health" -TimeoutSec 3 -ErrorAction Stop
            Write-Host "  Health:    $($health.status) - OK" -ForegroundColor Green
        } catch {
            Write-Host "  Health:    NOT RESPONDING" -ForegroundColor Red
        }

        Write-Host "============================================" -ForegroundColor Cyan
    } else {
        Write-Host "============================================" -ForegroundColor Cyan
        Write-Host " $AppName - STOPPED" -ForegroundColor Red
        Write-Host "============================================" -ForegroundColor Cyan
        Write-Host "  Port $AppPort is not in use" -ForegroundColor White
        Write-Host "  Directory: $DeployDir" -ForegroundColor White
        if (Test-Path $LogFile) {
            Write-Host "  Last 3 log lines:" -ForegroundColor Gray
            Get-Content $LogFile -Tail 3 | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
        }
        Write-Host "============================================" -ForegroundColor Cyan
    }
}

# ---- Dispatch ----
switch ($true) {
    $Start   { Start-App }
    $Stop    { Stop-App }
    $Restart { Stop-App; Start-Sleep -Seconds 2; Start-App }
    $Status  { Show-Status }
    default {
        Write-Host "Usage: .\run-deploy-server.ps1 -Start | -Stop | -Restart | -Status" -ForegroundColor White
        Write-Host "`nExamples:" -ForegroundColor Gray
        Write-Host "  .\run-deploy-server.ps1 -Start     # Start the app in background" -ForegroundColor Gray
        Write-Host "  .\run-deploy-server.ps1 -Stop      # Stop the running app" -ForegroundColor Gray
        Write-Host "  .\run-deploy-server.ps1 -Restart   # Restart the app" -ForegroundColor Gray
        Write-Host "  .\run-deploy-server.ps1 -Status    # Check if app is running" -ForegroundColor Gray
        Write-Host "`nCurrent status:" -ForegroundColor White
        Show-Status
    }
}
