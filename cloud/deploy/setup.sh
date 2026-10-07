#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════
# تثبيت منصة سيارات الأجرة على خادم Oracle Cloud (Ubuntu 22.04/24.04 — ARM أو x86)
# الاستعمال:   bash deploy/setup.sh                       ← على خادم «كفاءة»: taxi.kafaa-albayadh.duckdns.org
#              bash deploy/setup.sh taxi.mondomaine.dz    ← نطاق آخر
# يتعايش مع «كفاءة» على نفس الآلة: منفذ خاص (8901) وملف Caddy مستقل — لا يُعدَّل إعداد كفاءة
# يمكن إعادة تشغيله بأمان: لا يمسّ قاعدة البيانات الحيّة إن كانت موجودة
# ════════════════════════════════════════════════════════════
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
APP=/opt/taxi
PORT=8901
PKG="$(cd "$(dirname "$0")/.." && pwd)"
DOMAIN="${1:-}"

echo "==> 1/8 الحزم الأساسية"
sudo apt-get update -y
sudo -E apt-get install -y python3 python3-venv python3-pip sqlite3 curl gnupg debian-keyring debian-archive-keyring apt-transport-https iptables-persistent || \
sudo -E apt-get install -y python3 python3-venv python3-pip sqlite3 curl gnupg debian-keyring debian-archive-keyring apt-transport-https

if [ -z "$DOMAIN" ]; then
  if grep -q "kafaa-albayadh.duckdns.org" /etc/caddy/Caddyfile 2>/dev/null; then
    DOMAIN="taxi.kafaa-albayadh.duckdns.org"
  else
    IP="$(curl -fsS https://api.ipify.org || curl -fsS https://ifconfig.me)"
    DOMAIN="taxi-$(echo "$IP" | tr . -).sslip.io"
  fi
fi
echo "    النطاق: $DOMAIN"

echo "==> 2/8 Caddy (HTTPS تلقائي)"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt-get update -y && sudo apt-get install -y caddy
fi

echo "==> 3/8 المستخدم والملفات"
id taxi >/dev/null 2>&1 || sudo useradd --system --create-home --home-dir /home/taxi --shell /usr/sbin/nologin taxi
sudo mkdir -p "$APP/backend" "$APP/frontend" "$APP/logs" "$APP/backups"
# الشيفرة تُحدَّث دائماً — قاعدة البيانات لا تُستبدل أبداً إن كانت موجودة
if [ -f "$APP/backend/registrations.db" ]; then
  echo "    قاعدة بيانات موجودة على الخادم — لن تُستبدل"
  sudo cp -a "$APP/backend/registrations.db" "$APP/backups/before_setup_$(date +%F_%H%M).db"
  sudo find "$PKG/backend" -maxdepth 1 -mindepth 1 ! -name registrations.db -exec cp -a {} "$APP/backend/" \;
else
  sudo cp -a "$PKG/backend/." "$APP/backend/"
fi
sudo rm -rf "$APP/frontend"; sudo mkdir -p "$APP/frontend"
sudo cp -a "$PKG/frontend/." "$APP/frontend/"
sudo mkdir -p "$APP/backend/images"

echo "==> 4/8 إعداد الروابط (Google / الواجهة)"
sudo python3 - "$APP/backend/config.local.json" "$DOMAIN" <<'PY'
import json, sys
p, dom = sys.argv[1], sys.argv[2]
try: d = json.load(open(p, encoding="utf-8"))
except Exception: d = {}
d["FRONTEND_URL"] = f"https://{dom}"
d["GOOGLE_REDIRECT_URI"] = f"https://{dom}/api/auth/google/callback"
json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
PY
sudo chown -R taxi:taxi "$APP"
sudo chmod 600 "$APP/backend/config.local.json" "$APP/backend/gemini_key" "$APP/backend/claude_key" 2>/dev/null || true

echo "==> 5/8 بيئة Python"
sudo -u taxi python3 -m venv "$APP/venv"
sudo -u taxi "$APP/venv/bin/pip" install --upgrade pip -q
sudo -u taxi "$APP/venv/bin/pip" install -q -r "$APP/backend/requirements-cloud.txt"

