@echo off
echo ========================================================
echo   Launching AmiBroker-Class Indian EOD Stock Terminal
echo ========================================================
echo.

start "Stock-AI Backend (FastAPI)" cmd /k "python start_backend.py"
timeout /t 2 /nobreak >nul
start "Stock-AI Frontend (Next.js)" cmd /k "cd frontend && npm run dev"

echo Backend running on: http://127.0.0.1:8000
echo Frontend running on: http://localhost:3000
echo.
echo Opening browser...
timeout /t 3 /nobreak >nul
start http://localhost:3000
