from flask import Blueprint, request, jsonify
from database import get_db, generate_number, check_deputy_contract_date
from routes.status_flow import lock_reason
from utils import require_auth, save_image
import json
from datetime import datetime, date
from dateutil.relativedelta import relativedelta

deputy_bp = Blueprint("deputy", __name__)


# ════════════════════════════════════════
# PUT /api/driver/deputy
# حفظ/تحديث بيانات المناوب الكاملة
# ════════════════════════════════════════

@deputy_bp.route("/api/driver/deputy", methods=["PUT"])
@require_auth
def save_deputy(account):
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

        # حفظ صور المناوب
        img_cni_recto  = save_image(data.get("image_cni_recto_base64"),   "dep_cni_recto",  nin)
        img_cni_verso  = save_image(data.get("image_cni_verso_base64"),   "dep_cni_verso",  nin)
        img_perm_recto = save_image(data.get("image_permis_recto_base64"), "dep_perm_recto", nin)
        img_perm_verso = save_image(data.get("image_permis_verso_base64"), "dep_perm_verso", nin)

        today = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        # === أرشفة المناوب القديم إن وجد ===
        old_deputy = conn.execute(
            "SELECT id FROM deputies WHERE driver_id=? AND is_current=1",
            (driver["id"],)
        ).fetchone()

        if old_deputy:
            # أرشفة في deputies_history
            # إغلاق السجل المفتوح للمناوب القديم (بدل إدراج سجل جديد بلا تاريخ بداية)
            cur_h = conn.execute("""
                UPDATE deputies_history SET date_end=datetime('now','localtime'), end_reason='استبدال'
                WHERE driver_id=? AND deputy_id=? AND date_end IS NULL
            """, (driver["id"], old_deputy["id"]))
            if cur_h.rowcount == 0:
                conn.execute("""
                    INSERT INTO deputies_history (driver_id, deputy_id, date_start, date_end, end_reason)
                    VALUES (?, ?, (SELECT created_at FROM deputies WHERE id=?), datetime('now','localtime'), 'استبدال')
                """, (driver["id"], old_deputy["id"], old_deputy["id"]))

            # إنهاء عقد المناوب القديم
            old_dep_contract = conn.execute(
                "SELECT id FROM deputy_contracts WHERE driver_id=? AND is_current=1",
                (driver["id"],)
            ).fetchone()
            if old_dep_contract:
                conn.execute("""
                    UPDATE deputy_contracts
                    SET is_current=0, end_date=datetime('now','localtime'),
                        end_reason='استبدال_المناوب',
                        updated_at=datetime('now','localtime')
                    WHERE id=?
                """, (old_dep_contract["id"],))

            # أرشفة المناوب القديم
            # إلغاء رخصة السائق الإضافي المرتبطة بالمناوب القديم
            conn.execute("UPDATE deputy_permits SET is_current=0, updated_at=? WHERE driver_id=? AND is_current=1", (today, driver["id"]))
            conn.execute(
                "UPDATE deputies SET is_current=0, updated_at=? WHERE id=?",
                (today, old_deputy["id"])
            )

        # === إضافة المناوب الجديد ===
        dep_fields = {
            "driver_id":              driver["id"],
            "nom_ar":                 data.get("nom_ar"),
            "prenom_ar":              data.get("prenom_ar"),
            "nom_fr":                 data.get("nom_fr"),
            "prenom_fr":              data.get("prenom_fr"),
            "date_naissance":         data.get("date_naissance"),
            "lieu_naissance":         data.get("lieu_naissance"),
            "nin":                    data.get("nin"),
            "telephone":              data.get("telephone"),
            "adresse":                data.get("adresse"),
            "ocr_cni_raw":            json.dumps(data.get("ocr_cni_raw"), ensure_ascii=False) if data.get("ocr_cni_raw") else None,
            # رخصة السياقة
            "num_permis":             data.get("num_permis"),
            "date_delivrance_permis": data.get("date_delivrance_permis"),
            "date_expiration_permis": data.get("date_expiration_permis"),
            "categories_permis":      json.dumps(data.get("categories_permis", []), ensure_ascii=False),
            "wilaya_permis":          data.get("wilaya_permis"),
            "lieu_delivrance_permis": data.get("lieu_delivrance_permis"),
            "ocr_permis_raw":         json.dumps(data.get("ocr_permis_raw"), ensure_ascii=False) if data.get("ocr_permis_raw") else None,
            "is_current":             1,
            "updated_at":             today,
        }
        if img_cni_recto:  dep_fields["image_cni_recto_path"]    = img_cni_recto
        if img_cni_verso:  dep_fields["image_cni_verso_path"]    = img_cni_verso
        if img_perm_recto: dep_fields["image_permis_recto_path"] = img_perm_recto
        if img_perm_verso: dep_fields["image_permis_verso_path"] = img_perm_verso

        cols = ", ".join(dep_fields.keys())
        vals = ", ".join("?" * len(dep_fields))
        cur = conn.execute(
            f"INSERT INTO deputies ({cols}) VALUES ({vals})",
            list(dep_fields.values())
        )
        deputy_id = cur.lastrowid

        # === تسجيل date_start في deputies_history للمناوب الجديد ===
        conn.execute("""
            INSERT INTO deputies_history
            (driver_id, deputy_id, date_start)
            VALUES (?, ?, datetime('now','localtime'))
        """, (driver["id"], deputy_id))

        conn.commit()

    return jsonify({"success": True, "deputy_id": deputy_id})


