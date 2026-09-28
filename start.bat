@echo off
rem ============================================================
rem   WB Supply Planner - local launcher (Windows)
rem ------------------------------------------------------------
rem   Usage: double-click this file
rem   Port:  set PORT=8080  then run start.bat
rem
rem   Text is kept ASCII-only on purpose: cmd.exe mangles
rem   non-ASCII characters on many Windows locales.
rem ============================================================

setlocal
cd /d "%~dp0"

if not defined PORT set "PORT=5500"
if not defined HOST set "HOST=127.0.0.1"

echo.
echo   WB Supply Planner
echo   -----------------------------------------

rem --- Data folder ------------------------------------------
if not exist "data" mkdir "data"
if not exist "data\app.db" (
    echo   No data\app.db found - an empty one will be created.
    echo   To keep your data, put your file at data\app.db first.
)

rem --- Detect Node.js major version -------------------------
set "NODE_MAJOR=0"
where node >nul 2>&1
if %errorlevel% equ 0 (
    for /f "delims=" %%v in ('node -p "process.versions.node.split('.')[0]" 2^>nul') do set "NODE_MAJOR=%%v"
)

if %NODE_MAJOR% geq 22 (
    echo   Server: Node.js
    echo   Open:   http://127.0.0.1:%PORT%
    echo   -----------------------------------------
    echo   Press Ctrl+C to stop.
    echo.
    node server\server.js
    goto :end
)

rem --- Fall back to Python ----------------------------------
where python >nul 2>&1
if %errorlevel% equ 0 (
    if %NODE_MAJOR% gtr 0 echo   Node.js is too old ^(22+ required^), using Python.
    echo   Server: Python
    echo   Open:   http://127.0.0.1:%PORT%
    echo   -----------------------------------------
    echo   Press Ctrl+C to stop.
    echo.
    python server\server.py
    goto :end
)

echo.
echo   Neither Node.js 22+ nor Python 3 was found.
echo   Install one of them:
echo     Node.js  - https://nodejs.org   ^(version 22 or newer^)
echo     Python 3 - https://python.org   ^(version 3.10 or newer^)
echo.
pause
exit /b 1

:end
echo.
echo   Server stopped.
pause
