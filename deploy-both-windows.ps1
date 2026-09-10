# =============================================================
# deploy-both-windows.ps1
# Deploy LZGO + zhengbao.work on one Windows server without port conflicts.
# Public ports:
#   LZGO gateway: 80 / 443
# Internal port:
#   zhengbao.work app: 3002
# =============================================================
param(
    [string]$LzgoZip = "C:\deploy-package.zip",
    [string]$ZhengbaoZip = "C:\zhengbao-deploy.zip",
    [string]$LzgoDir = "C:\deploy-package",
    [string]$ZhengbaoDir = "C:\deploy-zhengbao",
    [switch]$InstallStartupTask,
    [switch]$OpenFirewall
)

$ErrorActionPreference = "Stop"

function Expand-CleanZip {
    param(
        [string]$ZipPath,
        [string]$Destination
    )

    if (-not (Test-Path $ZipPath)) {
        throw "Zip file not found: $ZipPath"
    }

    if (Test-Path $Destination) {
        Remove-Item -Path $Destination -Recurse -Force
    }
    New-Item -ItemType Directory -Path $Destination -Force | Out-Null
    Expand-Archive -Path $ZipPath -DestinationPath $Destination -Force
}

function Invoke-Health {
    param(
        [string]$Name,
        [string]$Url,
        [string]$HostHeader = ""
    )

    try {
        $args = @("-k", "-sS", "--max-time", "10")
        if ($HostHeader) {
            $args += @("-H", "Host: $HostHeader")
        }
        $args += $Url
        $result = & curl.exe @args
        Write-Host "  $Name OK: $result" -ForegroundColor Green
    } catch {
        Write-Host "  $Name FAILED: $($_.Exception.Message)" -ForegroundColor Red
        throw
    }
}

Write-Host "============================================" -ForegroundColor Cyan
Write-Host " Deploy LZGO + zhengbao.work" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

Write-Host "`n[1/5] Extracting packages..." -ForegroundColor Yellow
Expand-CleanZip -ZipPath $ZhengbaoZip -Destination $ZhengbaoDir
Expand-CleanZip -ZipPath $LzgoZip -Destination $LzgoDir

Write-Host "`n[2/5] Deploying zhengbao.work on internal port 3002..." -ForegroundColor Yellow
Push-Location $ZhengbaoDir
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\deploy-windows.ps1" -InstallStartupTask:$InstallStartupTask -StartApp
Pop-Location

Write-Host "`n[3/5] Deploying LZGO gateway on 80/443..." -ForegroundColor Yellow
Push-Location $LzgoDir
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\deploy-windows.ps1" -InstallStartupTask:$InstallStartupTask -OpenFirewall:$OpenFirewall
Pop-Location

Write-Host "`n[4/5] Waiting for services..." -ForegroundColor Yellow
Start-Sleep -Seconds 6

Write-Host "`n[5/5] Verifying routes..." -ForegroundColor Yellow
Invoke-Health -Name "zhengbao direct" -Url "http://127.0.0.1:3002/health"
Invoke-Health -Name "LZGO HTTP" -Url "http://127.0.0.1/health"
Invoke-Health -Name "LZGO HTTPS" -Url "https://127.0.0.1/health"
Invoke-Health -Name "zhengbao HTTPS proxy" -Url "https://127.0.0.1/health" -HostHeader "zhengbao.work"

Write-Host "`nDeployment complete." -ForegroundColor Green
Write-Host "Public access:" -ForegroundColor White
Write-Host "  https://luzhougo.cn" -ForegroundColor White
Write-Host "  https://zhengbao.work" -ForegroundColor White
