import logging, traceback, time, json, os
from datetime import datetime
from pathlib import Path
from flask import request, g

LOG_DIR = Path(__file__).resolve().parent.parent / "logs"
LOG_DIR.mkdir(exist_ok=True)

# ══ إعداد Logger ══
def _make_logger(name, filename, level=logging.DEBUG):
    logger = logging.getLogger(name)
    if logger.handlers: return logger
    logger.setLevel(level)
    fh = logging.FileHandler(LOG_DIR / filename, encoding="utf-8")
    fh.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(fh)
    return logger

error_log   = _make_logger("taxi.errors",   "errors.log")
request_log = _make_logger("taxi.requests", "requests.log")
ocr_log     = _make_logger("taxi.ocr",      "ocr.log")

def _now():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

def _entry(**kwargs):
    return json.dumps({"ts": _now(), **kwargs}, ensure_ascii=False)

# ══ تسجيل الطلبات والأخطاء ══
def register_monitor(app):

    @app.before_request
    def before():
        g.start_time = time.time()

    @app.after_request
    def after(response):
        duration = round((time.time() - g.get("start_time", time.time())) * 1000)
        entry = _entry(
            method   = request.method,
            path     = request.path,
            status   = response.status_code,
            ms       = duration,
            ip       = request.remote_addr,
            agent    = request.headers.get("User-Agent","")[:60],
        )
        request_log.info(entry)
        # سجّل الأخطاء 4xx/5xx
        if response.status_code >= 400:
            try:
                body = response.get_json(silent=True) or {}
            except Exception:
                body = {}
            error_log.warning(_entry(
                level    = "HTTP_ERROR",
                method   = request.method,
                path     = request.path,
                status   = response.status_code,
                error    = body.get("error", ""),
                ms       = duration,
            ))
        return response

    @app.errorhandler(Exception)
    def handle_exception(e):
        tb = traceback.format_exc()
        error_log.error(_entry(
            level   = "EXCEPTION",
            path    = request.path,
            method  = request.method,
            error   = str(e),
            trace   = tb[-800:],
        ))
        return {"error": "خطأ داخلي في الخادم", "detail": str(e)}, 500

    @app.errorhandler(404)
    def not_found(e):
        error_log.info(_entry(level="404", path=request.path, method=request.method))
        return {"error": "المسار غير موجود"}, 404

    @app.errorhandler(405)
    def method_not_allowed(e):
        error_log.warning(_entry(level="405", path=request.path, method=request.method))
        return {"error": "الطريقة غير مسموحة"}, 405

# ══ تسجيل OCR منفصل ══
def log_ocr(route, success, duration_ms, error=None, fields_empty=None):
    ocr_log.info(_entry(
        route      = route,
        success    = success,
        ms         = duration_ms,
        error      = error,
        empty      = fields_empty,
    ))

# ══ تسجيل خطأ يدوي ══
def log_error(level, msg, **kwargs):
    error_log.error(_entry(level=level, msg=msg, **kwargs))

# ══ API للمراقبة ══
def register_monitor_api(app):
    from flask import jsonify
    from utils import require_admin

    @app.route("/api/monitor/errors", methods=["GET"])
    @require_admin
    def get_errors(account):
        n = int(request.args.get("n", 50))
        log_file = LOG_DIR / "errors.log"
        if not log_file.exists():
            return jsonify({"errors": []})
        lines = log_file.read_text(encoding="utf-8").strip().split("\n")
        lines = [l for l in lines if l.strip()][-n:]
        entries = []
        for l in reversed(lines):
            try: entries.append(json.loads(l))
            except: entries.append({"raw": l})
        return jsonify({"errors": entries, "total": len(lines)})

    @app.route("/api/monitor/requests", methods=["GET"])
    @require_admin
    def get_requests(account):
        n = int(request.args.get("n", 100))
        log_file = LOG_DIR / "requests.log"
        if not log_file.exists():
            return jsonify({"requests": []})
        lines = log_file.read_text(encoding="utf-8").strip().split("\n")
        lines = [l for l in lines if l.strip()][-n:]
        entries = []
        for l in reversed(lines):
            try: entries.append(json.loads(l))
            except: pass
        return jsonify({"requests": entries})

    @app.route("/api/monitor/status", methods=["GET"])
    @require_admin
    def get_status(account):
        import sqlite3
        from database import get_db
        stats = {}
        try:
            with get_db() as conn:
                stats["drivers"]   = conn.execute("SELECT COUNT(*) FROM accounts WHERE role='driver'").fetchone()[0]
                stats["contracts"] = conn.execute("SELECT COUNT(*) FROM rental_contracts WHERE is_current=1").fetchone()[0]
        except Exception as e:
            stats["db_error"] = str(e)

        # آخر 10 أخطاء
        log_file = LOG_DIR / "errors.log"
        last_errors = []
        if log_file.exists():
            lines = log_file.read_text(encoding="utf-8").strip().split("\n")
            for l in reversed([x for x in lines if x.strip()][-20:]):
                try: last_errors.append(json.loads(l))
                except: pass
                if len(last_errors) >= 5: break

        return jsonify({
            "status":      "running",
            "ts":          _now(),
            "stats":       stats,
            "last_errors": last_errors,
        })

    @app.route("/api/monitor/frontend-error", methods=["POST"])
    def frontend_error():
        data = request.get_json() or {}
        error_log.error(_entry(
            level   = "FRONTEND",
            msg     = data.get("message",""),
            url     = data.get("url",""),
            stack   = (data.get("stack") or "")[:500],
            ua      = request.headers.get("User-Agent","")[:80],
        ))
        return jsonify({"ok": True})
