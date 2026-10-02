"""
استئناف النشاط — الملف الكامل المرفق بالطلب
─────────────────────────────────────────────
عند التوقف يُفسخ عقد الكراء ويُحرَّر الباب تلقائياً، لذلك طلب الاستئناف
يحمل معه كل ما يلزم لإعادة الاستغلال:
  • المركبة: نفس المركبة الحالية، أو مركبة جديدة (بطاقة رمادية)
  • الباب:   نفس الباب السابق، أو رقم باب جديد (قرار ولائي + المستفيد)
  • عقد كراء جديد دائماً (حتى مع نفس المستفيد) — إلا إذا كان السائق هو المستفيد نفسه
لا يتغيّر شيء عند تقديم الطلب. عند موافقة الإدارة يُطبَّق كل ذلك بتاريخ الموافقة
ثم تُحرَّر رخصة الاستغلال الجديدة (طباعة رخصة الاستغلال على طلب الاستئناف).
"""
import json
from datetime import datetime, date

from database import generate_number
from utils import save_image

VEHICLE_FIELDS = [
    "num_immatriculation", "num_precedent", "marque", "type_vehicule",
    "num_serie", "genre", "carrosserie", "energie", "puissance", "nb_places",
    "poids_total", "charge_utile", "annee_circulation",
    "date_delivrance", "lieu_delivrance", "wilaya_delivrance",
    "quittance_num", "quittance_montant", "quittance_date",
    "proprietaire_nom_ar", "proprietaire_prenom_ar",
    "proprietaire_nom", "proprietaire_prenom",
    "proprietaire_dob", "proprietaire_lieu",
    "proprietaire_adresse", "proprietaire_commune",
    "proprietaire_wilaya", "profession",
]
DOOR_FIELDS = ["door_number", "exploitation_commune", "decision_type",
               "decision_number", "decision_date", "decision_wilaya"]
BEN_FIELDS = ["ben_nom_ar", "ben_prenom_ar", "ben_nom_fr", "ben_prenom_fr",
              "ben_date_naissance", "ben_lieu_naissance", "ben_nin", "ben_telephone",
              "ben_adresse", "ben_wilaya", "ben_sifa", "ben_num_cni", "ben_date_cni",
              "ben_sexe", "ben_groupe_sanguin"]


def _s(x):
    return (str(x).strip() if x is not None else "")


def last_door(conn, driver_id, driver_nin=None):
    """آخر باب استغله السائق (عبر آخر عقد كراء، أو بابه كمستفيد) مع بيانات القرار والمستفيد."""
    q = """SELECT dl.*, b.nom_ar AS ben_nom_ar, b.prenom_ar AS ben_prenom_ar, b.nin AS ben_nin, b.sifa AS ben_sifa
           FROM door_licenses dl JOIN beneficiaries b ON b.id = dl.beneficiary_id WHERE dl.id=?"""
    rc = conn.execute("SELECT door_license_id FROM rental_contracts WHERE driver_id=? ORDER BY id DESC LIMIT 1",
                      (driver_id,)).fetchone()
    own = None
    if driver_nin:
        own = conn.execute("""SELECT dl.id FROM door_licenses dl JOIN beneficiaries b ON b.id = dl.beneficiary_id
                              WHERE dl.exploitation_mode='مستفيد' AND b.nin=? ORDER BY dl.updated_at DESC LIMIT 1""",
                           (driver_nin,)).fetchone()
    did = (own["id"] if own else None) or (rc["door_license_id"] if rc else None)
    if not did:
        return None
    row = conn.execute(q, (did,)).fetchone()
    if not row:
        return None
    d = dict(row)
    d["taken"] = bool(d.get("is_active") and d.get("current_driver_id") and d["current_driver_id"] != driver_id)
    return d


def _door_taken(conn, door_number, driver_id):
    return conn.execute("""SELECT 1 FROM door_licenses WHERE door_number=? AND is_active=1
                           AND current_driver_id IS NOT NULL AND current_driver_id!=?""",
                        (door_number, driver_id)).fetchone()


