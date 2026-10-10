#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════
# التراجع إلى الإصدار السابق للإنتاج (الشيفرة فقط — البيانات لا تُمسّ)
#   bash taxi-cloud/deploy/rollback.sh            ← آخر إصدار محفوظ
#   bash taxi-cloud/deploy/rollback.sh <ملف.tgz>  ← إصدار محدد
# ════════════════════════════════════════════════════════════
set -euo pipefail
command -v rsync >/dev/null || sudo apt-get install -y -q rsync
PROD=/opt/taxi
ARCH="${1:-$(ls -1t $PROD/releases/prod_*.tgz 2>/dev/null | head -1)}"
[ -n "$ARCH" ] && [ -f "$ARCH" ] || { echo "❌ لا يوجد إصدار سابق محفوظ"; ls -1t $PROD/releases 2>/dev/null; exit 1; }
echo "الإصدارات المحفوظة:"; ls -1t $PROD/releases/prod_*.tgz | head -5
read -r -p "استرجاع $(basename "$ARCH")؟ اكتب نعم: " OK
[ "$OK" = "نعم" ] || { echo "أُلغي."; exit 1; }
TMP="$(mktemp -d)"
sudo tar -C "$TMP" -xzf "$ARCH"
sudo rsync -a --checksum --delete-after --exclude='registrations.db*' --exclude='config.local.json' --exclude='gemini_key' \
     --exclude='claude_key' --exclude='images/' "$TMP/backend/" "$PROD/backend/"
sudo rsync -a --checksum --delete "$TMP/frontend/" "$PROD/frontend/"
sudo rm -rf "$TMP"
sudo rm -f "$PROD/RELEASE"
sudo chown -R taxi:taxi "$PROD"
sudo systemctl restart taxi
sleep 3
CODE="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8901/api/auth/me || true)"
[ "$CODE" = "401" ] && echo "✅ تم التراجع — الإنتاج يعمل" || echo "⚠️ تحقق: sudo journalctl -u taxi -n 50"
