from flask import Blueprint, request, jsonify, Response
from database import get_db, generate_number
from routes.status_flow import apply_status_request
from utils import require_admin
from datetime import datetime
import json, io
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
HAS_OPENPYXL = True

admin_bp = Blueprint("admin", __name__)


def _revert_vehicle_change(conn, driver_id, req_id, req_data, now):
    """رفض طلب تغيير_سيارة: استرجاع المركبة السابقة للسائق. يرجع رسالة خطأ أو None."""
    cur = conn.execute(
        "SELECT id, num_immatriculation, created_at FROM vehicles WHERE driver_id=? AND is_current=1 ORDER BY id DESC LIMIT 1",
        (driver_id,)).fetchone()
    new_im = (req_data.get("new_num_immatriculation") or "").strip()
    if cur and new_im and (cur["num_immatriculation"] or "").strip() != new_im:
        return f"المركبة الحالية للسائق ({cur['num_immatriculation']}) لا تطابق المركبة الجديدة في الطلب ({new_im}) — لا يمكن الاسترجاع تلقائياً"
    h = conn.execute("""
        SELECT vh.id, vh.vehicle_id, v.num_immatriculation FROM vehicles_history vh
        JOIN vehicles v ON v.id = vh.vehicle_id
        WHERE vh.driver_id=? AND vh.change_reason='تغيير_سيارة' AND vh.request_id IS NULL
        ORDER BY vh.id DESC LIMIT 1
    """, (driver_id,)).fetchone()
    if not h:
        return "لا توجد مركبة سابقة لهذا السائق لاسترجاعها"
    old_im = (req_data.get("current_num_immatriculation") or "").strip()
    if old_im and (h["num_immatriculation"] or "").strip() != old_im:
        return f"المركبة السابقة في الأرشيف ({h['num_immatriculation']}) لا تطابق المركبة الحالية في الطلب ({old_im}) — لا يمكن الاسترجاع تلقائياً"
    if h["num_immatriculation"] and conn.execute(
            "SELECT 1 FROM vehicles WHERE num_immatriculation=? AND is_current=1 AND driver_id!=?",
            (h["num_immatriculation"], driver_id)).fetchone():
        return f"المركبة السابقة ({h['num_immatriculation']}) أصبحت مسجّلة لسائق آخر — لا يمكن استرجاعها"
    if cur:
        conn.execute("UPDATE vehicles SET is_current=0, updated_at=? WHERE id=?", (now, cur["id"]))
        conn.execute("""
            INSERT INTO vehicles_history (driver_id, vehicle_id, change_reason, date_start, date_end, request_id)
            VALUES (?,?,'رفض_تغيير_سيارة',?,?,?)
        """, (driver_id, cur["id"], cur["created_at"] or now, now, req_id))
    conn.execute("UPDATE vehicles SET is_current=1, updated_at=? WHERE id=?", (now, h["vehicle_id"]))
    conn.execute("UPDATE vehicles_history SET request_id=?, change_reason='تغيير_سيارة_مرفوض' WHERE id=?",
                 (req_id, h["id"]))
    return None

# ════════════════════════════════════════
# Endpoint 1: GET /api/admin/requests
# ════════════════════════════════════════

@admin_bp.route("/api/admin/requests", methods=["GET"])
@require_admin
def get_all_requests(account):
    statut   = request.args.get("statut", "")
    req_type = request.args.get("request_type", "")
    search   = request.args.get("search", "")
    page     = int(request.args.get("page", 1))
    per_page = 20

    from routes.requests import _ensure_bump_cols
    with get_db() as _c:
        _ensure_bump_cols(_c)

    query = """
        SELECT r.*, d.nom_ar, d.prenom_ar, d.nin, d.telephone,
               door.door_number, acc.username
        FROM requests r
        JOIN drivers d ON d.id = r.driver_id
        JOIN accounts acc ON acc.id = d.account_id
        LEFT JOIN door_licenses door ON door.current_driver_id=d.id AND door.is_active=1
        WHERE 1=1
    """
    params = []
    if statut:
        query += " AND r.statut=?"
        params.append(statut)
    if req_type:
        query += " AND r.request_type=?"
        params.append(req_type)
    if search:
        query += " AND (d.nom_ar LIKE ? OR d.prenom_ar LIKE ? OR d.nin LIKE ? OR r.request_number LIKE ? OR acc.username LIKE ?)"
        s = f"%{search}%"
        params += [s, s, s, s, s]

    count_params = []
    count_query = "SELECT COUNT(*) FROM requests r JOIN drivers d ON d.id=r.driver_id WHERE 1=1"
    if statut:
        count_query += " AND r.statut=?"
        count_params.append(statut)
    if req_type:
        count_query += " AND r.request_type=?"
        count_params.append(req_type)
    if search:
        count_query += " AND (d.nom_ar LIKE ? OR d.prenom_ar LIKE ? OR d.nin LIKE ? OR r.request_number LIKE ?)"
        s = f"%{search}%"
        count_params += [s, s, s, s]

    query += " ORDER BY COALESCE(r.bumped_at, r.created_at) DESC, r.id DESC LIMIT ? OFFSET ?"
    params += [per_page, (page - 1) * per_page]

    with get_db() as conn:
        rows  = conn.execute(query, params).fetchall()
        total = conn.execute(count_query, count_params).fetchone()[0]

    return jsonify({
        "requests": [dict(r) for r in rows],
        "total":    total,
        "page":     page,
        "pages":    (total + per_page - 1) // per_page,
    })


# ════════════════════════════════════════
# Endpoint 2: PUT /api/admin/requests/<req_id>
# ════════════════════════════════════════

