@echo off
title SIPETANI — Full Stack Launcher
color 0E
echo.
echo  ============================================
echo   SIPETANI — Full Stack Launcher
echo   Backend (8080) + Frontend (3000)
echo  ============================================
echo.

echo [INFO] Membuka Backend di window baru...
start "SIPETANI Backend" cmd /k "call %~dp0start_backend.bat"

:: Tunggu sebentar agar backend mulai loading
echo [INFO] Menunggu backend siap (5 detik)...
timeout /t 5 /nobreak > nul

echo [INFO] Membuka Frontend di window baru...
start "SIPETANI Frontend" cmd /k "call %~dp0start_frontend.bat"

echo.
echo  ============================================
echo   Kedua service sedang berjalan!
echo   Backend  : http://localhost:8080
echo   Frontend : http://localhost:3000
echo   API Docs : http://localhost:8080/docs
echo  ============================================
echo.
echo  Tutup kedua window terminal untuk menghentikan.
echo.
pause
