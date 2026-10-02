from flask import Blueprint, request, jsonify
from database import get_db, generate_number
from routes.status_flow import lock_reason, pending_status_request
from utils import require_auth, save_image
import json
from datetime import datetime

driver_bp = Blueprint("driver", __name__)


# ════════════════════════════════════════
# GET /api/driver/profile
# ════════════════════════════════════════

@driver_bp.route("/api/driver/profile", methods=["GET"])
@require_auth
def get_profile(account):
    with get_db() as conn:
        driver = conn.execute(
            "SELECT * FROM drivers WHERE account_id=?", (account["id"],)
        ).fetchone()

        if not driver:
            return jsonify({"driver": None}), 200

        d = dict(driver)

        license_ = conn.execute(
            "SELECT * FROM driver_licenses WHERE driver_id=? AND is_current=1",
            (d["id"],)
        ).fetchone()

        vehicle = conn.execute(
            "SELECT * FROM vehicles WHERE driver_id=? AND is_current=1",
            (d["id"],)
        ).fetchone()

        door = conn.execute("""
            SELECT dl.*, b.nom_ar as ben_nom_ar, b.prenom_ar as ben_prenom_ar,
                   b.nom_fr as ben_nom_fr, b.prenom_fr as ben_prenom_fr,
                   b.date_naissance as ben_date_naissance,
                   b.lieu_naissance as ben_lieu_naissance,
                   b.sifa, b.nin as ben_nin,
                   b.telephone as ben_telephone, b.adresse as ben_adresse,
                   b.wilaya as ben_wilaya,
                   b.num_document_cni as ben_num_cni,
                   b.date_delivrance_cni as ben_date_cni,
                   b.sexe as ben_sexe,
                   b.groupe_sanguin as ben_groupe_sanguin
            FROM door_licenses dl
            JOIN beneficiaries b ON b.id = dl.beneficiary_id
            WHERE dl.current_driver_id=? AND dl.is_active=1
        """, (d["id"],)).fetchone()

        rental = conn.execute(
            "SELECT * FROM rental_contracts WHERE driver_id=? AND is_current=1",
            (d["id"],)
        ).fetchone()

        deputy = conn.execute(
            "SELECT * FROM deputies WHERE driver_id=? AND is_current=1",
            (d["id"],)
        ).fetchone()

        deputy_contract = conn.execute(
            "SELECT * FROM deputy_contracts WHERE driver_id=? AND is_current=1",
            (d["id"],)
        ).fetchone()

        activity = conn.execute(
            "SELECT * FROM activity WHERE driver_id=? AND is_current=1",
            (d["id"],)
        ).fetchone()

        # طلب توقف/استئناف ينتظر قرار الإدارة + سبب القفل + الباب السابق القابل لإعادة الربط
        _pend = pending_status_request(conn, d["id"])
        pending_status = dict(_pend) if _pend else None
        locked_reason = lock_reason(conn, d["id"])
        last_door = None
        if not door and d.get("statut") == "نشط":
            _ld = conn.execute("""
                SELECT dl.id, dl.door_number, b.nom_ar AS ben_nom, b.prenom_ar AS ben_prenom
                FROM rental_contracts rc
                JOIN door_licenses dl ON dl.id = rc.door_license_id
                JOIN beneficiaries b ON b.id = dl.beneficiary_id
                WHERE rc.driver_id=? ORDER BY rc.id DESC LIMIT 1
            """, (d["id"],)).fetchone()
            _own = conn.execute("""
                SELECT dl.id, dl.door_number, b.nom_ar AS ben_nom, b.prenom_ar AS ben_prenom
                FROM door_licenses dl JOIN beneficiaries b ON b.id = dl.beneficiary_id
                WHERE dl.exploitation_mode='مستفيد' AND b.nin=? ORDER BY dl.updated_at DESC LIMIT 1
            """, (d.get("nin"),)).fetchone() if d.get("nin") else None
            if _own:
                _ld = _own
            if _ld and not conn.execute("""
                SELECT 1 FROM door_licenses WHERE door_number=? AND is_active=1
                  AND current_driver_id IS NOT NULL AND current_driver_id!=?
            """, (_ld["door_number"], d["id"])).fetchone():
                last_door = dict(_ld)

        # الباب السابق (لنموذج طلب الاستئناف أثناء التوقف)
        resume_door = None
        if d.get("statut") in ("توقف_مؤقت", "توقف_نهائي"):
            from routes.resume_flow import last_door as _last_door
            resume_door = _last_door(conn, d["id"], d.get("nin"))

        notifs = conn.execute(
            "SELECT COUNT(*) as cnt FROM notifications WHERE driver_id=? AND is_read=0",
            (d["id"],)
        ).fetchone()

        # أحدث طلب تغيير سيارة بحالة "جديد" — لاستعادة reqId بعد تحديث الصفحة
        change_veh_req = conn.execute(
            """SELECT id, request_number, statut FROM requests
               WHERE driver_id=? AND request_type='تغيير_سيارة' AND statut='جديد'
               ORDER BY id DESC LIMIT 1""",
            (d["id"],)
        ).fetchone()

    # استنتاج الجنس من NIN إذا كان فارغاً في قاعدة البيانات
    door_dict = dict(door) if door else None
    if door_dict and not door_dict.get("ben_sexe") and door_dict.get("ben_nin"):
        nin = str(door_dict["ben_nin"])
        if nin[0] == "1":
            door_dict["ben_sexe"] = "ذكر"
        elif nin[0] == "2":
            door_dict["ben_sexe"] = "أنثى"

    return jsonify({
        "driver":                dict(driver) if driver else None,
        "license":               dict(license_) if license_ else None,
        "vehicle":               dict(vehicle) if vehicle else None,
        "door":                  door_dict,
        "rental":                dict(rental) if rental else None,
        "deputy":                dict(deputy) if deputy else None,
        "deputy_contract":       dict(deputy_contract) if deputy_contract else None,
        "activity":              dict(activity) if activity else None,
        "unread_notifs":         notifs["cnt"] if notifs else 0,
        "change_vehicle_request": dict(change_veh_req) if change_veh_req else None,
        "pending_status":        pending_status,
        "locked_reason":         locked_reason,
        "last_door":             last_door,
        "resume_door":           resume_door,
    })