@admin_bp.route("/api/admin/requests/<int:req_id>", methods=["PUT"])
@require_admin
def update_request(account, req_id):
    data        = request.get_json() or {}
    new_statut  = data.get("statut", "")
    admin_notes = data.get("admin_notes", "")
    now         = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    VALID = ["جديد", "قيد_المعالجة", "مقبول", "مرفوض"]
    if new_statut not in VALID:
        return jsonify({"error": "حالة غير صحيحة"}), 400

    with get_db() as conn:
        r = conn.execute("SELECT * FROM requests WHERE id=?", (req_id,)).fetchone()
        if not r:
            return jsonify({"error": "الطلب غير موجود"}), 404
        r = dict(r)
        req_data = {}
        try:
            req_data = json.loads(r.get("request_data") or "{}")
        except Exception:
            pass
        driver_id = r["driver_id"]

        # القرار النهائي (مقبول/مرفوض/ملغى) لا يُغيَّر لأي نوع من الطلبات —
        # قلبه كان يُصدر رخصاً لطلبات ملغاة أو يترك أثر طلب مقبول بعد رفضه
        if r.get("statut") in ("مقبول", "مرفوض", "ملغى") and new_statut != r.get("statut"):
            return jsonify({"error": f"هذا الطلب معالَج نهائياً ({r.get('statut').replace('_',' ')}) — لا يمكن تغيير قراره"}), 400

        if new_statut == "مقبول" and r.get("statut") == "مقبول":
            return jsonify({"error": "هذا الطلب مقبول مسبقاً"}), 400

        if new_statut == "مقبول" and r["request_type"] not in ("توقف_مؤقت", "توقف_نهائي", "استئناف", "شهادة_إدارية", "شهادة_إدارية_مناوب"):
            d = conn.execute("SELECT statut FROM drivers WHERE id=?", (driver_id,)).fetchone()
            if d and d["statut"] in ("توقف_مؤقت", "توقف_نهائي"):
                return jsonify({"error": f"السائق في حالة «{d['statut'].replace('_',' ')}» — لا يمكن قبول هذا الطلب"}), 400

        if new_statut == "مقبول":

            if r["request_type"] == "تغيير_سيارة":
                # السائق حفظ المركبة الجديدة مسبقاً عبر save_vehicle (driver.py)
                # وأرشف المركبة القديمة بنفسه — نربط الطلب فقط بسجل التغيير
                conn.execute("""
                    UPDATE vehicles_history SET request_id=?
                    WHERE id = (
                        SELECT id FROM vehicles_history
                        WHERE driver_id=? AND request_id IS NULL
                        ORDER BY id DESC LIMIT 1
                    )
                """, (req_id, driver_id))

            elif r["request_type"] == "تغيير_نشاط":
                old_act = conn.execute(
                    "SELECT id, activity_type, zone FROM activity WHERE driver_id=? AND is_current=1",
                    (driver_id,)
                ).fetchone()
                if old_act:
                    conn.execute(
                        "UPDATE activity SET is_current=0, updated_at=? WHERE id=?",
                        (now, old_act["id"])
                    )
                    conn.execute("""
                        UPDATE activity_history SET date_end=?
                        WHERE driver_id=? AND activity_type=? AND date_end IS NULL
                    """, (now, driver_id, old_act["activity_type"]))
                conn.execute(
                    "INSERT INTO activity (driver_id, activity_type, zone, is_current) VALUES (?,?,?,1)",
                    (driver_id, req_data.get("activity_type_new", ""), req_data.get("zone", ""))
                )
                conn.execute("""
                    INSERT INTO activity_history (driver_id, activity_type, zone, date_start, request_id)
                    VALUES (?,?,?,?,?)
                """, (driver_id, req_data.get("activity_type_new", ""), req_data.get("zone", ""), now, req_id))

            elif r["request_type"] == "تجديد_رخصة_سائق":
                conn.execute(
                    "UPDATE driver_licenses SET is_current=0, updated_at=? WHERE driver_id=? AND is_current=1",
                    (now, driver_id)
                )
                conn.execute(
                    "INSERT INTO driver_licenses (driver_id, num_permis, date_expiration, is_current) VALUES (?,?,?,1)",
                    (driver_id, req_data.get("num_permis_new"), req_data.get("date_expiration_new"))
                )

            elif r["request_type"] == "تصريح_مناوب":
                # ── إصدار رخصة سائق إضافي تلقائياً ──
                dep = conn.execute(
                    "SELECT * FROM deputies WHERE driver_id=? AND is_current=1", (driver_id,)
                ).fetchone()
                doo = conn.execute(
                    "SELECT * FROM door_licenses WHERE current_driver_id=? AND is_active=1", (driver_id,)
                ).fetchone()
                veh = conn.execute(
                    "SELECT * FROM vehicles WHERE driver_id=? AND is_current=1", (driver_id,)
                ).fetchone()
                act = conn.execute(
                    "SELECT * FROM activity WHERE driver_id=? AND is_current=1", (driver_id,)
                ).fetchone()
                drv = conn.execute(
                    "SELECT * FROM drivers WHERE id=?", (driver_id,)
                ).fetchone()
                dep_con = conn.execute(
                    "SELECT end_date FROM deputy_contracts WHERE driver_id=? AND is_current=1", (driver_id,)
                ).fetchone()
                rc_con = conn.execute(
                    "SELECT end_date FROM rental_contracts WHERE driver_id=? AND is_current=1", (driver_id,)
                ).fetchone()

                # لا رخصة سائق إضافي بدون مناوب حالي وعقد مناوب ساري
                if not dep or not dep_con:
                    return jsonify({"error": "لا يوجد مناوب حالي بعقد ساري لهذا السائق — لا يمكن إصدار رخصة السائق الإضافي"}), 400

                # تعطيل أي رخصة سابقة
                conn.execute(
                    "UPDATE deputy_permits SET is_current=0, updated_at=? WHERE driver_id=? AND is_current=1",
                    (now, driver_id)
                )

                # تاريخ الانتهاء: الأقرب بين نهاية عقد المناوب ونهاية عقد الكراء
                ends = [str(x["end_date"])[:10] for x in (dep_con, rc_con) if x and x["end_date"]]
                expiry = min(ends) if ends else None

                permit_number = generate_number("PRM", "deputy_permits", "permit_number")

                conn.execute("""
                    INSERT INTO deputy_permits
                    (driver_id, deputy_id, request_id, permit_number, issue_date, expiry_date,
                     door_number, num_immatriculation, activity_type, wilaya, commune, issued_by, is_current)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1)
                """, (
                    driver_id,
                    dep["id"]  if dep else None,
                    req_id,
                    permit_number,
                    now[:10],
                    expiry,
                    doo["door_number"]        if doo else None,
                    veh["num_immatriculation"] if veh else None,
                    act["activity_type"]       if act else None,
                    drv["wilaya"]              if drv else None,
                    drv["commune"]             if drv else None,
                    account["id"],
                ))

            elif r["request_type"] == "تجديد_رخصة_مناوب":
                dep = conn.execute(
                    "SELECT id FROM deputies WHERE driver_id=? AND is_current=1", (driver_id,)
                ).fetchone()
                if dep:
                    conn.execute(
                        "UPDATE deputies SET num_permis=?, date_expiration_permis=?, updated_at=? WHERE id=?",
                        (req_data.get("num_permis_new"), req_data.get("date_expiration_new"), now, dep["id"])
                    )

            elif r["request_type"] == "تغيير_باب":
                new_door_num = req_data.get("door_number", "")
                if new_door_num:
                    tgt = conn.execute(
                        "SELECT current_driver_id FROM door_licenses WHERE door_number=? ORDER BY id DESC LIMIT 1",
                        (new_door_num,)).fetchone()
                    if not tgt:
                        return jsonify({"error": f"الباب {new_door_num} غير موجود"}), 400
                    if tgt["current_driver_id"] and tgt["current_driver_id"] != driver_id:
                        return jsonify({"error": f"الباب {new_door_num} مستغل حالياً من طرف سائق آخر"}), 400
                    conn.execute(
                        "UPDATE door_licenses SET current_driver_id=NULL, updated_at=? WHERE current_driver_id=? AND is_active=1",
                        (now, driver_id)
                    )
                    conn.execute(
                        "UPDATE door_licenses SET current_driver_id=?, updated_at=? WHERE door_number=?",
                        (driver_id, now, new_door_num)
                    )

            elif r["request_type"] in ("توقف_مؤقت", "توقف_نهائي", "استئناف"):
                # موافقة الإدارة = الأثر الفعلي بتاريخ الموافقة
                err = apply_status_request(conn, r, now)
                if err:
                    conn.rollback()
                    return jsonify({"error": err}), 400

        elif new_statut == "مرفوض" and r["request_type"] == "تغيير_سيارة":
            # الرفض يُرجع الحالة السابقة: المركبة الجديدة (المحفوظة مسبقاً من السائق) تُؤرشف
            # والمركبة القديمة تعود حالية — لا شيء يُحذف
            err = _revert_vehicle_change(conn, driver_id, req_id, req_data, now)
            if err:
                conn.rollback()
                return jsonify({"error": err}), 400

        conn.execute("""
            UPDATE requests SET statut=?, admin_notes=?, processed_at=?, processed_by=?, updated_at=?
            WHERE id=?
        """, (new_statut, admin_notes, now, account["id"], now, req_id))
        conn.commit()

    return jsonify({"success": True})


