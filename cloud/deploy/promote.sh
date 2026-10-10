#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════
# ترقية الإصدار المُختبَر من النسخة التجريبية إلى الإنتاج
#   bash taxi-cloud/deploy/promote.sh
# • ينقل نفس الشيفرة بالضبط التي اختُبرت (لا الحزمة)
# • نسخة احتياطية للقاعدة + أرشيف للإصدار السابق (للتراجع بـ rollback.sh)
# • قاعدة بيانات الإنتاج وإعداداته لا تُمسّ
# ════════════════════════════════════════════════════════════
set -euo pipefail
command -v rsync >/dev/null || sudo apt-get install -y -q rsync
TEST=/opt/taxi-test
PROD=/opt/taxi
[ -f "$TEST/RELEASE" ] || { echo "❌ لا يوجد إصدار مُختبَر — شغّل stage.sh أولاً"; exit 1; }
REL="$(head -1 "$TEST/RELEASE")"
echo "الإصدار المُختبَر: $REL (رُفع إلى التجريبية في $(sed -n 2p "$TEST/RELEASE"))"
read -r -p "ترقيته إلى الإنتاج؟ اكتب نعم: " OK
[ "$OK" = "نعم" ] || { echo "أُلغي."; exit 1; }
TS="$(date +%F_%H%M%S)"
sudo mkdir -p "$PROD/releases"
sudo -u taxi sqlite3 "$PROD/backend/registrations.db" ".backup '$PROD/backups/before_promote_$TS.db'"
sudo tar -C "$PROD" -czf "$PROD/releases/prod_$TS.tgz" --exclude='backend/registrations.db*' \
     --exclude='backend/config.local.json' --exclude='backend/images' backend frontend
echo "✅ نسخة احتياطية + أرشيف الإصدار السابق: releases/prod_$TS.tgz"
# الشيفرة فقط — بدون قاعدة التجريبية وإعداداتها ومفاتيحها
sudo rsync -a --checksum --delete-after \
     --exclude='registrations.db*' --exclude='config.local.json' --exclude='gemini_key' --exclude='claude_key' \
     --exclude='images/' --exclude='__pycache__/' "$TEST/backend/" "$PROD/backend/"
sudo rsync -a --checksum --delete "$TEST/frontend/" "$PROD/frontend/"
sudo cp "$TEST/RELEASE" "$PROD/RELEASE"
sudo chown -R taxi:taxi "$PROD" && sudo chmod -R u+rwX "$PROD"
sudo chmod 600 "$PROD/backend/registrations.db" "$PROD/backend/config.local.json" 2>/dev/null || true
sudo -u taxi "$PROD/venv/bin/pip" install -q -r "$PROD/backend/requirements-cloud.txt"
sudo systemctl restart taxi
sleep 3
CODE="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8901/api/auth/me || true)"
ENV="$(curl -s http://127.0.0.1:8901/api/env || true)"
if [ "$CODE" = "401" ] && echo "$ENV" | grep -q '"test": *false'; then
  echo "✅ الإنتاج يعمل بالإصدار $REL"
else
  echo "❌ الإنتاج لا يستجيب كما يجب ($CODE $ENV) — تراجع فوري: bash taxi-cloud/deploy/rollback.sh"
  exit 1
fi
