"""
utils.py — الدوال المشتركة بين app.py وجميع الـ routes
يحل مشكلة الـ circular import
"""
from flask import request, jsonify
from functools import wraps
from pathlib import Path
from datetime import datetime
from database import get_db

APP_DIR    = Path(__file__).resolve().parent
IMAGES_DIR = APP_DIR / "images"
IMAGES_DIR.mkdir(exist_ok=True)


def get_account_from_token(token: str):
    if not token:
        return None
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM accounts WHERE token=? AND is_active=1", (token,)
        ).fetchone()
        return dict(row) if row else None


def save_image(base64_str: str, prefix: str, nin: str, mime_type: str = None) -> str | None:
    """يحفظ صورة (JPG/PNG/WEBP) أو PDF — النوع يُحدَّد من محتوى الملف نفسه فقط
    (لا يُوثق بالامتداد المرسل من المتصفح: يمنع رفع HTML/JS يُنفَّذ عند فتحه)"""
    if not base64_str:
        return None
    try:
        import base64
        data = base64.b64decode(base64_str)
        if data[:4] == b"%PDF":
            ext = "pdf"
        elif data[:8] == b"\x89PNG\r\n\x1a\n":
            ext = "png"
        elif data[:3] == b"\xff\xd8\xff":
            ext = "jpg"
        elif data[:4] == b"RIFF" and data[8:12] == b"WEBP":
            ext = "webp"
        else:
            return None   # نوع غير مسموح
        nin_safe = "".join(ch for ch in (nin or "x") if ch.isalnum()) or "x"
        ts = datetime.now().strftime('%Y%m%d%H%M%S%f')
        filename = f"{prefix}_{nin_safe}_{ts}.{ext}"
        (IMAGES_DIR / filename).write_bytes(data)
        return filename
    except Exception:
        return None

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        # يقبل الـ token من Header أو من query param ?token=
        token = request.headers.get("X-Token", "") or request.args.get("token", "")
        acc = get_account_from_token(token)
        if not acc:
            return jsonify({"error": "غير مصرح"}), 401
        return f(*args, account=acc, **kwargs)
    return decorated


def require_admin(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get("X-Token", "") or request.args.get("token", "")
        acc = get_account_from_token(token)
        if not acc or acc["role"] != "admin":
            return jsonify({"error": "للمدير فقط"}), 403
        return f(*args, account=acc, **kwargs)
    return decorated