# ════════════════════════════════════════
# POST /api/driver/deputy-contract
# إنشاء عقد عمل مناوب جديد
# ════════════════════════════════════════

@deputy_bp.route("/api/driver/deputy-contract", methods=["POST"])
@require_auth
def create_deputy_contract(account):
    data = request.get_json() or {}

    with get_db() as conn:
        driver = conn.execute(
            "SELECT id FROM drivers WHERE account_id=?", (account["id"],)
        ).fetchone()
        if not driver:
            return jsonify({"error": "أكمل بيانات الهوية أولاً"}), 400
        _why = lock_reason(conn, driver["id"])
        if _why:
            return jsonify({"error": _why}), 400

        # التحقق من وجود مناوب حالي
        deputy = conn.execute(
            "SELECT id FROM deputies WHERE driver_id=? AND is_current=1",
            (driver["id"],)
        ).fetchone()
        if not deputy:
            return jsonify({"error": "أضف بيانات المناوب أولاً"}), 400

        # التحقق من عدم وجود عقد مناوب نشط مسبقاً
        existing_contract = conn.execute(
            "SELECT id, contract_number FROM deputy_contracts WHERE driver_id=? AND is_current=1",
            (driver["id"],)
        ).fetchone()
        if existing_contract:
            return jsonify({
                "error": f"يوجد عقد مناوب نشط بالفعل ({existing_contract['contract_number']}). افسخه أولاً ثم أنشئ عقداً جديداً."
            }), 400

        # حساب تاريخ الانتهاء: سنة واحدة من اليوم
        contract_date     = date.today()
        end_date          = (contract_date + relativedelta(years=1)).strftime("%Y-%m-%d")
        contract_date_str = contract_date.strftime("%Y-%m-%d")

        # التحقق أن end_date لا يتجاوز عقد الكراء
        ok, msg = check_deputy_contract_date(end_date, driver["id"])
        if not ok:
            rental = conn.execute(
                "SELECT end_date FROM rental_contracts WHERE driver_id=? AND is_current=1",
                (driver["id"],)
            ).fetchone()
            if rental and rental["end_date"]:
                end_date = rental["end_date"]
            else:
                return jsonify({"error": msg}), 400

        # توليد رقم العقد تلقائياً
        contract_number = generate_number("DEP", "deputy_contracts", "contract_number")

        cur = conn.execute("""
            INSERT INTO deputy_contracts
            (driver_id, deputy_id, contract_number, contract_date, end_date, is_current)
            VALUES (?,?,?,?,?,1)
        """, (
            driver["id"], deputy["id"],
            contract_number, contract_date_str, end_date,
        ))
        conn.commit()

    return jsonify({
        "success":         True,
        "contract_id":     cur.lastrowid,
        "contract_number": contract_number,
        "contract_date":   contract_date_str,
        "end_date":        end_date,
    })


