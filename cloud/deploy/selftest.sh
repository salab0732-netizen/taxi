#!/usr/bin/env bash
# الفحص الشامل للبرنامج على الخادم الحقيقي
#   bash taxi-cloud/deploy/selftest.sh
# 1) نسخة احتياطية تلقائية للقاعدة  2) تشغيل كل الاختبارات  3) حفظ التقرير
# التقرير: لوحة الإدارة ← مراقبة النظام ← تقارير الفحص الشامل ← «عرض / حفظ PDF»
# ملاحظة: الفحص يُنشئ بيانات تجريبية (حسابات st_… وطلبات) — تُمسح لاحقاً بـ reset_data.sh
#   bash taxi-cloud/deploy/selftest.sh test   ← على النسخة التجريبية
set -euo pipefail
APP=/opt/taxi; ENVV=production
[ "${1:-}" = "test" ] && { APP=/opt/taxi-test; ENVV=test; }
TS="$(date +%F_%H%M)"
sudo -u taxi sqlite3 "$APP/backend/registrations.db" ".backup '$APP/backups/before_selftest_$TS.db'"
echo "✅ نسخة احتياطية: $APP/backups/before_selftest_$TS.db"
cd "$APP/backend"
sudo -u taxi env TAXI_ENV=$ENVV "$APP/venv/bin/python" selftest.py || true
