#!/usr/bin/env bash
# تحديث الشيفرة لاحقاً (بعد رفع حزمة جديدة) — قاعدة البيانات الحيّة لا تُمسّ
set -euo pipefail
APP=/opt/taxi
PKG="$(cd "$(dirname "$0")/.." && pwd)"
sudo cp -a "$APP/backend/registrations.db" "$APP/backups/before_update_$(date +%F_%H%M).db"
sudo find "$PKG/backend" -maxdepth 1 -mindepth 1 ! -name registrations.db ! -name config.local.json -exec cp -a {} "$APP/backend/" \;
sudo rm -rf "$APP/frontend" && sudo mkdir -p "$APP/frontend" && sudo cp -a "$PKG/frontend/." "$APP/frontend/"
sudo chown -R taxi:taxi "$APP"
sudo chmod -R u+rwX "$APP"   # ملفات Windows قد تصل للقراءة فقط
sudo -u taxi "$APP/venv/bin/pip" install -q -r "$APP/backend/requirements-cloud.txt"
# حماية الملفات الحساسة: القاعدة والنسخ والإعدادات لا يقرؤها إلا حساب البرنامج
sudo chmod 700 "$APP/backups"
sudo chmod 600 "$APP/backend/registrations.db" "$APP/backend/config.local.json" 2>/dev/null || true
sudo chmod 600 "$APP/backend/gemini_key" "$APP/backend/claude_key" 2>/dev/null || true
sudo systemctl restart taxi
# إعداد Caddy (رؤوس الأمان) — النطاق يُقرأ من الملف الحالي
SITE=/etc/caddy/centres/taxi-platform.caddy
if [ -f "$SITE" ]; then
  DOMAIN="$(awk 'NF && $1 !~ /^#/ {print $1; exit}' "$SITE")"
  [ -n "$DOMAIN" ] && bash "$PKG/deploy/caddy_site.sh" "$DOMAIN" 8901 "$APP" || true
fi
echo "✅ تم التحديث"
