from flask import Flask, request, jsonify, send_from_directory, redirect
from flask import redirect as _redirect
from flask_cors import CORS
import hashlib, secrets, urllib.parse
import requests as req_lib
from pathlib import Path
from database import get_db, init_db, migrate_db

import json as _json, os as _os
# الإعدادات السرية تُقرأ من config.local.json (غير مرفوع إلى GitHub) أو من متغيرات البيئة
_CFG_PATH = Path(__file__).resolve().parent / "config.local.json"
_CFG = _json.loads(_CFG_PATH.read_text(encoding="utf-8")) if _CFG_PATH.exists() else {}
def _cfg(key, default=""):
    return _os.environ.get(key) or _CFG.get(key, default)

# ── Google OAuth ──
GOOGLE_CLIENT_ID     = _cfg("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = _cfg("GOOGLE_CLIENT_SECRET")
GOOGLE_REDIRECT_URI  = _cfg("GOOGLE_REDIRECT_URI")
GOOGLE_AUTH_URL      = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL     = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL  = "https://www.googleapis.com/oauth2/v3/userinfo"
FRONTEND_URL         = _cfg("FRONTEND_URL")

# الخادم السحابي — يمر عبر sms-gate.app → الهاتف → SMS
SMS_API_URL  = "https://api.sms-gate.app/3rdparty/v1"
SMS_USERNAME = _cfg("SMS_USERNAME")
SMS_PASSWORD = _cfg("SMS_PASSWORD")
SMS_SIM      = int(_cfg("SMS_SIM", 1))
 
from utils import require_auth, require_admin, IMAGES_DIR
from monitor_middleware import register_monitor, register_monitor_api

app = Flask(__name__)
CORS(app)


# ════════════════════════════════════════
# Favicon (تجنب تسجيل 404 المتكرر)
# ════════════════════════════════════════
@app.route("/favicon.ico")
def favicon():
    return "", 204

init_db()
migrate_db()

# ══ نظام المراقبة ══
register_monitor(app)

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

# ════════════════════════════════════════
# المصادقة
# ════════════════════════════════════════

@app.route("/api/auth/register", methods=["POST"])
def register():
    data     = request.get_json() or {}
    username = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()
    role     = (data.get("role") or "driver").strip()
    if role not in ("driver", "company"):
        role = "driver"
    if not username or not password:
        return jsonify({"error": "اسم المستخدم وكلمة المرور مطلوبان"}), 400
    if len(password) < 6:
        return jsonify({"error": "كلمة المرور يجب أن تكون 6 أحرف على الأقل"}), 400

    with get_db() as conn:
        if conn.execute("SELECT id FROM accounts WHERE username=?", (username,)).fetchone():
            return jsonify({"error": "اسم المستخدم موجود مسبقاً"}), 409
        cursor = conn.execute(
            "INSERT INTO accounts (username, password_hash, role) VALUES (?,?,?)",
            (username, hash_password(password), role)
        )
        account_id = cursor.lastrowid

        if role == "company":
            # إنشاء سجل الشركة مع البيانات الأساسية
            nom_ar     = (data.get("nom_ar") or "").strip() or None
            nom_fr     = (data.get("nom_fr") or "").strip() or None
            rc         = (data.get("registre_commerce") or "").strip() or None
            telephone  = (data.get("telephone") or "").strip() or None
            adresse    = (data.get("adresse") or "").strip() or None
            wilaya     = (data.get("wilaya") or "").strip() or None
            rep_nom    = (data.get("representant_nom") or "").strip() or None
            conn.execute(
                """INSERT INTO companies (account_id, nom_ar, nom_fr,
                   registre_commerce, telephone, adresse, wilaya, representant_nom)
                   VALUES (?,?,?,?,?,?,?,?)""",
                (account_id, nom_ar, nom_fr, rc, telephone, adresse, wilaya, rep_nom)
            )
        conn.commit()
    return jsonify({"success": True, "id": account_id, "role": role}), 201


@app.route("/api/auth/login", methods=["POST"])
def login():
    data     = request.get_json() or {}
    username = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()
    if not username or not password:
        return jsonify({"error": "اسم المستخدم وكلمة المرور مطلوبان"}), 400

    with get_db() as conn:
        acc = conn.execute(
            "SELECT * FROM accounts WHERE username=? AND is_active=1", (username,)
        ).fetchone()
        if not acc or acc["password_hash"] != hash_password(password):
            return jsonify({"error": "بيانات الدخول غير صحيحة"}), 401

        token = secrets.token_hex(32)
        conn.execute(
            "UPDATE accounts SET token=?, updated_at=datetime('now','localtime') WHERE id=?",
            (token, acc["id"])
        )
        driver = conn.execute(
            "SELECT id FROM drivers WHERE account_id=?", (acc["id"],)
        ).fetchone()
        company = conn.execute(
            "SELECT id, nom_ar, nom_fr FROM companies WHERE account_id=?", (acc["id"],)
        ).fetchone()
        acc_role     = acc["role"]
        acc_username = acc["username"]
        driver_id    = driver["id"] if driver else None
        company_id   = company["id"] if company else None
        company_name = (company["nom_ar"] or company["nom_fr"]) if company else None

    return jsonify({
        "token":      token,
        "role":       acc_role,
        "username":   acc_username,
        "driver_id":  driver_id,
        "company_id": company_id,
        "company_name": company_name,
    })


@app.route("/api/auth/logout", methods=["POST"])
@require_auth
def logout(account):
    with get_db() as conn:
        conn.execute(
            "UPDATE accounts SET token=NULL, updated_at=datetime('now','localtime') WHERE id=?",
            (account["id"],)
        )
        conn.commit()
    return jsonify({"success": True})


@app.route("/api/auth/me", methods=["GET"])
@require_auth
def me(account):
    with get_db() as conn:
        driver = conn.execute(
            "SELECT id FROM drivers WHERE account_id=?", (account["id"],)
        ).fetchone()
        driver_id = driver["id"] if driver else None
    return jsonify({
        "id":        account["id"],
        "username":  account["username"],
        "role":      account["role"],
        "driver_id": driver_id,
    })


# ════════════════════════════════════════
# الصور
# ════════════════════════════════════════

def _safe_send(filename):
    resp = send_from_directory(IMAGES_DIR, filename)
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["Content-Security-Policy"] = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'"
    return resp


@app.route("/api/images/<filename>")
@require_auth
def serve_image(account, filename):
    # الصور وثائق شخصية (بطاقات هوية، رخص، قرارات): المدير يرى الكل،
    # والسائق يرى فقط الملفات المحفوظة باسم NIN الخاص به
    if account.get("role") == "company":
        with get_db() as conn:
            co = conn.execute("SELECT id FROM companies WHERE account_id=?", (account["id"],)).fetchone()
        if not co or f"_co{co['id']}_" not in filename:
            return jsonify({"error": "غير مصرح"}), 403
        return _safe_send(filename)
    if account.get("role") != "admin":
        with get_db() as conn:
            drv = conn.execute("SELECT nin FROM drivers WHERE account_id=?", (account["id"],)).fetchone()
        nin = (drv["nin"] if drv else "") or ""
        # تطابق تام لجزء NIN في اسم الملف (وليس مجرد احتواء نص) — NIN = 18 رقماً
        parts = filename.split("_")
        if not (nin.isdigit() and len(nin) == 18 and nin in parts):
            return jsonify({"error": "غير مصرح"}), 403
    return _safe_send(filename)


# ════════════════════════════════════════
# تسجيل الـ Blueprints
# ════════════════════════════════════════

from routes.driver        import driver_bp
from routes.door          import door_bp
from routes.deputy        import deputy_bp
from routes.requests      import requests_bp
from routes.ocr           import ocr_bp
from routes.print         import print_bp
from routes.admin         import admin_bp
from routes.notifications import notif_bp



# ── Google OAuth ──
@app.route("/api/auth/google")
def google_login():
    params = {
        "client_id":     GOOGLE_CLIENT_ID,
        "redirect_uri":  GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope":         "openid email profile",
        "access_type":   "offline",
        "prompt":        "select_account",
        # نوع الحساب المطلوب (سائق / شركة) يُمرَّر عبر state ويعود في الـ callback
        # «.app» ← الدخول من تطبيق الهاتف (متصفح الهاتف ثم العودة إلى التطبيق)
        "state":         ("company" if request.args.get("role") == "company" else "driver")
                         + (".app" if request.args.get("app") == "1" else ""),
    }
    url = GOOGLE_AUTH_URL + "?" + urllib.parse.urlencode(params)
    return redirect(url)


@app.route("/api/auth/google/callback")
def google_callback():
    code  = request.args.get("code")
    error = request.args.get("error")
    state = request.args.get("state", "")
    want  = "company" if state.split(".")[0] == "company" else "driver"
    from_app = state.endswith(".app")

    def redirect(url):
        # تطبيق الهاتف: Google يمنع الدخول داخل WebView، فيتم في متصفح الهاتف
        # ثم تُعاد النتيجة (نفس المعاملات) إلى التطبيق عبر رابط intent
        if not from_app:
            return _redirect(url)
        query = url.split("?", 1)[1] if "?" in url else ""
        intent = f"intent://auth?{query}#Intent;scheme=taxiapp;package=dz.taxi.mobile;end"
        return (
            "<!DOCTYPE html><html dir='rtl' lang='ar'><head><meta charset='utf-8'>"
            "<meta name='viewport' content='width=device-width,initial-scale=1'>"
            "<title>العودة إلى التطبيق</title></head>"
            "<body style='font-family:sans-serif;text-align:center;padding:40px 16px'>"
            "<h3>🚕 تمّ — العودة إلى تطبيق سيارات الأجرة</h3>"
            f"<p><a href=\"{intent}\" style='display:inline-block;padding:14px 28px;background:#0d5c4f;"
            "color:#fff;border-radius:10px;text-decoration:none;font-size:18px'>فتح التطبيق</a></p>"
            f"<script>location.href={_json.dumps(intent)};</script>"
            "</body></html>"
        )

    if error or not code:
        return redirect(FRONTEND_URL + f"/?google_error=cancelled&want={want}")

    # تبادل الكود بتوكن الوصول
    try:
        token_resp = req_lib.post(GOOGLE_TOKEN_URL, data={
            "code":          code,
            "client_id":     GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "redirect_uri":  GOOGLE_REDIRECT_URI,
            "grant_type":    "authorization_code",
        }, timeout=10)
        token_data   = token_resp.json()
        access_token = token_data.get("access_token")
    except Exception as e:
        return redirect(FRONTEND_URL + f"/?google_error=token_failed&want={want}")

    if not access_token:
        return redirect(FRONTEND_URL + f"/?google_error=token_failed&want={want}")

    # جلب بيانات المستخدم من قوقل
    try:
        user_info = req_lib.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10
        ).json()
    except Exception:
        return redirect(FRONTEND_URL + f"/?google_error=userinfo_failed&want={want}")

    google_id = user_info.get("sub")
    email     = user_info.get("email", "")
    name      = user_info.get("name", "")

    if not google_id:
        return redirect(FRONTEND_URL + f"/?google_error=no_google_id&want={want}")

    with get_db() as conn:
        # هل الحساب موجود بهذا google_id؟
        acc = conn.execute(
            "SELECT * FROM accounts WHERE google_id=?", (google_id,)
        ).fetchone()

        if not acc:
            # إنشاء حساب جديد
            base_username = (email.split("@")[0] if email else name.replace(" ", "_").lower() or "user")
            username = base_username
            i = 1
            while conn.execute("SELECT id FROM accounts WHERE username=?", (username,)).fetchone():
                username = f"{base_username}{i}"
                i += 1

            cursor = conn.execute(
                "INSERT INTO accounts (username, password_hash, role, google_id, google_email) VALUES (?,?,?,?,?)",
                (username, "", want, google_id, email)
            )
            account_id = cursor.lastrowid
            if want == "company":
                conn.execute("INSERT INTO companies (account_id) VALUES (?)", (account_id,))
            conn.commit()
            acc = conn.execute("SELECT * FROM accounts WHERE id=?", (account_id,)).fetchone()

        # الحساب موجود بنوع مختلف عن الزر المستعمل (المدير مسموح من زر السائقين)
        wrong = (acc["role"] != "company") if want == "company" else (acc["role"] == "company")
        if wrong:
            return redirect(FRONTEND_URL + f"/?google_error=wrong_type&want={want}")

        # توليد توكن جلسة
        token = secrets.token_hex(32)
        conn.execute(
            "UPDATE accounts SET token=?, google_email=?, updated_at=datetime('now','localtime') WHERE id=?",
            (token, email, acc["id"])
        )
        driver  = conn.execute("SELECT id FROM drivers WHERE account_id=?", (acc["id"],)).fetchone()
        company = conn.execute("SELECT id FROM companies WHERE account_id=?", (acc["id"],)).fetchone()
        conn.commit()

    driver_id    = driver["id"]  if driver  else ""
    company_id   = company["id"] if company else ""
    role         = acc["role"]
    username_out = acc["username"]

    params_out = urllib.parse.urlencode({
        "token":      token,
        "role":       role,
        "username":   username_out,
        "driver_id":  driver_id,
        "company_id": company_id,
        "google":     "1",
    })
    return redirect(f"{FRONTEND_URL}/?{params_out}")


