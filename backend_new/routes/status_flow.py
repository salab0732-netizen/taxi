"""
منطق تغيير حالة السائق (توقف مؤقت / توقف نهائي / استئناف)
───────────────────────────────────────────────────────────
القاعدة المعتمدة:
  • السائق يقدّم الطلب فقط — لا يتغيّر شيء في ملفه.
  • أثناء انتظار القرار: لا يُسمح له إلا بالطباعة.
  • موافقة الإدارة = الأثر الفعلي، بتاريخ الموافقة.
  • الرفض = لا أثر.
"""

STATUS_TYPES = ("توقف_مؤقت", "توقف_نهائي", "استئناف")
STOPPED = ("توقف_مؤقت", "توقف_نهائي")
PENDING = ("جديد", "قيد_المعالجة")


def pending_status_request(conn, driver_id):
    """طلب توقف/استئناف ينتظر قرار الإدارة (إن وجد)."""
    return conn.execute(f"""
        SELECT id, request_number, request_type, created_at FROM requests
        WHERE driver_id=? AND request_type IN ('توقف_مؤقت','توقف_نهائي','استئناف')
          AND statut IN ('جديد','قيد_المعالجة')
        ORDER BY id DESC LIMIT 1
    """, (driver_id,)).fetchone()


def lock_reason(conn, driver_id):
    """
    سبب منع السائق من أي عملية تعديل (عقد، باب، مناوب، مركبة، طلبات عادية).
    يرجع None إذا كان مسموحاً.
    """
    d = conn.execute("SELECT statut FROM drivers WHERE id=?", (driver_id,)).fetchone()
    if d and d["statut"] in STOPPED:
        return f"لا يمكن إجراء هذه العملية وأنت في حالة «{d['statut'].replace('_', ' ')}» — قدّم طلب استئناف وانتظر موافقة الإدارة"
    p = pending_status_request(conn, driver_id)
    if p:
        return f"لديك طلب «{p['request_type'].replace('_', ' ')}» ({p['request_number']}) في انتظار موافقة الإدارة — لا يُسمح إلا بالطباعة حتى يُعالَج"
    return None


def _terminate_all(conn, driver_id, today, now, reason):
    """فسخ كل ما يرتبط بالاستغلال عند التوقف: الكراء، الباب، المناوب، رخصة السائق الإضافي."""
    rental = conn.execute(
        "SELECT id FROM rental_contracts WHERE driver_id=? AND is_current=1", (driver_id,)
    ).fetchone()
    if rental:
        conn.execute("""
            UPDATE rental_contracts SET is_current=0, end_date=?, end_reason=?, updated_at=? WHERE id=?
        """, (today, reason, now, rental["id"]))

    conn.execute("""
        UPDATE door_licenses SET is_active=0, current_driver_id=NULL, updated_at=?
        WHERE current_driver_id=? AND is_active=1
    """, (now, driver_id))

    dep_ct = conn.execute(
        "SELECT id FROM deputy_contracts WHERE driver_id=? AND is_current=1", (driver_id,)
    ).fetchone()
    if dep_ct:
        conn.execute("""
            UPDATE deputy_contracts SET is_current=0, end_date=?, end_reason=?, updated_at=? WHERE id=?
        """, (today, reason, now, dep_ct["id"]))
    conn.execute("""
        UPDATE deputy_permits SET is_current=0, updated_at=? WHERE driver_id=? AND is_current=1
    """, (now, driver_id))

    cur_dep = conn.execute(
        "SELECT id FROM deputies WHERE driver_id=? AND is_current=1", (driver_id,)
    ).fetchone()
    if cur_dep:
        conn.execute("""
            UPDATE deputies_history SET date_end=?, end_reason=?
            WHERE driver_id=? AND deputy_id=? AND date_end IS NULL
        """, (now, reason, driver_id, cur_dep["id"]))
        conn.execute("UPDATE deputies SET is_current=0, updated_at=? WHERE id=?", (now, cur_dep["id"]))

    conn.execute("""
        UPDATE activity_history SET date_end=? WHERE driver_id=? AND date_end IS NULL
    """, (now, driver_id))


def apply_status_request(conn, req, now):
    """
    يُطبّق الأثر الفعلي لطلب توقف/استئناف عند موافقة الإدارة.
    يرجع رسالة خطأ إن كان الطلب لم يعد منطقياً، وإلا None.
    """
    driver_id = req["driver_id"]
    rtype = req["request_type"]
    today = now[:10]
    d = conn.execute("SELECT statut FROM drivers WHERE id=?", (driver_id,)).fetchone()
    statut = d["statut"] if d else "نشط"

    if rtype in STOPPED:
        if statut == rtype:
            return f"السائق في حالة «{rtype.replace('_', ' ')}» بالفعل"
        if rtype == "توقف_مؤقت" and statut == "توقف_نهائي":
            return "لا يمكن تحويل توقف نهائي إلى توقف مؤقت — يلزم استئناف أولاً"
        conn.execute("UPDATE drivers SET statut=?, updated_at=? WHERE id=?", (rtype, now, driver_id))
        _terminate_all(conn, driver_id, today, now, rtype)
    else:  # استئناف
        if statut not in STOPPED:
            return "السائق ليس في حالة توقف — لا معنى للاستئناف"
        conn.execute("UPDATE drivers SET statut='نشط', updated_at=? WHERE id=?", (now, driver_id))
        # الملف المرفق بطلب الاستئناف: المركبة + الباب + عقد كراء جديد
        from routes.resume_flow import resume_from_request, apply_resume
        res = resume_from_request(req)
        if res:
            err = apply_resume(conn, driver_id, req["id"], res, now)
            if err:
                return err
        act = conn.execute(
            "SELECT activity_type, zone FROM activity WHERE driver_id=? AND is_current=1", (driver_id,)
        ).fetchone()
        if act and not conn.execute(
            "SELECT 1 FROM activity_history WHERE driver_id=? AND date_end IS NULL", (driver_id,)
        ).fetchone():
            conn.execute("""
                INSERT INTO activity_history (driver_id, activity_type, zone, date_start) VALUES (?,?,?,?)
            """, (driver_id, act["activity_type"], act["zone"], now))

    # السجل التاريخي — بتاريخ الموافقة (الأثر الفعلي)
    conn.execute("UPDATE status_history SET date_end=? WHERE driver_id=? AND date_end IS NULL", (now, driver_id))
    conn.execute("""
        INSERT INTO status_history (driver_id, status_type, date_start, request_id, notes)
        VALUES (?,?,?,?,?)
    """, (driver_id, rtype, now, req["id"], req.get("notes") or ""))
    return None
