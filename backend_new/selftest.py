# ════════════════════════════════════════════════════════════
# selftest.py — الفحص الشامل للبرنامج على الخادم الحقيقي
#   يُشغَّل من deploy/selftest.sh (بعد نسخة احتياطية تلقائية):
#       cd /opt/taxi/backend && sudo -u taxi ../venv/bin/python selftest.py
#   يُنشئ بيانات تجريبية حقيقية (سائقون، شركات، طلبات، وثائق) ويختبر:
#   البنية، الموقع الحي، الحسابات، مسارات العمل، الصلاحيات، التزامن، الأداء، المراقبة
#   النتيجة تُحفظ في الجدول selftest_reports وتُعرض في «مراقبة النظام» وتُطبع PDF
# ════════════════════════════════════════════════════════════
import json
import logging
import os
import secrets
import shutil
import sqlite3
import sys
import threading
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
logging.getLogger("werkzeug").setLevel(logging.ERROR)   # سجلات البرنامج (المراقبة) تبقى تعمل

import app as A                       # noqa: E402
import security as S                  # noqa: E402
from database import get_db           # noqa: E402

A.send_sms = lambda *a, **k: True     # لا تُرسل رسائل SMS حقيقية أثناء الفحص
APP = A.app
RUN = datetime.now().strftime("%m%d%H%M%S")      # معرّف التشغيل (يمنع تعارض البيانات بين تشغيلين)
T0 = time.time()
RESULTS = []
SECTION = [""]


# ── أدوات ─────────────────────────────────────────────────────
def section(name):
    SECTION[0] = name
    print(f"\n━━ {name}")


def chk(name, ok, detail="", warn=False):
    status = "ok" if ok else ("warn" if warn else "fail")
    RESULTS.append({"section": SECTION[0], "name": name, "status": status, "detail": str(detail)[:300]})
    mark = {"ok": "✅", "warn": "⚠️ ", "fail": "❌"}[status]
    print(f"  {mark} {name}" + (f" — {detail}" if detail and status != "ok" else ""))
    return ok


def client(ip):
    """عميل اختبار بعنوان مستقل (حتى لا يُقفل الفحص عنوان أي مستخدم حقيقي)."""
    c = APP.test_client()
    c.environ_base["HTTP_X_FORWARDED_FOR"] = ip
    return c


CL = client("10.250.0.1")


def call(m, url, tok=None, js=None, c=None, raw=False):
    h = {"X-Token": tok} if tok else {}
    t = time.time()
    r = getattr(c or CL, m)(url, headers=h, json=js)
    ms = (time.time() - t) * 1000
    if raw:
        return r, ms
    try:
        j = r.get_json(silent=True)
    except Exception:
        j = None
    return r.status_code, (j if isinstance(j, dict) else {}), ms


def pt(tok):
    s, j, _ = call("post", "/api/auth/print-token", tok)
    return j.get("token", "")


def nin(i):
    return f"1099{RUN}{i:04d}"[:18].ljust(18, "0")


# ── حساب إدارة مؤقت للفحص (يُعطَّل في النهاية) ───────────────────
ADMIN_USER = f"selftest_admin_{RUN}"
ADMIN_PW = "St" + secrets.token_hex(8) + "9"
with get_db() as conn:
    conn.execute("INSERT INTO accounts (username, password_hash, role) VALUES (?,?,'admin')",
                 (ADMIN_USER, S.hash_password(ADMIN_PW)))
    conn.commit()


def cleanup_admin():
    with get_db() as conn:
        conn.execute("UPDATE accounts SET is_active=0, token=NULL, token_expires=NULL WHERE username=?", (ADMIN_USER,))
        conn.execute("DELETE FROM print_tokens WHERE account_id IN (SELECT id FROM accounts WHERE username=?)", (ADMIN_USER,))
        conn.commit()