# ════════════════════════════════════════
# Endpoint 2b: GET /api/admin/deputy-permit/<driver_id>
# جلب رخصة السائق الإضافي الحالية
# ════════════════════════════════════════

@admin_bp.route("/api/admin/deputy-permit/<int:target_driver_id>", methods=["GET"])
@require_admin
def get_deputy_permit(account, target_driver_id):
    with get_db() as conn:
        perm = conn.execute(
            "SELECT * FROM deputy_permits WHERE driver_id=? AND is_current=1 ORDER BY id DESC LIMIT 1",
            (target_driver_id,)
        ).fetchone()
    if not perm:
        return jsonify({"permit": None})
    return jsonify({"permit": dict(perm)})


# ════════════════════════════════════════
# Endpoint 2c: POST /api/admin/deputy-permit/<driver_id>
# إصدار رخصة يدوياً من لوحة الإدارة
# ════════════════════════════════════════

@admin_bp.route("/api/admin/deputy-permit/<int:target_driver_id>", methods=["POST"])
@require_admin
def issue_deputy_permit(account, target_driver_id):
    data = request.get_json() or {}
    now  = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    with get_db() as conn:
        drv = conn.execute("SELECT * FROM drivers WHERE id=?", (target_driver_id,)).fetchone()
        if not drv:
            return jsonify({"error": "السائق غير موجود"}), 404

        dep = conn.execute(
            "SELECT * FROM deputies WHERE driver_id=? AND is_current=1", (target_driver_id,)
        ).fetchone()
        doo = conn.execute(
            "SELECT * FROM door_licenses WHERE current_driver_id=? AND is_active=1", (target_driver_id,)
        ).fetchone()
        veh = conn.execute(
            "SELECT * FROM vehicles WHERE driver_id=? AND is_current=1", (target_driver_id,)
        ).fetchone()
        act = conn.execute(
            "SELECT * FROM activity WHERE driver_id=? AND is_current=1", (target_driver_id,)
        ).fetchone()

        # تعطيل الرخصة القديمة
        conn.execute(
            "UPDATE deputy_permits SET is_current=0, updated_at=? WHERE driver_id=? AND is_current=1",
            (now, target_driver_id)
        )

        permit_number = generate_number("PRM", "deputy_permits", "permit_number")

        conn.execute("""
            INSERT INTO deputy_permits
            (driver_id, deputy_id, request_id, permit_number, issue_date, expiry_date,
             door_number, num_immatriculation, activity_type, wilaya, commune, issued_by, is_current, notes)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,?)
        """, (
            target_driver_id,
            dep["id"]  if dep else None,
            data.get("request_id"),
            permit_number,
            data.get("issue_date") or now[:10],
            data.get("expiry_date"),
            data.get("door_number")        or (doo["door_number"]        if doo else None),
            data.get("num_immatriculation") or (veh["num_immatriculation"] if veh else None),
            data.get("activity_type")      or (act["activity_type"]      if act else None),
            data.get("wilaya")             or drv["wilaya"],
            data.get("commune")            or drv["commune"],
            account["id"],
            data.get("notes", ""),
        ))
        conn.commit()

    return jsonify({"success": True, "permit_number": permit_number})