# ════════════════════════════════════════
# مسارات الشركة
# ════════════════════════════════════════
# (مسارات الشركة انتقلت إلى routes/company.py)

from routes.company import company_bp
app.register_blueprint(company_bp)
app.register_blueprint(driver_bp)
app.register_blueprint(door_bp)
app.register_blueprint(deputy_bp)
app.register_blueprint(requests_bp)
app.register_blueprint(ocr_bp)
app.register_blueprint(print_bp)
app.register_blueprint(admin_bp)
app.register_blueprint(notif_bp)


register_monitor_api(app)

# ════════════════════════════════════════
# SMS OTP — نسيت كلمة المرور
# ════════════════════════════════════════

import random, base64
from datetime import datetime, timedelta

def send_sms(phone, message):
    """إرسال SMS عبر sms-gate.app"""
    # تحويل الرقم الجزائري: 05XXXXXXXX → +2135XXXXXXXX
    p = phone.strip()
    if p.startswith("0") and len(p) == 10:
        p = "+213" + p[1:]
    elif not p.startswith("+"):
        p = "+" + p
    creds = base64.b64encode(f"{SMS_USERNAME}:{SMS_PASSWORD}".encode()).decode()
    try:
        resp = req_lib.post(
            f"{SMS_API_URL}/message",
            headers={"Authorization": f"Basic {creds}",
                     "Content-Type": "application/json"},
            json={"message": message, "phoneNumbers": [p], "simNumber": SMS_SIM},
            timeout=15
        )
        print(f"SMS API status: {resp.status_code}, body: {resp.text[:300]}")
        return resp.status_code in (200, 201, 202)
    except Exception as e:
        print(f"SMS send error: {e}")
        return False

