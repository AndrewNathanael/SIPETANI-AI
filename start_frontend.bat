@echo off
title SIPETANI — Frontend Next.js
color 0B
echo.
echo  ============================================
echo   SIPETANI — Frontend Next.js (Port 3000)
echo  ============================================
echo.

cd /d "%~dp0frontend"

:: Cek apakah node_modules ada
if not exist "node_modules" (
    echo [INFO] node_modules belum ada. Menjalankan npm install...
    npm install
    if errorlevel 1 (
        echo [ERROR] npm install gagal!
        pause
        exit /b 1
    )
)

echo [INFO] Menjalankan Next.js dev server di http://localhost:3000
echo [INFO] Tekan Ctrl+C untuk menghentikan server
echo.

npm run dev

if errorlevel 1 (
    echo.
    echo [ERROR] Frontend gagal dijalankan. Cek log di atas.
    pause
)