# ════════════════════════════════════════
# Endpoint 3: GET /api/admin/drivers
# ════════════════════════════════════════

@admin_bp.route("/api/admin/drivers", methods=["GET"])
@require_admin
def get_all_drivers(account):
    search   = request.args.get("search", "")
    statut   = request.args.get("statut", "")
    page     = int(request.args.get("page", 1))
    per_page = 20

    query = """
        SELECT
            d.*,
            acc.username,
            dl.num_permis,
            dl.date_expiration          AS permis_expiration,
            v.num_immatriculation,
            v.marque,
            v.annee_circulation,
            door.door_number,
            door.wilaya                 AS door_wilaya,
            rc.contract_number          AS rental_number,
            rc.end_date                 AS rental_end,
            dep.nom_ar                  AS dep_nom_ar,
            dep.prenom_ar               AS dep_prenom_ar,
            dep.date_expiration_permis  AS dep_permis_exp,
            act.activity_type,
            act.zone                    AS activity_zone,
            ben.nom_ar                  AS ben_nom_ar,
            ben.prenom_ar               AS ben_prenom_ar,
            ben.sifa,
            perm.permit_number          AS deputy_permit_number,
            perm.expiry_date            AS deputy_permit_expiry
        FROM drivers d
        JOIN accounts acc              ON acc.id = d.account_id AND acc.role = 'driver'
        LEFT JOIN driver_licenses dl   ON dl.driver_id  = d.id AND dl.is_current = 1
        LEFT JOIN vehicles v           ON v.driver_id   = d.id AND v.is_current  = 1
        LEFT JOIN door_licenses door   ON door.current_driver_id = d.id AND door.is_active = 1
        LEFT JOIN beneficiaries ben    ON ben.id = door.beneficiary_id
        LEFT JOIN rental_contracts rc  ON rc.driver_id  = d.id AND rc.is_current = 1
        LEFT JOIN deputies dep         ON dep.driver_id = d.id AND dep.is_current = 1
        LEFT JOIN activity act         ON act.driver_id = d.id AND act.is_current = 1
        LEFT JOIN deputy_permits perm  ON perm.driver_id = d.id AND perm.is_current = 1
        WHERE 1=1
    """
    params = []

    if search:
        query += """
            AND (d.nom_ar LIKE ? OR d.prenom_ar LIKE ?
              OR d.nin LIKE ? OR d.telephone LIKE ?
              OR door.door_number LIKE ? OR acc.username LIKE ?)
        """
        s = f"%{search}%"
        params += [s, s, s, s, s, s]
    if statut:
        query += " AND d.statut=?"
        params.append(statut)

    query += " GROUP BY d.id"

    count_params = []
    count_q = """
        SELECT COUNT(*) FROM drivers d
        JOIN accounts acc ON acc.id = d.account_id AND acc.role = 'driver'
        WHERE 1=1
    """
    if search:
        count_q += " AND (d.nom_ar LIKE ? OR d.prenom_ar LIKE ? OR d.nin LIKE ? OR d.telephone LIKE ? OR acc.username LIKE ?)"
        s = f"%{search}%"
        count_params += [s, s, s, s, s]
    if statut:
        count_q += " AND d.statut=?"
        count_params.append(statut)

    query += " ORDER BY d.created_at DESC LIMIT ? OFFSET ?"
    params += [per_page, (page - 1) * per_page]

    with get_db() as conn:
        rows  = conn.execute(query, params).fetchall()
        total = conn.execute(count_q, count_params).fetchone()[0]

    return jsonify({
        "drivers": [dict(r) for r in rows],
        "total":   total,
        "page":    page,
        "pages":   (total + per_page - 1) // per_page,
    })


# ════════════════════════════════════════
# Endpoint 4: GET /api/admin/drivers/<driver_id>
# ════════════════════════════════════════