# ════════════════════════════════════════
# PUT /api/driver/identity
# ════════════════════════════════════════

@driver_bp.route("/api/driver/identity", methods=["PUT"])
@require_auth
def save_identity(account):
    data = request.get_json() or {}

    nin = data.get("nin", "")
    img_recto = save_image(data.get("image_cni_recto_base64"), "cni_recto", nin, data.get("image_cni_recto_mime"))
    img_verso  = save_image(data.get("image_cni_verso_base64"),  "cni_verso",  nin, data.get("image_cni_verso_mime"))

    with get_db() as conn:
        existing = conn.execute(
            "SELECT id FROM drivers WHERE account_id=?", (account["id"],)
        ).fetchone()

        fields = {
            "nom_ar":            data.get("nom_ar"),
            "prenom_ar":         data.get("prenom_ar"),
            "nom_fr":            data.get("nom_fr"),
            "prenom_fr":         data.get("prenom_fr"),
            "date_naissance":    data.get("date_naissance"),
            "lieu_naissance_ar": data.get("lieu_naissance_ar"),
            "lieu_naissance_fr": data.get("lieu_naissance_fr"),
            "wilaya_naissance":  data.get("wilaya_naissance"),
            "commune":           data.get("commune"),
            "wilaya":            data.get("wilaya"),
            "adresse":           data.get("adresse"),
            "nationalite":       data.get("nationalite", "جزائري"),
            "nin":               nin,
            "telephone":         data.get("telephone"),
            "telephone2":        data.get("telephone2"),
            "sexe":                data.get("sexe"),
            "groupe_sanguin":      data.get("groupe_sanguin"),
            "autorite_delivrance": data.get("autorite_delivrance"),
            "date_delivrance_cni": data.get("date_delivrance_cni"),
            "date_expiration_cni": data.get("date_expiration_cni"),
            "num_document_cni":    data.get("num_document_cni"),
            "ocr_cni_raw":       json.dumps(data.get("ocr_raw"), ensure_ascii=False) if data.get("ocr_raw") else None,
            "updated_at":        datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        }
        if img_recto: fields["image_cni_recto_path"] = img_recto
        if img_verso:  fields["image_cni_verso_path"] = img_verso

        if existing:
            # تحديث جزئي: الحقول غير المرسلة تبقى كما هي (كان كل حفظ يمسح الولاية والجنس والهاتف 2…)
            keep = {"updated_at", "image_cni_recto_path", "image_cni_verso_path"}
            fields = {k: v for k, v in fields.items()
                      if k in keep or k in data or (k == "ocr_cni_raw" and data.get("ocr_raw"))}
            # تحقق: هل NIN مستخدم من حساب آخر؟
            if nin:
                nin_conflict = conn.execute(
                    "SELECT id FROM drivers WHERE nin=? AND account_id!=?",
                    (nin, account["id"])
                ).fetchone()
                if nin_conflict:
                    return jsonify({"error": "رقم التعريف الوطني مسجّل مسبقاً لحساب آخر"}), 409

            set_clause = ", ".join(f"{k}=?" for k in fields)
            conn.execute(
                f"UPDATE drivers SET {set_clause} WHERE account_id=?",
                list(fields.values()) + [account["id"]]
            )
            driver_id = existing["id"]
        else:
            # تحقق: هل NIN مستخدم من حساب آخر؟
            if nin:
                nin_conflict = conn.execute(
                    "SELECT id FROM drivers WHERE nin=?", (nin,)
                ).fetchone()
                if nin_conflict:
                    return jsonify({"error": "رقم التعريف الوطني مسجّل مسبقاً لحساب آخر"}), 409

            fields["account_id"] = account["id"]
            cols = ", ".join(fields.keys())
            vals = ", ".join("?" * len(fields))
            cursor = conn.execute(
                f"INSERT INTO drivers ({cols}) VALUES ({vals})",
                list(fields.values())
            )
            driver_id = cursor.lastrowid

        conn.commit()

    return jsonify({"success": True, "driver_id": driver_id})


