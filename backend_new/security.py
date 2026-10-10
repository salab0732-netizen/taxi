# ════════════════════════════════════════════════════════════
# security.py — أمن المنصة
#   • تجزئة كلمات المرور PBKDF2-SHA256 مع ملح (600,000 تكرار) + ترحيل تلقائي من SHA-256 القديمة
#   • الحدّ من محاولات الدخول (قفل مؤقت لكل عنوان ولكل حساب)
#   • انتهاء الجلسات + رموز طباعة قصيرة العمر (لا يمرّ رمز الجلسة في الروابط)
#   • حماية Google OAuth بمعامل state عشوائي
#   • سجلّ تدقيق للعمليات الإدارية + رؤوس أمان HTTP
# ════════════════════════════════════════════════════════════
import hashlib
import hmac
import json
import secrets
import threading
import time
from datetime import datetime, timedelta

from flask import request

# ── كلمات المرور ──────────────────────────────────────────────
PBKDF2_ITER = 600_000


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ITER)
    return f"pbkdf2_sha256${PBKDF2_ITER}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str):
    """يرجع (صحيحة؟, تحتاج ترقية؟). يقبل الصيغة القديمة SHA-256 ويطلب ترقيتها."""
    if not stored or not password:
        return False, False
    if stored.startswith("pbkdf2_sha256$"):
        try:
            _, it, salt, h = stored.split("$")
            dk = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(it))
            return hmac.compare_digest(dk.hex(), h), int(it) < PBKDF2_ITER
        except Exception:
            return False, False
    legacy = hashlib.sha256(password.encode()).hexdigest()
    return hmac.compare_digest(legacy, stored), True


def password_problem(pw: str):
    """سياسة كلمة المرور للحسابات الجديدة."""
    if len(pw or "") < 8:
        return "كلمة المرور يجب أن تكون 8 أحرف على الأقل"
    if pw.isdigit() or pw.isalpha():
        return "كلمة المرور يجب أن تجمع بين حروف وأرقام"
    return None


# ── عنوان العميل الحقيقي (خلف Caddy / Vite) ────────────────────
def client_ip() -> str:
    ra = request.remote_addr or ""
    if ra in ("127.0.0.1", "::1"):
        xff = request.headers.get("X-Forwarded-For", "")
        if xff:
            return xff.split(",")[-1].strip()   # آخر قيمة = ما أضافه الوكيل الموثوق (لا يمكن للعميل تزويرها)
    return ra


# ── الحدّ من المحاولات ─────────────────────────────────────────
class Throttle:
    """قفل بعد max_fail محاولة خاطئة خلال window ثانية، لمدة lock ثانية."""
    def __init__(self, max_fail=5, window=900, lock=900):
        self.max_fail, self.window, self.lock = max_fail, window, lock
        self._fails, self._locked = {}, {}
        self._mx = threading.Lock()

    def locked_for(self, *keys) -> int:
        now = time.time()
        with self._mx:
            return int(max([self._locked.get(k, 0) - now for k in keys] + [0]))

    def fail(self, *keys):
        now = time.time()
        with self._mx:
            for k in keys:
                lst = [t for t in self._fails.get(k, []) if now - t < self.window] + [now]
                self._fails[k] = lst
                if len(lst) >= self.max_fail:
                    self._locked[k] = now + self.lock
                    self._fails[k] = []

    def success(self, *keys):
        with self._mx:
            for k in keys:
                self._fails.pop(k, None)
                self._locked.pop(k, None)


LOGIN_THROTTLE = Throttle(max_fail=5, window=900, lock=900)      # نفس الحساب من نفس العنوان: 5 أخطاء ← 15 دقيقة
IP_THROTTLE = Throttle(max_fail=30, window=900, lock=900)        # عنوان واحد يجرّب حسابات كثيرة (مكتب كامل خلف عنوان واحد لا يُقفل بخطأ موظف)
USER_THROTTLE = Throttle(max_fail=20, window=900, lock=900)      # لكل حساب من عناوين مختلفة: 20 خطأ ← 15 دقيقة
# لا يوجد قفل عام لكل الحسابات: كان يسمح لأي شخص بتعطيل الدخول على الجميع
GLOBAL_THROTTLE = USER_THROTTLE   # توافق مع الشيفرة القديمة