@admin_bp.route("/api/admin/drivers/<int:target_id>", methods=["GET"])
@require_admin
def get_driver_full(account, target_id):
    with get_db() as conn:
        driver = conn.execute("""
            SELECT d.*, acc.username FROM drivers d
            JOIN accounts acc ON acc.id=d.account_id
            WHERE d.id=?
        """, (target_id,)).fetchone()
        if not driver:
            return jsonify({"error": "غير موجود"}), 404

        license_ = conn.execute("SELECT * FROM driver_licenses WHERE driver_id=? AND is_current=1", (target_id,)).fetchone()
        vehicle  = conn.execute("SELECT * FROM vehicles WHERE driver_id=? AND is_current=1", (target_id,)).fetchone()
        door     = conn.execute("""
            SELECT dl.*, b.nom_ar as ben_nom, b.prenom_ar as ben_prenom, b.sifa
            FROM door_licenses dl JOIN beneficiaries b ON b.id=dl.beneficiary_id
            WHERE dl.current_driver_id=? AND dl.is_active=1
        """, (target_id,)).fetchone()
        rental   = conn.execute("SELECT * FROM rental_contracts WHERE driver_id=? AND is_current=1", (target_id,)).fetchone()
        deputy   = conn.execute("SELECT * FROM deputies WHERE driver_id=? AND is_current=1", (target_id,)).fetchone()
        dep_con  = conn.execute("SELECT * FROM deputy_contracts WHERE driver_id=? AND is_current=1", (target_id,)).fetchone()
        activity = conn.execute("SELECT * FROM activity WHERE driver_id=? AND is_current=1", (target_id,)).fetchone()
        reqs     = conn.execute("SELECT * FROM requests WHERE driver_id=? ORDER BY created_at DESC", (target_id,)).fetchall()
        dep_perm = conn.execute(
            "SELECT * FROM deputy_permits WHERE driver_id=? AND is_current=1 ORDER BY id DESC LIMIT 1",
            (target_id,)
        ).fetchone()

    return jsonify({
        "driver":          dict(driver),
        "license":         dict(license_) if license_ else None,
        "vehicle":         dict(vehicle)  if vehicle  else None,
        "door":            dict(door)     if door     else None,
        "rental":          dict(rental)   if rental   else None,
        "deputy":          dict(deputy)   if deputy   else None,
        "deputy_contract": dict(dep_con)  if dep_con  else None,
        "activity":        dict(activity) if activity else None,
        "requests":        [dict(r) for r in reqs],
        "deputy_permit":   dict(dep_perm) if dep_perm else None,
    })


# ════════════════════════════════════════
# Endpoint 5: GET /api/admin/stats
# ════════════════════════════════════════

@admin_bp.route("/api/admin/stats", methods=["GET"])
@require_admin
def get_stats(account):
    with get_db() as conn:
        base = "SELECT COUNT(*) FROM drivers d JOIN accounts acc ON acc.id=d.account_id AND acc.role='driver'"
        return jsonify({
            "total_drivers":       conn.execute(base).fetchone()[0],
            "active_drivers":      conn.execute(base + " WHERE d.statut='نشط'").fetchone()[0],
            "stopped_temp":        conn.execute(base + " WHERE d.statut='توقف_مؤقت'").fetchone()[0],
            "stopped_final":       conn.execute(base + " WHERE d.statut='توقف_نهائي'").fetchone()[0],
            "total_requests":      conn.execute("SELECT COUNT(*) FROM requests").fetchone()[0],
            "new_requests":        conn.execute("SELECT COUNT(*) FROM requests WHERE statut='جديد'").fetchone()[0],
            "pending_requests":    conn.execute("SELECT COUNT(*) FROM requests WHERE statut='قيد_المعالجة'").fetchone()[0],
            "approved_requests":   conn.execute("SELECT COUNT(*) FROM requests WHERE statut='مقبول'").fetchone()[0],
            "rejected_requests":   conn.execute("SELECT COUNT(*) FROM requests WHERE statut='مرفوض'").fetchone()[0],
            "today_requests":      conn.execute("SELECT COUNT(*) FROM requests WHERE date(created_at)=date('now','localtime')").fetchone()[0],
            "active_rentals":      conn.execute("SELECT COUNT(*) FROM rental_contracts WHERE is_current=1").fetchone()[0],
            "active_deputies":     conn.execute("SELECT COUNT(*) FROM deputy_contracts WHERE is_current=1").fetchone()[0],
            "active_dep_permits":  conn.execute("SELECT COUNT(*) FROM deputy_permits WHERE is_current=1").fetchone()[0],
        })


# ════════════════════════════════════════
# Endpoint 6: GET /api/admin/export/excel
# ════════════════════════════════════════

@admin_bp.route("/api/admin/export/excel", methods=["GET"])
@require_admin
def export_excel(account):
    """البطاقة الجماعية: سطر لكل سائق بوضعيته الحالية + ورقة ملخص (routes/export_card.py)."""
    from routes.export_card import build_workbook
    with get_db() as conn:
        wb = build_workbook(conn)
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    stamp = datetime.now().strftime('%Y%m%d_%H%M')
    from urllib.parse import quote
    encoded = quote(f"البطاقة_الجماعية_للسائقين_{stamp}.xlsx", encoding='utf-8')
    return Response(
        output.getvalue(),
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=drivers_card_{stamp}.xlsx; filename*=UTF-8''{encoded}"}
    )

# Endpoint 7: GET /api/admin/archive
# ════════════════════════════════════════