# ════════════════════════════════════════
# PUT /api/driver/license
# ════════════════════════════════════════

@driver_bp.route("/api/driver/license", methods=["PUT"])
@require_auth
def save_license(account):
    data = request.get_json() or {}

    with get_db() as conn:
        driver = conn.execute(
            "SELECT id, nin FROM drivers WHERE account_id=?", (account["id"],)
        ).fetchone()
        if not driver:
            # إنشاء سجل سائق فارغ إذا لم يكمل الهوية بعد
            cursor_d = conn.execute(
                "INSERT INTO drivers (account_id, updated_at) VALUES (?, datetime('now','localtime'))",
                (account["id"],)
            )
            driver_id = cursor_d.lastrowid
            nin = ""
        else:
            driver_id = driver["id"]
            nin = driver["nin"] or ""
        img_recto = save_image(data.get("image_permis_recto_base64"), "permis_recto", nin, data.get("image_permis_recto_mime"))
        img_verso  = save_image(data.get("image_permis_verso_base64"), "permis_verso",  nin, data.get("image_permis_verso_mime"))

        conn.execute(
            "UPDATE driver_licenses SET is_current=0, updated_at=datetime('now','localtime') WHERE driver_id=? AND is_current=1",
            (driver_id,)
        )

        cursor = conn.execute("""
            INSERT INTO driver_licenses
            (driver_id, num_permis, date_delivrance, date_expiration,
             lieu_delivrance, wilaya_delivrance, categories,
             image_permis_recto_path, image_permis_verso_path, ocr_permis_raw, is_current)
            VALUES (?,?,?,?,?,?,?,?,?,?,1)
        """, (
            driver_id,
            data.get("num_permis"),
            data.get("date_delivrance"),
            data.get("date_expiration"),
            data.get("lieu_delivrance"),
            data.get("wilaya_delivrance"),
            json.dumps(data.get("categories", []), ensure_ascii=False),
            img_recto, img_verso,
            json.dumps(data.get("ocr_raw"), ensure_ascii=False) if data.get("ocr_raw") else None,
        ))
        conn.commit()

    return jsonify({"success": True, "license_id": cursor.lastrowid})


# ════════════════════════════════════════
# PUT /api/driver/vehicle
# ════════════════════════════════════════

