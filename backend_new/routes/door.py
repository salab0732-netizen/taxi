from flask import Blueprint, request, jsonify
from database import get_db, generate_number
from routes.status_flow import lock_reason
from utils import require_auth, save_image
import json
from datetime import datetime, date, timedelta


import re as _re

def _digits(x):
    return _re.sub(r"\D", "", str(x or ""))


def _norm_name(x):
    s = _re.sub(r"[\s\-_ـ]", "", str(x or ""))
    return s.replace("أ", "ا").replace("إ", "ا").replace("آ", "ا").replace("ة", "ه").replace("ى", "ي")


def _same_person(drv, data):
    """هل بطاقة المستفيد هي بطاقة السائق نفسه؟ (NIN، أو الاسم الكامل + تاريخ الميلاد)"""
    if not drv:
        return False
    a, b = _digits(drv["nin"]), _digits(data.get("ben_nin"))
    if a and b and a == b:
        return True
    same_name = (_norm_name(drv["nom_ar"]) and _norm_name(drv["nom_ar"]) == _norm_name(data.get("ben_nom_ar"))
                 and _norm_name(drv["prenom_ar"]) == _norm_name(data.get("ben_prenom_ar")))
    same_dob = drv["date_naissance"] and str(drv["date_naissance"])[:10] == str(data.get("ben_date_naissance") or "")[:10]
    return bool(same_name and same_dob)

door_bp = Blueprint("door", __name__)


# ════════════════════════════════════════
# PUT /api/driver/door
# حفظ/تحديث رقم الباب + المستفيد + القرار الولائي
# يدعم: إدخال جديد + تحديث حالي + تغيير رقم الباب
# ════════════════════════════════════════