@admin_bp.route("/api/admin/archive", methods=["GET"])
@require_admin
def get_archive(account):
    search   = request.args.get("search", "")
    page     = int(request.args.get("page", 1))
    per_page = 20

    query = """
        SELECT d.*, dl.num_permis, door.door_number, acc.username
        FROM drivers d
        JOIN accounts acc ON acc.id=d.account_id AND acc.role='driver'
        LEFT JOIN driver_licenses dl ON dl.driver_id=d.id AND dl.is_current=1
        LEFT JOIN door_licenses door ON door.current_driver_id=d.id AND door.is_active=1
        WHERE d.statut='توقف_نهائي'
    """
    params = []
    if search:
        query += " AND (d.nom_ar LIKE ? OR d.prenom_ar LIKE ? OR d.nin LIKE ? OR acc.username LIKE ?)"
        s = f"%{search}%"
        params += [s, s, s, s]

    count_q = """
        SELECT COUNT(*) FROM drivers d
        JOIN accounts acc ON acc.id=d.account_id AND acc.role='driver'
        WHERE d.statut='توقف_نهائي'
    """
    count_p = []
    if search:
        count_q += " AND (d.nom_ar LIKE ? OR d.prenom_ar LIKE ? OR d.nin LIKE ?)"
        s = f"%{search}%"
        count_p += [s, s, s]

    query += " ORDER BY d.updated_at DESC LIMIT ? OFFSET ?"
    params += [per_page, (page - 1) * per_page]

    with get_db() as conn:
        rows  = conn.execute(query, params).fetchall()
        total = conn.execute(count_q, count_p).fetchone()[0]

    return jsonify({
        "drivers": [dict(r) for r in rows],
        "total":   total,
        "page":    page,
        "pages":   (total + per_page - 1) // per_page,
    })


# ════════════════════════════════════════
# Endpoint 8: طباعة رخصة السائق الإضافي — للمدير فقط
# GET /api/admin/print/deputy-permit/<driver_id>
# ════════════════════════════════════════

DEPUTY_PERMIT_DOC_STYLE = """
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; }
  body { background: #f3f4f6; padding: 20px; direction: rtl; }
  .doc { max-width: 680px; margin: 0 auto; background: #fff;
         border: 2px solid #125950; border-radius: 10px; padding: 32px; }
  .gov-header { text-align: center; border-bottom: 2px solid #125950;
                padding-bottom: 14px; margin-bottom: 16px; }
  .gov-header .g1 { font-size: 14px; font-weight: 800; color: #1a3a33; }
  .gov-header .g2 { font-size: 13px; color: #374151; margin-top: 4px; }
  .gov-header .g3 { font-size: 12px; color: #374151; margin-top: 2px; }
  .permit-ref { display: flex; justify-content: space-between; margin-bottom: 16px; font-size: 12px; }
  .main-title { text-align: center; font-size: 16px; font-weight: 800; color: #125950;
                text-decoration: underline; margin-bottom: 18px; }
  .body-text  { font-size: 12px; color: #374151; line-height: 2; margin-bottom: 6px; padding-right: 12px; }
  .field-list { font-size: 13px; line-height: 2.2; padding-right: 16px; }
  .warn       { background: #fef3c7; color: #92400e; font-weight: 700;
                text-align: center; padding: 8px; border-radius: 8px; margin-bottom: 18px;
                border: 1px solid #fde68a; }
  .footer     { text-align: center; color: #9ca3af; font-size: 11px; margin-top: 16px; }
  .btn        { display: block; width: 160px; margin: 16px auto 0; padding: 10px;
                background: #125950; color: #fff; border: none; border-radius: 8px;
                font-weight: 700; cursor: pointer; font-size: 14px; }
  @media print {
    .btn { display: none; }
    html, body { height: 100%; margin: 0; padding: 0; background: #fff; }
    @page { size: A4 portrait; margin: 10mm 12mm; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .doc { max-width: 100% !important; width: 100% !important;
           border: 2px solid #125950 !important; border-radius: 6px !important; }
  }
</style>
"""

ACTIVITY_MUHIT_ADMIN = {
    "فردية_حضرية":    "فردية",
    "جماعية_حضرية":   "جماعية",
    "مابين_البلديات": "مابين البلديات",
    "مابين_الولايات": "مابين الولايات",
}

def _v(val):
    import html as _h
    if val in (None, "", "None"):
        return "&#8212;"
    return _h.escape(val) if isinstance(val, str) else val

def _fmt_date(val):
    import re
    if not val or str(val) in ("None", ""):
        return "&#8212;"
    s = str(val).strip()
    m = re.match(r'^(\d{2})/(\d{2})/(\d{4})$', s)
    if m:
        dd, mm, yyyy = m.groups()
        return f"{yyyy}-{mm}-{dd}"
    return str(val).strip()[:10]