def build_resume(conn, driver, data):
    """
    يتحقق من بيانات طلب الاستئناف ويحفظ الصور. يرجع (resume, attachments, None) أو (None, None, رسالة خطأ).
    driver: صف drivers كامل.
    """
    from routes.door import _same_person
    r = data.get("resume") or {}
    nin = driver["nin"] or ""
    driver_id = driver["id"]
    att = {}
    out = {}

    # ── المركبة ──
    veh_changed = bool(r.get("vehicle_changed"))
    out["vehicle_changed"] = veh_changed
    if veh_changed:
        v = r.get("vehicle") or {}
        veh = {k: _s(v.get(k)) or None for k in VEHICLE_FIELDS}
        if not veh["num_immatriculation"]:
            return None, None, "رقم تسجيل المركبة الجديدة مطلوب"
        img = save_image(v.get("image_carte_grise_base64"), "carte_grise", nin)
        if img:
            veh["image_carte_grise_path"] = img
            att["carte_grise"] = img
        out["vehicle"] = veh
    else:
        cur = conn.execute("SELECT num_immatriculation FROM vehicles WHERE driver_id=? AND is_current=1",
                           (driver_id,)).fetchone()
        if not cur:
            return None, None, "لا توجد مركبة حالية في ملفك — أدخل المركبة"
        out["vehicle"] = {"num_immatriculation": cur["num_immatriculation"]}

    # ── صفة الاستغلال وعقد الكراء ──
    mode = _s(r.get("exploitation_mode")) or "مستأجر"
    if mode not in ("مستأجر", "مستفيد"):
        mode = "مستأجر"
    out["exploitation_mode"] = mode
    if mode == "مستأجر":
        try:
            rent = int(r.get("monthly_rent") or 0)
        except (TypeError, ValueError):
            rent = 0
        if rent <= 0:
            return None, None, "مبلغ الإيجار الشهري لعقد الكراء الجديد مطلوب"
        out["monthly_rent"] = rent

    # ── الباب ──
    door_changed = bool(r.get("door_changed"))
    out["door_changed"] = door_changed
    if door_changed:
        dd = r.get("door") or {}
        door = {k: _s(dd.get(k)) or None for k in DOOR_FIELDS}
        ben = {k: _s(dd.get(k)) or None for k in BEN_FIELDS}
        if not door["door_number"]:
            return None, None, "رقم الباب الجديد مطلوب"
        if not door["decision_number"] or not door["decision_date"]:
            return None, None, "رقم القرار الولائي وتاريخه مطلوبان للباب الجديد"
        if not (ben["ben_nom_ar"] and ben["ben_prenom_ar"] and ben["ben_nin"] and ben["ben_sifa"]):
            return None, None, "بيانات المستفيد (اللقب، الاسم، رقم التعريف الوطني، الصفة) مطلوبة للباب الجديد"
        if _door_taken(conn, door["door_number"], driver_id):
            return None, None, f"رقم الباب {door['door_number']} مستغل حالياً من طرف سائق آخر"
        if mode == "مستفيد" and not _same_person(driver, ben):
            return None, None, "صفة «مستفيد» تعني أن السائق هو صاحب الرخصة: بطاقة المستفيد لا تطابق هوية السائق"
        img = save_image(dd.get("image_decision_base64"), "decision", nin)
        if img:
            door["image_decision_path"] = img
            att["decision"] = img
        img = save_image(dd.get("ben_image_cni_recto_base64"), "ben_cni_recto", nin)
        if img:
            ben["image_cni_recto_path"] = img
            att["ben_cni_recto"] = img
        out["door"] = door
        out["beneficiary"] = ben
    else:
        ld = last_door(conn, driver_id, nin)
        if not ld:
            return None, None, "لا يوجد باب سابق في ملفك — اختر «تغيير رقم الباب» وأدخل بيانات الباب"
        if ld["taken"]:
            return None, None, f"الباب السابق {ld['door_number']} أصبح مستغلاً من طرف سائق آخر — أدخل رقم باب جديد"
        if mode == "مستفيد" and (ld.get("ben_nin") or "") != nin:
            return None, None, f"المستفيد صاحب الباب {ld['door_number']} ليس أنت — اختر صفة «مستأجر» (عقد كراء)"
        out["door"] = {"door_number": ld["door_number"], "door_license_id": ld["id"]}
        out["beneficiary"] = {"ben_nom_ar": ld["ben_nom_ar"], "ben_prenom_ar": ld["ben_prenom_ar"],
                              "ben_nin": ld["ben_nin"], "ben_sifa": ld["ben_sifa"]}

    return out, att, None


