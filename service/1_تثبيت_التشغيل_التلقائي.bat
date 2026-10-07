@echo off
chcp 65001 >nul
echo Installing background auto-start (administrator rights required)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -NoExit -File \"%~dp0install_autostart.ps1\"'"
