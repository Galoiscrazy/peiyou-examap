@echo off
chcp 65001 >nul 2>&1
title Physics Exam Map

echo.
echo  ========================================
echo    Physics Exam Map - Knowledge System
echo  ========================================
echo.

:: Switch to script directory
cd /d "%~dp0"
echo  Directory: %cd%
echo.

:: Step 1: Find Node.js
set "NODE_CMD=node"
set "NPM_CMD=npm"

where node >nul 2>&1
if %errorlevel% neq 0 (
    if exist "C:\Programs\Tools\NodeJs\node.exe" (
        set "NODE_CMD=C:\Programs\Tools\NodeJs\node.exe"
        set "NPM_CMD=C:\Programs\Tools\NodeJs\npm.cmd"
    ) else if exist "C:\Program Files\nodejs\node.exe" (
        set "NODE_CMD=C:\Program Files\nodejs\node.exe"
        set "NPM_CMD=C:\Program Files\nodejs\npm.cmd"
    ) else (
        echo  [ERROR] Node.js not found
        echo  Please install: https://nodejs.org/
        echo.
        pause
        exit /b 1
    )
)

echo  [OK] Node.js found
echo.

:: Step 2: Install dependencies
if not exist "node_modules\next" (
    echo  [1/3] Installing dependencies...
    call %NPM_CMD% install
    if %errorlevel% neq 0 (
        echo.
        echo  [ERROR] Install failed
        pause
        exit /b 1
    )
    echo  [1/3] Done
    echo.
) else (
    echo  [1/3] Dependencies ready
)

:: Step 3: Import database
if not exist "data\physics.db" (
    echo  [2/3] Importing knowledge points from Excel...
    %NODE_CMD% data\import-excel.mjs
    if %errorlevel% neq 0 (
        echo.
        echo  [ERROR] Import failed
        pause
        exit /b 1
    )
    echo  [2/3] Done
    echo.
) else (
    echo  [2/3] Database ready
)

:: Step 4: Clean old build cache
if exist ".next" (
    echo  [CLEAN] Removing old build cache...
    rmdir /s /q ".next" >nul 2>&1
)

:: Step 5: Kill old process on port 3210
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3210 " ^| findstr "LISTENING" 2^>nul') do (
    echo  [CLEAN] Killing old process on port 3210 (PID: %%a)
    taskkill /F /PID %%a >nul 2>&1
)

:: Step 6: Start server
echo  [3/3] Starting server...
echo.
echo  ----------------------------------------
echo    URL: http://localhost:3210
echo    Close this window to stop server
echo  ----------------------------------------
echo.

:: Open browser after delay
start "" cmd /c "timeout /t 10 /nobreak >nul && start http://localhost:3210"

:: Start Next.js (foreground)
call %NPM_CMD% run dev

:: Keep window open if server exits
echo.
echo  Server stopped.
pause
