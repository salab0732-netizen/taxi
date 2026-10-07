#!/usr/bin/env bash
# نسخة فورية مشفّرة من قاعدة البيانات لتنزيلها إلى حاسوبك
#   التشفير: AES-256 بكلمة سرّ تختارها الآن (لا تُحفظ في أي مكان — لا يمكن فتح الملف بدونها)
set -euo pipefail
TS="$(date +%F_%H%M)"
TMP="$(sudo -u taxi mktemp /opt/taxi/backups/.manual_XXXX.db)"
sudo -u taxi sqlite3 /opt/taxi/backend/registrations.db ".backup '$TMP'"
read -r -s -p "كلمة سرّ التشفير (10 أحرف على الأقل): " K1; echo
read -r -s -p "أعدها: " K2; echo
[ "$K1" = "$K2" ] || { sudo rm -f "$TMP"; echo "❌ غير متطابقتين"; exit 1; }
[ ${#K1} -ge 10 ] || { sudo rm -f "$TMP"; echo "❌ قصيرة"; exit 1; }
OUT="$HOME/taxi_db_$TS.db.enc"
sudo cat "$TMP" | TAXI_K="$K1" openssl enc -aes-256-cbc -pbkdf2 -iter 300000 -salt -pass env:TAXI_K -out "$OUT"
sudo rm -f "$TMP"
chmod 600 "$OUT"
echo "✅ النسخة المشفّرة: $OUT"
echo "   نزّلها من PowerShell على حاسوبك:"
echo "   scp -i C:\\KAFAA_Wallet\\ssh-key-a1.key ubuntu@kafaa-albayadh.duckdns.org:$(basename "$OUT") ."
echo "   ثم احذفها من الخادم:  rm ~/$(basename "$OUT")"
echo "   فكّ التشفير على حاسوبك: فك_تشفير_النسخة.bat"
