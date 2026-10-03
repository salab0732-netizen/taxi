from flask import Blueprint, request, jsonify
from database import get_db, generate_number
from utils import require_auth, save_image
import json
from routes.status_flow import STATUS_TYPES, STOPPED, pending_status_request, lock_reason
from datetime import datetime

requests_bp = Blueprint("requests", __name__)

VALID_TYPES = [
    "تغيير_سيارة", "تغيير_باب", "تغيير_نشاط",
    "تصريح_مناوب", "توقف_مؤقت", "توقف_نهائي",
    "استئناف", "تجديد_رخصة_سائق", "تجديد_رخصة_مناوب",
    "تجديد_وثائق_استغلال",
    "شهادة_إدارية", "شهادة_إدارية_مناوب",
]
# طلبات الشهادة الإدارية: لا تغيّر الملف — مسموحة حتى للسائق المتوقف
CERT_TYPES = ("شهادة_إدارية", "شهادة_إدارية_مناوب")


def _ensure_bump_cols(conn):
    for col, typ in (("bumped_at", "TEXT"), ("repeat_count", "INTEGER DEFAULT 0")):
        try:
            conn.execute(f"ALTER TABLE requests ADD COLUMN {col} {typ}")
        except Exception:
            pass


def _bump(conn, req_id, now):
    """تكرار نفس الطلب وهو معلّق: لا يُنشأ طلب جديد — يُرفع الطلب القائم لأعلى قائمة الإدارة
    بنفس الرقم والتاريخ، ويُعدّ التكرار."""
    conn.execute("UPDATE requests SET bumped_at=?, repeat_count=COALESCE(repeat_count,0)+1 WHERE id=?", (now, req_id))


# ════════════════════════════════════════
# POST /api/requests
# ════════════════════════════════════════

