#!/usr/bin/env bash
# إدارة حسابات الإدارة على النسخة السحابية
#   bash admin_account.sh reset     ← حذف كل الحسابات (بما فيها الإدارة) ثم إنشاء حساب إدارة جديد
#   bash admin_account.sh add       ← إضافة حساب إدارة جديد
#   bash admin_account.sh passwd    ← تغيير كلمة مرور حساب
set -euo pipefail
DB=/opt/taxi/backend/registrations.db
CMD="${1:-add}"
if [ "$CMD" = reset ]; then
  BK=/opt/taxi/backups/before_accounts_reset_$(date +%F_%H%M).db
  sudo -u taxi sqlite3 "$DB" ".backup '$BK'"
  echo "نسخة احتياطية: $BK"
fi
read -r -p "اسم المستخدم: " U
read -r -s -p "كلمة المرور (8 أحرف على الأقل): " P1; echo
read -r -s -p "أعد كلمة المرور: " P2; echo
[ "$P1" = "$P2" ] || { echo "❌ كلمتا المرور غير متطابقتين"; exit 1; }
[ ${#P1} -ge 8 ] || { echo "❌ كلمة المرور قصيرة"; exit 1; }
sudo -u taxi TAXI_U="$U" TAXI_P="$P1" TAXI_CMD="$CMD" python3 - "$DB" <<'PY'
import sqlite3, sys, os, hashlib
c = sqlite3.connect(sys.argv[1]); c.execute("PRAGMA foreign_keys = OFF")
u, p, cmd = os.environ["TAXI_U"].strip(), os.environ["TAXI_P"], os.environ["TAXI_CMD"]
h = hashlib.sha256(p.encode()).hexdigest()
if cmd == "reset":
    c.execute("DELETE FROM accounts")
    c.execute("DELETE FROM sqlite_sequence WHERE name='accounts'")
if cmd == "passwd":
    n = c.execute("UPDATE accounts SET password_hash=?, token=NULL WHERE username=?", (h, u)).rowcount
    print("✅ تم تغيير كلمة المرور" if n else "❌ الحساب غير موجود")
else:
    if c.execute("SELECT 1 FROM accounts WHERE username=?", (u,)).fetchone():
        print("❌ اسم المستخدم موجود"); sys.exit(1)
    c.execute("INSERT INTO accounts (username, password_hash, role) VALUES (?,?,'admin')", (u, h))
    print(f"✅ حساب الإدارة «{u}» جاهز")
c.commit()
print("الحسابات الآن:", [f"{r[0]} ({r[1]})" for r in c.execute("SELECT username, role FROM accounts")])
PY
