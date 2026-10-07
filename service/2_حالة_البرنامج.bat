@echo off
chcp 65001 >nul
title Taxi platform status
echo === Public link ===
type "%~dp0..\current-url.txt"
echo.
echo.
echo === Last supervisor events ===
powershell -NoProfile -Command "Get-Content -Tail 15 -Encoding UTF8 \"%~dp0..\logs\supervisor.log\""
echo.
schtasks /Query /TN TaxiPlatform /FO LIST | findstr /i "Status"
start "" http://localhost:3600
pause