@door_bp.route("/api/driver/door", methods=["PUT"])
@require_auth
def save_door(account):
    data = request.get_json() or {}

    with get_db() as conn:
        driver = conn.execute(
            "SELECT id, nin FROM drivers WHERE account_id=?", (account["id"],)
        ).fetchone()
        if not driver:
            return jsonify({"error": "أكمل بيانات الهوية أولاً"}), 400
        _why = lock_reason(conn, driver["id"])
        if _why:
            return jsonify({"error": _why}), 400

        nin = driver["nin"] or ""

        # --- حفظ صور المستفيد ---
        ben_img_recto = save_image(data.get("ben_image_cni_recto_base64"), "ben_cni_recto", nin)
        ben_img_verso  = save_image(data.get("ben_image_cni_verso_base64"), "ben_cni_verso", nin)

        # --- حفظ صورة القرار الولائي ---
        dec_img = save_image(data.get("image_decision_base64"), "decision", nin)

        # === 0. صفة الاستغلال ===
        mode = (data.get("exploitation_mode") or "مستأجر").strip()
        if mode not in ("مستأجر", "مستفيد"):
            mode = "مستأجر"
        if mode == "مستفيد":
            drv_full = conn.execute(
                "SELECT nin, nom_ar, prenom_ar, date_naissance FROM drivers WHERE id=?", (driver["id"],)
            ).fetchone()
            if not _same_person(drv_full, data):
                return jsonify({"error": "صفة «مستفيد» تعني أن السائق هو صاحب الرخصة: بطاقة التعريف المُدخلة لا تطابق هوية السائق "
                                         "(رقم التعريف الوطني أو الاسم وتاريخ الميلاد) — تحقق من البطاقة أو اختر «مستأجر»"}), 400

        # === التحقق من الحقول الإلزامية (رسالة واضحة بدل خطأ في الخادم) ===
        missing = [lbl for k, lbl in (("door_number", "رقم الرخصة (الباب)"), ("ben_nom_ar", "لقب المستفيد"),
                                      ("ben_prenom_ar", "اسم المستفيد")) if not str(data.get(k) or "").strip()]
        if missing:
            return jsonify({"error": "حقول إلزامية ناقصة: " + "، ".join(missing)}), 400

        # === 1. حفظ/تحديث المستفيد ===
        ben_nin = data.get("ben_nin", "")
        existing_ben = conn.execute(
            "SELECT id FROM beneficiaries WHERE nin=?", (ben_nin,)
        ).fetchone() if ben_nin else None

        ben_fields = {
            "nom_ar":              data.get("ben_nom_ar"),
            "prenom_ar":           data.get("ben_prenom_ar"),
            "nom_fr":              data.get("ben_nom_fr"),
            "prenom_fr":           data.get("ben_prenom_fr"),
            "date_naissance":      data.get("ben_date_naissance"),
            "lieu_naissance":      data.get("ben_lieu_naissance"),
            "nin":                 ben_nin,
            "telephone":           data.get("ben_telephone"),
            "adresse":             data.get("ben_adresse"),
            "wilaya":              data.get("ben_wilaya"),
            "sifa":                data.get("ben_sifa"),
            "num_document_cni":    data.get("ben_num_cni"),
            "date_delivrance_cni": data.get("ben_date_cni"),
            "sexe":                data.get("ben_sexe"),
            "groupe_sanguin":      data.get("ben_groupe_sanguin"),
            "ocr_cni_raw":         json.dumps(data.get("ben_ocr_raw"), ensure_ascii=False)
                                   if data.get("ben_ocr_raw") else None,
            "updated_at":          datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        }
        if ben_img_recto: ben_fields["image_cni_recto_path"] = ben_img_recto
        if ben_img_verso:  ben_fields["image_cni_verso_path"] = ben_img_verso

        if existing_ben:
            set_clause = ", ".join(f"{k}=?" for k in ben_fields)
            conn.execute(
                f"UPDATE beneficiaries SET {set_clause} WHERE id=?",
                list(ben_fields.values()) + [existing_ben["id"]]
            )
            ben_id = existing_ben["id"]
        else:
            cols = ", ".join(ben_fields.keys())
            vals = ", ".join("?" * len(ben_fields))
            cur = conn.execute(
                f"INSERT INTO beneficiaries ({cols}) VALUES ({vals})",
                list(ben_fields.values())
            )
            ben_id = cur.lastrowid

        # === 2. حفظ/تحديث رخصة الباب ===
        door_number = data.get("door_number", "").strip()
        if not door_number:
            conn.rollback()
            return jsonify({"error": "رقم الباب مطلوب"}), 400
        if not data.get("decision_number") or not data.get("decision_date"):
            conn.rollback()
            return jsonify({"error": "رقم القرار الولائي وتاريخه مطلوبان"}), 400

        # هل هذا الرقم موجود مسبقاً في قاعدة البيانات؟
        existing_door = conn.execute(
            "SELECT id, is_active, current_driver_id FROM door_licenses WHERE door_number=?", (door_number,)
        ).fetchone()
        # حماية: لا يجوز الاستحواذ على رقم باب يستغله سائق آخر حالياً
        if existing_door and existing_door["is_active"] and existing_door["current_driver_id"] \
                and existing_door["current_driver_id"] != driver["id"]:
            conn.rollback()
            return jsonify({"error": f"رقم الباب {door_number} مستغل حالياً من طرف سائق آخر"}), 400

        # الولاية: يقبل كلاً من 'wilaya' و 'door_wilaya'
        wilaya_val = data.get("wilaya") or data.get("door_wilaya") or "البيض"

        door_fields = {
            "beneficiary_id":      ben_id,
            "door_number":         door_number,
            "wilaya":              wilaya_val,
            "exploitation_commune":data.get("exploitation_commune"),
            "decision_type":       data.get("decision_type") or "غير_محدد",
            "decision_number":     data.get("decision_number"),
            "decision_date":       data.get("decision_date"),
            "decision_wilaya":     data.get("decision_wilaya"),
            "ocr_decision_raw":    json.dumps(data.get("decision_ocr_raw"), ensure_ascii=False)
                                   if data.get("decision_ocr_raw") else None,
            "current_driver_id":   driver["id"],
            "is_active":           1,
            "exploitation_mode":   mode,
            "updated_at":          datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        }
        if dec_img: door_fields["image_decision_path"] = dec_img

        # باب واحد نشط فقط لكل سائق: أوقف أي باب آخر نشط له
        conn.execute("""
            UPDATE door_licenses SET is_active=0, updated_at=datetime('now','localtime')
            WHERE current_driver_id=? AND is_active=1 AND door_number!=?
        """, (driver["id"], door_number))

        if existing_door:
            set_clause = ", ".join(f"{k}=?" for k in door_fields)
            conn.execute(
                f"UPDATE door_licenses SET {set_clause} WHERE id=?",
                list(door_fields.values()) + [existing_door["id"]]
            )
            door_id = existing_door["id"]
        else:
            # ── تغيير رقم الباب: ألغِ القديم ──────────────────────────
            # إذا كان هناك رقم باب قديم نشط لهذا السائق، أوقفه
            conn.execute("""
                UPDATE door_licenses
                SET is_active=0, updated_at=datetime('now','localtime')
                WHERE current_driver_id=? AND is_active=1
            """, (driver["id"],))
            # أنشئ رقم الباب الجديد
            cols = ", ".join(door_fields.keys())
            vals = ", ".join("?" * len(door_fields))
            cur = conn.execute(
                f"INSERT INTO door_licenses ({cols}) VALUES ({vals})",
                list(door_fields.values())
            )
            door_id = cur.lastrowid

        # المستفيد يستغل رخصته بنفسه ⇒ لا عقد كراء: يُفسخ أي عقد ساري
        if mode == "مستفيد":
            conn.execute("""
                UPDATE rental_contracts SET is_current=0, end_date=?, end_reason='استغلال_مباشر_من_المستفيد',
                       updated_at=datetime('now','localtime')
                WHERE driver_id=? AND is_current=1
            """, (datetime.now().strftime("%Y-%m-%d"), driver["id"]))

        conn.commit()

    return jsonify({"success": True, "beneficiary_id": ben_id, "door_id": door_id, "exploitation_mode": mode})


