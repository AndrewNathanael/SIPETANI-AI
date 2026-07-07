@echo off
title SIPETANI — Backend API
color 0A
echo.
echo  ============================================
echo   SIPETANI — Backend FastAPI (Port 8000)
echo  ============================================
echo.

cd /d "%~dp0backend"

:: Cek apakah venv ada
if not exist "venv\Scripts\activate.bat" (
    echo [ERROR] Virtual environment tidak ditemukan di backend\venv
    echo         Jalankan: python -m venv venv
    echo         Lalu: venv\Scripts\pip install -r requirements.txt
    pause
    exit /b 1
)

:: Cek apakah model ada
if not exist "model_sipetani.pt" (
    if not exist "yolov8n.pt" (
        echo [WARN] Model belum tersedia. Backend akan mendownload yolov8n.pt...
    ) else (
        echo [OK] Menggunakan yolov8n.pt (model default)
    )
) else (
    echo [OK] Menggunakan model_sipetani.pt (custom plant disease model)
)

echo.
echo [INFO] Mengaktifkan virtual environment...
call venv\Scripts\activate.bat

echo [INFO] Menjalankan uvicorn di http://localhost:8080
echo [INFO] Tekan Ctrl+C untuk menghentikan server
echo.

uvicorn main:app --host 0.0.0.0 --port 8080 --reload --log-level info

if errorlevel 1 (
    echo.
    echo [ERROR] Server gagal dijalankan. Cek log di atas.
    pause
)