@requests_bp.route("/api/requests", methods=["POST"])
@require_auth
def submit_request(account):
    data = request.get_json() or {}
    req_type = data.get("request_type", "")

    if req_type not in VALID_TYPES:
        return jsonify({"error": "نوع الطلب غير صحيح"}), 400

    with get_db() as conn:
        driver = conn.execute(
            "SELECT id, nin, statut FROM drivers WHERE account_id=?",
            (account["id"],)
        ).fetchone()
        if not driver:
            return jsonify({"error": "أكمل بيانات الهوية أولاً"}), 400

        nin = driver["nin"] or ""
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        today = datetime.now().strftime("%Y-%m-%d")
        _ensure_bump_cols(conn)

        # === قواعد عامة قبل أي حفظ ===
        if req_type in STATUS_TYPES:
            p = pending_status_request(conn, driver["id"])
            if p:
                if p["request_type"] == req_type:
                    _bump(conn, p["id"], now)
                    return jsonify({"error": f"طلبك ({p['request_number']}) قيد المعالجة — تم تذكير الإدارة به وإعادته إلى أعلى قائمة الطلبات", "bumped": True}), 400
                return jsonify({"error": f"لديك طلب «{p['request_type'].replace('_',' ')}» ({p['request_number']}) في انتظار موافقة الإدارة"}), 400
            if req_type == "استئناف" and driver["statut"] not in STOPPED:
                return jsonify({"error": "لا يمكن الاستئناف: وضعك الحالي «نشط»"}), 400
            if req_type in STOPPED and driver["statut"] == req_type:
                return jsonify({"error": f"وضعك الحالي هو «{req_type.replace('_',' ')}» بالفعل"}), 400
            if req_type == "توقف_مؤقت" and driver["statut"] == "توقف_نهائي":
                return jsonify({"error": "أنت في توقف نهائي — قدّم طلب استئناف أولاً"}), 400
        elif req_type not in CERT_TYPES:
            why = lock_reason(conn, driver["id"])
            if why:
                return jsonify({"error": why}), 400
        if req_type == "تصريح_مناوب":
            # كل عقد مناوب جديد يُرسل تصريحاً جديداً — الطلبات المعلّقة القديمة تصبح متجاوزة
            conn.execute("""
                UPDATE requests SET statut='ملغى', admin_notes='أُلغي تلقائياً — حلّ محله طلب أحدث بعقد مناوب جديد', updated_at=?
                WHERE driver_id=? AND request_type='تصريح_مناوب' AND statut IN ('جديد','قيد_المعالجة')
            """, (now, driver["id"]))
        elif req_type not in STATUS_TYPES:
            if req_type in CERT_TYPES:
                # الطلب المكرّر يُلغى ويعوّضه الأحدث
                conn.execute("""
                    UPDATE requests SET statut='ملغى', admin_notes='أُلغي تلقائياً — حلّ محله طلب شهادة أحدث', updated_at=?
                    WHERE driver_id=? AND request_type=? AND statut='جديد'
                """, (now, driver["id"], req_type))
            if req_type == "تغيير_سيارة":
                # المركبة الجديدة حُفظت فعلاً في الملف — الطلب الجديد يعوّض الطلبات القديمة التي لم تُفتح بعد
                conn.execute("""
                    UPDATE requests SET statut='ملغى', admin_notes='أُلغي تلقائياً — حلّ محله طلب تغيير مركبة أحدث', updated_at=?
                    WHERE driver_id=? AND request_type='تغيير_سيارة' AND statut='جديد'
                """, (now, driver["id"]))
            dup = conn.execute("""
                SELECT id, request_number FROM requests
                WHERE driver_id=? AND request_type=? AND statut IN ('جديد','قيد_المعالجة')
                ORDER BY id DESC LIMIT 1
            """, (driver["id"], req_type)).fetchone()
            if dup:
                _bump(conn, dup["id"], now)
                return jsonify({"error": f"طلبك ({dup['request_number']}) قيد المعالجة — تم تذكير الإدارة به وإعادته إلى أعلى قائمة الطلبات", "bumped": True}), 400

        attachments = {}

        if req_type == "تغيير_سيارة":
            img = save_image(data.get("image_carte_grise_base64"), "req_cg", nin)
            if img: attachments["carte_grise"] = img

        elif req_type == "تغيير_باب":
            img = save_image(data.get("image_decision_base64"), "req_dec", nin)
            if img: attachments["decision"] = img

        elif req_type in ("تصريح_مناوب", "تجديد_رخصة_مناوب"):
            img_p_r = save_image(data.get("image_permis_recto_base64"), "req_dep_perm_r", nin)
            img_p_v = save_image(data.get("image_permis_verso_base64"), "req_dep_perm_v", nin)
            img_c_r = save_image(data.get("image_cni_recto_base64"),    "req_dep_cni_r",  nin)
            img_c_v = save_image(data.get("image_cni_verso_base64"),    "req_dep_cni_v",  nin)
            if img_p_r: attachments["permis_recto"] = img_p_r
            if img_p_v: attachments["permis_verso"] = img_p_v
            if img_c_r: attachments["cni_recto"]    = img_c_r
            if img_c_v: attachments["cni_verso"]    = img_c_v

        elif req_type == "تجديد_رخصة_سائق":
            img_r = save_image(data.get("image_permis_recto_base64"), "req_perm_r", nin)
            img_v = save_image(data.get("image_permis_verso_base64"), "req_perm_v", nin)
            if img_r: attachments["permis_recto"] = img_r
            if img_v: attachments["permis_verso"] = img_v

        # === بيانات الطلب ===
        request_data = {k: v for k, v in {
            # بيانات عامة
            "num_immatriculation":  data.get("num_immatriculation"),
            "marque":               data.get("marque"),
            "type_vehicule":        data.get("type_vehicule"),
            "num_serie":            data.get("num_serie"),
            "annee_circulation":    data.get("annee_circulation"),
            # المركبة الحالية (تغيير_سيارة)
            "current_num_immatriculation": data.get("current_num_immatriculation"),
            "current_marque":              data.get("current_marque"),
            "current_type_vehicule":       data.get("current_type_vehicule"),
            "current_num_serie":           data.get("current_num_serie"),
            "current_annee_circulation":   data.get("current_annee_circulation"),
            # المركبة الجديدة (تغيير_سيارة)
            "new_num_immatriculation": data.get("new_num_immatriculation"),
            "new_marque":              data.get("new_marque"),
            "new_type_vehicule":       data.get("new_type_vehicule"),
            "new_num_serie":           data.get("new_num_serie"),
            "new_annee_circulation":   data.get("new_annee_circulation"),
            # باب
            "door_number":          data.get("door_number"),
            "decision_type":        data.get("decision_type"),
            "decision_number":      data.get("decision_number"),
            "decision_date":        data.get("decision_date"),
            "new_beneficiary_name": data.get("new_beneficiary_name"),
            # نشاط
            "activity_type_old":    data.get("activity_type_old"),
            "activity_type_new":    data.get("activity_type_new"),
            "zone":                 data.get("zone"),
            # مناوب
            "deputy_nom_ar":        data.get("deputy_nom_ar"),
            "deputy_prenom_ar":     data.get("deputy_prenom_ar"),
            "deputy_nin":           data.get("deputy_nin"),
            "deputy_num_permis":    data.get("deputy_num_permis"),
            "deputy_expiration":    data.get("deputy_expiration"),
            # رخصة
            "num_permis_new":       data.get("num_permis_new"),
            "date_expiration_new":  data.get("date_expiration_new"),
            "notes":                data.get("notes"),
        }.items() if v is not None}

        # === استئناف: الملف الكامل (مركبة + باب + عقد كراء جديد) يُرفق بالطلب ===
        if req_type == "استئناف":
            from routes.resume_flow import build_resume
            drv_row = conn.execute("SELECT * FROM drivers WHERE id=?", (driver["id"],)).fetchone()
            resume, res_att, res_err = build_resume(conn, drv_row, data)
            if res_err:
                return jsonify({"error": res_err}), 400
            request_data["resume"] = resume
            attachments.update(res_att)

        # === تغيير المركبة: بيانات المركبتين تُؤخذ من قاعدة البيانات (أدق من الواجهة) ===
        if req_type == "تغيير_سيارة":
            cur_v = conn.execute("SELECT * FROM vehicles WHERE driver_id=? AND is_current=1 ORDER BY id DESC LIMIT 1",
                                 (driver["id"],)).fetchone()
            old_v = conn.execute("""SELECT v.* FROM vehicles_history vh JOIN vehicles v ON v.id = vh.vehicle_id
                                    WHERE vh.driver_id=? AND vh.change_reason='تغيير_سيارة' AND vh.request_id IS NULL
                                    ORDER BY vh.id DESC LIMIT 1""", (driver["id"],)).fetchone()
            for pre, row in (("new_", cur_v), ("current_", old_v)):
                if row:
                    for k in ("num_immatriculation", "marque", "type_vehicule", "num_serie", "annee_circulation"):
                        if row[k]:
                            request_data[pre + k] = row[k]
            if old_v:
                request_data["num_immatriculation"] = old_v["num_immatriculation"]
                request_data["marque"] = old_v["marque"]

        # === طلب شهادة إدارية: الغرض + المعني (السائق أو مناوبه) ===
        if req_type in CERT_TYPES:
            purpose = (data.get("purpose") or "").strip()[:300]
            if purpose:
                request_data["purpose"] = purpose
            if req_type == "شهادة_إدارية_مناوب":
                dep = conn.execute("SELECT nin, nom_ar, prenom_ar FROM deputies WHERE driver_id=? AND is_current=1 ORDER BY id DESC LIMIT 1",
                                   (driver["id"],)).fetchone()
                if not dep:
                    return jsonify({"error": "لا يوجد سائق مناوب مسجّل في ملفك"}), 400
                request_data.update({"deputy_nin": dep["nin"], "deputy_name": f"{dep['nom_ar'] or ''} {dep['prenom_ar'] or ''}".strip()})

        # === رقم الطلب ===
        request_number = generate_number("REQ", "requests", "request_number")

        # ملاحظة: طلبات التوقف/الاستئناف لا تُحدث أي أثر هنا —
        # الأثر الفعلي يُطبَّق عند موافقة الإدارة (routes/status_flow.apply_status_request)

        # === حفظ الطلب ===
        cur = conn.execute("""
            INSERT INTO requests
            (driver_id, request_type, statut, request_data, attachments,
             notes, request_number, updated_at)
            VALUES (?,?,?,?,?,?,?,?)
        """, (
            driver["id"], req_type, "جديد",
            json.dumps(request_data, ensure_ascii=False),
            json.dumps(attachments, ensure_ascii=False),
            data.get("notes", ""),
            request_number, now,
        ))
        req_id = cur.lastrowid

        conn.commit()

    return jsonify({
        "success":        True,
        "request_id":     cur.lastrowid,
        "request_number": request_number,
    })