@app.route("/api/auth/forgot-password", methods=["POST"])
def forgot_password():
    data = request.get_json() or {}
    phone = (data.get("phone") or "").strip()
    if not phone:
        return jsonify({"error": "أدخل رقم الهاتف"}), 400
    with get_db() as conn:
        acc = conn.execute(
            "SELECT id FROM accounts WHERE username=?", (phone,)
        ).fetchone()
        if not acc:
            # لا نكشف أن الحساب غير موجود
            return jsonify({"ok": True})
        # حد الإرسال: رسالة واحدة كل دقيقة لنفس الحساب
        prev = conn.execute("SELECT reset_otp_expiry FROM accounts WHERE id=?", (acc["id"],)).fetchone()
        if prev and prev["reset_otp_expiry"]:
            try:
                sent_at = datetime.strptime(prev["reset_otp_expiry"], "%Y-%m-%d %H:%M:%S") - timedelta(minutes=10)
                if (datetime.now() - sent_at).total_seconds() < 60:
                    return jsonify({"error": "انتظر دقيقة قبل طلب رمز جديد"}), 429
            except ValueError:
                pass
        import secrets as _s
        otp = f"{_s.randbelow(900000) + 100000}"
        expiry = (datetime.now() + timedelta(minutes=10)).strftime("%Y-%m-%d %H:%M:%S")
        conn.execute(
            "UPDATE accounts SET reset_otp=?, reset_otp_expiry=?, reset_attempts=0 WHERE id=?",
            (otp, expiry, acc["id"])
        )
        conn.commit()
    ok = send_sms(phone,
        f"نظام إدارة سيارات الأجرة\nرمز إعادة تعيين كلمة المرور: {otp}\nصالح 10 دقائق")
    if not ok:
        return jsonify({"error": "فشل إرسال الرسالة — تأكد أن التطبيق يعمل على الهاتف"}), 500
    return jsonify({"ok": True})