# ════════════════════════════════════════
# POST /api/driver/rental-contract
# إنشاء عقد كراء جديد
# القواعد:
#   - مدة العقد سنة واحدة تلقائياً (end_date = contract_date + 1 سنة)
#   - لا يمكن إنشاء عقد جديد إذا كان العقد الحالي لم يبقَ له أكثر من 7 أيام
#   - عقد واحد نشط فقط في أي وقت
# ════════════════════════════════════════

@door_bp.route("/api/driver/rental-contract", methods=["POST"])
@require_auth
def create_rental_contract(account):
    with get_db() as conn:
        driver = conn.execute(
            "SELECT id FROM drivers WHERE account_id=?", (account["id"],)
        ).fetchone()
        if not driver:
            return jsonify({"error": "أكمل بيانات الهوية أولاً"}), 400
        _why = lock_reason(conn, driver["id"])
        if _why:
            return jsonify({"error": _why}), 400

        # جلب رقم الباب المرتبط بالسائق
        door = conn.execute(
            "SELECT id, beneficiary_id, exploitation_mode FROM door_licenses WHERE current_driver_id=? AND is_active=1",
            (driver["id"],)
        ).fetchone()
        if not door:
            return jsonify({"error": "أكمل بيانات رقم الباب أولاً"}), 400
        if (door["exploitation_mode"] or "مستأجر") == "مستفيد":
            return jsonify({"error": "أنت المستفيد صاحب الرخصة وتستغلها بنفسك — لا حاجة لعقد كراء"}), 400

        # التحقق من العقد النشط الحالي
        old_contract = conn.execute(
            "SELECT id, contract_number, end_date FROM rental_contracts WHERE driver_id=? AND is_current=1",
            (driver["id"],)
        ).fetchone()

        today = datetime.now().date()

        if old_contract and old_contract["end_date"]:
            try:
                end_dt = datetime.strptime(old_contract["end_date"][:10], "%Y-%m-%d").date()
                days_remaining = (end_dt - today).days

                if days_remaining > 7:
                    # العقد ساري ولم يبقَ 7 أيام بعد — لا يُسمح بالتجديد
                    return jsonify({
                        "error": f"العقد الحالي ساري المفعول — لا يمكن التجديد إلا قبل 7 أيام من انتهائه ({old_contract['end_date']}). "
                                 f"الأيام المتبقية: {days_remaining}",
                        "days_remaining": days_remaining,
                        "end_date": old_contract["end_date"],
                        "can_renew_after": (end_dt - timedelta(days=7)).strftime("%Y-%m-%d"),
                    }), 400
            except (ValueError, TypeError):
                pass  # تاريخ غير صالح — نكمل

        # أنهِ العقد القديم إن وجد
        if old_contract:
            conn.execute("""
                UPDATE rental_contracts
                SET is_current=0,
                    end_reason='تجديد',
                    updated_at=datetime('now','localtime')
                WHERE id=?
            """, (old_contract["id"],))

        # مدة العقد: سنة واحدة تلقائياً من تاريخ اليوم
        contract_date = today
        try:
            end_date = date(today.year + 1, today.month, today.day)
        except ValueError:
            # 29 فيفري → 28 فيفري
            end_date = date(today.year + 1, today.month, 28)

        contract_date_str = contract_date.strftime("%Y-%m-%d")
        end_date_str      = end_date.strftime("%Y-%m-%d")

        contract_number = generate_number("RENT", "rental_contracts", "contract_number")

        data = request.get_json(silent=True) or {}
        try:
            monthly_rent = int(data.get("monthly_rent") or 0)
        except (TypeError, ValueError):
            monthly_rent = 0
        if monthly_rent <= 0:
            conn.rollback()
            return jsonify({"error": "مبلغ الإيجار الشهري مطلوب ويجب أن يكون أكبر من صفر"}), 400

        cursor = conn.execute("""
            INSERT INTO rental_contracts
            (door_license_id, beneficiary_id, driver_id,
             contract_number, contract_date, end_date, monthly_rent, is_current)
            VALUES (?,?,?,?,?,?,?,1)
        """, (
            door["id"], door["beneficiary_id"], driver["id"],
            contract_number,
            contract_date_str,
            end_date_str,
            monthly_rent,
        ))
        conn.commit()

    return jsonify({
        "success":         True,
        "contract_id":     cursor.lastrowid,
        "contract_number": contract_number,
        "contract_date":   contract_date_str,
        "end_date":        end_date_str,
    })


