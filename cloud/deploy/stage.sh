#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════
# رفع تحديث جديد إلى النسخة التجريبية فقط (الإنتاج لا يتأثر)
#   bash taxi-cloud/deploy/stage.sh
# ثم: الفحص الشامل تلقائياً على النسخة التجريبية — جرّب بنفسك — ثم promote.sh
# ════════════════════════════════════════════════════════════
set -euo pipefail
APP=/opt/taxi-test
PKG="$(cd "$(dirname "$0")/.." && pwd)"
[ -d "$APP/backend" ] || { echo "❌ ثبّت النسخة التجريبية أولاً: bash taxi-cloud/deploy/staging_setup.sh"; exit 1; }
TS="$(date +%F_%H%M%S)"
# حفظ الإصدار الحالي للنسخة التجريبية (للمقارنة أو التراجع)
sudo tar -C "$APP" -czf "$APP/releases/test_before_$TS.tgz" --exclude='backend/registrations.db*' \
     --exclude='backend/config.local.json' --exclude='backend/images' backend frontend
sudo find "$PKG/backend" -maxdepth 1 -mindepth 1 ! -name registrations.db ! -name config.local.json -exec cp -a {} "$APP/backend/" \;
sudo rm -rf "$APP/frontend" && sudo mkdir -p "$APP/frontend" && sudo cp -a "$PKG/frontend/." "$APP/frontend/"
sudo chown -R taxi:taxi "$APP" && sudo chmod -R u+rwX "$APP"
sudo -u taxi "$APP/venv/bin/pip" install -q -r "$APP/backend/requirements-cloud.txt"
# بصمة الإصدار: promote.sh ينقل هذا الإصدار بالضبط
( cd "$PKG" && find backend frontend -type f ! -name 'registrations.db*' ! -name config.local.json ! -path '*/__pycache__/*' -print0 \
    | sort -z | xargs -0 sha256sum | sha256sum | cut -c1-12 ) | sudo tee "$APP/RELEASE" >/dev/null
echo "$TS" | sudo tee -a "$APP/RELEASE" >/dev/null
# الملفات التي ينشئها البرنامج لا يقرؤها غيره (قاعدة البيانات 600)
grep -q '^UMask=' /etc/systemd/system/taxi-test.service || { sudo sed -i 's/^\(Environment=TAXI_ENV=test\)$/\1\nUMask=0077/' /etc/systemd/system/taxi-test.service; sudo systemctl daemon-reload; }
sudo chmod 600 "$APP"/backend/registrations.db* 2>/dev/null || true
sudo systemctl restart taxi-test
sleep 2
echo "✅ الإصدار $(head -1 $APP/RELEASE) على النسخة التجريبية — الفحص الشامل:"
cd "$APP/backend" && sudo -u taxi env TAXI_ENV=test "$APP/venv/bin/python" selftest.py || true
echo
echo "جرّب على الهاتف والحاسوب، ثم إن كان كل شيء سليماً:  bash taxi-cloud/deploy/promote.sh"