@admin_bp.route("/api/admin/print/deputy-permit/<int:target_driver_id>")
@require_admin
def admin_print_deputy_permit(account, target_driver_id):
    """طباعة رخصة السائق الإضافي — للمدير فقط"""
    with get_db() as conn:
        driver = conn.execute("SELECT * FROM drivers WHERE id=?", (target_driver_id,)).fetchone()
        if not driver:
            return "السائق غير موجود", 404
        driver = dict(driver)

        perm = conn.execute(
            "SELECT * FROM deputy_permits WHERE driver_id=? AND is_current=1 ORDER BY id DESC LIMIT 1",
            (target_driver_id,)
        ).fetchone()

        dep = conn.execute(
            "SELECT * FROM deputies WHERE driver_id=? AND is_current=1",
            (target_driver_id,)
        ).fetchone()
        dep = dict(dep) if dep else {}

        veh = conn.execute(
            "SELECT * FROM vehicles WHERE driver_id=? AND is_current=1",
            (target_driver_id,)
        ).fetchone()
        veh = dict(veh) if veh else {}

        doo = conn.execute(
            "SELECT dl.* FROM door_licenses dl WHERE dl.current_driver_id=? AND dl.is_active=1",
            (target_driver_id,)
        ).fetchone()
        doo = dict(doo) if doo else {}

        act = conn.execute(
            "SELECT * FROM activity WHERE driver_id=? AND is_current=1",
            (target_driver_id,)
        ).fetchone()
        act = dict(act) if act else {}

        # رخصة الاستغلال: آخر طلب مقبول غير تصريح مناوب
        expl_req = conn.execute(
            "SELECT request_number, processed_at FROM requests "
            "WHERE driver_id=? AND request_type IN ('تجديد_وثائق_استغلال','تغيير_سيارة','تغيير_باب','تغيير_نشاط','تغيير_مركبة') AND statut='مقبول' "
            "ORDER BY id DESC LIMIT 1",
            (target_driver_id,)
        ).fetchone()
        expl_req = dict(expl_req) if expl_req else {}

    if not perm:
        no_permit_html = f"""<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="UTF-8"><title>رخصة السائق الإضافي</title>{DEPUTY_PERMIT_DOC_STYLE}</head>
<body>
<div class="doc">
  <div class="gov-header">
    <div class="g1">الجمهورية الجزائرية الديمقراطية الشعبية</div>
    <div class="g2">وزارة الداخلية والجماعات المحلية والنقل</div>
    <div class="g3">مديرية النقل لولاية البيض</div>
  </div>
  <div class="warn">
    &#9888;&#65039; لم تُصدر رخصة السائق الإضافي لهذا السائق بعد.<br>
    يجب قبول طلب "تصريح_مناوب" أولاً ليتم إنشاء الرخصة تلقائياً.
  </div>
  <div style="text-align:center;color:#6b7280;font-size:13px;margin-top:12px;">
    السائق: <strong>{_v(driver.get('prenom_ar'))} {_v(driver.get('nom_ar'))}</strong>
  </div>
</div>
</body>
</html>"""
        return Response(no_permit_html, mimetype="text/html; charset=utf-8")

    perm = dict(perm)
    today_str     = datetime.now().strftime("%Y-%m-%d")
    today_display = datetime.now().strftime("%d/%m/%Y")
    year_str      = datetime.now().strftime("%Y")
    activity_type = perm.get("activity_type") or act.get("activity_type", "")
    muhit         = ACTIVITY_MUHIT_ADMIN.get(activity_type, activity_type or "—")

    drv_nom       = _v(driver.get("nom_ar"))
    drv_prenom    = _v(driver.get("prenom_ar"))
    dep_nom       = _v(dep.get("nom_ar"))    if dep else "—"
    dep_prenom    = _v(dep.get("prenom_ar")) if dep else "—"
    dep_adresse      = _v(dep.get("adresse"))           if dep else "—"
    dep_ddn          = _fmt_date(dep.get("date_naissance"))           if dep else "—"
    dep_lieu_naiss   = _v(dep.get("lieu_naissance"))                   if dep else "—"
    dep_permis       = _v(dep.get("num_permis"))                       if dep else "—"
    dep_permis_date  = _fmt_date(dep.get("date_delivrance_permis"))    if dep else "—"
    permit_num    = _v(perm.get("permit_number"))
    issue_date    = _v(perm.get("issue_date"))
    expiry_date   = _v(perm.get("expiry_date"))
    door_number   = _v(perm.get("door_number")         or doo.get("door_number"))
    num_immat     = _v(perm.get("num_immatriculation") or veh.get("num_immatriculation"))
    # رخصة الاستغلال: نوع + رقم + تاريخ
    ACTIVITY_EXPL_LABEL_ADMIN = {
        "فردية_حضرية":    "فردية",
        "جماعية_حضرية":   "جماعية",
        "مابين_البلديات": "مابين البلديات",
        "مابين_الولايات": "مابين الولايات",
    }
    expl_type_label   = ACTIVITY_EXPL_LABEL_ADMIN.get(activity_type, "")
    expl_license_num  = _v(expl_req.get("request_number")) if expl_req else "&#8212;"
    raw_date          = (expl_req.get("processed_at") or "")[:10]
    expl_license_date = _fmt_date(raw_date) if raw_date else "&#8212;"
    expl_decision     = expl_license_num

    body = f"""<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="UTF-8"><title>رخصة السائق الإضافي</title>{DEPUTY_PERMIT_DOC_STYLE}</head>
<body>
<div class="doc">

  <div class="gov-header">
    <div class="g1">الجمهورية الجزائرية الديمقراطية الشعبية</div>
    <div class="g2">وزارة الداخلية والجماعات المحلية والنقل</div>
    <div class="g3">مديرية النقل لولاية البيض</div>
  </div>

  <div class="permit-ref">
    <div><strong>الرقم:</strong> &nbsp;&nbsp;{permit_num}</div>
  </div>

  <div class="main-title">رخصة سائق إضافي</div>

  <div class="body-text" style="margin-bottom:12px;">ان مدير النقل لولاية البيض:</div>

  <div class="body-text">
    - بمقتضى المرسوم التنفيذي 230/12 المؤرخ في 03 رجب عام 1433 الموافق ل 24 مايو 2012
    والمتضمن تنظيم النقل بواسطة سيارات الأجرة المعدل والمتمم.
  </div>
  <div class="body-text" style="margin-bottom:18px;">
    - بمقتضى القرار المؤرخ في 11 ذي القعدة عام 1437 الموافق ل 14 غشت سنة 2016 الذي يحدد نماذج
    الوثائق المرتبطة بممارسة نشاط النقل بواسطة سيارة الأجرة.
  </div>

  <div style="margin-bottom:8px; font-size:13px;">- يقرر ما يأتي-</div>

  <div class="body-text" style="margin-bottom:18px; line-height:2.2;">
    <strong>المادة الأولى :</strong>
    عملا بأحكام المرسوم التنفيذي 230/12 المؤرخ في 03 رجب عام 1433
    الموافق ل 24 مايو 2012 والمذكور أعلاه تسلم رخصة سياقة إضافية
    <strong>للسيد :</strong> {dep_prenom} {dep_nom} ،
    <strong>تاريخ و مكان الازدياد :</strong> <span dir="ltr">{dep_ddn}</span> &nbsp;ب&nbsp; {dep_lieu_naiss} ،
    <strong>رقم رخصة السياقة :</strong> <span dir="ltr">{dep_permis}</span> ،
    <strong>تاريخ رخصة السياقة :</strong> <span dir="ltr">{dep_permis_date}</span> .
  </div>

  <div class="body-text" style="margin-top:10px; margin-bottom:18px;">
    وذلك تبعا للطلب الذي قدمه السيد :
    {drv_prenom} {drv_nom}
    بصفته <strong>حائز</strong> على رخصة استغلال خدمة سيارة اجرة
    <strong>{expl_type_label} رقم : {expl_license_num}</strong> ،
    الصادرة بتاريخ : <span dir="ltr">{expl_license_date}</span> ،
  </div>

  <div class="field-list">
    <div><strong>بلدية الالتحاق :</strong> &nbsp;&nbsp;{(doo.get("exploitation_commune") or "البيض")}</div>
    <div><strong>محيط النقل الحضري الملحق به :</strong> &nbsp;&nbsp;{muhit}</div>
    <div><strong>رقم تسجيل المركبة :</strong> &nbsp;&nbsp;<span dir="ltr">{num_immat}</span></div>
    <div><strong>رقم الباب :</strong> &nbsp;&nbsp;&nbsp;{door_number}</div>
  </div>

  <div style="margin-top:16px; font-size:13px;">
    <strong>&#10005; مدة العقد صالحة الى غاية:</strong>
    &nbsp;&nbsp;<span dir="ltr">{expiry_date}</span>
  </div>

  <div style="margin-top:40px; text-align:center;">
    <div style="font-size:13px;">حرر بالبيض في : <span dir="ltr">{today_display}</span></div>
    <div style="font-size:13px; font-weight:700; margin-top:6px;">المدير</div>
  </div>

  <div class="footer">{permit_num} — رخصة سائق إضافي — {today_str}</div>

</div>
<button class="btn" onclick="window.print()">&#128424;&#65039; طباعة</button>
</body>
</html>"""

    return Response(body, mimetype="text/html; charset=utf-8")


