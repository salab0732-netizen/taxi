#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════
# تثبيت بيئة الاختبار (النسخة التجريبية) — مرة واحدة فقط
#   bash taxi-cloud/deploy/staging_setup.sh
# • نسخة منفصلة تماماً: /opt/taxi-test — قاعدة بيانات خاصة — منفذ 8902 — رابط taxi-test.…
# • لا تمسّ الإنتاج (/opt/taxi) ولا «كفاءة»
# • شريط «نسخة تجريبية» + علامة «غير صالحة» على كل الوثائق + لا رسائل SMS حقيقية
# ════════════════════════════════════════════════════════════
set -euo pipefail
PROD=/opt/taxi
APP=/opt/taxi-test
PORT=8902
PKG="$(cd "$(dirname "$0")/.." && pwd)"
PROD_SITE=/etc/caddy/centres/taxi-platform.caddy
[ -d "$PROD/backend" ] && [ -f "$PROD_SITE" ] || { echo "❌ ثبّت الإنتاج أولاً (setup.sh)"; exit 1; }
PROD_DOMAIN="$(awk 'NF && $1 !~ /^#/ {print $1; exit}' "$PROD_SITE")"
DOMAIN="${1:-$(echo "$PROD_DOMAIN" | sed 's/^taxi\./taxi-test./')}"
[ "$DOMAIN" != "$PROD_DOMAIN" ] || DOMAIN="test.$PROD_DOMAIN"
echo "==> رابط النسخة التجريبية: https://$DOMAIN"

echo "==> 1/6 الملفات"
sudo mkdir -p "$APP/backend" "$APP/frontend" "$APP/logs" "$APP/backups" "$APP/releases"
sudo find "$PKG/backend" -maxdepth 1 -mindepth 1 ! -name registrations.db ! -name config.local.json -exec cp -a {} "$APP/backend/" \;
sudo rm -rf "$APP/frontend" && sudo mkdir -p "$APP/frontend" && sudo cp -a "$PKG/frontend/." "$APP/frontend/"
sudo mkdir -p "$APP/backend/images"

echo "==> 2/6 الإعدادات (منسوخة من الإنتاج، بدون SMS حقيقي)"
sudo python3 - "$PROD/backend/config.local.json" "$APP/backend/config.local.json" "$DOMAIN" <<'PY'
import json, sys
src, dst, dom = sys.argv[1:4]
try: d = json.load(open(src, encoding="utf-8"))
except Exception: d = {}
d["FRONTEND_URL"] = f"https://{dom}"
d["GOOGLE_REDIRECT_URI"] = f"https://{dom}/api/auth/google/callback"
d["TAXI_ENV"] = "test"
for k in ("SMS_USERNAME", "SMS_PASSWORD"):
    d.pop(k, None)
json.dump(d, open(dst, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
PY
for k in gemini_key claude_key; do [ -f "$PROD/backend/$k" ] && sudo cp -a "$PROD/backend/$k" "$APP/backend/$k"; done
sudo chown -R taxi:taxi "$APP"
sudo chmod -R u+rwX "$APP"
sudo chmod 700 "$APP/backups"
sudo chmod 600 "$APP/backend/config.local.json" "$APP/backend/gemini_key" "$APP/backend/claude_key" 2>/dev/null || true

echo "==> 3/6 بيئة Python"
[ -x "$APP/venv/bin/python" ] || sudo -u taxi python3 -m venv "$APP/venv"
sudo -u taxi "$APP/venv/bin/pip" install -q --upgrade pip
sudo -u taxi "$APP/venv/bin/pip" install -q -r "$APP/backend/requirements-cloud.txt"

echo "==> 4/6 الخدمة taxi-test (منفذ $PORT)"
sudo tee /etc/systemd/system/taxi-test.service >/dev/null <<UNIT
[Unit]
Description=Taxi platform — TEST environment
After=network-online.target
Wants=network-online.target

[Service]
User=taxi
Group=taxi
WorkingDirectory=$APP/backend
Environment=PYTHONIOENCODING=utf-8
Environment=TAXI_ENV=test
ExecStart=$APP/venv/bin/gunicorn --workers 1 --threads 8 --timeout 180 --bind 127.0.0.1:$PORT app:app
Restart=always
RestartSec=3
MemoryMax=1G

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable --now taxi-test
sudo systemctl restart taxi-test

echo "==> 5/6 Caddy (HTTPS)"
bash "$PKG/deploy/caddy_site.sh" "$DOMAIN" "$PORT" "$APP" taxi-test

echo "==> 6/6 نسخ احتياطي يومي للنسخة التجريبية (7 أيام)"
sudo tee /etc/cron.d/taxi-test-backup >/dev/null <<CRON
45 2 * * * taxi sqlite3 $APP/backend/registrations.db ".backup '$APP/backups/db_\$(date +\%F).db'" && find $APP/backups -name 'db_*.db' -mtime +7 -delete
CRON
sudo chmod 644 /etc/cron.d/taxi-test-backup

sleep 3
ENV="$(curl -s http://127.0.0.1:$PORT/api/env || true)"
if echo "$ENV" | grep -q '"test": *true'; then
  echo "✅ النسخة التجريبية تعمل: https://$DOMAIN"
  echo "   أنشئ حساب إدارة لها:  bash taxi-cloud/deploy/admin_account.sh add test"
else
  echo "⚠️ تحقق: sudo journalctl -u taxi-test -n 50   ($ENV)"
fi