# ════════════════════════════════════════
# GET /api/requests
# ════════════════════════════════════════

@requests_bp.route("/api/requests", methods=["GET"])
@require_auth
def get_my_requests(account):
    with get_db() as conn:
        driver = conn.execute(
            "SELECT id FROM drivers WHERE account_id=?", (account["id"],)
        ).fetchone()
        if not driver:
            return jsonify({"requests": []}), 200

        rows = conn.execute("""
            SELECT id, request_number, request_type, statut,
                   request_data, notes, admin_notes, created_at, processed_at
            FROM requests WHERE driver_id=? ORDER BY created_at DESC
        """, (driver["id"],)).fetchall()

    return jsonify({"requests": [dict(r) for r in rows]})


# ════════════════════════════════════════
# GET /api/requests/<id>
# ════════════════════════════════════════

@requests_bp.route("/api/requests/<int:req_id>", methods=["GET"])
@require_auth
def get_request(account, req_id):
    with get_db() as conn:
        driver = conn.execute(
            "SELECT id FROM drivers WHERE account_id=?", (account["id"],)
        ).fetchone()
        if not driver:
            return jsonify({"error": "غير موجود"}), 404

        row = conn.execute(
            "SELECT * FROM requests WHERE id=? AND driver_id=?",
            (req_id, driver["id"])
        ).fetchone()
        if not row:
            return jsonify({"error": "الطلب غير موجود"}), 404

    return jsonify(dict(row))