@driver_bp.route("/api/driver/vehicle", methods=["PUT"])
@require_auth
def save_vehicle(account):
    data = request.get_json() or {}

    with get_db() as conn:
        driver = conn.execute(
            "SELECT id, nin FROM drivers WHERE account_id=?", (account["id"],)
        ).fetchone()
        if not driver:
            cursor_d = conn.execute(
                "INSERT INTO drivers (account_id, updated_at) VALUES (?, datetime('now','localtime'))",
                (account["id"],)
            )
            driver_id = cursor_d.lastrowid
            nin = ""
        else:
            driver_id = driver["id"]
            _why = lock_reason(conn, driver_id)
            if _why:
                return jsonify({"error": _why}), 400
            nin = driver["nin"] or ""

        img_cg = save_image(data.get("image_carte_grise_base64"), "carte_grise", nin, data.get("image_carte_grise_mime"))

        num_immat = data.get("num_immatriculation", "").strip()

        # تحقق: هل نفس رقم التسجيل مسجّل لسائق آخر حالياً؟
        if num_immat:
            old_owner = conn.execute("""
                SELECT v.id as vid, v.driver_id, d.nom_ar, d.prenom_ar, d.nin
                FROM vehicles v
                JOIN drivers d ON d.id = v.driver_id
                WHERE v.num_immatriculation=? AND v.is_current=1
                  AND v.driver_id != ?
            """, (num_immat, driver_id)).fetchone()

            if old_owner:
                old_owner = dict(old_owner)
                # ── 1. أرشفة السيارة من السائق القديم ──
                _ov_date = conn.execute("SELECT created_at FROM vehicles WHERE id=?", (old_owner["vid"],)).fetchone()
                _ov_start = (_ov_date["created_at"] if _ov_date else None) or datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                conn.execute("""
                    UPDATE vehicles
                    SET is_current=0, updated_at=datetime('now','localtime')
                    WHERE id=?
                """, (old_owner["vid"],))
                conn.execute("""
                    INSERT INTO vehicles_history
                    (driver_id, vehicle_id, change_reason, date_start, date_end)
                    VALUES (?, ?, 'نقل_ملكية', ?, datetime('now','localtime'))
                """, (old_owner["driver_id"], old_owner["vid"], _ov_start))

                # ── 2. تسجيل طلب تغيير_مركبة تلقائياً ──
                req_num = generate_number("REQ", "requests", "request_number")
                old_name = f"{old_owner.get('prenom_ar','') or ''} {old_owner.get('nom_ar','') or ''}".strip()
                conn.execute("""
                    INSERT INTO requests
                    (driver_id, request_type, request_number, statut, notes, created_at)
                    VALUES (?, 'تغيير_مركبة', ?, 'مقبول', ?, datetime('now','localtime'))
                """, (
                    driver_id,
                    req_num,
                    f"نقل ملكية المركبة {num_immat} من السائق [{old_name}] (NIN: {old_owner.get('nin','')}) إلى السائق الجديد"
                ))

        old_vehicle = conn.execute(
            "SELECT id, created_at FROM vehicles WHERE driver_id=? AND is_current=1",
            (driver_id,)
        ).fetchone()

        if old_vehicle:
            _ov2_start = dict(old_vehicle).get("created_at") or datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            conn.execute(
                "UPDATE vehicles SET is_current=0, updated_at=datetime('now','localtime') WHERE id=?",
                (old_vehicle["id"],)
            )
            conn.execute("""
                INSERT INTO vehicles_history
                (driver_id, vehicle_id, change_reason, date_start, date_end)
                VALUES (?, ?, 'تغيير_سيارة', ?, datetime('now','localtime'))
            """, (driver_id, old_vehicle["id"], _ov2_start))

        cursor = conn.execute("""
            INSERT INTO vehicles
            (driver_id, num_immatriculation, num_precedent, marque, type_vehicule,
             num_serie, genre, carrosserie, energie, puissance, nb_places,
             poids_total, charge_utile, annee_circulation,
             date_delivrance, lieu_delivrance, wilaya_delivrance,
             quittance_num, quittance_montant, quittance_date,
             proprietaire_nom_ar, proprietaire_prenom_ar,
             proprietaire_nom, proprietaire_prenom,
             proprietaire_dob, proprietaire_lieu,
             proprietaire_adresse, proprietaire_commune,
             proprietaire_wilaya, profession,
             image_carte_grise_path, ocr_carte_grise_raw, is_current)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)
        """, (
            driver_id,
            data.get("num_immatriculation"),    data.get("num_precedent"),
            data.get("marque"),                 data.get("type_vehicule"),
            data.get("num_serie"),              data.get("genre"),
            data.get("carrosserie"),            data.get("energie"),
            data.get("puissance"),              data.get("nb_places"),
            data.get("poids_total"),            data.get("charge_utile"),
            data.get("annee_circulation"),      data.get("date_delivrance"),
            data.get("lieu_delivrance"),        data.get("wilaya_delivrance"),
            data.get("quittance_num"),          data.get("quittance_montant"),
            data.get("quittance_date"),
            data.get("proprietaire_nom_ar"),    data.get("proprietaire_prenom_ar"),
            data.get("proprietaire_nom"),       data.get("proprietaire_prenom"),
            data.get("proprietaire_dob"),       data.get("proprietaire_lieu"),
            data.get("proprietaire_adresse"),   data.get("proprietaire_commune"),
            data.get("proprietaire_wilaya"),    data.get("profession"),
            img_cg,
            json.dumps(data.get("ocr_raw"), ensure_ascii=False) if data.get("ocr_raw") else None,
        ))
        conn.commit()

    return jsonify({"success": True, "vehicle_id": cursor.lastrowid})


# ════════════════════════════════════════
# تنبيه: save_door و rental-contract محوَّلان إلى routes/door.py
# ════════════════════════════════════════


