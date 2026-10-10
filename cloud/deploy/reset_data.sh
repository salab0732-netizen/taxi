#!/usr/bin/env bash
# تفريغ قاعدة بيانات النسخة السحابية: حذف كل البيانات مع الإبقاء على حسابات الإدارة فقط
# نسخة احتياطية كاملة قبل الحذف في /opt/taxi/backups
# النسخة التجريبية:  bash reset_data.sh test
set -euo pipefail
APP=/opt/taxi; SVC=taxi
[ "${1:-}" = "test" ] && { APP=/opt/taxi-test; SVC=taxi-test; }
DB=$APP/backend/registrations.db
BK=$APP/backups/before_reset_$(date +%F_%H%M).db
echo "القاعدة: $DB"
read -r -p "سيتم حذف كل البيانات (عدا حسابات الإدارة). اكتب نعم للمتابعة: " OK
[ "$OK" = "نعم" ] || { echo "أُلغي."; exit 1; }
sudo systemctl stop $SVC
sudo -u taxi sqlite3 "$DB" ".backup '$BK'"
sudo -u taxi python3 - "$DB" <<'PY'
import sqlite3, sys
c = sqlite3.connect(sys.argv[1])
c.execute("PRAGMA foreign_keys = OFF")
tables = [t for (t,) in c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
for t in tables:
    if t == "accounts":
        c.execute("DELETE FROM accounts WHERE role <> 'admin' OR username LIKE 'selftest_admin_%'")
        c.execute("UPDATE accounts SET token = NULL")
    else:
        c.execute(f'DELETE FROM "{t}"')
c.execute("DELETE FROM sqlite_sequence WHERE name <> 'accounts'")
c.commit()
c.execute("VACUUM")
for t in tables:
    n = c.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
    if n: print(f"  {t}: {n}")
print("✅ القاعدة فارغة — حسابات الإدارة:", [r[0] for r in c.execute("SELECT username FROM accounts")])
PY
sudo rm -f $APP/backend/images/* 2>/dev/null || true
# سجلات المراقبة تبدأ من الصفر أيضاً (أخطاء الفحص التجريبي لا تبقى)
for f in $APP/logs/*.log; do [ -f "$f" ] && sudo truncate -s 0 "$f"; done
sudo rm -f $APP/logs/*.log.[0-9] 2>/dev/null || true
sudo systemctl start $SVC
echo "النسخة الاحتياطية قبل التفريغ: $BK"