def lock_message(sec: int) -> str:
    m = max(1, (sec + 59) // 60)
    return f"محاولات خاطئة كثيرة — أعد المحاولة بعد {m} دقيقة"


# ── الجلسات ورموز الطباعة ─────────────────────────────────────
SESSION_TTL = {"admin": timedelta(hours=12), "company": timedelta(days=30), "driver": timedelta(days=30)}
PRINT_TTL = timedelta(minutes=5)
_FMT = "%Y-%m-%d %H:%M:%S"


def ensure_security_schema(conn):
    cols = {r[1] for r in conn.execute("PRAGMA table_info(accounts)")}
    if "token_expires" not in cols:
        conn.execute("ALTER TABLE accounts ADD COLUMN token_expires TEXT")
    conn.execute("""CREATE TABLE IF NOT EXISTS print_tokens (
        token TEXT PRIMARY KEY, account_id INTEGER NOT NULL, expires TEXT NOT NULL)""")
    conn.execute("""CREATE TABLE IF NOT EXISTS oauth_states (
        state TEXT PRIMARY KEY, want TEXT, expires TEXT NOT NULL)""")
    conn.execute("""CREATE TABLE IF NOT EXISTS admin_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts TEXT DEFAULT (datetime('now','localtime')),
        account_id INTEGER, username TEXT, ip TEXT,
        method TEXT, path TEXT, status INTEGER, detail TEXT)""")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_audit_ts ON admin_audit(ts)")


def session_expiry(role: str) -> str:
    return (datetime.now() + SESSION_TTL.get(role, SESSION_TTL["driver"])).strftime(_FMT)


def new_session(conn, account_id: int, role: str) -> str:
    token = secrets.token_hex(32)
    conn.execute("UPDATE accounts SET token=?, token_expires=?, updated_at=datetime('now','localtime') WHERE id=?",
                 (token, session_expiry(role), account_id))
    return token


def new_print_token(conn, account_id: int) -> str:
    now = datetime.now()
    conn.execute("DELETE FROM print_tokens WHERE expires < ?", (now.strftime(_FMT),))
    t = "pt_" + secrets.token_urlsafe(24)
    conn.execute("INSERT INTO print_tokens (token, account_id, expires) VALUES (?,?,?)",
                 (t, account_id, (now + PRINT_TTL).strftime(_FMT)))
    return t


def lookup_account(conn, token: str, from_query: bool):
    """رمز الجلسة يُقبل من الترويسة فقط؛ الروابط (query) تقبل رموز الطباعة القصيرة فقط (GET)."""
    if not token:
        return None
    now = datetime.now()
    if token.startswith("pt_"):
        if not from_query or request.method != "GET":
            return None
        r = conn.execute("""SELECT a.* FROM print_tokens p JOIN accounts a ON a.id = p.account_id
                            WHERE p.token=? AND p.expires >= ? AND a.is_active=1""",
                         (token, now.strftime(_FMT))).fetchone()
        return dict(r) if r else None
    if from_query:
        return None
    r = conn.execute("SELECT * FROM accounts WHERE token=? AND is_active=1", (token,)).fetchone()
    if not r:
        return None
    acc = dict(r)
    exp = acc.get("token_expires")
    if exp:
        try:
            exp_dt = datetime.strptime(exp, _FMT)
        except ValueError:
            exp_dt = now
        if exp_dt < now:
            conn.execute("UPDATE accounts SET token=NULL, token_expires=NULL WHERE id=?", (acc["id"],))
            conn.commit()
            return None
        # تمديد منزلق: الجلسة تبقى ما دام المستخدم نشطاً
        ttl = SESSION_TTL.get(acc.get("role"), SESSION_TTL["driver"])
        if exp_dt - now < ttl - timedelta(minutes=30):
            conn.execute("UPDATE accounts SET token_expires=? WHERE id=?", (session_expiry(acc.get("role")), acc["id"]))
            conn.commit()
    else:
        # جلسة قديمة (قبل التحديث) ← تُمنح مدة صلاحية الآن
        conn.execute("UPDATE accounts SET token_expires=? WHERE id=?", (session_expiry(acc.get("role")), acc["id"]))
        conn.commit()
    return acc


# ── Google OAuth state ───────────────────────────────────────
def new_oauth_state(conn, want: str) -> str:
    now = datetime.now()
    conn.execute("DELETE FROM oauth_states WHERE expires < ?", (now.strftime(_FMT),))
    s = secrets.token_urlsafe(24)
    conn.execute("INSERT INTO oauth_states (state, want, expires) VALUES (?,?,?)",
                 (s, want, (now + timedelta(minutes=10)).strftime(_FMT)))
    return s


def take_oauth_state(conn, state: str):
    """يرجع نوع الحساب المطلوب أو None إن كان state مزوّراً/منتهياً (يُستعمل مرة واحدة)."""
    if not state:
        return None
    r = conn.execute("SELECT want FROM oauth_states WHERE state=? AND expires >= ?",
                     (state, datetime.now().strftime(_FMT))).fetchone()
    conn.execute("DELETE FROM oauth_states WHERE state=?", (state,))
    return r["want"] if r else None


# ── سجلّ التدقيق + رؤوس الأمان ─────────────────────────────────
_SENSITIVE = {"password", "new_password", "otp", "token", "image", "base64"}


def _summary(data):
    if not isinstance(data, dict):
        return ""
    out = {}
    for k, v in data.items():
        if any(s in k.lower() for s in _SENSITIVE):
            continue
        if isinstance(v, (str, int, float, bool)) or v is None:
            out[k] = v if not isinstance(v, str) else v[:120]
    return json.dumps(out, ensure_ascii=False)[:800]


CSP = ("default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; "
       "script-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self'; "
       "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'")


# عمليات تقنية متكررة لا تُعدّ تعديلاً إدارياً
_AUDIT_SKIP = {"/api/auth/print-token", "/api/monitor/frontend-error", "/api/monitor/frontend", "/api/auth/logout"}


def register_security(app, get_db):
    with get_db() as conn:
        ensure_security_schema(conn)
        conn.commit()

    @app.after_request
    def _security_after(resp):
        # رؤوس الأمان
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        resp.headers.setdefault("X-Frame-Options", "DENY")
        resp.headers.setdefault("Referrer-Policy", "no-referrer")
        resp.headers.setdefault("Permissions-Policy", "geolocation=(), microphone=()")
        if resp.mimetype == "text/html":
            resp.headers.setdefault("Content-Security-Policy", CSP)
        if request.path.startswith("/api/") and resp.mimetype == "application/json":
            resp.headers.setdefault("Cache-Control", "no-store")
        # سجلّ تدقيق العمليات الإدارية (كل تعديل يقوم به حساب إدارة)
        try:
            if request.method in ("POST", "PUT", "DELETE") and request.path.startswith("/api/") \
                    and request.path not in _AUDIT_SKIP:
                acc = getattr(request, "_sec_account", None)
                if acc and acc.get("role") == "admin":
                    with get_db() as conn:
                        conn.execute("""INSERT INTO admin_audit (account_id, username, ip, method, path, status, detail)
                                        VALUES (?,?,?,?,?,?,?)""",
                                     (acc["id"], acc.get("username"), client_ip(), request.method,
                                      request.path, resp.status_code,
                                      _summary(request.get_json(silent=True))))
                        conn.commit()
        except Exception:
            pass
        return resp