# ════════════════════════════════════════
# POST /api/driver/deputy-contract/terminate
# فسخ عقد المناوب الحالي يدوياً من قِبل السائق
# ════════════════════════════════════════

@deputy_bp.route("/api/driver/deputy-contract/terminate", methods=["POST"])
@require_auth
def terminate_deputy_contract(account):
    now   = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    today = datetime.now().strftime("%Y-%m-%d")

    with get_db() as conn:
        driver = conn.execute(
            "SELECT id FROM drivers WHERE account_id=?", (account["id"],)
        ).fetchone()
        if not driver:
            return jsonify({"error": "السائق غير موجود"}), 404
        _why = lock_reason(conn, driver["id"])
        if _why:
            return jsonify({"error": _why}), 400

        contract = conn.execute(
            "SELECT id, deputy_id FROM deputy_contracts WHERE driver_id=? AND is_current=1",
            (driver["id"],)
        ).fetchone()
        if not contract:
            return jsonify({"error": "لا يوجد عقد مناوب نشط"}), 404

        # فسخ العقد
        conn.execute("""
            UPDATE deputy_contracts
            SET is_current=0, end_date=?, end_reason='فسخ_يدوي', updated_at=?
            WHERE id=?
        """, (today, now, contract["id"]))

        # أرشفة المناوب في deputies_history
        conn.execute("""
            UPDATE deputies_history
            SET date_end=?, end_reason='فسخ_العقد'
            WHERE driver_id=? AND deputy_id=? AND date_end IS NULL
        """, (today, driver["id"], contract["deputy_id"]))

        # أرشفة المناوب نفسه (is_current=0)
        # إلغاء رخصة السائق الإضافي المرتبطة بالمناوب القديم
        conn.execute("UPDATE deputy_permits SET is_current=0, updated_at=? WHERE driver_id=? AND is_current=1", (now, driver["id"]))
        conn.execute(
            "UPDATE deputies SET is_current=0, updated_at=? WHERE id=?",
            (now, contract["deputy_id"])
        )

        conn.commit()

    return jsonify({"success": True})


# ════════════════════════════════════════
# GET /api/driver/deputy-history
# تاريخ كل المناوبين وعقودهم (أرشيف كامل)
# ════════════════════════════════════════

@deputy_bp.route("/api/driver/deputy-history", methods=["GET"])
@require_auth
def get_deputy_history(account):
    with get_db() as conn:
        driver = conn.execute(
            "SELECT id FROM drivers WHERE account_id=?", (account["id"],)
        ).fetchone()
        if not driver:
            return jsonify({"history": []}), 200

        # تاريخ المناوبين
        deputies_hist = conn.execute("""
            SELECT dh.*, d.nom_ar, d.prenom_ar, d.nin, d.num_permis,
                   d.date_expiration_permis
            FROM deputies_history dh
            JOIN deputies d ON d.id = dh.deputy_id
            WHERE dh.driver_id=?
            ORDER BY dh.created_at DESC
        """, (driver["id"],)).fetchall()

        # تاريخ عقود المناوبين
        contracts_hist = conn.execute("""
            SELECT dc.*, d.nom_ar, d.prenom_ar, d.nin
            FROM deputy_contracts dc
            JOIN deputies d ON d.id = dc.deputy_id
            WHERE dc.driver_id=?
            ORDER BY dc.created_at DESC
        """, (driver["id"],)).fetchall()

    return jsonify({
        "deputies":  [dict(r) for r in deputies_hist],
        "contracts": [dict(r) for r in contracts_hist],
    })
