# =============================================================
# build-deploy-package.ps1
# Build and package the zhengbao.work portfolio app for deployment
# Output: zhengbao-deploy/ folder and zhengbao-deploy.zip
# =============================================================
param(
    [switch]$SkipBuild,
    [switch]$SkipZip
)

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot
$PackageDir = Join-Path $ProjectRoot "zhengbao-deploy"
$ZipFile = Join-Path $ProjectRoot "zhengbao-deploy.zip"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host " Build Deploy Package - zhengbao.work" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# ---- 1. Build project ----
if (-not $SkipBuild) {
    Write-Host "`n[1/4] Installing dependencies..." -ForegroundColor Yellow
    npm install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "npm install failed" }

    Write-Host "`n[2/4] Building project (vite + esbuild)..." -ForegroundColor Yellow
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm build failed" }

    Write-Host "  Build complete: dist/server.cjs + dist/assets/*" -ForegroundColor Green
} else {
    Write-Host "`n[1/4] Skipping build (--SkipBuild)" -ForegroundColor DarkYellow
    Write-Host "  [2/4] Skipping build" -ForegroundColor DarkYellow
}

# ---- 3. Prepare deploy package directory ----
Write-Host "`n[3/4] Preparing zhengbao-deploy/..." -ForegroundColor Yellow

if (Test-Path $PackageDir) {
    Remove-Item -Recurse -Force $PackageDir
}
New-Item -ItemType Directory -Path $PackageDir -Force | Out-Null

# Copy dist/ (built frontend)
Write-Host "  Copying dist/..." -ForegroundColor Gray
Copy-Item -Recurse -Path (Join-Path $ProjectRoot "dist") -Destination (Join-Path $PackageDir "dist")

# Copy server/ (bundled server)
Write-Host "  Copying server/..." -ForegroundColor Gray
Copy-Item -Recurse -Path (Join-Path $ProjectRoot "server") -Destination (Join-Path $PackageDir "server")

# Copy package.json (needed for npm install --production on server)
Write-Host "  Copying package.json..." -ForegroundColor Gray
Copy-Item -Path (Join-Path $ProjectRoot "package.json") -Destination (Join-Path $PackageDir "package.json")

# Copy deploy scripts
Write-Host "  Copying deploy scripts..." -ForegroundColor Gray
Copy-Item -Path (Join-Path $ProjectRoot "deploy-windows.ps1") -Destination (Join-Path $PackageDir "deploy-windows.ps1") -ErrorAction SilentlyContinue
Copy-Item -Path (Join-Path $ProjectRoot "run-deploy-server.ps1") -Destination (Join-Path $PackageDir "run-deploy-server.ps1") -ErrorAction SilentlyContinue

# Certificates are intentionally NOT copied here.
# TLS termination and SNI moved to the standalone gateway project
# (zhang-zheng-bao/gateway), which owns the only authoritative cert set.
# This app is reached through that gateway on port 3002.

# Copy .env template (NOT the real .env with secrets)
Write-Host "  Copying .env template..." -ForegroundColor Gray
if (Test-Path (Join-Path $ProjectRoot ".env.deploy")) {
    Copy-Item -Path (Join-Path $ProjectRoot ".env.deploy") -Destination (Join-Path $PackageDir ".env")
}

Write-Host "  Package directory ready: $PackageDir" -ForegroundColor Green

# ---- 4. Create ZIP archive ----
if (-not $SkipZip) {
    Write-Host "`n[4/4] Creating zhengbao-deploy.zip..." -ForegroundColor Yellow

    if (Test-Path $ZipFile) {
        Remove-Item -Force $ZipFile
    }

    Compress-Archive -Path "$PackageDir\*" -DestinationPath $ZipFile -Force

    $ZipSize = [math]::Round((Get-Item $ZipFile).Length / 1MB, 2)
    Write-Host "  Package created: $ZipFile ($ZipSize MB)" -ForegroundColor Green
} else {
    Write-Host "`n[4/4] Skipping ZIP (--SkipZip)" -ForegroundColor DarkYellow
}

Write-Host "`n============================================" -ForegroundColor Cyan
Write-Host " Build complete!" -ForegroundColor Green
Write-Host " Deploy package: $PackageDir" -ForegroundColor Green
if (-not $SkipZip) {
    Write-Host " ZIP archive:    $ZipFile" -ForegroundColor Green
}
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "`nNext steps on the Windows Server:" -ForegroundColor White
Write-Host "  1. Copy zhengbao-deploy.zip to C:\deploy-zhengbao" -ForegroundColor White
Write-Host "  2. Extract and run: .\deploy-windows.ps1 -InstallStartupTask -StartApp" -ForegroundColor White
Write-Host "     Note: zhengbao.work is normally reached through the LZGO HTTPS proxy on 80/443, so opening port 3002 publicly is not required." -ForegroundColor White
