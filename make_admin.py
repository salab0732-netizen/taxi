import sqlite3

conn = sqlite3.connect(r"F:\taxi-main\backend_new\registrations.db")

print("=== Accounts ===")
rows = conn.execute("SELECT id, username, role FROM accounts").fetchall()
for r in rows:
    print(f"  id={r[0]}  username={r[1]}  role={r[2]}")

print()
u = input("Enter username to make admin: ").strip()

row = conn.execute("SELECT id, username, role FROM accounts WHERE username=?", (u,)).fetchone()
if not row:
    print("NOT FOUND")
else:
    conn.execute("UPDATE accounts SET role='admin' WHERE username=?", (u,))
    conn.commit()
    print(f"OK - {u} is now admin")

conn.close()
input("Press Enter to close...")
