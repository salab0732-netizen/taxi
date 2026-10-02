"""
فحص وحذف السائقين المكررين (نفس NIN في حسابات مختلفة)
يحتفظ بالسجل الأقدم ويحذف الأحدث بعد نقل بياناته
"""
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent / "registrations.db"

conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row
conn.execute("PRAGMA foreign_keys = OFF")

# ── 1. فحص المكررين ──
print("=" * 60)
print("فحص السائقين بنفس NIN...")
print("=" * 60)

dups = conn.execute("""
    SELECT nin, COUNT(*) as cnt, GROUP_CONCAT(id) as ids,
           GROUP_CONCAT(account_id) as acc_ids
    FROM drivers
    WHERE nin IS NOT NULL AND nin != ''
    GROUP BY nin
    HAVING COUNT(*) > 1
""").fetchall()

if not dups:
    print("✅ لا يوجد تكرار في NIN")
    conn.close()
    exit()

for dup in dups:
    nin  = dup["nin"]
    ids  = [int(x) for x in dup["ids"].split(",")]
    print(f"\n⚠️  NIN مكرر: {nin}  |  IDs: {ids}")

    records = []
    for did in ids:
        r = conn.execute("""
            SELECT d.id, d.nom_ar, d.prenom_ar, d.nin, d.statut,
                   d.created_at, d.account_id,
                   acc.username,
                   dl.door_number, dl.id as door_lid,
                   v.num_immatriculation, v.id as vehicle_id,
                   rc.contract_number, rc.id as rental_id,
                   rc.is_current as rental_active
            FROM drivers d
            JOIN accounts acc ON acc.id = d.account_id
            LEFT JOIN door_licenses dl
                   ON dl.current_driver_id = d.id AND dl.is_active = 1
            LEFT JOIN vehicles v
                   ON v.driver_id = d.id AND v.is_current = 1
            LEFT JOIN rental_contracts rc
                   ON rc.driver_id = d.id AND rc.is_current = 1
            WHERE d.id = ?
        """, (did,)).fetchone()
        records.append(dict(r))
        print(f"   [{did}] {r['prenom_ar']} {r['nom_ar']} "
              f"| user={r['username']} "
              f"| باب={r['door_number']} "
              f"| سيارة={r['num_immatriculation']} "
              f"| عقد={r['contract_number']} "
              f"| created={r['created_at']}")

    # ── 2. الأقدم (id أصغر) يُحتفظ به ──
    keep_id   = min(ids)
    delete_id = max(ids)
    keep   = next(r for r in records if r["id"] == keep_id)
    delete = next(r for r in records if r["id"] == delete_id)

    print(f"\n   → نحتفظ بـ   [{keep_id}]  username={keep['username']}")
    print(f"   → نحذف       [{delete_id}] username={delete['username']}")

    # ── 3. نقل البيانات من المحذوف إلى المحفوظ إن لزم ──
    if delete["door_lid"] and not keep["door_number"]:
        conn.execute(
            "UPDATE door_licenses SET current_driver_id=? WHERE id=?",
            (keep_id, delete["door_lid"])
        )
        print(f"   ↳ نقل الباب {delete['door_number']} → [{keep_id}]")

    if delete["vehicle_id"] and not keep["num_immatriculation"]:
        conn.execute(
            "UPDATE vehicles SET driver_id=? WHERE id=?",
            (keep_id, delete["vehicle_id"])
        )
        print(f"   ↳ نقل السيارة {delete['num_immatriculation']} → [{keep_id}]")

    if delete["rental_id"] and delete["rental_active"] and not keep["rental_active"]:
        conn.execute(
            "UPDATE rental_contracts SET driver_id=? WHERE id=?",
            (keep_id, delete["rental_id"])
        )
        print(f"   ↳ نقل العقد {delete['contract_number']} → [{keep_id}]")

    # ── 4. أرشفة ما تبقى عند المحذوف ──
    conn.execute(
        "UPDATE door_licenses SET current_driver_id=NULL, is_active=0 WHERE current_driver_id=?",
        (delete_id,)
    )
    conn.execute(
        "UPDATE vehicles SET is_current=0 WHERE driver_id=? AND is_current=1",
        (delete_id,)
    )
    conn.execute(
        "UPDATE rental_contracts SET is_current=0 WHERE driver_id=? AND is_current=1",
        (delete_id,)
    )

    # ── 5. حذف السجل والحساب ──
    del_acc_id = delete["account_id"]
    conn.execute("DELETE FROM drivers  WHERE id=?", (delete_id,))
    conn.execute("DELETE FROM accounts WHERE id=?", (del_acc_id,))
    print(f"   ✅ حُذف driver_id={delete_id}, account_id={del_acc_id}")

conn.commit()
conn.execute("PRAGMA foreign_keys = ON")
conn.close()

print("\n" + "=" * 60)
print("✅ تم تصحيح قاعدة البيانات")
print("=" * 60)
