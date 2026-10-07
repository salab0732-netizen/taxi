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


def get_account_from_token(token: str = None):
    """رمز الجلسة من الترويسة X-Token فقط؛ الروابط (?token=) تقبل رموز الطباعة القصيرة pt_ فقط."""
    from security import lookup_account
    hdr = request.headers.get("X-Token", "")
    with get_db() as conn:
        acc = lookup_account(conn, hdr, False) if hdr else \
              lookup_account(conn, request.args.get("token", ""), True)
    if acc:
        request._sec_account = acc
    return acc


STORE_UPLOADED_DOCUMENTS = False


def save_image(base64_str: str, prefix: str, nin: str, mime_type: str = None) -> str | None:
    """يحفظ صورة (JPG/PNG/WEBP) أو PDF — النوع يُحدَّد من محتوى الملف نفسه فقط
    (لا يُوثق بالامتداد المرسل من المتصفح: يمنع رفع HTML/JS يُنفَّذ عند فتحه)"""
    # سياسة المديرية: لا تُحفظ أي وثيقة مرفوعة (بطاقة رمادية، رخصة، بطاقة تعريف، قرار…) في البرنامج —
    # الصورة تُستعمل للقراءة الآلية (OCR) فقط ثم تُهمل، والوثائق المولّدة تُنشأ عند الطلب
    if not STORE_UPLOADED_DOCUMENTS or not base64_str:
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
        acc = get_account_from_token()
        if not acc:
            return jsonify({"error": "غير مصرح"}), 401
        return f(*args, account=acc, **kwargs)
    return decorated


def require_admin(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        acc = get_account_from_token()
        if not acc or acc["role"] != "admin":
            return jsonify({"error": "للمدير فقط"}), 403
        return f(*args, account=acc, **kwargs)
    return decorated
