<#
  Starts both halves of Tijify:
    - the Python CV service (cv/main.py) over its own venv
    - the Electron/React app (app/) in dev mode

  Each runs in its own PowerShell window so you can watch both logs and
  press Q / Ctrl+C in either independently.

  Usage:
    ./run.ps1                # camera index 1 (external webcam, per cv/README.md)
    ./run.ps1 -Camera 0      # laptop webcam, or whichever index works on your machine
#>

param(
    [int]$Camera = 1
)

$root = $PSScriptRoot
$cvPython = Join-Path $root "cv\.venv\Scripts\python.exe"

if (-not (Test-Path $cvPython)) {
    Write-Error "CV venv not found at $cvPython. Set it up first: python -m venv cv/.venv; cv/.venv/Scripts/python -m pip install -r cv/requirements.txt"
    exit 1
}
if (-not (Test-Path (Join-Path $root "app\node_modules"))) {
    Write-Error "app/node_modules not found. Run 'npm install' inside app/ first."
    exit 1
}

Write-Host "Starting CV service (camera $Camera)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "Set-Location '$root'; & '$cvPython' cv\main.py --camera $Camera"
)

Write-Host "Starting Electron app (npm run dev)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "Set-Location '$root\app'; npm run dev"
)

Write-Host "Both started in separate windows. CV: ws://localhost:8765, video: http://localhost:8766/video_feed" -ForegroundColor Green
