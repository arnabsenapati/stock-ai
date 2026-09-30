@echo off
setlocal enabledelayedexpansion

echo ========================================================
echo   Stock-AI Terminal - Windows Service Installer (NSSM)
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
    echo [ERROR] NSSM executable could not be found!
    echo Please make sure nssm.exe is located at C:\nssm-2.24\win64\nssm.exe or on PATH.
    pause
    exit /b 1
)

:: Locate Python
set "PYTHON_EXE=C:\Users\Arnab Senapati\AppData\Local\Programs\Python\Python314\python.exe"
if not exist "%PYTHON_EXE%" (
    for /f "tokens=*" %%i in ('where python 2^>nul') do (
        set "PYTHON_EXE=%%i"
        goto :found_python
    )
)
:found_python

if not exist "%PYTHON_EXE%" (
    echo [ERROR] Python executable could not be found!
    pause
    exit /b 1
)

set "SERVICE_NAME=StockAI"
set "APP_DIR=D:\SourceCode\stock-ai"
set "RUNNER_SCRIPT=%APP_DIR%\service_runner.py"
set "LOG_DIR=%APP_DIR%\logs"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

echo NSSM:    "%NSSM_EXE%"
echo Python:  "%PYTHON_EXE%"
echo App Dir: "%APP_DIR%"
echo Service: %SERVICE_NAME%
echo.

:: Stop and remove existing service if present
echo [1/4] Checking existing service status...
"%NSSM_EXE%" status %SERVICE_NAME% >nul 2>&1
if %errorlevel% equ 0 (
    echo Stopping and removing existing %SERVICE_NAME% service...
    "%NSSM_EXE%" stop %SERVICE_NAME% >nul 2>&1
    "%NSSM_EXE%" remove %SERVICE_NAME% confirm >nul 2>&1
)

:: Install new service
echo [2/4] Installing %SERVICE_NAME% service...
"%NSSM_EXE%" install %SERVICE_NAME% "%PYTHON_EXE%" "\"%RUNNER_SCRIPT%\""
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install service.
    pause
    exit /b %errorlevel%
)

:: Configure Service Parameters
echo [3/4] Configuring service parameters...
"%NSSM_EXE%" set %SERVICE_NAME% AppDirectory "%APP_DIR%"
"%NSSM_EXE%" set %SERVICE_NAME% DisplayName "AmiBroker Stock AI Terminal Service"
"%NSSM_EXE%" set %SERVICE_NAME% Description "Automated End-of-Day Indian Stock Market Terminal (FastAPI Backend + Next.js Frontend)"
"%NSSM_EXE%" set %SERVICE_NAME% Start SERVICE_AUTO_START
"%NSSM_EXE%" set %SERVICE_NAME% AppStdout "%LOG_DIR%\service_stdout.log"
"%NSSM_EXE%" set %SERVICE_NAME% AppStderr "%LOG_DIR%\service_stderr.log"
"%NSSM_EXE%" set %SERVICE_NAME% AppRotateFiles 1
"%NSSM_EXE%" set %SERVICE_NAME% AppRotateOnline 1
"%NSSM_EXE%" set %SERVICE_NAME% AppRotateSeconds 86400
"%NSSM_EXE%" set %SERVICE_NAME% AppRotateBytes 10485760

:: Start the Service
echo [4/4] Starting service %SERVICE_NAME%...
"%NSSM_EXE%" start %SERVICE_NAME%

echo.
echo ========================================================
echo   Service '%SERVICE_NAME%' installed and started successfully!
echo   - Backend:  http://127.0.0.1:8000
echo   - Frontend: http://localhost:3000
echo   - Logs:     %LOG_DIR%
echo ========================================================
echo.
timeout /t 5

