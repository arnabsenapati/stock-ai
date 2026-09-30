@echo off
setlocal enabledelayedexpansion

echo ========================================================
echo   Stock-AI Terminal - Windows Service Uninstaller
echo ========================================================
echo.

:: Check for Administrator privileges
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Requesting Administrator privileges...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd.exe -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

:: Locate NSSM
set "NSSM_EXE=C:\nssm-2.24\win64\nssm.exe"
if not exist "%NSSM_EXE%" (
    for /f "tokens=*" %%i in ('where nssm 2^>nul') do set "NSSM_EXE=%%i"
)

if not exist "%NSSM_EXE%" (
    echo [ERROR] NSSM executable could not be found at C:\nssm-2.24\win64\nssm.exe or on PATH!
    pause
    exit /b 1
)

set "SERVICE_NAME=StockAI"

echo Stopping service %SERVICE_NAME%...
"%NSSM_EXE%" stop %SERVICE_NAME%

echo Removing service %SERVICE_NAME%...
"%NSSM_EXE%" remove %SERVICE_NAME% confirm

echo.
echo Service '%SERVICE_NAME%' has been stopped and uninstalled.
echo.
pause