def apply_resume(conn, driver_id, req_id, res, now):
    """يُطبَّق عند موافقة الإدارة. يرجع رسالة خطأ أو None (الاستدعاء داخل نفس المعاملة)."""
    today = now[:10]

    # ── 1. المركبة ──
    if res.get("vehicle_changed"):
        veh = res.get("vehicle") or {}
        im = veh.get("num_immatriculation")
        other = conn.execute("""SELECT id, driver_id, created_at FROM vehicles
                                WHERE num_immatriculation=? AND is_current=1 AND driver_id!=?""",
                             (im, driver_id)).fetchone()
        if other:  # نقل ملكية من سائق آخر — كما في حفظ المركبة
            conn.execute("UPDATE vehicles SET is_current=0, updated_at=? WHERE id=?", (now, other["id"]))
            conn.execute("""INSERT INTO vehicles_history (driver_id, vehicle_id, change_reason, date_start, date_end, request_id)
                            VALUES (?,?,'نقل_ملكية',?,?,?)""",
                         (other["driver_id"], other["id"], other["created_at"] or now, now, req_id))
        cur = conn.execute("SELECT id, created_at FROM vehicles WHERE driver_id=? AND is_current=1",
                           (driver_id,)).fetchone()
        if cur:
            conn.execute("UPDATE vehicles SET is_current=0, updated_at=? WHERE id=?", (now, cur["id"]))
            conn.execute("""INSERT INTO vehicles_history (driver_id, vehicle_id, change_reason, date_start, date_end, request_id)
                            VALUES (?,?,'تغيير_سيارة_استئناف',?,?,?)""",
                         (driver_id, cur["id"], cur["created_at"] or now, now, req_id))
        cols = [k for k in VEHICLE_FIELDS + ["image_carte_grise_path"] if k in veh]
        conn.execute(f"INSERT INTO vehicles (driver_id, {', '.join(cols)}, is_current) "
                     f"VALUES (?, {', '.join('?' * len(cols))}, 1)",
                     [driver_id] + [veh[c] for c in cols])
    elif not conn.execute("SELECT 1 FROM vehicles WHERE driver_id=? AND is_current=1", (driver_id,)).fetchone():
        return "لا توجد مركبة حالية للسائق"

    # ── 2. الباب (والمستفيد) ──
    mode = res.get("exploitation_mode") or "مستأجر"
    door = res.get("door") or {}
    num = door.get("door_number")
    if _door_taken(conn, num, driver_id):
        return f"الباب {num} أصبح مستغلاً من طرف سائق آخر — لا يمكن قبول الاستئناف بهذا الباب"
    conn.execute("UPDATE door_licenses SET is_active=0, updated_at=? WHERE current_driver_id=? AND is_active=1 AND door_number!=?",
                 (now, driver_id, num))
    if res.get("door_changed"):
        b = res.get("beneficiary") or {}
        ben_row = {
            "nom_ar": b.get("ben_nom_ar"), "prenom_ar": b.get("ben_prenom_ar"),
            "nom_fr": b.get("ben_nom_fr"), "prenom_fr": b.get("ben_prenom_fr"),
            "date_naissance": b.get("ben_date_naissance"), "lieu_naissance": b.get("ben_lieu_naissance"),
            "nin": b.get("ben_nin"), "telephone": b.get("ben_telephone"), "adresse": b.get("ben_adresse"),
            "wilaya": b.get("ben_wilaya"), "sifa": b.get("ben_sifa"),
            "num_document_cni": b.get("ben_num_cni"), "date_delivrance_cni": b.get("ben_date_cni"),
            "sexe": b.get("ben_sexe"), "groupe_sanguin": b.get("ben_groupe_sanguin"),
            "image_cni_recto_path": b.get("image_cni_recto_path"),
        }
        ben_row = {k: v for k, v in ben_row.items() if v}
        ben_row["updated_at"] = now
        ex = conn.execute("SELECT id FROM beneficiaries WHERE nin=?", (ben_row["nin"],)).fetchone()
        if ex:
            conn.execute(f"UPDATE beneficiaries SET {', '.join(k + '=?' for k in ben_row)} WHERE id=?",
                         list(ben_row.values()) + [ex["id"]])
            ben_id = ex["id"]
        else:
            ben_id = conn.execute(f"INSERT INTO beneficiaries ({', '.join(ben_row)}) VALUES ({', '.join('?' * len(ben_row))})",
                                  list(ben_row.values())).lastrowid
        drow = {k: door.get(k) for k in DOOR_FIELDS + ["image_decision_path"] if door.get(k)}
        drow.setdefault("decision_type", "غير_محدد")
        drow.update({"beneficiary_id": ben_id, "wilaya": "البيض", "current_driver_id": driver_id,
                     "is_active": 1, "exploitation_mode": mode, "updated_at": now})
        exd = conn.execute("SELECT id FROM door_licenses WHERE door_number=?", (num,)).fetchone()
        if exd:
            drow.pop("wilaya")
            conn.execute(f"UPDATE door_licenses SET {', '.join(k + '=?' for k in drow)} WHERE id=?",
                         list(drow.values()) + [exd["id"]])
            door_id = exd["id"]
        else:
            door_id = conn.execute(f"INSERT INTO door_licenses ({', '.join(drow)}) VALUES ({', '.join('?' * len(drow))})",
                                   list(drow.values())).lastrowid
    else:
        exd = conn.execute("SELECT id, beneficiary_id FROM door_licenses WHERE door_number=?", (num,)).fetchone()
        if not exd:
            return f"الباب {num} غير موجود"
        conn.execute("UPDATE door_licenses SET is_active=1, current_driver_id=?, exploitation_mode=?, updated_at=? WHERE id=?",
                     (driver_id, mode, now, exd["id"]))
        door_id, ben_id = exd["id"], exd["beneficiary_id"]

    # ── 3. عقد الكراء الجديد (سنة من تاريخ الموافقة) ──
    conn.execute("""UPDATE rental_contracts SET is_current=0, end_reason=COALESCE(end_reason,'استئناف'), updated_at=?
                    WHERE driver_id=? AND is_current=1""", (now, driver_id))
    if mode == "مستأجر":
        t = datetime.strptime(today, "%Y-%m-%d").date()
        try:
            end = date(t.year + 1, t.month, t.day)
        except ValueError:
            end = date(t.year + 1, t.month, 28)
        conn.execute("""INSERT INTO rental_contracts (door_license_id, beneficiary_id, driver_id, contract_number,
                        contract_date, end_date, monthly_rent, is_current) VALUES (?,?,?,?,?,?,?,1)""",
                     (door_id, ben_id, driver_id, generate_number("RENT", "rental_contracts", "contract_number"),
                      today, end.isoformat(), res.get("monthly_rent")))
    return None


def resume_from_request(req):
    try:
        return (json.loads(req.get("request_data") or "{}") or {}).get("resume")
    except Exception:
        return None