# ════════════════════════════════════════
# POST /api/driver/rental-contract/terminate
# فسخ عقد الكراء الحالي
# ════════════════════════════════════════

@door_bp.route("/api/driver/rental-contract/terminate", methods=["POST"])
@require_auth
def terminate_rental_contract(account):
    with get_db() as conn:
        driver = conn.execute(
            "SELECT id FROM drivers WHERE account_id=?", (account["id"],)
        ).fetchone()
        if not driver:
            return jsonify({"error": "السائق غير موجود"}), 400
        _why = lock_reason(conn, driver["id"])
        if _why:
            return jsonify({"error": _why}), 400

        contract = conn.execute(
            "SELECT id, contract_number FROM rental_contracts WHERE driver_id=? AND is_current=1",
            (driver["id"],)
        ).fetchone()
        if not contract:
            return jsonify({"error": "لا يوجد عقد نشط لفسخه"}), 400

        conn.execute("""
            UPDATE rental_contracts
            SET is_current=0,
                end_date=datetime('now','localtime'),
                end_reason='فسخ',
                updated_at=datetime('now','localtime')
            WHERE id=?
        """, (contract["id"],))
        conn.commit()

    return jsonify({
        "success": True,
        "contract_id": contract["id"],
        "contract_number": contract["contract_number"],
        "message": "تم فسخ عقد الكراء بنجاح"
    })