@app.route("/api/auth/reset-password", methods=["POST"])
def reset_password():
    data = request.get_json() or {}
    phone    = (data.get("phone") or "").strip()
    otp      = (data.get("otp") or "").strip()
    new_pass = (data.get("new_password") or "").strip()
    if not phone or not otp or not new_pass:
        return jsonify({"error": "بيانات ناقصة"}), 400
    if len(new_pass) < 6:
        return jsonify({"error": "كلمة المرور يجب أن تكون 6 أحرف على الأقل"}), 400
    with get_db() as conn:
        acc = conn.execute(
            "SELECT id, reset_otp, reset_otp_expiry, reset_attempts FROM accounts WHERE username=?",
            (phone,)
        ).fetchone()
        if not acc or not acc["reset_otp"]:
            return jsonify({"error": "الرمز غير صحيح"}), 400
        if (acc["reset_attempts"] or 0) >= 5:
            conn.execute("UPDATE accounts SET reset_otp=NULL, reset_otp_expiry=NULL WHERE id=?", (acc["id"],))
            conn.commit()
            return jsonify({"error": "محاولات كثيرة خاطئة — اطلب رمزاً جديداً"}), 400
        if acc["reset_otp"] != otp:
            conn.execute("UPDATE accounts SET reset_attempts=COALESCE(reset_attempts,0)+1 WHERE id=?", (acc["id"],))
            conn.commit()
            return jsonify({"error": "الرمز غير صحيح"}), 400
        if acc["reset_otp_expiry"] and datetime.now() > datetime.strptime(acc["reset_otp_expiry"], "%Y-%m-%d %H:%M:%S"):
            return jsonify({"error": "انتهت صلاحية الرمز — اطلب رمزاً جديداً"}), 400
        h = hashlib.sha256(new_pass.encode()).hexdigest()
        conn.execute(
            # إلغاء الجلسات القديمة (token=NULL) عند تغيير كلمة المرور
            "UPDATE accounts SET password_hash=?, reset_otp=NULL, reset_otp_expiry=NULL, reset_attempts=0, token=NULL WHERE id=?",
            (h, acc["id"])
        )
        conn.commit()
    return jsonify({"ok": True, "message": "تم تغيير كلمة المرور بنجاح"})


if __name__ == "__main__":
    print("🚕 خادم نظام سيارات الأجرة — المنفذ 5000")
    app.run(host="0.0.0.0", port=5000, debug=False, use_reloader=True)
