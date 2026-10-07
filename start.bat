@echo off
title نظام إدارة سيارات الأجرة
color 0A
echo.
echo  ========================================
echo   نظام إدارة سيارات الأجرة
echo  ========================================
echo.

echo  ايقاف نسخة ngrok السابقة ان وجدت...
taskkill /IM ngrok.exe /F >nul 2>&1
timeout /t 1 /nobreak > nul

echo  [1/3] تشغيل Backend...
start "Backend - Flask" cmd /k "cd /d F:\taxi-main\backend_new && python app.py"
timeout /t 3 /nobreak > nul

echo  [2/3] تشغيل Frontend...
start "Frontend - Vite" cmd /k "cd /d F:\taxi-main\frontend_new && npm run dev"
timeout /t 4 /nobreak > nul

echo  [3/3] تشغيل ngrok...  (الرابط المحلي: http://localhost:3600)
python F:\taxi-main\run_new.py

exit
