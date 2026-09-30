# Stock-AI Terminal - Windows Service Installer (PowerShell)
# Requires Administrator privileges

param(
    [string]$NssmPath = "C:\nssm-2.24\win64\nssm.exe",
    [string]$ServiceName = "StockAI"
)

# Ensure Elevation
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "[INFO] Script not running as Administrator. Requesting elevation..." -ForegroundColor Yellow
    Start-Process powershell.exe -ArgumentList ("-NoProfile -ExecutionPolicy Bypass -File `"{0}`"" -f $PSCommandPath) -Verb RunAs
    exit
}

$appDir = "D:\SourceCode\stock-ai"
$pythonExe = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $pythonExe) {
    $pythonExe = "C:\Users\Arnab Senapati\AppData\Local\Programs\Python\Python314\python.exe"
}

if (-not (Test-Path $NssmPath)) {
    $nssmCmd = (Get-Command nssm -ErrorAction SilentlyContinue).Source
    if ($nssmCmd) { $NssmPath = $nssmCmd }
    else {
        Write-Error "NSSM not found at $NssmPath or on PATH!"
        pause
        exit 1
    }
}

$runnerScript = Join-Path $appDir "service_runner.py"
$logsDir = Join-Path $appDir "logs"
if (-not (Test-Path $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
}

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  Stock-AI Terminal - Installing NSSM Windows Service   " -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "NSSM:    $NssmPath"
Write-Host "Python:  $pythonExe"
Write-Host "App Dir: $appDir"
Write-Host "Service: $ServiceName"

# Check if service already exists
$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Stopping and removing existing service $ServiceName..." -ForegroundColor Yellow
    & $NssmPath stop $ServiceName 2>$null | Out-Null
    & $NssmPath remove $ServiceName confirm 2>$null | Out-Null
    Start-Sleep -Seconds 2
}

# Install Service
Write-Host "Installing service $ServiceName..." -ForegroundColor Green
& $NssmPath install $ServiceName "$pythonExe" "`"$runnerScript`""

# Configure parameters
Write-Host "Configuring parameters..." -ForegroundColor Green
& $NssmPath set $ServiceName AppDirectory "$appDir"
& $NssmPath set $ServiceName DisplayName "AmiBroker Stock AI Terminal Service"
& $NssmPath set $ServiceName Description "Automated End-of-Day Indian Stock Market Terminal (FastAPI Backend + Next.js Frontend)"
& $NssmPath set $ServiceName Start SERVICE_AUTO_START
& $NssmPath set $ServiceName AppStdout (Join-Path $logsDir "service_stdout.log")
& $NssmPath set $ServiceName AppStderr (Join-Path $logsDir "service_stderr.log")
& $NssmPath set $ServiceName AppRotateFiles 1
& $NssmPath set $ServiceName AppRotateOnline 1
& $NssmPath set $ServiceName AppRotateSeconds 86400
& $NssmPath set $ServiceName AppRotateBytes 10485760

# Start Service
Write-Host "Starting service $ServiceName..." -ForegroundColor Green
& $NssmPath start $ServiceName

Write-Host "`nService $ServiceName installed and started successfully!" -ForegroundColor Green
Write-Host "Backend URL:  http://127.0.0.1:8000"
Write-Host "Frontend URL: http://localhost:3000"
Write-Host "Logs Path:    $logsDir`n"