echo "==> 6/8 خدمة الخادم (تعمل دائماً وتُعاد تلقائياً)"
sudo tee /etc/systemd/system/taxi.service >/dev/null <<UNIT
[Unit]
Description=Taxi platform backend (Flask/Gunicorn)
After=network-online.target
Wants=network-online.target

[Service]
User=taxi
Group=taxi
WorkingDirectory=$APP/backend
Environment=PYTHONIOENCODING=utf-8
ExecStart=$APP/venv/bin/gunicorn --workers 1 --threads 8 --timeout 180 --bind 127.0.0.1:$PORT app:app
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable --now taxi
sudo systemctl restart taxi

echo "==> 7/8 Caddy + جدار الحماية"
# ملف موقع مستقل — لا نلمس Caddyfile الخاص بكفاءة (يستورد /etc/caddy/centres/*.caddy)
SITE_DIR=/etc/caddy/centres
sudo mkdir -p "$SITE_DIR"
if [ ! -f /etc/caddy/Caddyfile ] || ! grep -q "import /etc/caddy/centres/\*.caddy" /etc/caddy/Caddyfile; then
  echo "import /etc/caddy/centres/*.caddy" | sudo tee -a /etc/caddy/Caddyfile >/dev/null
fi
sudo tee "$SITE_DIR/taxi-platform.caddy" >/dev/null <<CADDY
$DOMAIN {
    encode gzip
    request_body {
        max_size 40MB
    }
    handle /api/* {
        reverse_proxy 127.0.0.1:$PORT
    }
    handle {
        root * $APP/frontend
        try_files {path} /index.html
        file_server
    }
    header {
        Strict-Transport-Security "max-age=31536000"
        X-Content-Type-Options nosniff
        Referrer-Policy strict-origin-when-cross-origin
    }
}
CADDY
if ! sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
  echo "❌ خطأ في إعداد Caddy — أُزيل ملف البرنامج حتى لا يتأثر موقع كفاءة"
  sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile 2>&1 | tail -5
  sudo rm -f "$SITE_DIR/taxi-platform.caddy"
  exit 1
fi
# صور Ubuntu في Oracle تغلق كل المنافذ ما عدا 22 — نفتح 80 و443
for port in 80 443; do
  sudo iptables -C INPUT -p tcp --dport $port -m state --state NEW -j ACCEPT 2>/dev/null || \
  sudo iptables -I INPUT 6 -p tcp --dport $port -m state --state NEW -j ACCEPT
done
command -v netfilter-persistent >/dev/null && sudo netfilter-persistent save || true
sudo systemctl enable --now caddy
sudo systemctl reload caddy || sudo systemctl restart caddy

echo "==> 8/8 النسخ الاحتياطي اليومي (02:30 — يُحتفظ بـ 30 يوماً)"
sudo tee /etc/cron.d/taxi-backup >/dev/null <<CRON
30 2 * * * taxi sqlite3 $APP/backend/registrations.db ".backup '$APP/backups/db_\$(date +\%F).db'" && find $APP/backups -name 'db_*.db' -mtime +30 -delete
CRON
sudo chmod 644 /etc/cron.d/taxi-backup

sleep 3
echo
CODE="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$PORT/api/auth/me || true)"
if [ "$CODE" = "401" ]; then
  echo "✅ الخادم يعمل"
else
  echo "⚠️ تحقق من الخادم (الرمز $CODE): sudo journalctl -u taxi -n 50"
fi
echo "════════════════════════════════════════════"
echo "  رابط البرنامج:  https://$DOMAIN"
echo "  لوحة الإدارة:   https://$DOMAIN/#admin"
echo "  (الشهادة HTTPS تُصدر تلقائياً خلال دقيقة عند أول زيارة)"
echo "  أضف في Google Cloud Console رابط الرجوع:"
echo "     https://$DOMAIN/api/auth/google/callback"
echo "════════════════════════════════════════════"
