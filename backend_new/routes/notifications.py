from flask import Blueprint, request, jsonify
from database import get_db
from utils import require_auth, require_admin
from datetime import date, datetime

notif_bp = Blueprint("notifications", __name__)


def check_and_create_notifications(conn, driver_id: int):
    """
    يفحص كل التواريخ الحرجة للسائق ويُنشئ تنبيهات إن لزم.
    يستقبل conn موجود مسبقاً لتجنب تداخل get_db().
    """
    today = date.today()
    checks = []

    # 1. رخصة السياقة
    lic = conn.execute(
        "SELECT date_expiration FROM driver_licenses WHERE driver_id=? AND is_current=1",
        (driver_id,)
    ).fetchone()
    if lic and lic["date_expiration"]:
        checks.append(("رخصة_سائق", lic["date_expiration"]))

    # 2. رخصة المناوب
    dep = conn.execute(
        "SELECT date_expiration_permis FROM deputies WHERE driver_id=? AND is_current=1",
        (driver_id,)
    ).fetchone()
    if dep and dep["date_expiration_permis"]:
        checks.append(("رخصة_مناوب", dep["date_expiration_permis"]))

    # 3. عقد عمل المناوب
    dep_con = conn.execute(
        "SELECT end_date FROM deputy_contracts WHERE driver_id=? AND is_current=1",
        (driver_id,)
    ).fetchone()
    if dep_con and dep_con["end_date"]:
        checks.append(("عقد_مناوب", dep_con["end_date"]))

    # 4. عقد كراء الرخصة
    rental = conn.execute(
        "SELECT end_date FROM rental_contracts WHERE driver_id=? AND is_current=1",
        (driver_id,)
    ).fetchone()
    if rental and rental["end_date"]:
        checks.append(("عقد_كراء", rental["end_date"]))

    # فحص كل تاريخ وإنشاء التنبيه
    for notif_type, expiry_str in checks:
        try:
            import re as _re
            _s = str(expiry_str).strip()
            _m = _re.match(r"^(\d{2})/(\d{2})/(\d{4})", _s)      # DD/MM/YYYY (من OCR)
            expiry    = date(int(_m.group(3)), int(_m.group(2)), int(_m.group(1))) if _m \
                        else date.fromisoformat(_s[:10])            # YYYY-MM-DD أو تاريخ+وقت
            days_left = (expiry - today).days

            if days_left < 0:
                urgency = "عاجل"
                msg = f"⛔ {notif_type.replace('_',' ')} — منتهية منذ {abs(days_left)} يوم"
            elif days_left <= 7:
                urgency = "عاجل"
                msg = f"🚨 {notif_type.replace('_',' ')} — تنتهي خلال {days_left} أيام"
            elif days_left <= 30:
                urgency = "تحذير"
                msg = f"⚠️ {notif_type.replace('_',' ')} — تنتهي خلال {days_left} يوماً"
            else:
                continue  # لا تنبيه إذا كان أكثر من 30 يوم

            # تحقق إن كان التنبيه موجوداً مسبقاً لنفس اليوم
            existing = conn.execute("""
                SELECT id FROM notifications
                WHERE driver_id=? AND notif_type=? AND related_date=? AND urgency=?
            """, (driver_id, notif_type, expiry_str, urgency)).fetchone()   # تنبيه واحد لكل تاريخ/درجة — لا تكرار يومي

            if not existing:
                conn.execute("""
                    INSERT INTO notifications
                    (driver_id, notif_type, urgency, message, related_date)
                    VALUES (?,?,?,?,?)
                """, (driver_id, notif_type, urgency, msg, expiry_str))

        except (ValueError, TypeError):
            continue

    conn.commit()


# ════════════════════════════════════════
# Endpoint 1: GET /api/notifications
# جلب تنبيهات السائق + تشغيل الفحص تلقائياً
# ════════════════════════════════════════

@notif_bp.route("/api/notifications", methods=["GET"])
@require_auth
def get_notifications(account):
    with get_db() as conn:
        driver = conn.execute(
            "SELECT id FROM drivers WHERE account_id=?", (account["id"],)
        ).fetchone()
        if not driver:
            return jsonify({"notifications": [], "unread": 0}), 200

        driver_id = driver["id"]
        # تشغيل فحص التنبيهات تلقائياً (نمرر conn لتجنب تداخل get_db)
        check_and_create_notifications(conn, driver_id)

        notifs = conn.execute("""
            SELECT * FROM notifications
            WHERE driver_id=?
            ORDER BY created_at DESC
            LIMIT 50
        """, (driver_id,)).fetchall()

        unread = conn.execute(
            "SELECT COUNT(*) FROM notifications WHERE driver_id=? AND is_read=0",
            (driver_id,)
        ).fetchone()[0]

    return jsonify({
        "notifications": [dict(n) for n in notifs],
        "unread":        unread,
    })


# ════════════════════════════════════════
# Endpoint 2: PUT /api/notifications/<notif_id>/read
# تعليم تنبيه واحد كمقروء
# ════════════════════════════════════════

@notif_bp.route("/api/notifications/<int:notif_id>/read", methods=["PUT"])
@require_auth
def mark_read(account, notif_id):
    with get_db() as conn:
        driver = conn.execute(
            "SELECT id FROM drivers WHERE account_id=?", (account["id"],)
        ).fetchone()
        if not driver:
            return jsonify({"error": "غير موجود"}), 404

        conn.execute(
            "UPDATE notifications SET is_read=1 WHERE id=? AND driver_id=?",
            (notif_id, driver["id"])
        )
        conn.commit()

    return jsonify({"success": True})


# ════════════════════════════════════════
# Endpoint 3: PUT /api/notifications/read-all
# تعليم كل التنبيهات كمقروءة
# ════════════════════════════════════════

@notif_bp.route("/api/notifications/read-all", methods=["PUT"])
@require_auth
def mark_all_read(account):
    with get_db() as conn:
        driver = conn.execute(
            "SELECT id FROM drivers WHERE account_id=?", (account["id"],)
        ).fetchone()
        if not driver:
            return jsonify({"error": "غير موجود"}), 404

        conn.execute(
            "UPDATE notifications SET is_read=1 WHERE driver_id=?",
            (driver["id"],)
        )
        conn.commit()

    return jsonify({"success": True})


# ════════════════════════════════════════
# Endpoint 4: GET /api/admin/notifications/summary
# ملخص التنبيهات لكل السائقين — للمدير فقط
# ════════════════════════════════════════

@notif_bp.route("/api/admin/notifications/summary", methods=["GET"])
@require_admin
def admin_notifications_summary(account):
    with get_db() as conn:
        urgent = conn.execute("""
            SELECT d.nom_ar, d.prenom_ar, d.nin, d.telephone,
                   COUNT(n.id) as urgent_count,
                   GROUP_CONCAT(n.notif_type, ' | ') as types
            FROM notifications n
            JOIN drivers d ON d.id = n.driver_id
            WHERE n.urgency='عاجل' AND n.is_read=0
            GROUP BY d.id
            ORDER BY urgent_count DESC
        """).fetchall()

        totals = conn.execute("""
            SELECT urgency, COUNT(*) as cnt
            FROM notifications WHERE is_read=0
            GROUP BY urgency
        """).fetchall()

    return jsonify({
        "urgent_drivers": [dict(r) for r in urgent],
        "totals":         {r["urgency"]: r["cnt"] for r in totals},
    })
