#!/usr/bin/env bash
# يكتب ملف موقع Caddy للبرنامج (مع رؤوس الأمان) — يُستدعى من setup.sh و update.sh
#   bash caddy_site.sh <DOMAIN> [PORT] [APP] [NAME]
#   NAME: taxi-platform (الإنتاج) أو taxi-test (النسخة التجريبية)
set -euo pipefail
DOMAIN="$1"; PORT="${2:-8901}"; APP="${3:-/opt/taxi}"; NAME="${4:-taxi-platform}"
SITE_DIR=/etc/caddy/centres
SITE="$SITE_DIR/$NAME.caddy"
sudo mkdir -p "$SITE_DIR"
[ -f "$SITE" ] && sudo cp -a "$SITE" "/tmp/$NAME.caddy.bak"
sudo tee "$SITE" >/dev/null <<CADDY
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
        # الصفحة الرئيسية لا تُحفظ في ذاكرة المتصفح/التطبيق: كل تحديث يظهر فوراً
        # (ملفات assets تحمل بصمة في اسمها فتُحفظ سنة كاملة)
        @assets path /assets/*
        header @assets Cache-Control "public, max-age=31536000, immutable"
        @page not path /assets/*
        header @page Cache-Control "no-cache"
        file_server
    }
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        Referrer-Policy no-referrer
        Permissions-Policy "geolocation=(), microphone=(), camera=(self)"
        Content-Security-Policy "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'"
        -Server
    }
}
CADDY
if ! sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
  echo "❌ خطأ في إعداد Caddy — استُرجع الملف السابق حتى لا يتأثر موقع كفاءة"
  sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile 2>&1 | tail -5
  if [ -f /tmp/$NAME.caddy.bak ]; then sudo cp -a /tmp/$NAME.caddy.bak "$SITE"; else sudo rm -f "$SITE"; fi
  exit 1
fi
sudo systemctl reload caddy || sudo systemctl restart caddy
echo "    Caddy: $DOMAIN (رؤوس الأمان مفعّلة)"