# ════════════════════════════════════════════════════════════
def t_infrastructure():
    section("1. البنية والخادم")
    db = Path(__file__).resolve().parent / "registrations.db"
    c = sqlite3.connect(db)
    chk("سلامة قاعدة البيانات (integrity_check)", c.execute("PRAGMA integrity_check").fetchone()[0] == "ok")
    fk = c.execute("PRAGMA foreign_key_check").fetchall()
    chk("الروابط بين الجداول (foreign_key_check)", not fk, f"{len(fk)} رابط مكسور", warn=True)
    tables = {r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    need = {"accounts", "drivers", "requests", "door_licenses", "rental_contracts", "companies",
            "company_drivers", "company_vehicles", "work_certificates", "admin_audit", "print_tokens"}
    chk("كل الجداول الأساسية موجودة", need <= tables, ", ".join(sorted(need - tables)))
    c.close()
    chk("حجم قاعدة البيانات", True, f"{db.stat().st_size / 1024:.0f} KB")
    free = shutil.disk_usage(str(db.parent)).free / 1e9
    chk("المساحة الحرة على القرص ≥ 2 GB", free >= 2, f"{free:.1f} GB")
    from env import TAXI_ENV
    chk("البيئة: " + ("نسخة تجريبية (taxi-test)" if TAXI_ENV == "test" else "الإنتاج"), True)
    bdir = Path(__file__).resolve().parent.parent / "backups"
    if bdir.exists():
        files = sorted(bdir.glob("db_*.db"), key=lambda p: p.stat().st_mtime)
        age = (time.time() - files[-1].stat().st_mtime) / 3600 if files else None
        chk("النسخ الاحتياطي اليومي يعمل (آخر نسخة < 26 ساعة)", age is not None and age < 26,
            f"آخر نسخة منذ {age:.0f} ساعة" if age is not None else "لا توجد نسخ يومية بعد", warn=age is None)
    cron = Path("/etc/cron.d/" + ("taxi-test-backup" if TAXI_ENV == "test" else "taxi-backup"))
    chk("جدولة النسخ الاحتياطي (cron)", cron.exists(), "الملف غير موجود", warn=not cron.exists())
    logs = Path(__file__).resolve().parent.parent / "logs"
    size = sum(p.stat().st_size for p in logs.glob("*.log*")) / 1e6 if logs.exists() else 0
    chk("حجم السجلات معقول (< 200 MB)", size < 200, f"{size:.1f} MB")
    mode = oct(db.stat().st_mode)[-3:]
    chk("قاعدة البيانات محمية (لا يقرؤها الآخرون)", mode[-1] == "0", f"الصلاحيات {mode}", warn=True)


def t_live_site():
    section("2. الموقع الحي (HTTPS)")
    url = (A.FRONTEND_URL or "").rstrip("/")
    if not url.startswith("https://"):
        chk("عنوان الموقع معروف", False, "FRONTEND_URL غير مضبوط", warn=True)
        return
    try:
        import requests as rq
        t = time.time()
        r = rq.get(url + "/", timeout=15)
        ms = (time.time() - t) * 1000
        chk("الصفحة الرئيسية تفتح (200)", r.status_code == 200, r.status_code)
        chk("زمن تحميل الصفحة < 1.5 ثانية", ms < 1500, f"{ms:.0f} ms")
        h = {k.lower(): v for k, v in r.headers.items()}
        chk("HSTS (إجبار HTTPS)", "strict-transport-security" in h)
        chk("Content-Security-Policy", "content-security-policy" in h)
        chk("منع التضمين X-Frame-Options", h.get("x-frame-options", "").upper() == "DENY", h.get("x-frame-options"))
        chk("nosniff", h.get("x-content-type-options") == "nosniff")
        chk("ضغط gzip", "gzip" in h.get("content-encoding", "") or len(r.content) < 3000, h.get("content-encoding"), warn=True)
        r2 = rq.get(url.replace("https://", "http://") + "/", timeout=15, allow_redirects=False)
        chk("التحويل من HTTP إلى HTTPS", r2.status_code in (301, 302, 308) and r2.headers.get("Location", "").startswith("https://"),
            r2.status_code)
        r3 = rq.get(url + "/api/auth/me", timeout=15)
        chk("الواجهة البرمجية ترفض الطلب بدون جلسة (401)", r3.status_code == 401, r3.status_code)
        chk("لا تُكشف نسخة الخادم (Server)", "server" not in {k.lower() for k in r3.headers} or
            not any(x in r3.headers.get("Server", "") for x in ("gunicorn", "Werkzeug", "Python")), r3.headers.get("Server"))
        r4 = rq.get(url + "/api/no-such-route", timeout=15)
        chk("مسار غير موجود يرجع 404 دون تفاصيل داخلية", r4.status_code == 404 and "Traceback" not in r4.text, r4.status_code)
        import ssl, socket
        host = url.split("//")[1].split("/")[0]
        ctx = ssl.create_default_context()
        with socket.create_connection((host, 443), timeout=10) as sock, ctx.wrap_socket(sock, server_hostname=host) as ss:
            exp = datetime.strptime(ss.getpeercert()["notAfter"], "%b %d %H:%M:%S %Y %Z")
            days = (exp - datetime.utcnow()).days
            chk("شهادة HTTPS صالحة (> 15 يوماً)", days > 15, f"تنتهي بعد {days} يوماً")
    except Exception as e:
        chk("الاتصال بالموقع الحي", False, f"{type(e).__name__}: {e}", warn=True)


def t_accounts():
    section("3. الحسابات والدخول والجلسات")
    s, j, _ = call("post", "/api/auth/register", js={"username": f"st_weak_{RUN}", "password": "12345678"})
    chk("رفض كلمة مرور أرقام فقط", s == 400, s)
    s, j, _ = call("post", "/api/auth/register", js={"username": f"st_short_{RUN}", "password": "ab1"})
    chk("رفض كلمة مرور قصيرة", s == 400, s)
    u = f"st_drv_login_{RUN}"
    s, j, _ = call("post", "/api/auth/register", js={"username": u, "password": "Test1234x"})
    chk("تسجيل حساب سائق", s == 201, s)
    s, j, _ = call("post", "/api/auth/register", js={"username": u, "password": "Test1234x"})
    chk("منع تكرار اسم المستخدم", s == 409, s)
    s, j, _ = call("post", "/api/auth/register", js={"username": f"st_role_{RUN}", "password": "Test1234x", "role": "admin"})
    with get_db() as conn:
        r = conn.execute("SELECT role FROM accounts WHERE username=?", (f"st_role_{RUN}",)).fetchone()
    chk("لا يمكن إنشاء حساب إدارة من التسجيل العام", not r or r["role"] != "admin", r["role"] if r else "-")
    s, j, _ = call("post", "/api/auth/login", js={"username": u, "password": "Test1234x", "space": "driver"})
    tok = j.get("token")
    chk("الدخول بكلمة المرور الصحيحة", s == 200 and tok, s)
    with get_db() as conn:
        h = conn.execute("SELECT password_hash, token_expires FROM accounts WHERE username=?", (u,)).fetchone()
    chk("كلمة المرور محفوظة مشفّرة PBKDF2", h["password_hash"].startswith("pbkdf2_sha256$"))
    chk("للجلسة تاريخ انتهاء", bool(h["token_expires"]), h["token_expires"])
    s, _, _ = call("post", "/api/auth/login", js={"username": u, "password": "Test1234x", "space": "admin"})
    chk("سائق لا يدخل فضاء الإدارة", s == 403, s)
    s, _, _ = call("post", "/api/auth/login", js={"username": u, "password": "Test1234x", "space": "company"})
    chk("سائق لا يدخل فضاء الشركات", s == 403, s)
    s, _, _ = call("get", f"/api/auth/me?token={tok}")
    chk("رمز الجلسة لا يُقبل داخل الرابط", s == 401, s)
    p = pt(tok)
    chk("إصدار رمز طباعة مؤقت", p.startswith("pt_"))
    s, _, _ = call("get", "/api/auth/me", p)
    chk("رمز الطباعة لا يصلح كجلسة", s == 401, s)
    # القفل بعد المحاولات الخاطئة — بعنوان مستقل حتى لا يتأثر أي مستخدم حقيقي
    c = client("10.250.9.9")
    codes = [call("post", "/api/auth/login", js={"username": u, "password": "wrong-pass1"}, c=c)[0] for _ in range(6)]
    chk("قفل الدخول بعد 5 محاولات خاطئة", codes[:5] == [401] * 5 and codes[5] == 429, codes)
    s, _, _ = call("post", "/api/auth/login", js={"username": u, "password": "Test1234x"}, c=c)
    chk("القفل يشمل كلمة المرور الصحيحة أثناء مدته", s == 429, s)
    S.LOGIN_THROTTLE.success("pair:10.250.9.9:" + u.lower())
    S.GLOBAL_THROTTLE.success("acct:" + u.lower())
    c3 = client("10.250.9.11")
    s, j3, _ = call("post", "/api/auth/login", js={"username": u, "password": "Test1234x"}, c=c3)
    chk("خطأ مستخدم في عنوان لا يُقفل الحساب على عنوان آخر", s == 200, s)
    tok = j3.get("token") or tok   # الدخول الجديد يستبدل الجلسة السابقة (جلسة واحدة لكل حساب)
    s, _, _ = call("post", "/api/auth/logout", tok)
    s2, _, _ = call("get", "/api/auth/me", tok)
    chk("الخروج يُلغي الجلسة", s == 200 and s2 == 401, (s, s2))
    s, j, _ = call("post", "/api/auth/forgot-password", js={"phone": f"st_nouser_{RUN}"}, c=client("10.250.9.10"))
    chk("نسيت كلمة المرور لا يكشف وجود الحساب", s == 200, s)


def new_driver(i, label=""):
    u = f"st_drv{i}_{RUN}"
    call("post", "/api/auth/register", js={"username": u, "password": "Test1234x"})
    s, j, _ = call("post", "/api/auth/login", js={"username": u, "password": "Test1234x", "space": "driver"})
    return j.get("token")


DATA = {}


def t_driver_flow(ADM):
    section("4. مسار السائق كاملاً")
    T = new_driver(1)
    DATA["T1"] = T
    steps = [
        ("put", "/api/driver/identity", {"nom_ar": "اختبار", "prenom_ar": "سائق", "nom_fr": "TEST", "prenom_fr": "DRIVER",
                                          "nin": nin(1), "date_naissance": "1990-01-01", "lieu_naissance_ar": "البيض",
                                          "telephone": "0661000001", "adresse": "حي التجربة - البيض", "wilaya": "البيض", "sexe": "ذكر"}, "حفظ الهوية"),
        ("put", "/api/driver/license", {"num_permis": f"ST{RUN}1", "date_delivrance": "2020-01-01", "date_expiration": "2030-01-01",
                                         "lieu_delivrance": "بلدية البيض", "categories": "B"}, "حفظ رخصة السياقة"),
        ("put", "/api/driver/vehicle", {"num_immatriculation": f"9{RUN[-5:]}-111-32", "marque": "RENAULT", "type_vehicule": "SYMBOL",
                                         "num_serie": f"STVIN{RUN}01", "annee_circulation": "2018", "energie": "بنزين", "nb_places": "5"}, "حفظ المركبة"),
        ("put", "/api/driver/door", {"door_number": f"S{RUN[-4:]}", "wilaya": "البيض", "decision_number": f"ST-{RUN}", "decision_date": "2021-05-05",
                                      "decision_type": "قرار ولائي", "exploitation_mode": "مستأجر", "ben_nom_ar": "مستفيد", "ben_prenom_ar": "تجريبي",
                                      "ben_nin": nin(2), "ben_sifa": "ابن_مجاهد", "ben_date_naissance": "1950-01-01"}, "حفظ الباب والمستفيد"),
        ("post", "/api/driver/rental-contract", {"monthly_rent": 7000}, "إنشاء عقد الكراء"),
        ("put", "/api/driver/deputy", {"nom_ar": "مناوب", "prenom_ar": "تجريبي", "nin": nin(3), "num_permis": f"STD{RUN}",
                                        "date_naissance": "1985-01-01", "date_expiration_permis": "2031-01-01", "telephone": "0661000002"}, "حفظ المناوب"),
        ("post", "/api/driver/deputy-contract", {}, "عقد المناوب"),
    ]
    for m, u, js, lbl in steps:
        s, j, _ = call(m, u, T, js)
        chk(lbl, s in (200, 201), f"{s} {j.get('error', '')}")
    s, prof, _ = call("get", "/api/driver/profile", T)
    did = (prof.get("driver") or {}).get("id")
    DATA["did1"] = did
    DATA["rental1"] = (prof.get("rental") or {}).get("id")
    DATA["depc1"] = (prof.get("deputy_contract") or {}).get("id")
    chk("الملف يحتوي كل البيانات", all([did, prof.get("door"), prof.get("rental"), prof.get("vehicle")]),
        {k: bool(prof.get(k)) for k in ("door", "rental", "vehicle", "deputy_contract")})
    rn = (prof.get("rental") or {}).get("contract_number", "")
    chk("ترقيم عقد الكراء بالصيغة RENT-سنة-رقم", rn.startswith(f"RENT-{datetime.now().year}-"), rn)

    reqs = {}
    for t, extra, lbl in (("تجديد_وثائق_استغلال", {}, "طلب تجديد وثائق الاستغلال"), ("تصريح_مناوب", {}, "طلب تصريح مناوب"),
                          ("شهادة_إدارية", {"purpose": "ملف إداري"}, "طلب شهادة إدارية"),
                          ("تغيير_نشاط", {"activity_type_new": "مابين_البلديات"}, "طلب تغيير النشاط")):
        s, j, _ = call("post", "/api/requests", T, {"request_type": t, **extra})
        chk(lbl, s in (200, 201) and j.get("request_id"), f"{s} {j.get('error', '')}")
        reqs[t] = j
    DATA["req1"] = reqs["تجديد_وثائق_استغلال"].get("request_id")
    time.sleep(1.2)   # التوقيت بالثانية: التكرار يجب أن يكون بعد الطلبات الأخرى
    s, j, _ = call("post", "/api/requests", T, {"request_type": "تجديد_وثائق_استغلال"})
    chk("تكرار نفس الطلب يُرفض ويُذكَّر الإدارة", s == 400, s)
    s, lst, _ = call("get", "/api/admin/requests", ADM)
    first = (lst.get("requests") or [{}])[0]
    chk("الطلب المكرر يرتفع لأعلى قائمة الإدارة", first.get("id") == DATA["req1"], first.get("request_number"), warn=True)
    nums = [r.get("request_number") for r in reqs.values() if r.get("request_number")]
    chk("أرقام الطلبات فريدة وبصيغة REQ-سنة-رقم", len(set(nums)) == len(nums) and all(n.startswith("REQ-") for n in nums), nums)
    for t, r in reqs.items():
        if r.get("request_id"):
            s, j, _ = call("put", f"/api/admin/requests/{r['request_id']}", ADM, {"statut": "مقبول", "admin_notes": "فحص"})
            chk(f"قبول الإدارة: {t}", s == 200, f"{s} {j.get('error', '')}")
    s, j, _ = call("put", f"/api/admin/requests/{DATA['req1']}", ADM, {"statut": "مرفوض"})
    chk("منع تغيير قرار نهائي", s == 400, s)
    s, j, _ = call("put", f"/api/admin/requests/{DATA['req1']}", ADM, {"statut": "حالة_وهمية"})
    chk("رفض حالة غير صالحة", s == 400, s)

    P = pt(ADM)
    for u, lbl in ((f"/api/admin/print/license/{DATA['req1']}", "طباعة رخصة الاستغلال"),
                   (f"/api/admin/print/current-license/{did}", "رخصة الاستغلال من الملف"),
                   (f"/api/admin/print/deputy-permit/{did}", "رخصة السائق الإضافي"),
                   (f"/api/admin/print/history/{did}", "الشهادة التاريخية")):
        r, ms = call("get", f"{u}?token={P}", raw=True)
        html = r.get_data(as_text=True)
        chk(lbl, r.status_code == 200 and "<html" in html and "اختبار" in html, r.status_code)
        chk(f"  └ التواريخ بصيغة يوم/شهر/سنة في: {lbl}", "1990-01-01" not in html, warn=True)
    PD = pt(T)
    for path, lbl in ((f"/api/print/rental-contract/{DATA['rental1']}", "طباعة عقد الكراء (السائق)"),
                      (f"/api/print/request/{DATA['req1']}", "طباعة طلب (السائق)"),
                      ("/api/print/admin-cert-driver", "طباعة طلب شهادة إدارية (السائق)")):
        r, _ = call("get", f"{path}?token={PD}", raw=True)
        chk(lbl, r.status_code == 200, r.status_code)

    s, prep, _ = call("get", f"/api/admin/work-cert/prepare?driver_id={did}", ADM)
    chk("إعداد الشهادة الإدارية (البحث والفترات)", s == 200 and prep.get("periods"), s)
    r = CL.post("/api/admin/work-cert/render", headers={"X-Token": ADM}, json={"person": prep.get("person"), "periods": prep.get("periods")})
    no = r.headers.get("X-Cert-Number", "")
    chk("تحرير الشهادة الإدارية برقم تلقائي", r.status_code == 200 and "/" in no, f"{r.status_code} {no}")
    s, hist, _ = call("get", f"/api/admin/work-cert/history?nin={nin(1)}", ADM)
    chk("الشهادة مؤرشفة في قاعدة البيانات", s == 200 and len(hist.get("items", hist.get("history", []))) >= 1, s)

    s, j, _ = call("post", "/api/requests", T, {"request_type": "توقف_مؤقت", "notes": "فحص"})
    sid = j.get("request_id")
    chk("طلب توقف مؤقت", s in (200, 201) and sid, s)
    s, _, _ = call("post", "/api/requests", T, {"request_type": "تغيير_نشاط", "activity_type_new": "فردية_حضرية"})
    chk("منع الطلبات الأخرى أثناء انتظار التوقف", s == 400, s)
    call("put", f"/api/admin/requests/{sid}", ADM, {"statut": "مقبول"})
    s, prof, _ = call("get", "/api/driver/profile", T)
    chk("بعد التوقف: الحالة توقف_مؤقت والعقود مغلقة", (prof.get("driver") or {}).get("statut") == "توقف_مؤقت" and not prof.get("rental"),
        (prof.get("driver") or {}).get("statut"))
    s, _, _ = call("put", "/api/driver/vehicle", T, {"num_immatriculation": "000000-111-32"})
    chk("منع تعديل المركبة أثناء التوقف", s == 400, s)
    s, j, _ = call("post", "/api/requests", T, {"request_type": "استئناف", "resume": {"vehicle_changed": False, "door_changed": False,
                                                                                    "exploitation_mode": "مستأجر", "monthly_rent": 7500}})
    chk("طلب الاستئناف", s in (200, 201), f"{s} {j.get('error', '')}")
    if j.get("request_id"):
        call("put", f"/api/admin/requests/{j['request_id']}", ADM, {"statut": "مقبول"})
    s, prof, _ = call("get", "/api/driver/profile", T)
    chk("بعد الاستئناف: نشط مع عقد كراء جديد", (prof.get("driver") or {}).get("statut") == "نشط" and prof.get("rental"),
        (prof.get("driver") or {}).get("statut"))
    old_plate = (prof.get("vehicle") or {}).get("num_immatriculation")
    call("put", "/api/driver/vehicle", T, {"num_immatriculation": f"8{RUN[-5:]}-111-32", "marque": "KIA", "type_vehicule": "PICANTO",
                                           "num_serie": f"STVIN{RUN}02", "annee_circulation": "2020"})
    s, j, _ = call("post", "/api/requests", T, {"request_type": "تغيير_سيارة"})
    chk("طلب تغيير المركبة", s in (200, 201), f"{s} {j.get('error', '')}")
    if j.get("request_id"):
        call("put", f"/api/admin/requests/{j['request_id']}", ADM, {"statut": "مرفوض", "admin_notes": "فحص"})
    s, prof, _ = call("get", "/api/driver/profile", T)
    chk("بعد رفض التغيير تعود المركبة القديمة", (prof.get("vehicle") or {}).get("num_immatriculation") == old_plate,
        (prof.get("vehicle") or {}).get("num_immatriculation"))
    from datetime import date, timedelta
    soon = (date.today() + timedelta(days=10)).isoformat()
    call("put", "/api/driver/license", T, {"date_expiration": soon})
    s, n, _ = call("get", "/api/notifications", T)
    chk("تنبيه السائق بقرب انتهاء رخصة السياقة (10 أيام)", s == 200 and any(x.get("notif_type") == "رخصة_سائق" for x in n.get("notifications", [])),
        len(n.get("notifications", [])))
    call("put", "/api/driver/license", T, {"date_expiration": "2030-01-01"})


def t_company_flow(ADM):
    section("5. مسار الشركة كاملاً")
    out = {}
    for k in (1, 2):
        u = f"st_co{k}_{RUN}"
        s, _, _ = call("post", "/api/auth/register", js={"username": u, "password": "Test1234x", "role": "company",
                                                          "nom_ar": f"شركة الفحص {k}", "registre_commerce": f"ST-RC-{RUN}-{k}"})
        if k == 1:
            chk("تسجيل شركة", s == 201, s)
        s, j, _ = call("post", "/api/auth/login", js={"username": u, "password": "Test1234x", "space": "company"})
        out[k] = j.get("token")
    CT = out[1]
    DATA["CT1"], DATA["CT2"] = out[1], out[2]
    s, j, _ = call("put", "/api/company/profile", CT, {"nom_ar": "شركة الفحص 1", "registre_commerce": f"ST-RC-{RUN}-1", "num_agrement": "33",
                                                       "date_agrement": "2024-01-01", "commune": "البيض", "gerant_nom": "مسير", "gerant_prenom": "تجريبي"})
    chk("حفظ هوية الشركة", s == 200, f"{s} {j.get('error', '')}")
    s, v, _ = call("post", "/api/company/vehicles", CT, {"num_immatriculation": f"7{RUN[-5:]}-222-32", "marque": "DACIA", "type_vehicule": "LOGAN",
                                                         "num_serie": f"STCO{RUN}01", "nb_places": "5"})
    vid = (v.get("item") or {}).get("id")
    chk("إضافة مركبة", s in (200, 201) and vid, f"{s} {v.get('error', '')}")
    s, d, _ = call("post", "/api/company/drivers", CT, {"nom_ar": "أجير", "prenom_ar": "تجريبي", "nin": nin(10), "num_permis": f"STCP{RUN}",
                                                        "date_naissance": "1992-01-01", "date_delivrance": "2019-01-01", "date_expiration": "2029-01-01"})
    drid = (d.get("item") or {}).get("id")
    chk("إضافة سائق أجير", s in (200, 201) and drid, f"{s} {d.get('error', '')}")
    s, _, _ = call("post", "/api/company/drivers", CT, {"nom_ar": "أجير", "prenom_ar": "تجريبي", "nin": nin(10), "num_permis": f"STCP{RUN}"})
    chk("منع تكرار السائق (نفس رقم التعريف)", s == 400, s)
    s, _, _ = call("post", "/api/company/drivers", CT, {"nom_ar": "خطأ", "nin": "12345"})
    chk("منع رقم تعريف ناقص", s == 400, s)
    DATA["co_vid"], DATA["co_did"] = vid, drid
    s, _, _ = call("put", f"/api/company/vehicles/{vid}/driver", CT, {"driver_id": drid})
    chk("ربط السائق بالمركبة", s == 200, s)
    s, h, _ = call("post", "/api/company/hire-requests", CT, {"driver_id": drid, "vehicle_id": vid})
    hid = h.get("id") or h.get("request_id")
    DATA["co_hid"] = hid
    chk("عقد التوظيف + طلب الرخصة", s in (200, 201) and hid, f"{s} {h.get('error', '')}")
    s, j, _ = call("put", f"/api/admin/hire-requests/{hid}", ADM, {"statut": "مقبول"})
    chk("قبول الإدارة (رخصة سائق أجير)", s == 200, f"{s} {j.get('error', '')}")
    r, _ = call("get", f"/api/admin/print/company/hire-permit/{hid}?token={pt(ADM)}", raw=True)
    chk("طباعة رخصة السائق الأجير", r.status_code == 200, r.status_code)
    s, j, _ = call("post", f"/api/company/vehicles/{vid}/change", CT, {"num_immatriculation": f"6{RUN[-5:]}-222-32", "marque": "HYUNDAI",
                                                                       "type_vehicule": "ACCENT", "num_serie": f"STCO{RUN}02", "annee_circulation": "2021",
                                                                       "nb_places": "5", "energie": "بنزين",
                                                                       "image_carte_grise_base64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="})
    chk("طلب تغيير مركبة الشركة", s in (200, 201), f"{s} {j.get('error', '')}")
    s, vr, _ = call("get", "/api/admin/company/vehicle-requests?statut=جديد", ADM)
    mine = [x for x in vr.get("requests", []) if str(x.get("new_num_immatriculation", x.get("num_immatriculation", ""))).startswith(f"6{RUN[-5:]}")] \
        or vr.get("requests", [])[:1]
    if mine:
        s, x, _ = call("put", f"/api/admin/company/vehicle-requests/{mine[0]['id']}", ADM, {"statut": "مقبول"})
        chk("قبول تغيير المركبة وإصدار رخصة جديدة", s == 200 and (x.get("permit") or {}).get("permit_number"), f"{s} {x.get('error', '')}")
    else:
        chk("ظهور طلب تغيير المركبة لدى الإدارة", False, "القائمة فارغة")
    s, prof, _ = call("get", "/api/company/profile", CT)
    cid = (prof.get("company") or {}).get("id")
    DATA["co_cid"] = cid
    for k in ("card", "history"):
        r, _ = call("get", f"/api/admin/print-company/{k}/{cid}?token={pt(ADM)}", raw=True)
        chk(f"وثيقة الشركة ({k})", r.status_code == 200, r.status_code)
    r, _ = call("get", f"/api/company/print-company/card?token={pt(CT)}", raw=True)
    chk("الشركة تطبع بطاقة معلوماتها", r.status_code == 200, r.status_code)
    s, j, _ = call("post", f"/api/company/hire-requests/{hid}/terminate", CT, {"reason": "فحص"})
    chk("فسخ عقد التوظيف", s == 200, f"{s} {j.get('error', '')}")


def t_access_control(ADM):
    section("6. الصلاحيات: لا أحد يصل إلى بيانات غيره")
    T2 = new_driver(2)
    call("put", "/api/driver/identity", T2, {"nom_ar": "ثاني", "prenom_ar": "سائق", "nin": nin(20), "date_naissance": "1991-01-01",
                                             "telephone": "0661000020", "wilaya": "البيض"})
    P2 = pt(T2)
    own = [("عقد كراء سائق آخر", f"/api/print/rental-contract/{DATA.get('rental1')}"),
           ("طلب سائق آخر", f"/api/print/request/{DATA.get('req1')}"),
           ("تفاصيل طلب سائق آخر", f"/api/requests/{DATA.get('req1')}"),
           ("عقد مناوب سائق آخر", f"/api/print/deputy-contract/{DATA.get('depc1')}"),
           ("طلب تجديد سائق آخر", f"/api/print/request-renewal/{DATA.get('req1')}")]
    for lbl, u in own:
        if "None" in u:
            continue
        sep = "&" if "?" in u else "?"
        r, _ = call("get", f"{u}{sep}token={P2}", raw=True) if "/print/" in u else call("get", u, T2, raw=True)
        chk(f"سائق لا يرى: {lbl}", r.status_code in (403, 404), r.status_code)
    CT2 = DATA.get("CT2")
    if CT2 and DATA.get("co_vid"):
        s, _, _ = call("put", f"/api/company/vehicles/{DATA['co_vid']}", CT2, {"marque": "X"})
        chk("شركة لا تعدّل مركبة شركة أخرى", s in (403, 404), s)
        s, _, _ = call("delete", f"/api/company/drivers/{DATA['co_did']}", CT2)
        chk("شركة لا تحذف سائق شركة أخرى", s in (403, 404), s)
        r, _ = call("get", f"/api/company/print/hire-contract/{DATA['co_hid']}?token={pt(CT2)}", raw=True)
        chk("شركة لا تطبع عقد شركة أخرى", r.status_code in (403, 404), r.status_code)
        s, j, _ = call("get", "/api/company/drivers", CT2)
        chk("قائمة سائقي الشركة لا تحوي سائقي غيرها", not any(x.get("id") == DATA["co_did"] for x in j.get("drivers", j.get("items", []))))
    # كل مسارات الإدارة ممنوعة على السائق والشركة وغير المسجّل
    rules = [r for r in APP.url_map.iter_rules() if r.rule.startswith(("/api/admin", "/api/monitor")) and "frontend-error" not in r.rule]
    leaks = []
    for rule in rules:
        url = rule.rule
        for a in rule.arguments:
            url = url.replace(f"<int:{a}>", "1").replace(f"<{a}>", "card")
        for m in sorted(rule.methods - {"HEAD", "OPTIONS"}):
            for who, tok in (("سائق", T2), ("شركة", CT2), ("زائر", None)):
                r = getattr(CL, m.lower())(url, headers={"X-Token": tok} if tok else {}, json={})
                if r.status_code not in (401, 403):
                    leaks.append(f"{who} {m} {url} → {r.status_code}")
    chk(f"كل مسارات الإدارة والمراقبة ({len(rules)}) ممنوعة على غير الإدارة", not leaks, "; ".join(leaks[:5]))
    rules = [r for r in APP.url_map.iter_rules() if r.rule.startswith(("/api/company", "/api/driver"))]
    bad = []
    for rule in rules:
        url = rule.rule
        for a in rule.arguments:
            url = url.replace(f"<int:{a}>", "1").replace(f"<{a}>", "card")
        for m in sorted(rule.methods - {"HEAD", "OPTIONS"}):
            r = getattr(CL, m.lower())(url, json={})
            if r.status_code not in (401, 403):
                bad.append(f"{m} {url} → {r.status_code}")
    chk("مسارات السائق والشركة ترفض الزائر غير المسجّل", not bad, "; ".join(bad[:5]))
    s, _, _ = call("get", "/api/company/profile", T2)
    chk("سائق لا يدخل مسارات الشركات", s in (401, 403, 404), s)
    r = CL.get("/api/images/..%2F..%2Fregistrations.db", headers={"X-Token": ADM})
    chk("لا يمكن الوصول إلى ملفات الخادم عبر مسار الصور", r.status_code in (400, 403, 404), r.status_code)


def t_input_validation(ADM):
    section("7. سلامة المدخلات")
    T = DATA["T1"]
    r = CL.put("/api/driver/identity", headers={"X-Token": T, "Content-Type": "application/json"}, data="{bad json")
    chk("JSON غير صالح لا يُسقط الخادم", r.status_code < 500, r.status_code)
    r = CL.post("/api/requests", headers={"X-Token": T}, json={})
    chk("طلب بدون نوع يُرفض بوضوح", 400 <= r.status_code < 500, r.status_code)
    s, j, _ = call("post", "/api/requests", T, {"request_type": "نوع_غير_موجود"})
    chk("نوع طلب غير معروف يُرفض", s == 400, s)
    name = "O'Brien \"<b>اختبار</b>\""
    s, _, _ = call("put", "/api/driver/identity", T, {"nom_fr": name})
    s2, prof, _ = call("get", "/api/driver/profile", T)
    chk("الأحرف الخاصة تُحفظ كما هي", (prof.get("driver") or {}).get("nom_fr") == name, (prof.get("driver") or {}).get("nom_fr"))
    r, _ = call("get", f"/api/admin/print/history/{DATA['did1']}?token={pt(ADM)}", raw=True)
    html = r.get_data(as_text=True)
    chk("الوسوم في الأسماء تُعرض كنص في الوثائق (لا تُنفَّذ)", "<b>اختبار</b>" not in html, "الوسم ظاهر كـ HTML")
    call("put", "/api/driver/identity", T, {"nom_fr": "TEST"})
    big = "A" * (30 * 1024 * 1024)
    r = CL.post("/api/requests", headers={"X-Token": T}, json={"request_type": "شهادة_إدارية", "purpose": big})
    chk("رفض الطلبات الضخمة (> 25 MB)", r.status_code == 413, r.status_code)
    s, j, _ = call("post", "/api/requests", T, {"request_type": "شهادة_إدارية", "purpose": "' OR 1=1 --"})
    s2, lst, _ = call("get", "/api/requests", T)
    chk("علامات SQL في النصوص لا تؤثر", s < 500 and s2 == 200, (s, s2))


def t_concurrency(ADM):
    section("8. التزامن والضغط (طلبات متزامنة)")
    toks = [new_driver(100 + i) for i in range(20)]
    nums, errs = [], []
    lock = threading.Lock()

    def work(i, tok):
        c = client(f"10.250.1.{i}")
        call("put", "/api/driver/identity", tok, {"nom_ar": "تزامن", "prenom_ar": str(i), "nin": nin(100 + i),
                                                  "date_naissance": "1990-01-01", "telephone": f"06610{i:05d}", "wilaya": "البيض"}, c=c)
        s, j, _ = call("post", "/api/requests", tok, {"request_type": "شهادة_إدارية"}, c=c)
        with lock:
            (nums if s in (200, 201) else errs).append(j.get("request_number") or f"{s}:{j.get('error')}")

    th = [threading.Thread(target=work, args=(i, t)) for i, t in enumerate(toks)]
    t0 = time.time()
    [t.start() for t in th]
    [t.join() for t in th]
    chk("20 طلباً متزامناً كلها مقبولة", not errs, errs[:3])
    chk("أرقام الطلبات المتزامنة فريدة (لا تكرار)", len(set(nums)) == len(nums), f"{len(nums)} رقم / {len(set(nums))} فريد")
    chk("مدة معالجة 20 طلباً متزامناً < 10 ثوان", time.time() - t0 < 10, f"{time.time() - t0:.1f} s")
    s, prep, _ = call("get", f"/api/admin/work-cert/prepare?driver_id={DATA['did1']}", ADM)
    cert_nums, cerr = [], []

    def cert(i):
        c = client(f"10.250.2.{i}")
        r = c.post("/api/admin/work-cert/render", headers={"X-Token": ADM}, json={"person": prep.get("person"), "periods": prep.get("periods")})
        with lock:
            (cert_nums if r.status_code == 200 else cerr).append(r.headers.get("X-Cert-Number") or r.status_code)

    th = [threading.Thread(target=cert, args=(i,)) for i in range(10)]
    [t.start() for t in th]
    [t.join() for t in th]
    chk("10 شهادات إدارية متزامنة كلها مُحرّرة", not cerr, cerr[:3])
    chk("أرقام الشهادات المتزامنة فريدة", len(set(cert_nums)) == len(cert_nums), f"{len(cert_nums)} / {len(set(cert_nums))}")


def t_performance(ADM):
    section("9. الأداء (زمن الاستجابة)")
    for u, tok, lbl in (("/api/admin/requests", ADM, "قائمة الطلبات (الإدارة)"), ("/api/admin/drivers", ADM, "قائمة السائقين"),
                        ("/api/admin/stats", ADM, "الإحصائيات"), ("/api/driver/profile", DATA["T1"], "ملف السائق"),
                        (f"/api/admin/print/history/{DATA['did1']}?token={pt(ADM)}", None, "وثيقة مطبوعة")):
        times = sorted(call("get", u, tok, raw=True)[1] for _ in range(30))
        p95 = times[int(len(times) * 0.95) - 1]
        chk(f"{lbl}: p95 < 300 ms", p95 < 300, f"وسيط {times[15]:.0f} ms — p95 {p95:.0f} ms")


def t_monitoring(ADM):
    section("10. نظام المراقبة والتدقيق")
    s, st, _ = call("get", "/api/monitor/status", ADM)
    chk("حالة الخادم متاحة", s == 200 and st.get("status") == "running", s)
    call("get", f"/api/st-missing-{RUN}")
    s, e, _ = call("get", "/api/monitor/errors?n=300", ADM)
    chk("الأخطاء تُسجَّل وتظهر في المراقبة", any(f"st-missing-{RUN}" in (x.get("path") or "") for x in e.get("errors", [])), s)
    s, a, _ = call("get", f"/api/admin/audit?q={RUN}", ADM)
    s2, a2, _ = call("get", "/api/admin/audit", ADM)
    chk("عمليات الإدارة مسجّلة في سجلّ التدقيق", s2 == 200 and any(x.get("username") == ADMIN_USER for x in a2.get("items", [])), s2)
    chk("سجلّ التدقيق لا يحفظ كلمات المرور", not any("Test1234x" in (x.get("detail") or "") or ADMIN_PW in (x.get("detail") or "")
                                                     for x in a2.get("items", [])))
    s, j, _ = call("get", "/api/admin/notifications/summary", ADM)
    chk("ملخص الإشعارات للإدارة", s == 200, s)
    s, j, _ = call("get", "/api/admin/export/excel", ADM)
    r = CL.get("/api/admin/export/excel", headers={"X-Token": ADM})
    chk("تصدير Excel", r.status_code == 200 and len(r.data) > 1000, f"{r.status_code} {len(r.data)}B")


def save_report(dur):
    total = len(RESULTS)
    fails = sum(r["status"] == "fail" for r in RESULTS)
    warns = sum(r["status"] == "warn" for r in RESULTS)
    with get_db() as conn:
        conn.execute("""CREATE TABLE IF NOT EXISTS selftest_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (datetime('now','localtime')),
            duration REAL, total INTEGER, passed INTEGER, failed INTEGER, warnings INTEGER, data TEXT)""")
        cur = conn.execute("INSERT INTO selftest_reports (duration, total, passed, failed, warnings, data) VALUES (?,?,?,?,?,?)",
                           (round(dur, 1), total, total - fails - warns, fails, warns, json.dumps(RESULTS, ensure_ascii=False)))
        conn.commit()
        return cur.lastrowid, total, fails, warns


def main():
    s, j, _ = call("post", "/api/auth/login", js={"username": ADMIN_USER, "password": ADMIN_PW, "space": "admin"})
    ADM = j.get("token")
    tests = [t_infrastructure, t_live_site, t_accounts, lambda: t_driver_flow(ADM), lambda: t_company_flow(ADM),
             lambda: t_access_control(ADM), lambda: t_input_validation(ADM), lambda: t_concurrency(ADM),
             lambda: t_performance(ADM), lambda: t_monitoring(ADM)]
    try:
        for t in tests:
            try:
                t()
            except Exception as e:
                import traceback
                chk("تعذّر إكمال هذا القسم", False, f"{type(e).__name__}: {e} | {traceback.format_exc().splitlines()[-3].strip()}")
    finally:
        cleanup_admin()
    rid, total, fails, warns = save_report(time.time() - T0)
    print(f"\n════ النتيجة: {total} اختباراً — ✅ {total - fails - warns}  ⚠️  {warns}  ❌ {fails}  — {time.time() - T0:.0f} ثانية")
    print(f"     التقرير رقم {rid}: لوحة الإدارة ← مراقبة النظام ← تقارير الفحص الشامل (طباعة / حفظ PDF)")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
