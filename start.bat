@echo off
setlocal EnableDelayedExpansion
echo ========================================
echo    StudyAI - Adaptive Study Coach
echo ========================================
echo.
set "ROOT=%~dp0"

if exist "%ROOT%.env.local" (
  echo Loading local environment from .env.local...
  for /f "usebackq tokens=1,* delims==" %%A in ("%ROOT%.env.local") do (
    if not "%%A"=="" (
      if /i not "%%A"=="REM" (
        set "VAR_NAME=%%A"
        if not "!VAR_NAME:~0,1!"=="#" set "%%A=%%B"
      )
    )
  )
)

echo Starting backend server in a new window...
start "StudyAI Backend" cmd /k "cd /d \"%ROOT%backend\" && python app.py"

echo Waiting for backend to initialize...
timeout /t 3 /nobreak > nul

echo Starting frontend dev server in a new window...
start "StudyAI Frontend" cmd /k "cd /d \"%ROOT%frontend\" && npm.cmd run dev"

echo.
echo ========================================
echo Both servers starting!
echo.
echo Backend: http://localhost:5000
echo Frontend: http://localhost:5173
echo ========================================
echo.
echo Opening browser in 5 seconds...
timeout /t 5 /nobreak > nul
start http://localhost:5173
endlocal
