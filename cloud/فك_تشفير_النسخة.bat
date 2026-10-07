@echo off
chcp 65001 >nul
REM فك تشفير نسخة قاعدة البيانات المنزّلة من الخادم السحابي (*.db.enc)
REM يستعمل openssl المرفق مع Git for Windows
setlocal
set "OSSL=C:\Program Files\Git\usr\bin\openssl.exe"
if not exist "%OSSL%" set "OSSL=openssl"
if "%~1"=="" (
  echo اسحب ملف .db.enc وأفلته فوق هذا الملف، أو:
  echo    فك_تشفير_النسخة.bat taxi_db_XXXX.db.enc
  pause & exit /b 1
)
set "IN=%~1"
set "OUT=%~dpn1"
"%OSSL%" enc -d -aes-256-cbc -pbkdf2 -iter 300000 -in "%IN%" -out "%OUT%"
if errorlevel 1 ( echo فشل فك التشفير — تحقق من كلمة السر & pause & exit /b 1 )
echo تم: %OUT%
pause