# (طباعة رخصة الاستغلال: routes/print.py — print_exploitation_license)


# ════════════════════════════════════════
# صيانة (تُشغَّل مرة واحدة عند الانتقال لنظام "الأثر بعد موافقة الإدارة")
# POST /api/admin/maintenance/migrate-approval-flow   body: {"up_to_id": 112}
#   1. إلغاء طلبات التوقف/الاستئناف القديمة المعلّقة (نُفّذت بالنظام القديم)
#   2. إعادة بناء سجل الوضعيات من الطلبات المقبولة بتاريخ الموافقة
#   نسخة من السجل القديم تُحفظ في status_history_backup
# ════════════════════════════════════════

@admin_bp.route("/api/admin/maintenance/migrate-approval-flow", methods=["POST"])
@require_admin
def migrate_approval_flow(account):
    data = request.get_json(silent=True) or {}
    up_to_id = int(data.get("up_to_id") or 0)
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with get_db() as conn:
        cancelled = 0
        if up_to_id:
            cur = conn.execute("""
                UPDATE requests SET statut='ملغى', processed_at=?, updated_at=?,
                    admin_notes='ملغى — متجاوز: نُفّذ أثره بالنظام القديم قبل اعتماد موافقة الإدارة'
                WHERE request_type IN ('توقف_مؤقت','توقف_نهائي','استئناف')
                  AND statut IN ('جديد','قيد_المعالجة') AND id <= ?
            """, (now, now, up_to_id))
            cancelled = cur.rowcount

        # نسخة احتياطية كاملة باسم مؤرَّخ (كانت تفشل إذا تغيّرت أعمدة الجدول بعد نسخة سابقة)
        conn.execute(f"CREATE TABLE status_history_backup_{datetime.now().strftime('%Y%m%d%H%M%S%f')} AS SELECT * FROM status_history")
        conn.execute("DELETE FROM status_history")
        total = 0
        for drv in conn.execute("SELECT id FROM drivers").fetchall():
            events = conn.execute("""
                SELECT id, request_type, COALESCE(processed_at, created_at) AS eff, notes FROM requests
                WHERE driver_id=? AND request_type IN ('توقف_مؤقت','توقف_نهائي','استئناف') AND statut='مقبول'
                ORDER BY COALESCE(processed_at, created_at), id
            """, (drv["id"],)).fetchall()
            periods, last_state = [], "نشط"
            for ev in events:
                state = "نشط" if ev["request_type"] == "استئناف" else ev["request_type"]
                if state == last_state:
                    continue
                periods.append(ev); last_state = state
            for i, ev in enumerate(periods):
                end = periods[i+1]["eff"] if i + 1 < len(periods) else None
                conn.execute("""
                    INSERT INTO status_history (driver_id, status_type, date_start, date_end, request_id, notes)
                    VALUES (?,?,?,?,?,?)
                """, (drv["id"], ev["request_type"], ev["eff"], end, ev["id"], ev["notes"] or ""))
                total += 1
        conn.commit()
    return jsonify({"success": True, "cancelled": cancelled, "history_records": total})


# (عقود توظيف الشركات للمدير: routes/company.py — admin_list_hire_requests / admin_process_hire_request)
