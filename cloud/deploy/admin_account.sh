#!/usr/bin/env bash
# إدارة حسابات الإدارة على النسخة السحابية
#   bash admin_account.sh reset     ← حذف كل الحسابات (بما فيها الإدارة) ثم إنشاء حساب إدارة جديد
#   bash admin_account.sh add       ← إضافة حساب إدارة جديد
#   bash admin_account.sh passwd    ← تغيير كلمة مرور حساب
#   أضف كلمة test في الآخر للعمل على النسخة التجريبية:  bash admin_account.sh add test
set -euo pipefail
APP=/opt/taxi; [ "${2:-}" = "test" ] && APP=/opt/taxi-test
DB=$APP/backend/registrations.db
echo "القاعدة: $DB"
CMD="${1:-add}"
if [ "$CMD" = reset ]; then
  BK=$APP/backups/before_accounts_reset_$(date +%F_%H%M).db
  sudo -u taxi sqlite3 "$DB" ".backup '$BK'"
  echo "نسخة احتياطية: $BK"
fi
read -r -p "اسم المستخدم: " U
read -r -s -p "كلمة المرور (10 أحرف على الأقل، حروف وأرقام): " P1; echo
read -r -s -p "أعد كلمة المرور: " P2; echo
[ "$P1" = "$P2" ] || { echo "❌ كلمتا المرور غير متطابقتين"; exit 1; }
[ ${#P1} -ge 10 ] || { echo "❌ كلمة المرور قصيرة (10 أحرف على الأقل لحساب الإدارة)"; exit 1; }
[[ "$P1" =~ [0-9] && "$P1" =~ [A-Za-z] ]] || { echo "❌ يجب أن تجمع بين حروف وأرقام"; exit 1; }
sudo -u taxi TAXI_U="$U" TAXI_P="$P1" TAXI_CMD="$CMD" python3 - "$DB" <<'PY'
import sqlite3, sys, os, hashlib, secrets
c = sqlite3.connect(sys.argv[1]); c.execute("PRAGMA foreign_keys = OFF")
u, p, cmd = os.environ["TAXI_U"].strip(), os.environ["TAXI_P"], os.environ["TAXI_CMD"]
_salt = secrets.token_bytes(16)
h = f"pbkdf2_sha256$600000${_salt.hex()}${hashlib.pbkdf2_hmac('sha256', p.encode(), _salt, 600000).hex()}"
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