# ════════════════════════════════════════
# GET /api/driver/door-history
# تاريخ رخص الباب والعقود (أرشيف كامل)
# ════════════════════════════════════════

@door_bp.route("/api/driver/door-history", methods=["GET"])
@require_auth
def get_door_history(account):
    with get_db() as conn:
        driver = conn.execute(
            "SELECT id FROM drivers WHERE account_id=?", (account["id"],)
        ).fetchone()
        if not driver:
            return jsonify({"history": []}), 200

        contracts = conn.execute("""
            SELECT rc.*,
                   dl.door_number, dl.decision_type, dl.decision_number,
                   dl.decision_date, dl.wilaya as door_wilaya,
                   b.nom_ar as ben_nom_ar, b.prenom_ar as ben_prenom_ar, b.sifa
            FROM rental_contracts rc
            JOIN door_licenses dl ON dl.id = rc.door_license_id
            JOIN beneficiaries b  ON b.id  = rc.beneficiary_id
            WHERE rc.driver_id=?
            ORDER BY rc.created_at DESC
        """, (driver["id"],)).fetchall()

    return jsonify({"history": [dict(r) for r in contracts]})


# ════════════════════════════════════════
# POST /api/driver/door/relink
# بعد موافقة الإدارة على الاستئناف: إعادة ربط الباب السابق (إن بقي شاغراً)
# يبقى على السائق إنشاء عقد كراء جديد
# ════════════════════════════════════════

@door_bp.route("/api/driver/door/relink", methods=["POST"])
@require_auth
def relink_last_door(account):
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with get_db() as conn:
        driver = conn.execute("SELECT id, statut FROM drivers WHERE account_id=?", (account["id"],)).fetchone()
        if not driver:
            return jsonify({"error": "السائق غير موجود"}), 400
        _why = lock_reason(conn, driver["id"])
        if _why:
            return jsonify({"error": _why}), 400
        if conn.execute("SELECT 1 FROM door_licenses WHERE current_driver_id=? AND is_active=1", (driver["id"],)).fetchone():
            return jsonify({"error": "لديك باب مرتبط حالياً"}), 400
        last = conn.execute("""
            SELECT dl.id, dl.door_number FROM rental_contracts rc
            JOIN door_licenses dl ON dl.id = rc.door_license_id
            WHERE rc.driver_id=? ORDER BY rc.id DESC LIMIT 1
        """, (driver["id"],)).fetchone()
        # مستفيد يستغل رخصته بنفسه (بلا عقد): بابه هو الباب الذي هو صاحبه
        own = conn.execute("""
            SELECT dl.id, dl.door_number FROM door_licenses dl
            JOIN beneficiaries b ON b.id = dl.beneficiary_id
            JOIN drivers d ON d.id = ?
            WHERE dl.exploitation_mode='مستفيد' AND b.nin = d.nin ORDER BY dl.updated_at DESC LIMIT 1
        """, (driver["id"],)).fetchone()
        if own and (not last or own["id"] != last["id"]):
            last = own
        if not last:
            return jsonify({"error": "لا يوجد باب سابق — أدخل بيانات باب جديد"}), 400
        taken = conn.execute("""
            SELECT 1 FROM door_licenses WHERE door_number=? AND is_active=1
              AND current_driver_id IS NOT NULL AND current_driver_id!=?
        """, (last["door_number"], driver["id"])).fetchone()
        if taken:
            return jsonify({"error": f"الباب {last['door_number']} أصبح مستغلاً من طرف سائق آخر — أدخل باباً جديداً"}), 400
        conn.execute("UPDATE door_licenses SET is_active=1, current_driver_id=?, updated_at=? WHERE id=?",
                     (driver["id"], now, last["id"]))
        conn.commit()
    return jsonify({"success": True, "door_number": last["door_number"]})
