import re
from flask import Blueprint, Response, request
from database import get_db
from utils import require_auth, require_admin
from datetime import datetime
import json

print_bp = Blueprint("print", __name__)

# ════════════════════════════════════════
# الستايل الموحد
# ════════════════════════════════════════

STYLE = """
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; }
  body { background: #f3f4f6; padding: 20px; direction: rtl; }
  .doc { max-width: 750px; margin: 0 auto; background: #fff;
         border: 2px solid #125950; border-radius: 10px; padding: 32px; }
  .header { text-align: center; border-bottom: 2px solid #125950;
            padding-bottom: 14px; margin-bottom: 20px; }
  .header h1 { color: #125950; font-size: 18px; }
  .header p  { color: #6b7280; font-size: 12px; margin-top: 4px; }
  .badge { background: #e4f5ec; color: #1d7a54; font-weight: 700;
           text-align: center; padding: 8px; border-radius: 8px; margin-bottom: 18px; }
  .warn  { background: #fef3c7; color: #92400e; font-weight: 700;
           text-align: center; padding: 8px; border-radius: 8px; margin-bottom: 18px; border: 1px solid #fde68a; }
  .danger{ background: #fee2e2; color: #991b1b; font-weight: 700;
           text-align: center; padding: 10px; border-radius: 8px; margin-bottom: 18px; border: 1px solid #fca5a5; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  td { padding: 9px 8px; border-bottom: 1px solid #dce2de; font-size: 13px; }
  td.label { font-weight: 700; color: #10233a; width: 40%; }
  td.sep { background: #f4f8f7; color: #125950; font-weight: 700;
           padding: 8px; border-top: 2px solid #86efac; border-bottom: 2px solid #86efac; }
  td.sep-warn { background: #fffbeb; color: #92400e; font-weight: 700;
           padding: 8px; border-top: 2px solid #fde68a; border-bottom: 2px solid #fde68a; }
  td.sep-red  { background: #fef2f2; color: #991b1b; font-weight: 700;
           padding: 8px; border-top: 2px solid #fca5a5; border-bottom: 2px solid #fca5a5; }
  .sign { display: flex; justify-content: space-between; margin-top: 30px; }
  .sign-box { text-align: center; width: 45%; }
  .sign-box .line { border-top: 1px solid #374151; margin-top: 40px; padding-top: 6px;
                    font-size: 12px; color: #6b7280; }
  .footer { text-align: center; color: #9ca3af; font-size: 11px; margin-top: 16px; }
  .btn { display: block; width: 160px; margin: 16px auto 0; padding: 10px;
         background: #125950; color: #fff; border: none; border-radius: 8px;
         font-weight: 700; cursor: pointer; font-size: 14px; }
  h3 { color:#125950; margin:16px 0 8px; }
  @media print {
    .btn { display: none; }
    html, body { height: 100%; margin: 0; padding: 0; background: #fff; }
    @page { size: A4 portrait; margin: 10mm 12mm; }
    body { display: flex; align-items: stretch; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .doc {
      max-width: 100% !important;
      width: 100% !important;
      min-height: calc(297mm - 20mm) !important;
      padding: 20px 24px !important;
      border: 2px solid #125950 !important;
      border-radius: 6px !important;
      display: flex !important;
      flex-direction: column !important;
    }
    table { flex: 1; margin-bottom: 0 !important; }
    .header { padding-bottom: 10px !important; margin-bottom: 14px !important; }
    .header h1 { font-size: 16px !important; }
    .header p  { font-size: 11px !important; margin-top: 3px !important; }
    .badge, .warn, .danger { padding: 6px !important; margin-bottom: 12px !important; font-size: 12px !important; }
    td { padding: 7px 8px !important; font-size: 12.5px !important; }
    td.sep, td.sep-warn, td.sep-red { padding: 7px 8px !important; font-size: 12.5px !important; }
    .sign { margin-top: auto !important; padding-top: 20px !important; }
    .sign-box .line { margin-top: 40px !important; }
    .footer { margin-top: 14px !important; font-size: 10px !important; }
  }
</style>
"""

def html_page(title: str, body: str) -> str:
    return f"""<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="UTF-8"><title>{title}</title>{STYLE}</head>
<body>{body}<button class="btn" onclick="window.print()">&#128424;&#65039; طباعة</button></body>
</html>"""

def v(val):
    if val in (None, "", "None"):
        return "&#8212;"
    if isinstance(val, str):
        import html as _h
        val = _h.escape(val)   # يمنع حقن HTML/JS في الوثائق المطبوعة
    # قيم الأنواع المخزّنة بشرطة سفلية (أرملة_مجاهد، فسخ_يدوي...) تُعرض بمسافة
    if isinstance(val, str) and "_" in val and re.search(r"[\u0600-\u06FF]", val):
        return val.replace("_", " ")
    return val

def _last_door(conn, driver_id, before):
    """رقم الباب الذي كان يستغله السائق قبل تاريخ معيّن (يُستعمل عندما يكون الباب قد حُرِّر بسبب التوقف)."""
    row = conn.execute("""
        SELECT dl.* FROM rental_contracts rc
        JOIN door_licenses dl ON dl.id = rc.door_license_id
        WHERE rc.driver_id=? AND rc.created_at <= ?
        ORDER BY rc.id DESC LIMIT 1
    """, (driver_id, before)).fetchone()
    return dict(row) if row else {}

# ════════════════════════════════════════════════════════════════
# fmt_date — دالة توحيد تنسيق التواريخ
# ════════════════════════════════════════════════════════════════
# المشكلة: بعض التواريخ تُخزَّن في قاعدة البيانات بصيغة DD/MM/YYYY
# (مصدرها OCR أو إدخال يدوي قديم)، بينما تواريخ أخرى تُخزَّن
# بالصيغة الصحيحة YYYY-MM-DD (من حقول type="date" في الواجهة).
# هذا يُسبّب تناقضًا في الطباعة: نفس الوثيقة تعرض تنسيقَين مختلفَين.
#
# الحل: نمرر جميع حقول التواريخ عبر fmt_date() قبل عرضها في HTML،
# فتتحول DD/MM/YYYY → YYYY-MM-DD، وتبقى التواريخ الجزئية 00/00/YYYY
# كما هي، وتمر YYYY-MM-DD دون تغيير.
#
# الحقول المعالجة في عقد الكراء:
#   ben_dob        — تاريخ ميلاد المستفيد (صاحب الرخصة)
#   ben_cni_date   — تاريخ إصدار بطاقة المستفيد
#   drv_dob        — تاريخ ميلاد السائق
#   drv_permis_date — تاريخ رخصة السياقة
#
# إذا أضفت حقل تاريخ جديد في المستقبل → استخدم fmt_date() بدل v()
# ════════════════════════════════════════════════════════════════
def fmt_date(val):
    if not val or val in ("None", ""):
        return "&#8212;"
    import re
    s = str(val).strip()
    m = re.match(r'^(\d{2})/(\d{2})/(\d{4})$', s)
    if m:
        dd, mm, yyyy = m.groups()
        return f"{yyyy}-{mm}-{dd}"
    # YYYY-MM-DD أو أي صيغة أخرى → خذ أول 10 أحرف فقط
    return s[:10]

def drv_full(conn, driver_id):
    d   = conn.execute("SELECT * FROM drivers WHERE id=?", (driver_id,)).fetchone()
    lic = conn.execute("SELECT * FROM driver_licenses WHERE driver_id=? AND is_current=1", (driver_id,)).fetchone()
    veh = conn.execute("SELECT * FROM vehicles WHERE driver_id=? AND is_current=1", (driver_id,)).fetchone()
    doo = conn.execute("SELECT dl.*, b.nom_ar as ben_nom, b.prenom_ar as ben_prenom, b.sifa FROM door_licenses dl JOIN beneficiaries b ON b.id=dl.beneficiary_id WHERE dl.current_driver_id=? AND dl.is_active=1", (driver_id,)).fetchone()
    act = conn.execute("SELECT * FROM activity WHERE driver_id=? AND is_current=1", (driver_id,)).fetchone()
    rc  = conn.execute("SELECT * FROM rental_contracts WHERE driver_id=? AND is_current=1", (driver_id,)).fetchone()
    dep = conn.execute("SELECT dep.*, dc.contract_number as dc_num, dc.end_date as dc_end FROM deputies dep JOIN deputy_contracts dc ON dc.deputy_id=dep.id WHERE dep.driver_id=? AND dep.is_current=1 AND dc.is_current=1", (driver_id,)).fetchone()
    return (
        dict(d)   if d   else {},
        dict(lic) if lic else {},
        dict(veh) if veh else {},
        dict(doo) if doo else {},
        dict(act) if act else {},
        dict(rc)  if rc  else ({"contract_number": "مستفيد", "contract_date": "مستفيد", "end_date": "مستفيد", "monthly_rent": "مستفيد"} if doo and (dict(doo).get("exploitation_mode") == "مستفيد") else {}),
        dict(dep) if dep else {},
    )

ACTIVITY_LABELS = {
    "فردية_حضرية":    "فردية حضرية",
    "جماعية_حضرية":   "جماعية حضرية",
    "مابين_البلديات": "ما بين البلديات",
    "مابين_الولايات": "ما بين الولايات",
}

# ════════════════════════════════════════
# Endpoint 1: طباعة طلب
# ════════════════════════════════════════

@print_bp.route("/api/print/request/<int:req_id>")
@require_auth
def print_request(account, req_id):
    with get_db() as conn:
        # الأدمن يمكنه طباعة أي طلب مباشرة
        if account.get("role") == "admin":
            r = conn.execute("SELECT * FROM requests WHERE id=?", (req_id,)).fetchone()
            if not r:
                return "الطلب غير موجود", 404
            r = dict(r)
            d, lic, veh, doo, act, rc, dep = drv_full(conn, r["driver_id"])
        else:
            driver = conn.execute(
                "SELECT id FROM drivers WHERE account_id=?", (account["id"],)
            ).fetchone()
            if not driver:
                return "غير موجود", 404

            r = conn.execute(
                "SELECT * FROM requests WHERE id=? AND driver_id=?",
                (req_id, driver["id"])
            ).fetchone()
            if not r:
                return "الطلب غير موجود", 404

            d, lic, veh, doo, act, rc, dep = drv_full(conn, driver["id"])
            r = dict(r)

    req_data = {}
    try: req_data = json.loads(r.get("request_data") or "{}")
    except: pass

    rt = r["request_type"]
    extra_rows = ""

    if rt == "تغيير_سيارة":
        # المركبة الجديدة: من new_* في req_data
        new_immat  = req_data.get("new_num_immatriculation") or ""
        new_marque = req_data.get("new_marque")              or ""
        new_type   = req_data.get("new_type_vehicule")       or ""
        new_serie  = req_data.get("new_num_serie")           or ""
        new_annee  = req_data.get("new_annee_circulation")   or ""

        # المركبة الحالية (قت تقديم الطلب):
        # 1) نأخذها من current_* في req_data إن وُجدت
        # 2) إذا كانت مطابقة للـ new_* (تم الحفظ أولاً) → نجلبها من vehicles_history
        cur_immat  = req_data.get("current_num_immatriculation") or ""
        cur_marque = req_data.get("current_marque")              or ""
        cur_type   = req_data.get("current_type_vehicule")       or ""
        cur_serie  = req_data.get("current_num_serie")           or ""
        cur_annee  = req_data.get("current_annee_circulation")   or ""

        # إذا كانت المركبة الحالية مطابقة للجديدة أو فارغة → ابحث في التاريخ عن مركبة مختلفة
        if not cur_immat or cur_immat == new_immat:
            with get_db() as conn2:
                # ابحث عن آخر مركبة مأرشفة مختلفة عن المركبة الجديدة
                hist = conn2.execute("""
                    SELECT vh.*, v.num_immatriculation, v.marque, v.type_vehicule,
                           v.num_serie, v.annee_circulation
                    FROM vehicles_history vh
                    JOIN vehicles v ON v.id = vh.vehicle_id
                    WHERE vh.driver_id = ?
                      AND v.num_immatriculation != ?
                    ORDER BY vh.id DESC LIMIT 1
                """, (r["driver_id"], new_immat or "")).fetchone()
                # إذا لم نجد مختلفة، خذ الأخيرة مهما كانت
                if not hist:
                    hist = conn2.execute("""
                        SELECT vh.*, v.num_immatriculation, v.marque, v.type_vehicule,
                               v.num_serie, v.annee_circulation
                        FROM vehicles_history vh
                        JOIN vehicles v ON v.id = vh.vehicle_id
                        WHERE vh.driver_id = ?
                        ORDER BY vh.id DESC LIMIT 1
                    """, (r["driver_id"],)).fetchone()
            if hist:
                hist = dict(hist)
                cur_immat  = hist.get("num_immatriculation") or cur_immat
                cur_marque = hist.get("marque")              or cur_marque
                cur_type   = hist.get("type_vehicule")       or cur_type
                cur_serie  = hist.get("num_serie")           or cur_serie
                cur_annee  = hist.get("annee_circulation")   or cur_annee

        new_immat_cell  = new_immat  if new_immat  else '<span style="color:#9ca3af">لم يُدخل بعد</span>'
        new_marque_cell = new_marque if new_marque else '<span style="color:#9ca3af">&#8212;</span>'
        new_type_cell   = new_type   if new_type   else '<span style="color:#9ca3af">&#8212;</span>'
        new_serie_cell  = new_serie  if new_serie  else '<span style="color:#9ca3af">&#8212;</span>'
        new_annee_cell  = new_annee  if new_annee  else '<span style="color:#9ca3af">&#8212;</span>'

        extra_rows = f"""
        <tr><td class="sep" colspan="2">&#128664; المركبة الحالية</td></tr>
        <tr><td class="label">رقم التسجيل</td><td>{v(cur_immat)}</td></tr>
        <tr><td class="label">الصنف</td><td>{v(cur_marque)}</td></tr>
        <tr><td class="label">الطراز</td><td>{v(cur_type)}</td></tr>
        <tr><td class="label">رقم التسلسلي في الطراز</td><td>{v(cur_serie)}</td></tr>
        <tr><td class="label">سنة الصنع</td><td>{v(cur_annee)}</td></tr>
        <tr><td class="sep" colspan="2">&#128994; المركبة الجديدة</td></tr>
        <tr><td class="label">رقم التسجيل</td><td>{new_immat_cell}</td></tr>
        <tr><td class="label">الصنف</td><td>{new_marque_cell}</td></tr>
        <tr><td class="label">الطراز</td><td>{new_type_cell}</td></tr>
        <tr><td class="label">رقم التسلسلي في الطراز</td><td>{new_serie_cell}</td></tr>
        <tr><td class="label">سنة الصنع</td><td>{new_annee_cell}</td></tr>"""

    elif rt == "تغيير_نشاط":
        extra_rows = f"""
        <tr><td class="sep" colspan="2">&#128664; مواصفات المركبة</td></tr>
      <tr><td class="label">رقم التسجيل</td><td>{v(veh.get("num_immatriculation"))}</td></tr>
      <tr><td class="label">الصنف / الطراز</td><td>{v(veh.get("marque"))} &#8212; {v(veh.get("type_vehicule"))}</td></tr>
      <tr><td class="label">الرقم التسلسلي</td><td>{v(veh.get("num_serie"))}</td></tr>
      <tr><td class="label">عدد المقاعد</td><td>{v(veh.get("nb_places"))}</td></tr>
      <tr><td class="label">سنة الصنع</td><td>{v(veh.get("annee_circulation"))}</td></tr>
      <tr><td class="sep" colspan="2">&#128260; تغيير طبيعة النشاط</td></tr>
        <tr><td class="label">النشاط الحالي</td><td>{ACTIVITY_LABELS.get(req_data.get("activity_type_old",""), req_data.get("activity_type_old","&#8212;"))}</td></tr>
        <tr><td class="label">النشاط الجديد</td><td>{ACTIVITY_LABELS.get(req_data.get("activity_type_new",""), req_data.get("activity_type_new","&#8212;"))}</td></tr>"""

    elif rt in ("توقف_مؤقت", "توقف_نهائي", "استئناف"):
        label_map = {"توقف_مؤقت": "توقف مؤقت", "توقف_نهائي": "توقف نهائي", "استئناف": "استئناف النشاط"}
        cls_map   = {"توقف_مؤقت": "sep-warn", "توقف_نهائي": "sep-red", "استئناف": "sep"}
        extra_rows = f"""
        <tr><td class="{cls_map.get(rt,"sep")}" colspan="2">&#128203; {label_map.get(rt, rt)}</td></tr>
        <tr><td class="label">السبب / الملاحظات</td><td>{v(r.get("notes"))}</td></tr>"""

    elif rt == "تجديد_وثائق_استغلال":
        extra_rows = f"""
        <tr><td class="sep" colspan="2">&#128196; وثائق الاستغلال</td></tr>
        <tr><td class="label">رقم رخصة السياقة</td><td>{v(lic.get("num_permis"))}</td></tr>
        <tr><td class="label">انتهاء الرخصة</td><td>{v(lic.get("date_expiration"))}</td></tr>
        <tr><td class="label">رقم الباب</td><td>{v(doo.get("door_number"))}</td></tr>
        <tr><td class="label">رقم عقد الكراء</td><td>{v(rc.get("contract_number"))}</td></tr>
        <tr><td class="label">انتهاء عقد الكراء</td><td>{v(rc.get("end_date")) or "مفتوح"}</td></tr>"""

    elif rt == "تغيير_باب":
        # جلب بيانات المستفيد الكاملة من جدول beneficiaries
        ben = {}
        if doo.get("beneficiary_id"):
            with get_db() as conn2:
                b = conn2.execute("SELECT * FROM beneficiaries WHERE id=?", (doo["beneficiary_id"],)).fetchone()
                if b: ben = dict(b)
        extra_rows = f"""
        <tr><td class="sep" colspan="2">&#128100; بيانات المستفيد (صاحب الرخصة)</td></tr>
        <tr><td class="label">الاسم واللقب</td><td>{v(ben.get("prenom_ar"))} {v(ben.get("nom_ar"))}</td></tr>
        <tr><td class="label">تاريخ ومكان الازدياد</td><td>{fmt_date(ben.get("date_naissance"))} &#8212; {v(ben.get("lieu_naissance"))}</td></tr>
        <tr><td class="label">العنوان</td><td>{v(ben.get("adresse"))}</td></tr>
        <tr><td class="label">NIN</td><td>{v(ben.get("nin"))}</td></tr>
        <tr><td class="label">رقم بطاقة التعريف</td><td>{v(ben.get("num_document_cni"))}</td></tr>
        <tr><td class="label">تاريخ إصدار البطاقة</td><td>{fmt_date(ben.get("date_delivrance_cni"))}</td></tr>
        <tr><td class="label">رقم الرخصة الحالي</td><td>{v(doo.get("door_number"))}</td></tr>
        <tr><td class="sep" colspan="2">&#128664; السيارة المستعملة</td></tr>
        <tr><td class="label">الصنف</td><td>{v(veh.get("marque"))}</td></tr>
        <tr><td class="label">الطراز</td><td>{v(veh.get("modele") or veh.get("type_vehicule"))}</td></tr>
        <tr><td class="label">رقم التسجيل</td><td>{v(veh.get("num_immatriculation"))}</td></tr>
        <tr><td class="label">رقم التسلسلي</td><td>{v(veh.get("num_serie"))}</td></tr>"""

    # ── تخصيص عرض طلب تغيير النشاط ──
    _is_act = (rt == "تغيير_نشاط")
    _title  = "طلب تغيير طبيعة النشاط" if _is_act else f"طلب رسمي — {rt}"
    _badge  = (f'رقم الطلب: {v(r["request_number"])} — تاريخ التقديم: {(r.get("created_at") or "")[:10]}'
               if _is_act else f'رقم الطلب: {v(r["request_number"])}')
    _birth_rows = (f'<tr><td class="label">تاريخ الميلاد</td><td>{v(d.get("date_naissance"))}</td></tr>'
                   f'<tr><td class="label">مكان الميلاد</td><td>{v(d.get("lieu_naissance_ar"))}</td></tr>')\
                  if _is_act else ""
    body = f"""<div class="doc">
    <div class="header">
      <h1>&#128661; {_title}</h1>
      <p>DTW ELBAYADH -STT /DEV2026</p>
    </div>
    <div class="badge">{_badge}</div>
    <table>
      <tr><td class="sep" colspan="2">&#128100; بيانات مقدم الطلب</td></tr>
      <tr><td class="label">الاسم واللقب</td><td>{v(d.get("prenom_ar"))} {v(d.get("nom_ar"))}</td></tr>
      <tr><td class="label">NIN</td><td>{v(d.get("nin"))}</td></tr>
      {_birth_rows}
      <tr><td class="label">الهاتف</td><td>{v(d.get("telephone"))}</td></tr>
      <tr><td class="label">العنوان</td><td>{v(d.get("adresse"))}</td></tr>
      <tr><td class="label">رقم رخصة السياقة</td><td>{v(lic.get("num_permis"))}</td></tr>
      <tr><td class="label">رقم الباب</td><td>{v(doo.get("door_number"))}</td></tr>
      {extra_rows}
      <tr><td class="sep" colspan="2">&#128203; معلومات الطلب</td></tr>
      <tr><td class="label">تاريخ التقديم</td><td>{v(r["created_at"])}</td></tr>
      <tr><td class="label">الحالة</td><td>{v(r["statut"])}</td></tr>
    </table>
    <div class="sign">
      <div class="sign-box"><div class="line">توقيع مقدم الطلب</div></div>
    </div>
    <div class="footer">{v(r["request_number"])} &#8212; {datetime.now().strftime("%Y-%m-%d")}</div>
    </div>"""

    return Response(html_page(f"طلب {rt}", body), mimetype="text/html; charset=utf-8")


# ════════════════════════════════════════
# Endpoint 2: عقد كراء الرخصة
# ════════════════════════════════════════

@print_bp.route("/api/print/rental-contract/<int:contract_id>")
@require_auth
def print_rental_contract(account, contract_id):
    with get_db() as conn:
        driver = conn.execute(
            "SELECT id FROM drivers WHERE account_id=?", (account["id"],)
        ).fetchone()
        if not driver:
            return "غير موجود", 404

        rc = conn.execute("""
            SELECT rc.*,
                   dl.door_number, dl.decision_number, dl.decision_date, dl.decision_type,
                   dl.decision_wilaya, dl.exploitation_commune,
                   b.nom_ar   as ben_nom,    b.prenom_ar as ben_prenom,
                   b.date_naissance as ben_dob, b.adresse as ben_adresse,
                   b.nin as ben_nin, b.sifa,
                   b.lieu_naissance as ben_lieu_naissance,
                   b.num_document_cni as ben_cni_num, b.date_delivrance_cni as ben_cni_date,
                   d.nom_ar, d.prenom_ar, d.nin, d.adresse,
                   d.date_naissance as drv_dob,
                   d.lieu_naissance_ar as drv_lieu_naissance,
                   d.num_document_cni as drv_cni_num, d.date_delivrance_cni as drv_cni_date,
                   drv_lic.num_permis as drv_permis, drv_lic.date_delivrance as drv_permis_date,
                   veh.num_immatriculation, veh.marque, veh.modele, veh.type_vehicule,
                   veh.num_serie, veh.nb_places
            FROM rental_contracts rc
            JOIN door_licenses  dl  ON dl.id = rc.door_license_id
            JOIN beneficiaries  b   ON b.id  = rc.beneficiary_id
            JOIN drivers        d   ON d.id  = rc.driver_id
            LEFT JOIN vehicles      veh     ON veh.driver_id=d.id AND veh.is_current=1
            LEFT JOIN driver_licenses drv_lic ON drv_lic.driver_id=d.id AND drv_lic.is_current=1
            WHERE rc.id=? AND rc.driver_id=?
        """, (contract_id, driver["id"])).fetchone()
        if not rc:
            return "العقد غير موجود", 404

    r = dict(rc)
    rent   = r.get("monthly_rent") or "........"
    wilaya = r.get("decision_wilaya") or r.get("exploitation_commune") or "........"

    body = f"""
<style>
@media print {{
  /* ═══════════════════════════════════════════════════════════
     CSS طباعة عقد الكراء — مبادئ ثابتة:
     1. print-color-adjust: exact → يجبر المتصفح على طباعة
        الألوان والحدود (بدونه يختفي الإطار الأخضر)
     2. .doc border → يجب تحديده صريحاً هنا لأن هذا الـCSS
        يتجاوز الـCSS العام — لا تضع border: none أبداً
     3. page-break-before: always على .legal-block → الصفحة 2 تبدأ من الإطار القانوني
     4. الأحجام محسوبة لملء الصفحتين: 12px للجداول، 13px للنصوص، line-height 1.9
  ═══════════════════════════════════════════════════════════ */
  * {{ -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }}
  @page {{ size: A4; margin: 10mm 12mm; }}
  body {{ padding: 0 !important; background: #fff !important; }}
  .doc {{
    padding: 12px !important;
    border: 2px solid #125950 !important;
    max-width: 100% !important;
    box-decoration-break: clone !important;
    -webkit-box-decoration-break: clone !important;
  }}
  .header {{ padding-bottom: 8px !important; margin-bottom: 12px !important; }}
  .header h1 {{ font-size: 15px !important; }}
  .header p  {{ font-size: 11px !important; margin-top: 2px !important; }}
  table {{ margin-bottom: 10px !important; page-break-inside: avoid; width: 100% !important; }}
  td {{ padding: 5px 8px !important; font-size: 12px !important; line-height: 1.5 !important; }}
  td.sep, td.sep-warn, td.sep-red {{ padding: 5px 8px !important; font-size: 12px !important; }}
  td.label {{ font-size: 12px !important; width: 42% !important; }}
  h3 {{ font-size: 13px !important; margin: 10px 0 6px !important; page-break-after: avoid; }}
  p  {{ font-size: 13px !important; line-height: 1.9 !important; margin-bottom: 10px !important; page-break-inside: avoid; orphans: 4; widows: 4; }}
  .sep-div {{ margin: 12px 0 !important; font-size: 12px !important; }}
  .sign {{ margin-top: 20px !important; page-break-inside: avoid; }}
  .sign-box {{ min-height: 90px !important; }}
  .stamp-box {{ min-height: 120px !important; }}
  .legal-block {{ page-break-before: always; page-break-inside: avoid; padding-top: 4px !important; }}
}}
</style>
<div class="doc">
  <div class="header">
    <h1>عقد كراء رخصة سيارة أجرة</h1>
    <p>عقد مجزأ &mdash; رقم العقد: {v(r["contract_number"])}</p>
  </div>

  <!-- الطرف الأول -->
  <table>
    <tr><td class="sep" colspan="2">1ـ الطرف الأول (صاحب الرخصة)</td></tr>
    <tr><td class="label">الاسم واللقب</td><td>{v(r["ben_prenom"])} {v(r["ben_nom"])}</td></tr>
    <tr><td class="label">تاريخ ومكان الازدياد</td><td>{fmt_date(r["ben_dob"])} — {v(r["ben_lieu_naissance"])}</td></tr>
    <tr><td class="label">العنوان</td><td>{v(r["ben_adresse"])}</td></tr>
    <tr><td class="label">رقم بطاقة التعريف</td><td>{v(r["ben_cni_num"])}</td></tr>
    <tr><td class="label">تاريخ إصدار البطاقة</td><td>{fmt_date(r["ben_cni_date"])}</td></tr>
    <tr><td class="label">رقم التعريف الوطني (NIN)</td><td>{v(r["ben_nin"])}</td></tr>
    <tr><td class="label">رقم الرخصة</td><td>{v(r["door_number"])}</td></tr>
    <tr><td class="label">بلدية الالتحاق</td><td>{v(r["exploitation_commune"])}</td></tr>
    <tr><td class="label">قرار رقم</td><td>{v(r["decision_number"])}</td></tr>
    <tr><td class="label">تاريخ القرار</td><td>{v(r["decision_date"])}</td></tr>
    <tr><td class="label">صادر عن والي ولاية</td><td>{wilaya}</td></tr>
  </table>

  <div class="sep-div" style="text-align:center; font-weight:bold; margin:10px 0; color:#125950;">— من جهة —</div>

  <!-- الطرف الثاني -->
  <table>
    <tr><td class="sep" colspan="2">2ـ الطرف الثاني (صاحب سيارة الأجرة / المكتري)</td></tr>
    <tr><td class="label">الاسم واللقب</td><td>{v(r["prenom_ar"])} {v(r["nom_ar"])}</td></tr>
    <tr><td class="label">تاريخ ومكان الازدياد</td><td>{fmt_date(r["drv_dob"])} — {v(r["drv_lieu_naissance"])}</td></tr>
    <tr><td class="label">العنوان</td><td>{v(r["adresse"])}</td></tr>
    <tr><td class="label">رقم التعريف الوطني (NIN)</td><td>{v(r["nin"])}</td></tr>
    <tr><td class="label">رقم رخصة السياقة</td><td>{v(r["drv_permis"])}</td></tr>
    <tr><td class="label">تاريخ رخصة السياقة</td><td>{fmt_date(r["drv_permis_date"])}</td></tr>
  </table>

  <div class="sep-div" style="text-align:center; font-weight:bold; margin:10px 0; color:#125950;">— من جهة أخرى —</div>

  <!-- مواصفات السيارة -->
  <table>
    <tr><td class="sep" colspan="2">مالك السيارة ذات الخصائص التالية</td></tr>
    <tr><td class="label">الصنف</td><td>{v(r["marque"])}</td></tr>
    <tr><td class="label">الطراز</td><td>{v(r["modele"] or r.get("type_vehicule"))}</td></tr>
    <tr><td class="label">رقم التسلسلي في الطراز</td><td>{v(r["num_serie"])}</td></tr>
    <tr><td class="label">رقم التسجيل</td><td>{v(r["num_immatriculation"])}</td></tr>
    <tr><td class="label">عدد المقاعد</td><td>{v(r["nb_places"])}</td></tr>
  </table>

  <!-- الإطار القانوني -->
  <div class="legal-block">
  <h3>الإطار القانوني</h3>
  <p style="font-size:13px; line-height:1.9; text-align:justify; margin-bottom:12px;">
    عملاً بالقوانين والتنظيمات المعمول بها، لاسيما أحكام المرسوم: 287/86 المؤرخ في: 09 ديسمبر 1986
    الذي ينظم منح رخص استغلال الأجرة والقرار المؤرخ في: 08 أوت 1993 الذي ينظم النقل الذي تقوم به
    سيارات الأجرة والمعدل والمتمم بالقرار المؤرخ في: 02 جانفي 2001.
  </p>
  <p style="font-size:13px; font-weight:bold; margin-bottom:8px;">تم الاتفاق على ما يلي:</p>
  <p style="font-size:13px; line-height:1.9; text-align:justify; margin-bottom:12px;">
    بيان أن المالك المسمى من الطرف الأول، يكري رخصة استغلال سيارة الأجرة المذكورة أعلاه للمالك
    المسمى الطرف الثاني، الذي يقبل ذلك.
  </p>
  </div>

  <!-- شروط العقد -->
  <table>
    <tr><td class="sep" colspan="2">المدة</td></tr>
    <tr><td class="label">تاريخ البداية</td><td>{(v(r["contract_date"]) or "")[:10]}</td></tr>
    <tr><td class="label">تاريخ النهاية</td><td>{(v(r.get("end_date")) or "........")[:10]}</td></tr>
    <tr><td colspan="2" style="font-size:13px; line-height:1.8; color:#374151;">
      قابلة للتجديد الضمني، وعلى الطرف الذي يريد إنهاء العقد أن ينذر الطرف الآخر برسالة موصى عليها
      مع إشعار بالاستلام تتضمن إشعاراً مسبقاً مدته شهران (02).
    </td></tr>
    <tr><td class="sep" colspan="2">ثمن كراء رخصة الأجرة</td></tr>
    <tr><td class="label">المبلغ الشهري</td><td><strong>{rent}</strong> دج</td></tr>
    <tr><td colspan="2" style="font-size:13px; line-height:1.8; color:#374151;">
      يدفع في اليوم الثلاثين (30) من كل شهر. يدفع المكري جميع أنواع الحقوق والرسوم والضرائب الناتجة
      عن استغلال خدمة سيارة الأجرة المقصود بهذا العقد ودون حق الطعن ضد المكري. ويجب عليه أن يدفع
      غرامات المخالفات وينفذ جميع العقوبات التي يمكن أن تأمر بها الهيئات القضائية أو الإدارية بسبب
      عدم احترام تنظيمات الشرطة أو حركة مرور في الطريق.
    </td></tr>
  </table>

  <h3>مسؤولية المتعاقدين</h3>
  <p style="font-size:13px; line-height:1.9; text-align:justify; margin-bottom:12px;">
    المكري هو المسؤول الشخصي المباشر ويجب عليه أن يمتثل للقوانين والتنظيمات المتعلقة باستغلال
    رخصة سيارة الأجرة.
  </p>

  <h3>شروط الفسخ</h3>
  <p style="font-size:13px; line-height:1.9; text-align:justify; margin-bottom:12px;">
    يمكن فسخ العقد بطلب من المكري إذا لم يدفع المكتري ثمن الكراء عند أجله
    (أو لأي سبب آخر يجب توضيحه).
  </p>
  <p style="font-size:13px; line-height:1.9; text-align:justify; margin-bottom:12px;">
    تسوى المنازعات التي تمكن... خلال تنفيذ بنود هذا العقد حسب الأحكام والإجراءات التي ينص
    عليها تشريع القانون المعمول به والمطبق في هذا المجال.
  </p>
  <p style="font-size:13px; margin-bottom:20px;">اطلعت عليه، قبلت: المكري.</p>

  <!-- التوقيعات -->
  <div class="sign">
    <div class="sign-box">
      <div style="font-weight:bold; margin-bottom:6px;">صاحب سيارة الأجرة</div>
      <div style="font-size:12px; color:#6b7280; margin-top:4px;">رخصة السياقة رقم: {v(r["drv_permis"])}</div>
      <div style="font-size:12px; color:#6b7280;">الصادرة في: {v(r["drv_permis_date"])}</div>
      <div style="margin-top:40px;"></div>
    </div>
    <div class="sign-box">
      <div style="font-weight:bold; margin-bottom:6px;">صاحب الرخصة</div>
      <div style="font-size:12px; color:#6b7280; margin-top:4px;">ب.ت.و. رقم: {v(r["ben_cni_num"])}</div>
      <div style="font-size:12px; color:#6b7280;">الصادرة في: {v(r["ben_cni_date"])}</div>
      <div style="margin-top:40px;"></div>
    </div>
  </div>

  <!-- مصادقة البلدية -->
  <div class="stamp-box" style="text-align:center; margin-top:24px; border:1px dashed #86efac; padding:24px;
              min-height:90px; border-radius:8px; background:#f4f8f7;">
    <div style="font-weight:bold; color:#125950; margin-bottom:8px;">مصادقة البلدية</div>
  </div>

  <div class="footer" style="margin-top:14px;">رقم العقد: {v(r["contract_number"])}</div>
</div>
"""
    return Response(html_page("عقد كراء رخصة سيارة أجرة", body), mimetype="text/html; charset=utf-8")


# ════════════════════════════════════════
# Endpoint 3: عقد عمل المناوب
# ════════════════════════════════════════

@print_bp.route("/api/print/deputy-contract/<int:contract_id>")
@require_auth
def print_deputy_contract(account, contract_id):
    with get_db() as conn:
        driver = conn.execute(
            "SELECT id FROM drivers WHERE account_id=?", (account["id"],)
        ).fetchone()
        if not driver:
            return "غير موجود", 404

        dc = conn.execute("""
            SELECT dc.*,
                   d.nom_ar, d.prenom_ar, d.nin, d.telephone, d.adresse,
                   dl.num_permis, dl.date_expiration,
                   veh.num_immatriculation, veh.marque, veh.type_vehicule, veh.num_serie, veh.nb_places, veh.annee_circulation,
                   door.door_number,
                   dep.nom_ar as dep_nom, dep.prenom_ar as dep_prenom,
                   dep.nin as dep_nin, dep.telephone as dep_tel, dep.adresse as dep_adresse,
                   dep.num_permis as dep_permis, dep.date_expiration_permis as dep_exp
            FROM deputy_contracts dc
            JOIN drivers d    ON d.id   = dc.driver_id
            JOIN deputies dep ON dep.id = dc.deputy_id
            LEFT JOIN driver_licenses dl  ON dl.driver_id=d.id AND dl.is_current=1
            LEFT JOIN vehicles veh        ON veh.driver_id=d.id AND veh.is_current=1
            LEFT JOIN door_licenses door  ON door.current_driver_id=d.id AND door.is_active=1
            WHERE dc.id=? AND dc.driver_id=?
        """, (contract_id, driver["id"])).fetchone()
        if not dc:
            return "العقد غير موجود", 404

    dc = dict(dc)
    body = f"""<style>
@media print {{
  * {{ -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }}
  @page {{ size: A4; margin: 8mm 10mm; }}
  body {{ padding: 0 !important; background: #fff !important; }}
  .doc {{ padding: 10px !important; border: 2px solid #125950 !important; max-width: 100% !important; }}
  .header {{ padding-bottom: 4px !important; margin-bottom: 6px !important; }}
  .header h1 {{ font-size: 13px !important; }}
  .header p  {{ font-size: 10px !important; margin-top: 1px !important; }}
  .badge {{ font-size: 11px !important; padding: 4px 8px !important; margin-bottom: 6px !important; }}
  table {{ margin-bottom: 5px !important; width: 100% !important; page-break-inside: avoid; }}
  td {{ padding: 3px 6px !important; font-size: 10.5px !important; line-height: 1.35 !important; }}
  td.sep {{ padding: 3px 6px !important; font-size: 10.5px !important; }}
  td.label {{ font-size: 10.5px !important; width: 38% !important; }}
  .contract-text {{ font-size: 11px !important; line-height: 1.7 !important; margin: 6px 0 !important; page-break-inside: avoid; }}
  .sign {{ margin-top: 10px !important; page-break-inside: avoid; }}
  .sign-box {{ min-height: 50px !important; font-size: 10.5px !important; }}
}}
</style>
<div class="doc">
  <div class="header">
    <h1>&#128661; عقد عمل سائق مناوب</h1>
    <p>محرر بتاريخ: {v(dc["contract_date"])}</p>
  </div>
  <div class="badge">رقم العقد: {v(dc["contract_number"])}</div>

  <!-- الطرف الأول -->
  <table>
    <tr><td class="sep" colspan="2">الطرف الأول &mdash; صاحب العمل</td></tr>
    <tr><td class="label">الاسم واللقب</td><td>{v(dc["prenom_ar"])} {v(dc["nom_ar"])}</td></tr>
    <tr><td class="label">رقم التعريف الوطني (NIN)</td><td>{v(dc["nin"])}</td></tr>
    <tr><td class="label">الهاتف</td><td>{v(dc["telephone"])}</td></tr>
    <tr><td class="label">العنوان</td><td>{v(dc["adresse"])}</td></tr>
    <tr><td class="label">رقم رخصة السياقة</td><td>{v(dc["num_permis"])}</td></tr>
    <tr><td class="label">رقم الباب</td><td>{v(dc["door_number"])}</td></tr>
  </table>

  <!-- الطرف الثاني -->
  <table>
    <tr><td class="sep" colspan="2">الطرف الثاني &mdash; السائق المناوب</td></tr>
    <tr><td class="label">الاسم واللقب</td><td>{v(dc["dep_prenom"])} {v(dc["dep_nom"])}</td></tr>
    <tr><td class="label">رقم التعريف الوطني (NIN)</td><td>{v(dc["dep_nin"])}</td></tr>
    <tr><td class="label">الهاتف</td><td>{v(dc["dep_tel"])}</td></tr>
    <tr><td class="label">العنوان</td><td>{v(dc["dep_adresse"])}</td></tr>
    <tr><td class="label">رقم رخصة السياقة</td><td>{v(dc["dep_permis"])}</td></tr>
    <tr><td class="label">تاريخ انتهاء الرخصة</td><td>{v(dc["dep_exp"])}</td></tr>
  </table>

  <!-- بنود العقد — نفس نسق جدول طلب التوظيف -->
  <table>
    <tr><td class="sep" colspan="2">&#128203; بنود العقد</td></tr>
    <tr><td class="label">تاريخ بداية العقد</td><td>{v(dc["contract_date"])}</td></tr>
    <tr><td class="label">تاريخ انتهاء العقد</td><td>{v(dc["end_date"]) or "........"}</td></tr>
    <tr><td class="sep" colspan="2">&#128664; المركبة المكلّف بقيادتها</td></tr>
    <tr><td class="label">الصنف / الطراز</td><td>{v(dc["marque"])} &mdash; {v(dc["type_vehicule"])}</td></tr>
    <tr><td class="label">رقم التسجيل</td><td>{v(dc["num_immatriculation"])}</td></tr>
    <tr><td class="label">الرقم التسلسلي</td><td>{v(dc["num_serie"])}</td></tr>
    <tr><td class="label">عدد المقاعد</td><td>{v(dc["nb_places"])}</td></tr>
    <tr><td class="label">سنة الصنع</td><td>{v(dc["annee_circulation"])}</td></tr>
  </table>

  <!-- التوقيعات -->
  <div class="sign">
    <div class="sign-box"><div class="line">توقيع الطرف الأول (صاحب العمل)</div></div>
    <div class="sign-box"><div class="line">توقيع الطرف الثاني (السائق المناوب)</div></div>
  </div>
  <div class="footer">{v(dc["contract_number"])}</div>
</div>"""

    return Response(html_page("عقد عمل مناوب", body), mimetype="text/html; charset=utf-8")


# ════════════════════════════════════════
# Endpoint NEW: طباعة رخصة السائق الإضافي للسائق نفسه
# GET /api/print/my-deputy-permit  ← require_auth (سائق)
# ════════════════════════════════════════

@print_bp.route("/api/print/my-deputy-permit")
@require_auth
def print_my_deputy_permit(account):
    with get_db() as conn:
        driver = conn.execute(
            "SELECT * FROM drivers WHERE account_id=?", (account["id"],)
        ).fetchone()
        if not driver:
            return "السائق غير موجود", 404

        perm = conn.execute(
            "SELECT * FROM deputy_permits WHERE driver_id=? AND is_current=1 ORDER BY id DESC LIMIT 1",
            (driver["id"],)
        ).fetchone()

        if not perm:
            return Response(
                html_page("رخصة سائق إضافي",
                    '<div class="doc"><div class="warn">⚠️ لم تُصدر الإدارة الرخصة بعد.<br>يرجى تقديم طلب التصريح بالمناوب وانتظار الموافقة.</div></div>'),
                mimetype="text/html; charset=utf-8"
            )

        perm   = dict(perm)
        d, lic, veh, doo, act, rc, dep = drv_full(conn, driver["id"])
        driver = dict(driver)

        # رخصة الاستغلال: آخر طلب مقبول غير تصريح مناوب
        expl_req = conn.execute(
            "SELECT request_number, processed_at FROM requests "
            "WHERE driver_id=? AND request_type != 'تصريح_مناوب' AND statut='مقبول' "
            "ORDER BY id DESC LIMIT 1",
            (driver["id"],)
        ).fetchone()
        expl_req = dict(expl_req) if expl_req else {}

    today_str  = datetime.now().strftime("%Y-%m-%d")
    year_str   = datetime.now().strftime("%Y")

    ACTIVITY_MUHIT_LOCAL = {
        "فردية_حضرية":    "فردية",
        "جماعية_حضرية":   "جماعية",
        "مابين_البلديات": "مابين البلديات",
        "مابين_الولايات": "مابين الولايات",
    }

    activity_type = perm.get("activity_type") or act.get("activity_type", "")
    muhit         = ACTIVITY_MUHIT_LOCAL.get(activity_type, activity_type or "—")

    # — بيانات سائق سيارة الأجرة (صاحب العمل)
    drv_nom       = v(driver.get("nom_ar"))
    drv_prenom    = v(driver.get("prenom_ar"))
    drv_adresse   = v(driver.get("adresse"))

    # — بيانات المناوب
    dep_nom       = v(dep.get("nom_ar"))                   if dep else "—"
    dep_prenom    = v(dep.get("prenom_ar"))                if dep else "—"
    dep_adresse   = v(dep.get("adresse"))                  if dep else "—"
    dep_permis       = v(dep.get("num_permis"))              if dep else "—"
    dep_exp          = v(dep.get("date_expiration_permis"))  if dep else "—"
    dep_ddn          = fmt_date(dep.get("date_naissance"))         if dep else "—"
    dep_lieu_naiss   = v(dep.get("lieu_naissance"))                 if dep else "—"
    dep_permis_date  = fmt_date(dep.get("date_delivrance_permis"))  if dep else "—"

    # — بيانات رخصة الاستغلال
    permit_num    = v(perm.get("permit_number"))
    issue_date    = v(perm.get("issue_date"))
    expiry_date   = v(perm.get("expiry_date"))
    door_number   = v(perm.get("door_number")         or doo.get("door_number"))
    num_immat     = v(perm.get("num_immatriculation") or veh.get("num_immatriculation"))

    # رخصة الاستغلال: نوع + رقم + تاريخ
    ACTIVITY_EXPL_LABEL = {
        "فردية_حضرية":    "فردية",
        "جماعية_حضرية":   "جماعية",
        "مابين_البلديات": "مابين البلديات",
        "مابين_الولايات": "مابين الولايات",
    }
    expl_type_label  = ACTIVITY_EXPL_LABEL.get(activity_type, "")
    expl_license_num = v(expl_req.get("request_number")) if expl_req else "—"
    raw_date         = (expl_req.get("processed_at") or "")[:10]
    expl_license_date= fmt_date(raw_date) if raw_date else "—"
    expl_decision    = expl_license_num   # للتوافق مع الكود القديم

    body = f"""
<div class="doc" style="max-width:720px; padding:48px 56px; font-size:14px;
     line-height:1.95; font-family:'Traditional Arabic',Arial,sans-serif;">

  <!-- ── رأس الصفحة ── -->
  <div style="text-align:right; margin-bottom:4px;">
    <div style="font-size:19px; font-weight:900; color:#000;">الجمهورية الجزائرية الديمقراطية الشعبية</div>
    <div style="font-size:16px; font-weight:700; color:#000; margin-top:6px;">وزارة الداخلية والجماعات المحلية والنقل</div>
    <div style="font-size:14px; color:#000; margin-top:4px;">مديرية النقل لولاية البيض</div>
  </div>

  <div style="margin:16px 0; font-size:14px;">
    الرقم:{permit_num} / {year_str}
  </div>

  <!-- ── العنوان ── -->
  <div style="text-align:center; font-size:22px; font-weight:900;
              text-decoration:underline; margin:28px 0 32px; color:#000;">
    رخصة سائق إضافي
  </div>

  <!-- ── نص الافتتاح ── -->
  <div style="margin-bottom:18px;">ان مدير النقل لولاية البيض:</div>

  <!-- ── المراسيم ── -->
  <div style="margin-bottom:10px;">
    - بمقتضى المرسوم التنفيذي 12-230 المؤرخ في 03 رجب عام 1433 الموافق ل 24 مايو 2012
    والمتضمن تنظيم النقل بواسطة سيارات الأجرة المعدل والمتمم.
  </div>
  <div style="margin-bottom:24px;">
    - بمقتضى القرار المؤرخ في 11 ذي القعدة عام 1437 الموافق ل 14 غشت سنة 2016 الذي يحدد نماذج
    الوثائق المرتبطة بممارسة نشاط النقل بواسطة سيارة الأجرة.
  </div>

  <div style="margin-bottom:20px;">- يقرر ما يأتي-</div>

  <!-- ── المادة الأولى + بيانات المناوب ── -->
  <div style="margin-bottom:14px; line-height:2.2;">
    <strong>المادة الأولى :</strong>
    عملا بأحكام المرسوم التنفيذي 12-230 المؤرخ في 03 رجب عام 1433
    الموافق ل 24 مايو 2012 والمذكور أعلاه تسلم رخصة سياقة إضافية
    <strong>للسيد :</strong> {dep_prenom} {dep_nom} ،
    <strong>تاريخ و مكان الازدياد :</strong> <span dir="ltr">{dep_ddn}</span> &nbsp;ب&nbsp; {dep_lieu_naiss} ،
    <strong>رقم رخصة السياقة :</strong> <span dir="ltr">{dep_permis}</span> ،
    <strong>تاريخ رخصة السياقة :</strong> <span dir="ltr">{dep_permis_date}</span> .
  </div>

  <!-- ── وذلك تبعاً + بيانات رخصة الاستغلال ── -->
  <div style="margin-bottom:20px;">
    وذلك تبعا للطلب الذي قدمه السيد :
    {drv_prenom} {drv_nom}
    بصفته <strong>حائز</strong> على رخصة استغلال خدمة سيارة اجرة
    <strong>{expl_type_label} رقم : {expl_license_num}</strong> ،
    الصادرة بتاريخ : <span dir="ltr">{expl_license_date}</span> ،
  </div>

  <!-- ── بيانات الرخصة ── -->
  <div style="line-height:2.4; margin-bottom:10px;">
    <div><strong>بلدية الالتحاق :</strong> &nbsp;&nbsp; {(doo.get("exploitation_commune") or "البيض")}</div>
    <div><strong>محيط النقل الحضري الملحق به :</strong> &nbsp;&nbsp; {muhit}</div>
    <div><strong>رقم تسجيل المركبة :</strong> &nbsp;&nbsp; {num_immat}</div>
    <div><strong>رقم الباب :</strong> &nbsp;&nbsp; {door_number}</div>
    <div><strong>مدة العقد صالحة الى غاية :</strong> &nbsp;&nbsp;
      <strong style="font-size:15px; color:#125950;">{expiry_date}</strong>
    </div>
  </div>

  <!-- ── التوقيع ── -->
  <div style="display:flex; justify-content:space-between; margin-top:48px; align-items:flex-end;">
    <div style="font-size:14px;">حرر بالبيض في : {today_str}</div>
    <div style="text-align:center;">
      <div style="font-weight:700; font-size:15px; margin-bottom:40px;">المديِر</div>
    </div>
  </div>

  <div class="footer" style="margin-top:32px;">
    {permit_num} — رخصة سائق إضافي — {today_str}
  </div>
</div>"""

    return Response(html_page("رخصة سائق إضافي", body), mimetype="text/html; charset=utf-8")


# ════════════════════════════════════════
# Endpoint 4: طلب توظيف مناوب
# ════════════════════════════════════════

@print_bp.route("/api/print/deputy-job-request/<int:contract_id>")
@require_auth
def print_deputy_job_request(account, contract_id):
    try:
        with get_db() as conn:
            driver = conn.execute(
                "SELECT id FROM drivers WHERE account_id=?", (account["id"],)
            ).fetchone()
            if not driver:
                return "غير موجود", 404

            dc = conn.execute("""
                SELECT dc.*,
                       d.nom_ar, d.prenom_ar, d.nin as drv_nin,
                       d.telephone as drv_tel, d.adresse as drv_adresse,
                       d.date_naissance as drv_dob, d.lieu_naissance_ar as drv_lieu,
                       dl.num_permis as drv_permis, dl.categories as drv_cat_permis,
                       dl.date_expiration as drv_exp_permis,
                       veh.num_immatriculation, veh.marque, veh.type_vehicule, veh.num_serie, veh.nb_places, veh.annee_circulation,
                       veh.num_serie, veh.annee_circulation, veh.energie, veh.nb_places,
                       door.door_number,
                       dep.nom_ar as dep_nom, dep.prenom_ar as dep_prenom,
                       dep.nin as dep_nin, dep.telephone as dep_tel, dep.adresse as dep_adresse,
                       dep.date_naissance as dep_dob, dep.lieu_naissance as dep_lieu,
                       dep.num_permis as dep_permis, dep.categories_permis as dep_cats,
                       dep.date_delivrance_permis as dep_del,
                       dep.date_expiration_permis as dep_exp,
                       dep.wilaya_permis as dep_wilaya, dep.lieu_delivrance_permis as dep_lieu_del
                FROM deputy_contracts dc
                JOIN drivers d     ON d.id   = dc.driver_id
                JOIN deputies dep  ON dep.id = dc.deputy_id
                LEFT JOIN driver_licenses dl ON dl.driver_id=d.id AND dl.is_current=1
                LEFT JOIN vehicles veh       ON veh.driver_id=d.id AND veh.is_current=1
                LEFT JOIN door_licenses door ON door.current_driver_id=d.id AND door.is_active=1
                WHERE dc.id=? AND dc.driver_id=?
            """, (contract_id, driver["id"])).fetchone()
            if not dc:
                return "العقد غير موجود", 404

        dc = dict(dc)
        try:
            drv_cats = json.loads(dc.get("drv_cat_permis") or "[]")
            drv_cats_str = "، ".join(drv_cats) if drv_cats else "&#8212;"
        except: drv_cats_str = v(dc.get("drv_cat_permis"))
        try:
            dep_cats = json.loads(dc.get("dep_cats") or "[]")
            dep_cats_str = "، ".join(dep_cats) if dep_cats else "&#8212;"
        except: dep_cats_str = v(dc.get("dep_cats"))

        today_str = datetime.now().strftime("%Y-%m-%d")
        body = f"""<style>
@media print {{
  * {{ -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }}
  @page {{ size: A4; margin: 7mm 9mm; }}
  body {{ padding: 0 !important; background: #fff !important; }}
  .doc {{ padding: 9px !important; border: 2px solid #125950 !important; max-width: 100% !important; }}
  .header {{ padding-bottom: 4px !important; margin-bottom: 6px !important; }}
  .header h1 {{ font-size: 13px !important; }}
  .header p  {{ font-size: 10px !important; margin-top: 1px !important; }}
  .badge {{ font-size: 11px !important; padding: 4px 8px !important; margin-bottom: 6px !important; }}
  table {{ margin-bottom: 4px !important; page-break-inside: avoid; width: 100% !important; }}
  td {{ padding: 3px 6px !important; font-size: 10.5px !important; line-height: 1.3 !important; }}
  td.sep {{ padding: 3px 6px !important; font-size: 10.5px !important; }}
  td.label {{ font-size: 10.5px !important; width: 40% !important; }}
  .sign {{ margin-top: 8px !important; page-break-inside: avoid; }}
  .sign-box {{ min-height: 55px !important; font-size: 10.5px !important; }}
}}
</style>
<div class="doc">
          <div class="header">
            <h1>&#128661; طلب توظيف سائق مناوب لسيارة أجرة</h1>
            <p>محرر بتاريخ: {today_str}</p>
          </div>
          <div class="badge">رقم العقد: {v(dc["contract_number"])}</div>
          <table>
            <tr><td class="sep" colspan="2">&#128661; بيانات سائق سيارة الأجرة (صاحب العمل)</td></tr>
            <tr><td class="label">اللقب والاسم</td><td>{v(dc["prenom_ar"])} {v(dc["nom_ar"])}</td></tr>
            <tr><td class="label">NIN</td><td>{v(dc["drv_nin"])}</td></tr>
            <tr><td class="label">تاريخ الميلاد</td><td>{v(dc.get("drv_dob"))}</td></tr>
            <tr><td class="label">مكان الميلاد</td><td>{v(dc.get("drv_lieu"))}</td></tr>
            <tr><td class="label">الهاتف</td><td>{v(dc["drv_tel"])}</td></tr>
            <tr><td class="label">العنوان</td><td>{v(dc["drv_adresse"])}</td></tr>
            <tr><td class="label">رقم رخصة السياقة</td><td>{v(dc["drv_permis"])}</td></tr>
            <tr><td class="label">فئة الرخصة</td><td>{drv_cats_str}</td></tr>
            <tr><td class="label">انتهاء رخصة السياقة</td><td>{v(dc.get("drv_exp_permis"))}</td></tr>
            <tr><td class="label">رقم الباب</td><td>{v(dc.get("door_number"))}</td></tr>
            <tr><td class="sep" colspan="2">&#128100; بيانات السائق المناوب</td></tr>
            <tr><td class="label">اللقب والاسم</td><td>{v(dc["dep_prenom"])} {v(dc["dep_nom"])}</td></tr>
            <tr><td class="label">NIN</td><td>{v(dc["dep_nin"])}</td></tr>
            <tr><td class="label">تاريخ الميلاد</td><td>{v(dc.get("dep_dob"))}</td></tr>
            <tr><td class="label">مكان الميلاد</td><td>{v(dc.get("dep_lieu"))}</td></tr>
            <tr><td class="label">الهاتف</td><td>{v(dc["dep_tel"])}</td></tr>
            <tr><td class="label">العنوان</td><td>{v(dc["dep_adresse"])}</td></tr>
            <tr><td class="label">رقم رخصة السياقة</td><td>{v(dc["dep_permis"])}</td></tr>
            <tr><td class="label">فئات الرخصة</td><td>{dep_cats_str}</td></tr>
            <tr><td class="label">تاريخ الإصدار</td><td>{v(dc.get("dep_del"))}</td></tr>
            <tr><td class="label">تاريخ الانتهاء</td><td>{v(dc.get("dep_exp"))}</td></tr>
            <tr><td class="label">جهة الإصدار</td><td>{v(dc.get("dep_lieu_del"))} &#8212; {v(dc.get("dep_wilaya"))}</td></tr>
            <tr><td class="sep" colspan="2">&#128664; بيانات المركبة</td></tr>
            <tr><td class="label">رقم التسجيل</td><td>{v(dc.get("num_immatriculation"))}</td></tr>
            <tr><td class="label">الصنف / الطراز</td><td>{v(dc.get("marque"))} {v(dc.get("type_vehicule"))}</td></tr>
            <tr><td class="label">رقم التسلسلي في الطراز</td><td>{v(dc.get("num_serie"))}</td></tr>
            <tr><td class="label">سنة الصنع</td><td>{v(dc.get("annee_circulation"))}</td></tr>
            <tr><td class="label">نوع الوقود</td><td>{v(dc.get("energie"))}</td></tr>
            <tr><td class="label">عدد المقاعد</td><td>{v(dc.get("nb_places"))}</td></tr>
          </table>
          <div class="sign">
            <div class="sign-box"></div>
            <div class="sign-box"><div class="line">توقيع صاحب العمل</div></div>
          </div>
          <div class="footer">{v(dc["contract_number"])} &#8212; {today_str}</div>
        </div>"""

        return Response(html_page("طلب توظيف سائق مناوب", body), mimetype="text/html; charset=utf-8")

    except Exception:
        import traceback
        return f"<pre style='color:red;direction:ltr'>{traceback.format_exc()}</pre>", 500


# ════════════════════════════════════════
# تجديد وثائق الاستغلال
# ════════════════════════════════════════

@print_bp.route("/api/print/request-renewal/<int:req_id>")
@require_auth
def print_request_renewal(account, req_id):
    with get_db() as conn:
        drv = conn.execute("SELECT id FROM drivers WHERE account_id=?", (account["id"],)).fetchone()
        if not drv: return "غير موجود", 404
        req = conn.execute("SELECT * FROM requests WHERE id=? AND driver_id=?", (req_id, drv["id"])).fetchone()
        if not req: return "الطلب غير موجود", 404
        d, lic, veh, doo, act, rc, dep = drv_full(conn, drv["id"])

    req = dict(req)
    today = (req.get("created_at") or datetime.now().strftime("%Y-%m-%d"))[:10]
    cats = lic.get("categories", "")
    try:
        if isinstance(cats, str) and cats.startswith("["): cats = "، ".join(json.loads(cats))
    except: pass

    body = f"""<div class="doc">
    <div class="header"><h1>&#128661; طلب تجديد وثائق الاستغلال</h1><p>DTW ELBAYADH -STT /DEV2026</p></div>
    <div class="badge">رقم الطلب: {v(req["request_number"])} &#8212; تاريخ التقديم: {today}</div>
    <table>
      <tr><td class="sep" colspan="2">&#128100; بيانات السائق مقدم الطلب</td></tr>
      <tr><td class="label">اللقب والاسم</td><td>{v(d.get("prenom_ar"))} {v(d.get("nom_ar"))}</td></tr>
      <tr><td class="label">NIN</td><td>{v(d.get("nin"))}</td></tr>
      <tr><td class="label">تاريخ الميلاد</td><td>{v(d.get("date_naissance"))}</td></tr>
      <tr><td class="label">مكان الميلاد</td><td>{v(d.get("lieu_naissance_ar"))}</td></tr>
      <tr><td class="label">العنوان</td><td>{v(d.get("adresse"))}</td></tr>
      <tr><td class="label">الهاتف</td><td>{v(d.get("telephone"))}</td></tr>
      <tr><td class="sep" colspan="2">&#128203; رخصة السياقة</td></tr>
      <tr><td class="label">رقم الرخصة</td><td>{v(lic.get("num_permis"))}</td></tr>
      <tr><td class="label">الفئات</td><td>{v(cats)}</td></tr>
      <tr><td class="label">تاريخ الإصدار</td><td>{v(lic.get("date_delivrance"))}</td></tr>
      <tr><td class="label">تاريخ الانتهاء</td><td>{v(lic.get("date_expiration"))}</td></tr>
      <tr><td class="label">جهة الإصدار</td><td>{v(lic.get("wilaya_delivrance"))}</td></tr>
      <tr><td class="sep" colspan="2">&#128664; المركبة</td></tr>
      <tr><td class="label">رقم التسجيل</td><td>{v(veh.get("num_immatriculation"))}</td></tr>
      <tr><td class="label">الصنف / الطراز</td><td>{v(veh.get("marque"))} {v(veh.get("type_vehicule"))}</td></tr>
      <tr><td class="label">سنة أول استعمال</td><td>{v(veh.get("annee_circulation"))}</td></tr>
      <tr><td class="sep" colspan="2">&#128682; رقم الباب وعقد الكراء</td></tr>
      <tr><td class="label">رقم الباب</td><td>{v(doo.get("door_number"))}</td></tr>
      <tr><td class="label">المستفيد</td><td>{v(doo.get("ben_prenom"))} {v(doo.get("ben_nom"))}</td></tr>
      <tr><td class="label">رقم عقد الكراء</td><td>{v(rc.get("contract_number"))}</td></tr>
      <tr><td class="label">تاريخ تحرير العقد</td><td>{v(rc.get("contract_date"))}</td></tr>
      <tr><td class="label">تاريخ انتهاء العقد</td><td>{v(rc.get("end_date")) or "مفتوح"}</td></tr>
    </table>
    <div class="sign">
      <div class="sign-box"><div class="line">توقيع مقدم الطلب</div></div>
    </div>
    <div class="footer">{v(req["request_number"])} &#8212; {today}</div>
    </div>"""
    return Response(html_page("طلب تجديد وثائق الاستغلال", body), mimetype="text/html; charset=utf-8")


# ════════════════════════════════════════
# تغيير طبيعة النشاط
# ════════════════════════════════════════

@print_bp.route("/api/print/request-activity/<int:req_id>")
@require_auth
def print_request_activity(account, req_id):
    with get_db() as conn:
        if account.get("role") == "admin":
            req = conn.execute("SELECT * FROM requests WHERE id=?", (req_id,)).fetchone()
            if not req: return "الطلب غير موجود", 404
            driver_id = dict(req)["driver_id"]
        else:
            drv = conn.execute("SELECT id FROM drivers WHERE account_id=?", (account["id"],)).fetchone()
            if not drv: return "غير موجود", 404
            req = conn.execute("SELECT * FROM requests WHERE id=? AND driver_id=?", (req_id, drv["id"])).fetchone()
            if not req: return "الطلب غير موجود", 404
            driver_id = drv["id"]
        d, lic, veh, doo, act, rc, dep = drv_full(conn, driver_id)

    req = dict(req)
    today = (req.get("created_at") or datetime.now().strftime("%Y-%m-%d"))[:10]
    req_data = {}
    try: req_data = json.loads(req.get("request_data") or "{}")
    except: pass
    act_old = ACTIVITY_LABELS.get(req_data.get("activity_type_old",""), req_data.get("activity_type_old","&#8212;"))
    act_new = ACTIVITY_LABELS.get(req_data.get("activity_type_new",""), req_data.get("activity_type_new","&#8212;"))

    body = f"""<div class="doc">
    <div class="header"><h1>&#128661; طلب تغيير طبيعة النشاط</h1><p>DTW ELBAYADH -STT /DEV2026</p></div>
    <div class="badge">رقم الطلب: {v(req["request_number"])} &#8212; تاريخ التقديم: {today}</div>
    <table>
      <tr><td class="sep" colspan="2">&#128100; بيانات السائق مقدم الطلب</td></tr>
      <tr><td class="label">اللقب والاسم</td><td>{v(d.get("prenom_ar"))} {v(d.get("nom_ar"))}</td></tr>
      <tr><td class="label">NIN</td><td>{v(d.get("nin"))}</td></tr>
      <tr><td class="label">تاريخ الميلاد</td><td>{v(d.get("date_naissance"))}</td></tr>
      <tr><td class="label">مكان الميلاد</td><td>{v(d.get("lieu_naissance_ar"))}</td></tr>
      <tr><td class="label">الهاتف</td><td>{v(d.get("telephone"))}</td></tr>
      <tr><td class="label">العنوان</td><td>{v(d.get("adresse"))}</td></tr>
      <tr><td class="label">رقم رخصة السياقة</td><td>{v(lic.get("num_permis"))}</td></tr>
      <tr><td class="label">رقم الباب</td><td>{v(doo.get("door_number"))}</td></tr>
      <tr><td class="sep" colspan="2">&#128664; مواصفات المركبة</td></tr>
      <tr><td class="label">رقم التسجيل</td><td>{v(veh.get("num_immatriculation"))}</td></tr>
      <tr><td class="label">الصنف / الطراز</td><td>{v(veh.get("marque"))} &#8212; {v(veh.get("type_vehicule"))}</td></tr>
      <tr><td class="label">الرقم التسلسلي</td><td>{v(veh.get("num_serie"))}</td></tr>
      <tr><td class="label">عدد المقاعد</td><td>{v(veh.get("nb_places"))}</td></tr>
      <tr><td class="label">سنة الصنع</td><td>{v(veh.get("annee_circulation"))}</td></tr>
      <tr><td class="sep" colspan="2">&#128260; تغيير طبيعة النشاط</td></tr>
      <tr><td class="label">النشاط الحالي</td><td style="background:#fef3c7;font-weight:700;color:#92400e">{act_old}</td></tr>
      <tr><td class="label">النشاط الجديد المطلوب</td><td style="background:#d1fae5;font-weight:700;color:#065f46">{act_new}</td></tr>
      <tr><td class="label">ملاحظات</td><td>{req.get("notes") or "لا توجد ملاحظات"}</td></tr>
    </table>
    <div class="sign">
      <div class="sign-box"><div class="line">توقيع مقدم الطلب</div></div>
    </div>
    <div class="footer">{v(req["request_number"])} &#8212; {today}</div>
    </div>"""
    return Response(html_page("طلب تغيير طبيعة النشاط", body), mimetype="text/html; charset=utf-8")


# ════════════════════════════════════════
# نسخة المدير — طلب تغيير طبيعة النشاط
# ════════════════════════════════════════

@print_bp.route("/api/admin/print/request-activity/<int:req_id>")
@require_admin
def admin_print_request_activity(account, req_id):
    # نفس المحتوى لكن بتوثيق المدير — يمكن الطباعة من لوحة الإدارة
    with get_db() as conn:
        req = conn.execute("SELECT r.*, d.nom_ar, d.prenom_ar, d.nin, d.telephone, d.adresse, d.date_naissance, d.lieu_naissance_ar FROM requests r JOIN drivers d ON d.id=r.driver_id WHERE r.id=?", (req_id,)).fetchone()
        if not req: return "الطلب غير موجود", 404
        req = dict(req)
        driver_id = conn.execute("SELECT driver_id FROM requests WHERE id=?", (req_id,)).fetchone()["driver_id"]
        d, lic, veh, doo, act, rc, dep = drv_full(conn, driver_id)

    today = (req.get("created_at") or datetime.now().strftime("%Y-%m-%d"))[:10]
    req_data = {}
    try: req_data = json.loads(req.get("request_data") or "{}")
    except: pass
    act_old = ACTIVITY_LABELS.get(req_data.get("activity_type_old",""), req_data.get("activity_type_old","&#8212;"))
    act_new = ACTIVITY_LABELS.get(req_data.get("activity_type_new",""), req_data.get("activity_type_new","&#8212;"))

    body = f"""<div class="doc">
    <div class="header"><h1>&#128661; طلب تغيير طبيعة النشاط</h1><p>DTW ELBAYADH -STT /DEV2026</p></div>
    <div class="badge">رقم الطلب: {v(req["request_number"])} &#8212; تاريخ التقديم: {today}</div>
    <table>
      <tr><td class="sep" colspan="2">&#128100; بيانات السائق مقدم الطلب</td></tr>
      <tr><td class="label">اللقب والاسم</td><td>{v(d.get("prenom_ar"))} {v(d.get("nom_ar"))}</td></tr>
      <tr><td class="label">NIN</td><td>{v(d.get("nin"))}</td></tr>
      <tr><td class="label">تاريخ الميلاد</td><td>{v(d.get("date_naissance"))}</td></tr>
      <tr><td class="label">مكان الميلاد</td><td>{v(d.get("lieu_naissance_ar"))}</td></tr>
      <tr><td class="label">الهاتف</td><td>{v(d.get("telephone"))}</td></tr>
      <tr><td class="label">العنوان</td><td>{v(d.get("adresse"))}</td></tr>
      <tr><td class="label">رقم رخصة السياقة</td><td>{v(lic.get("num_permis"))}</td></tr>
      <tr><td class="label">رقم الباب</td><td>{v(doo.get("door_number"))}</td></tr>
      <tr><td class="sep" colspan="2">&#128664; مواصفات المركبة</td></tr>
      <tr><td class="label">رقم التسجيل</td><td>{v(veh.get("num_immatriculation"))}</td></tr>
      <tr><td class="label">الصنف / الطراز</td><td>{v(veh.get("marque"))} &#8212; {v(veh.get("type_vehicule"))}</td></tr>
      <tr><td class="label">الرقم التسلسلي</td><td>{v(veh.get("num_serie"))}</td></tr>
      <tr><td class="label">عدد المقاعد</td><td>{v(veh.get("nb_places"))}</td></tr>
      <tr><td class="label">سنة الصنع</td><td>{v(veh.get("annee_circulation"))}</td></tr>
      <tr><td class="sep" colspan="2">&#128260; تغيير طبيعة النشاط</td></tr>
      <tr><td class="label">النشاط الحالي</td><td style="background:#fef3c7;font-weight:700;color:#92400e">{act_old}</td></tr>
      <tr><td class="label">النشاط الجديد المطلوب</td><td style="background:#d1fae5;font-weight:700;color:#065f46">{act_new}</td></tr>
      <tr><td class="label">ملاحظات</td><td>{req.get("notes") or "لا توجد ملاحظات"}</td></tr>
    </table>
    <div class="sign">
      <div class="sign-box"><div class="line">توقيع مقدم الطلب</div></div>
    </div>
    <div class="footer">{v(req["request_number"])} &#8212; {today}</div>
    </div>"""
    return Response(html_page("طلب تغيير طبيعة النشاط", body), mimetype="text/html; charset=utf-8")


# ════════════════════════════════════════
# التوقف النهائي
# ════════════════════════════════════════

@print_bp.route("/api/print/request-stop-final/<int:req_id>")
@require_auth
def print_request_stop_final(account, req_id):
    with get_db() as conn:
        if account.get("role") == "admin":
            req = conn.execute("SELECT * FROM requests WHERE id=?", (req_id,)).fetchone()
            if not req: return "الطلب غير موجود", 404
            driver_id = dict(req)["driver_id"]
        else:
            drv = conn.execute("SELECT id FROM drivers WHERE account_id=?", (account["id"],)).fetchone()
            if not drv: return "غير موجود", 404
            req = conn.execute("SELECT * FROM requests WHERE id=? AND driver_id=?", (req_id, drv["id"])).fetchone()
            if not req: return "الطلب غير موجود", 404
            driver_id = drv["id"]
        d, lic, veh, doo, act, rc, dep = drv_full(conn, driver_id)
        if not doo or not doo.get("door_number"):
            doo = _last_door(conn, driver_id, dict(req).get("processed_at") or dict(req)["created_at"])

        # الأثر الفعلي يكون بتاريخ موافقة الإدارة — قبلها لا توجد عقود مفسوخة بسبب هذا الطلب
        _eff = dict(req)["processed_at"] if dict(req).get("statut") == "مقبول" else None
        # عقد الكراء المفسوخ (is_current=0, end_reason=توقف_نهائي) أو الأحدث منتهياً
        rc_term = conn.execute("""
            SELECT rc.*,
                   dl.door_number, dl.decision_number, dl.decision_date, dl.decision_type,
                   dl.decision_wilaya, dl.exploitation_commune,
                   b.nom_ar as ben_nom, b.prenom_ar as ben_prenom,
                   b.nin as ben_nin, b.sifa, b.adresse as ben_adresse,
                   b.date_naissance as ben_dob, b.lieu_naissance as ben_lieu,
                   b.num_document_cni as ben_cni_num, b.date_delivrance_cni as ben_cni_date
            FROM rental_contracts rc
            JOIN door_licenses dl ON dl.id = rc.door_license_id
            JOIN beneficiaries  b  ON b.id  = rc.beneficiary_id
            WHERE rc.driver_id=? AND rc.is_current=0
              AND rc.updated_at >= ? AND rc.updated_at <= datetime(?, '+1 minute')
            ORDER BY rc.updated_at DESC LIMIT 1
        """, (driver_id, _eff, _eff)).fetchone() if _eff else None

        # عقد المناوب المفسوخ
        dc_term = conn.execute("""
            SELECT dc.*,
                   d2.nom_ar, d2.prenom_ar, d2.nin, d2.telephone, d2.adresse,
                   dl2.num_permis, dl2.date_expiration,
                   veh2.num_immatriculation, veh2.marque,
                   door2.door_number,
                   dep.nom_ar as dep_nom, dep.prenom_ar as dep_prenom,
                   dep.nin as dep_nin, dep.telephone as dep_tel,
                   dep.num_permis as dep_permis, dep.date_expiration_permis as dep_exp
            FROM deputy_contracts dc
            JOIN drivers  d2   ON d2.id   = dc.driver_id
            JOIN deputies dep  ON dep.id  = dc.deputy_id
            LEFT JOIN driver_licenses dl2  ON dl2.driver_id=d2.id AND dl2.is_current=1
            LEFT JOIN vehicles veh2        ON veh2.driver_id=d2.id AND veh2.is_current=1
            LEFT JOIN door_licenses door2  ON door2.id = (
                SELECT id FROM door_licenses WHERE current_driver_id=d2.id AND is_active=1 LIMIT 1
            )
            WHERE dc.driver_id=? AND dc.is_current=0
              AND dc.updated_at >= ? AND dc.updated_at <= datetime(?, '+1 minute')
            ORDER BY dc.updated_at DESC LIMIT 1
        """, (driver_id, _eff, _eff)).fetchone() if _eff else None

    req    = dict(req)
    rct    = dict(rc_term) if rc_term else None
    dct    = dict(dc_term) if dc_term else None
    today = (req.get("created_at") or datetime.now().strftime("%Y-%m-%d"))[:10]

    # ─── وثيقة 1: طلب التوقف النهائي ───
    doc1 = f"""<div class="doc" style="page-break-after:always">
    <div class="header"><h1>&#128661; طلب التوقف النهائي عن النشاط</h1><p>DTW ELBAYADH -STT /DEV2026</p></div>
    <div class="danger">&#9940; توقف نهائي &#8212; رقم الطلب: {v(req["request_number"])}</div>
    <table>
      <tr><td class="sep" colspan="2">&#128100; بيانات السائق مقدم الطلب</td></tr>
      <tr><td class="label">اللقب والاسم</td><td>{v(d.get("prenom_ar"))} {v(d.get("nom_ar"))}</td></tr>
      <tr><td class="label">NIN</td><td>{v(d.get("nin"))}</td></tr>
      <tr><td class="label">تاريخ الميلاد</td><td>{v(d.get("date_naissance"))}</td></tr>
      <tr><td class="label">مكان الميلاد</td><td>{v(d.get("lieu_naissance_ar"))}</td></tr>
      <tr><td class="label">العنوان</td><td>{v(d.get("adresse"))}</td></tr>
      <tr><td class="label">الهاتف</td><td>{v(d.get("telephone"))}</td></tr>
      <tr><td class="label">رقم رخصة السياقة</td><td>{v(lic.get("num_permis"))}</td></tr>
      <tr><td class="label">رقم الباب</td><td>{v(doo.get("door_number"))}</td></tr>
      <tr><td class="label">طبيعة النشاط</td><td>{ACTIVITY_LABELS.get(act.get("activity_type","") if act else "", act.get("activity_type","&#8212;") if act else "&#8212;")}</td></tr>
      <tr><td class="sep" colspan="2">&#128664; مواصفات المركبة</td></tr>
      <tr><td class="label">رقم التسجيل</td><td>{v(veh.get("num_immatriculation"))}</td></tr>
      <tr><td class="label">الصنف / الطراز</td><td>{v(veh.get("marque"))} &#8212; {v(veh.get("type_vehicule"))}</td></tr>
      <tr><td class="label">الرقم التسلسلي</td><td>{v(veh.get("num_serie"))}</td></tr>
      <tr><td class="label">عدد المقاعد</td><td>{v(veh.get("nb_places"))}</td></tr>
      <tr><td class="label">سنة الصنع</td><td>{v(veh.get("annee_circulation"))}</td></tr>
      <tr><td class="sep-red" colspan="2">&#9940; بيانات التوقف النهائي</td></tr>
      <tr><td class="label">تاريخ تقديم الطلب</td><td>{(req.get("created_at") or "")[:16]}</td></tr>
      <tr><td class="label">تاريخ التوقف الفعلي</td><td>{(req.get("processed_at") or "")[:16] if req.get("statut")=="مقبول" else ("مرفوض من الإدارة" if req.get("statut")=="مرفوض" else "في انتظار موافقة الإدارة")}</td></tr>
      <tr><td class="label">السبب / الملاحظات</td><td>{req.get("notes") or "لا توجد ملاحظات"}</td></tr>
    </table>
    <div class="sign">
      <div class="sign-box"><div class="line">توقيع مقدم الطلب</div></div>
    </div>
    <div class="footer">{v(req["request_number"])} &#8212; {today}</div>
    </div>"""

    # ─── وثيقة 2: فسخ عقد الكراء (إن وجد) ───
    doc2 = ""
    if rct:
        wilaya = rct.get("decision_wilaya") or rct.get("exploitation_commune") or "&#8212;"
        terminate_date = (rct.get("end_date") or today)[:10]
        doc2 = f"""<div class="doc" style="page-break-after:always">
    <div class="header"><h1>&#128203; محضر فسخ عقد كراء رخصة استغلال</h1><p>محرر بتاريخ: {today}</p></div>
    <div class="danger">&#9888;&#65039; فسخ عقد الكراء &#8212; رقم العقد: {v(rct["contract_number"])}</div>
    <table>
      <tr><td class="sep" colspan="2">الطرف الأول &#8212; صاحب الرخصة (المستفيد)</td></tr>
      <tr><td class="label">الاسم واللقب</td><td>{v(rct["ben_prenom"])} {v(rct["ben_nom"])}</td></tr>
      <tr><td class="label">الصفة</td><td>{v(rct["sifa"])}</td></tr>
      <tr><td class="label">تاريخ ومكان الازدياد</td><td>{fmt_date(rct.get("ben_dob"))} &#8212; {v(rct.get("ben_lieu"))}</td></tr>
      <tr><td class="label">العنوان</td><td>{v(rct["ben_adresse"])}</td></tr>
      <tr><td class="label">NIN</td><td>{v(rct["ben_nin"])}</td></tr>
      <tr><td class="label">رقم بطاقة التعريف</td><td>{v(rct.get("ben_cni_num"))}</td></tr>
      <tr><td class="label">تاريخ إصدار البطاقة</td><td>{fmt_date(rct.get("ben_cni_date"))}</td></tr>
      <tr><td class="label">رقم الباب</td><td>{v(rct["door_number"])}</td></tr>
      <tr><td class="sep-red" colspan="2">الطرف الثاني &#8212; السائق المستأجر</td></tr>
      <tr><td class="label">الاسم واللقب</td><td>{v(d.get("prenom_ar"))} {v(d.get("nom_ar"))}</td></tr>
      <tr><td class="label">تاريخ ومكان الازدياد</td><td>{fmt_date(d.get("date_naissance"))} &#8212; {v(d.get("lieu_naissance_ar"))}</td></tr>
      <tr><td class="label">العنوان</td><td>{v(d.get("adresse"))}</td></tr>
      <tr><td class="label">NIN</td><td>{v(d.get("nin"))}</td></tr>
      <tr><td class="label">الهاتف</td><td>{v(d.get("telephone"))}</td></tr>
      <tr><td class="label">رقم رخصة السياقة</td><td>{v(lic.get("num_permis") if lic else None)}</td></tr>
      <tr><td class="sep" colspan="2">&#128196; بيانات القرار الولائي</td></tr>
      <tr><td class="label">رقم القرار</td><td>{v(rct.get("decision_number"))}</td></tr>
      <tr><td class="label">تاريخ القرار</td><td>{v(rct.get("decision_date"))}</td></tr>
      <tr><td class="label">نوع القرار</td><td>{v(rct.get("decision_type"))}</td></tr>
      <tr><td class="label">صادر عن والي ولاية</td><td>{wilaya}</td></tr>
      <tr><td class="sep-red" colspan="2">&#128203; بيانات الفسخ</td></tr>
      <tr><td class="label">رقم العقد المفسوخ</td><td>{v(rct["contract_number"])}</td></tr>
      <tr><td class="label">تاريخ تحرير العقد</td><td>{v(rct["contract_date"])}</td></tr>
      <tr><td class="label">تاريخ الفسخ</td><td>{terminate_date}</td></tr>
      <tr><td class="label">سبب الفسخ</td><td>{v(rct.get("end_reason"))}</td></tr>
    </table>
    <div class="sign">
      <div class="sign-box"><div class="line">توقيع الطرف الأول (صاحب الرخصة)</div></div>
      <div class="sign-box"><div class="line">توقيع الطرف الثاني (السائق)</div></div>
    </div>
    <div class="footer">{v(rct["contract_number"])} &#8212; فسخ عقد الكراء &#8212; {today}</div>
    </div>"""

    # ─── وثيقة 3: فسخ عقد المناوب (إن وجد) ───
    doc3 = ""
    if dct:
        doc3 = f"""<div class="doc">
    <div class="header"><h1>&#128203; محضر فسخ عقد عمل سائق مناوب</h1><p>محرر بتاريخ: {today}</p></div>
    <div class="danger">&#9888;&#65039; فسخ عقد المناوب &#8212; رقم العقد: {v(dct["contract_number"])}</div>
    <table>
      <tr><td class="sep" colspan="2">الطرف الأول &#8212; صاحب العمل (السائق الأصلي)</td></tr>
      <tr><td class="label">الاسم واللقب</td><td>{v(dct["prenom_ar"])} {v(dct["nom_ar"])}</td></tr>
      <tr><td class="label">NIN</td><td>{v(dct["nin"])}</td></tr>
      <tr><td class="label">الهاتف</td><td>{v(dct["telephone"])}</td></tr>
      <tr><td class="label">رقم رخصة السياقة</td><td>{v(dct["num_permis"])}</td></tr>
      <tr><td class="label">رقم الباب</td><td>{v(dct["door_number"])}</td></tr>
      <tr><td class="label">رقم التسجيل</td><td>{v(dct["num_immatriculation"])} &#8212; {v(dct["marque"])}</td></tr>
      <tr><td class="sep-red" colspan="2">الطرف الثاني &#8212; السائق المناوب</td></tr>
      <tr><td class="label">الاسم واللقب</td><td>{v(dct["dep_prenom"])} {v(dct["dep_nom"])}</td></tr>
      <tr><td class="label">NIN</td><td>{v(dct["dep_nin"])}</td></tr>
      <tr><td class="label">الهاتف</td><td>{v(dct["dep_tel"])}</td></tr>
      <tr><td class="label">رقم رخصة السياقة</td><td>{v(dct["dep_permis"])}</td></tr>
      <tr><td class="label">تاريخ انتهاء الرخصة</td><td>{v(dct["dep_exp"])}</td></tr>
      <tr><td class="sep-red" colspan="2">&#128203; بيانات الفسخ</td></tr>
      <tr><td class="label">رقم العقد المفسوخ</td><td>{v(dct["contract_number"])}</td></tr>
      <tr><td class="label">تاريخ إبرام العقد</td><td>{v(dct["contract_date"])}</td></tr>
      <tr><td class="label">تاريخ الفسخ</td><td>{(dct.get("end_date") or today)[:10]}</td></tr>
      <tr><td class="label">سبب الفسخ</td><td>{v(dct.get("end_reason"))}</td></tr>
    </table>
    <div class="sign">
      <div class="sign-box"><div class="line">توقيع الطرف الأول (صاحب العمل)</div></div>
      <div class="sign-box"><div class="line">توقيع الطرف الثاني (المناوب)</div></div>
    </div>
    <div class="footer">{v(dct["contract_number"])} &#8212; فسخ عقد المناوب &#8212; {today}</div>
    </div>"""

    page_break_css = """<style>
/* ═══ تجاوز CSS الموحد لصفحة الوثائق المتعددة ═══
   الهدف: كل وثيقة في صفحة A4 مستقلة بدون تمدد أو تقليص تلقائي.
   نلغي display:flex و min-height الموروثَين من STYLE العام،
   ونضغط الخطوط والمسافات لضمان ملاءمة أطول وثيقة (فسخ عقد الكراء).
*/
@media print {
  @page { size: A4 portrait; margin: 8mm 10mm; }

  /* إلغاء flex للجسم وإعادة التدفق الطبيعي */
  body {
    display: block !important;
    background: #fff !important;
    padding: 0 !important;
  }

  /* كل وثيقة تأخذ صفحة كاملة ثم كسر */
  .doc {
    display: block !important;          /* إلغاء flex-direction:column الموروث */
    min-height: auto !important;        /* إلغاء min-height:calc(297mm-20mm) */
    width: 100% !important;
    max-width: 100% !important;
    box-sizing: border-box !important;
    padding: 14px 18px !important;
    margin: 0 !important;
    border: 2px solid #125950 !important;
    border-radius: 6px !important;
    page-break-after: always !important;
    break-after: page !important;
    page-break-inside: avoid !important;  /* لا نقطع الوثيقة في منتصفها */
    break-inside: avoid !important;
  }

  /* الوثيقة الأخيرة: لا كسر بعدها */
  .doc:last-of-type {
    page-break-after: avoid !important;
    break-after: avoid !important;
  }

  /* ضغط الرأسية */
  .header { padding-bottom: 8px !important; margin-bottom: 12px !important; }
  .header h1 { font-size: 14px !important; }
  .header p  { font-size: 10px !important; margin-top: 2px !important; }

  /* ضغط الشارة الحمراء */
  .danger { padding: 5px !important; margin-bottom: 10px !important; font-size: 11px !important; }

  /* ضغط الجدول */
  table { margin-bottom: 10px !important; }
  td { padding: 5px 7px !important; font-size: 11px !important; border-bottom: 1px solid #dce2de !important; }
  td.sep, td.sep-warn, td.sep-red { padding: 5px 7px !important; font-size: 11px !important; }
  td.label { width: 38% !important; }

  /* ضغط قسم التوقيع */
  .sign { margin-top: 14px !important; }
  .sign-box .line { margin-top: 28px !important; font-size: 11px !important; padding-top: 4px !important; }

  /* الذيل */
  .footer { margin-top: 10px !important; font-size: 10px !important; }

  /* إخفاء زر الطباعة */
  .btn { display: none !important; }
}
</style>"""
    body = page_break_css + doc1 + doc2 + doc3
    return Response(html_page("التوقف النهائي — وثائق الفسخ", body), mimetype="text/html; charset=utf-8")


# ════════════════════════════════════════
# التوقف المؤقت
# ════════════════════════════════════════

@print_bp.route("/api/print/request-stop-temp/<int:req_id>")
@require_auth
def print_request_stop_temp(account, req_id):
    with get_db() as conn:
        if account.get("role") == "admin":
            req = conn.execute("SELECT * FROM requests WHERE id=?", (req_id,)).fetchone()
            if not req: return "الطلب غير موجود", 404
            driver_id = dict(req)["driver_id"]
        else:
            drv = conn.execute("SELECT id FROM drivers WHERE account_id=?", (account["id"],)).fetchone()
            if not drv: return "غير موجود", 404
            req = conn.execute("SELECT * FROM requests WHERE id=? AND driver_id=?", (req_id, drv["id"])).fetchone()
            if not req: return "الطلب غير موجود", 404
            driver_id = drv["id"]
        d, lic, veh, doo, act, rc, dep = drv_full(conn, driver_id)
        if not doo or not doo.get("door_number"):
            doo = _last_door(conn, driver_id, dict(req).get("processed_at") or dict(req)["created_at"])

    req = dict(req)
    today = (req.get("created_at") or datetime.now().strftime("%Y-%m-%d"))[:10]
    body = f"""<div class="doc">
    <div class="header"><h1>&#128661; طلب التوقف المؤقت عن النشاط</h1><p>DTW ELBAYADH -STT /DEV2026</p></div>
    <div class="warn">&#9208;&#65039; توقف مؤقت &#8212; رقم الطلب: {v(req["request_number"])}</div>
    <table>
      <tr><td class="sep" colspan="2">&#128100; بيانات السائق مقدم الطلب</td></tr>
      <tr><td class="label">اللقب والاسم</td><td>{v(d.get("prenom_ar"))} {v(d.get("nom_ar"))}</td></tr>
      <tr><td class="label">NIN</td><td>{v(d.get("nin"))}</td></tr>
      <tr><td class="label">العنوان</td><td>{v(d.get("adresse"))}</td></tr>
      <tr><td class="label">الهاتف</td><td>{v(d.get("telephone"))}</td></tr>
      <tr><td class="label">رقم رخصة السياقة</td><td>{v(lic.get("num_permis"))}</td></tr>
      <tr><td class="label">رقم الباب</td><td>{v(doo.get("door_number"))}</td></tr>
      <tr><td class="label">رقم التسجيل</td><td>{v(veh.get("num_immatriculation"))}</td></tr>
      <tr><td class="sep-warn" colspan="2">&#9208;&#65039; بيانات التوقف المؤقت</td></tr>
      <tr><td class="label">تاريخ تقديم الطلب</td><td>{(req.get("created_at") or "")[:16]}</td></tr>
      <tr><td class="label">تاريخ التوقف الفعلي</td><td>{(req.get("processed_at") or "")[:16] if req.get("statut")=="مقبول" else ("مرفوض من الإدارة" if req.get("statut")=="مرفوض" else "في انتظار موافقة الإدارة")}</td></tr>
      <tr><td class="label">السبب / الملاحظات</td><td>{req.get("notes") or "لا توجد ملاحظات"}</td></tr>
    </table>
    <div class="sign">
      <div class="sign-box"><div class="line">توقيع مقدم الطلب</div></div>
    </div>
    <div class="footer">{v(req["request_number"])} &#8212; {today}</div>
    </div>"""
    return Response(html_page("طلب التوقف المؤقت", body), mimetype="text/html; charset=utf-8")


# ════════════════════════════════════════
# استئناف النشاط
# ════════════════════════════════════════

@print_bp.route("/api/print/request-resume/<int:req_id>")
@require_auth
def print_request_resume(account, req_id):
    with get_db() as conn:
        if account.get("role") == "admin":
            req = conn.execute("SELECT * FROM requests WHERE id=?", (req_id,)).fetchone()
            if not req: return "الطلب غير موجود", 404
            driver_id = dict(req)["driver_id"]
        else:
            drv = conn.execute("SELECT id FROM drivers WHERE account_id=?", (account["id"],)).fetchone()
            if not drv: return "غير موجود", 404
            req = conn.execute("SELECT * FROM requests WHERE id=? AND driver_id=?", (req_id, drv["id"])).fetchone()
            if not req: return "الطلب غير موجود", 404
            driver_id = drv["id"]
        d, lic, veh, doo, act, rc, dep = drv_full(conn, driver_id)
        if not doo or not doo.get("door_number"):
            doo = _last_door(conn, driver_id, dict(req).get("processed_at") or dict(req)["created_at"])
        # آخر توقف قبل هذا الطلب تحديداً (من جدول الطلبات — مصدر موثوق بتاريخ التقديم)
        last_stop = conn.execute("""
            SELECT COALESCE(processed_at, created_at) AS date_start, request_type AS status_type FROM requests
            WHERE driver_id=? AND request_type IN ('توقف_مؤقت','توقف_نهائي') AND statut='مقبول' AND id < ?
            ORDER BY id DESC LIMIT 1
        """, (driver_id, req_id)).fetchone()

    req = dict(req)
    ls  = dict(last_stop) if last_stop else {}
    if ls.get("status_type"):
        ls["status_type"] = ls["status_type"].replace("_", " ")
    today = (req.get("created_at") or datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    body = f"""<div class="doc">
    <div class="header"><h1>&#128661; طلب استئناف النشاط</h1><p>DTW ELBAYADH -STT /DEV2026</p></div>
    <div class="badge">&#9989; استئناف النشاط &#8212; رقم الطلب: {v(req["request_number"])}</div>
    <table>
      <tr><td class="sep" colspan="2">&#128100; بيانات السائق مقدم الطلب</td></tr>
      <tr><td class="label">اللقب والاسم</td><td>{v(d.get("prenom_ar"))} {v(d.get("nom_ar"))}</td></tr>
      <tr><td class="label">NIN</td><td>{v(d.get("nin"))}</td></tr>
      <tr><td class="label">العنوان</td><td>{v(d.get("adresse"))}</td></tr>
      <tr><td class="label">الهاتف</td><td>{v(d.get("telephone"))}</td></tr>
      <tr><td class="label">رقم رخصة السياقة</td><td>{v(lic.get("num_permis"))}</td></tr>
      <tr><td class="label">رقم الباب</td><td>{v(doo.get("door_number"))}</td></tr>
      <tr><td class="label">رقم التسجيل</td><td>{v(veh.get("num_immatriculation"))}</td></tr>
      <tr><td class="sep" colspan="2">&#9654;&#65039; بيانات الاستئناف</td></tr>
      <tr><td class="label">تاريخ آخر توقف</td><td>{v(ls.get("date_start"))}</td></tr>
      <tr><td class="label">نوع آخر توقف</td><td>{v(ls.get("status_type"))}</td></tr>
      <tr><td class="label">تاريخ تقديم الطلب</td><td>{(req.get("created_at") or "")[:16]}</td></tr>
      <tr><td class="label">تاريخ الاستئناف الفعلي</td><td>{(req.get("processed_at") or "")[:16] if req.get("statut")=="مقبول" else ("مرفوض من الإدارة" if req.get("statut")=="مرفوض" else "في انتظار موافقة الإدارة")}</td></tr>
      <tr><td class="label">ملاحظات</td><td>{req.get("notes") or "لا توجد ملاحظات"}</td></tr>
    </table>
    <div class="sign">
      <div class="sign-box"><div class="line">توقيع مقدم الطلب</div></div>
    </div>
    <div class="footer">{v(req["request_number"])} &#8212; {today}</div>
    </div>"""
    return Response(html_page("طلب استئناف النشاط", body), mimetype="text/html; charset=utf-8")


# ════════════════════════════════════════
# فسخ عقد الكراء
# ════════════════════════════════════════

@print_bp.route("/api/print/rental-contract-termination/<int:contract_id>")
@require_auth
def print_rental_contract_termination(account, contract_id):
    with get_db() as conn:
        driver = conn.execute("SELECT id FROM drivers WHERE account_id=?", (account["id"],)).fetchone()
        if not driver: return "غير موجود", 404
        rc = conn.execute("""
            SELECT rc.*,
                   dl.door_number, dl.decision_number, dl.decision_date, dl.decision_type,
                   dl.decision_wilaya, dl.exploitation_commune,
                   b.nom_ar as ben_nom, b.prenom_ar as ben_prenom,
                   b.nin as ben_nin, b.sifa, b.adresse as ben_adresse,
                   b.date_naissance as ben_dob, b.lieu_naissance as ben_lieu,
                   b.num_document_cni as ben_cni_num, b.date_delivrance_cni as ben_cni_date,
                   d.nom_ar, d.prenom_ar, d.nin, d.telephone, d.adresse,
                   d.date_naissance as drv_dob, d.lieu_naissance_ar as drv_lieu,
                   dl2.num_permis, dl2.date_delivrance as drv_permis_date
            FROM rental_contracts rc
            JOIN door_licenses dl  ON dl.id  = rc.door_license_id
            JOIN beneficiaries b   ON b.id   = rc.beneficiary_id
            JOIN drivers d         ON d.id   = rc.driver_id
            LEFT JOIN driver_licenses dl2 ON dl2.driver_id=d.id AND dl2.is_current=1
            WHERE rc.id=? AND rc.driver_id=?
        """, (contract_id, driver["id"])).fetchone()
        if not rc: return "العقد غير موجود", 404

    rc = dict(rc)
    today_str = datetime.now().strftime("%Y-%m-%d")
    terminate_date = (rc.get("end_date") or today_str)[:10]
    wilaya = rc.get("decision_wilaya") or rc.get("exploitation_commune") or "&#8212;"
    body = f"""<div class="doc">
    <div class="header"><h1>&#128661; محضر فسخ عقد كراء رخصة استغلال سيارة أجرة</h1><p>محرر بتاريخ: {today_str}</p></div>
    <div class="danger">&#9888;&#65039; وثيقة فسخ عقد الكراء &#8212; رقم العقد: {v(rc["contract_number"])}</div>
    <table>
      <tr><td class="sep" colspan="2">الطرف الأول &#8212; صاحب الرخصة (المستفيد)</td></tr>
      <tr><td class="label">الاسم واللقب</td><td>{v(rc["ben_prenom"])} {v(rc["ben_nom"])}</td></tr>
      <tr><td class="label">الصفة</td><td>{v(rc["sifa"])}</td></tr>
      <tr><td class="label">تاريخ ومكان الازدياد</td><td>{fmt_date(rc.get("ben_dob"))} &#8212; {v(rc.get("ben_lieu"))}</td></tr>
      <tr><td class="label">العنوان</td><td>{v(rc["ben_adresse"])}</td></tr>
      <tr><td class="label">NIN</td><td>{v(rc["ben_nin"])}</td></tr>
      <tr><td class="label">رقم بطاقة التعريف</td><td>{v(rc.get("ben_cni_num"))}</td></tr>
      <tr><td class="label">تاريخ إصدار البطاقة</td><td>{fmt_date(rc.get("ben_cni_date"))}</td></tr>
      <tr><td class="label">رقم الباب</td><td>{v(rc["door_number"])}</td></tr>
      <tr><td class="sep-red" colspan="2">الطرف الثاني &#8212; السائق المستأجر</td></tr>
      <tr><td class="label">الاسم واللقب</td><td>{v(rc["prenom_ar"])} {v(rc["nom_ar"])}</td></tr>
      <tr><td class="label">تاريخ ومكان الازدياد</td><td>{fmt_date(rc.get("drv_dob"))} &#8212; {v(rc.get("drv_lieu"))}</td></tr>
      <tr><td class="label">العنوان</td><td>{v(rc["adresse"])}</td></tr>
      <tr><td class="label">NIN</td><td>{v(rc["nin"])}</td></tr>
      <tr><td class="label">الهاتف</td><td>{v(rc["telephone"])}</td></tr>
      <tr><td class="label">رقم رخصة السياقة</td><td>{v(rc["num_permis"])}</td></tr>
      <tr><td class="label">تاريخ رخصة السياقة</td><td>{fmt_date(rc.get("drv_permis_date"))}</td></tr>
      <tr><td class="sep" colspan="2">&#128196; بيانات القرار الولائي</td></tr>
      <tr><td class="label">رقم القرار</td><td>{v(rc.get("decision_number"))}</td></tr>
      <tr><td class="label">تاريخ القرار</td><td>{v(rc.get("decision_date"))}</td></tr>
      <tr><td class="label">نوع القرار</td><td>{v(rc.get("decision_type"))}</td></tr>
      <tr><td class="label">صادر عن والي ولاية</td><td>{wilaya}</td></tr>
      <tr><td class="sep-red" colspan="2">&#128203; بيانات الفسخ</td></tr>
      <tr><td class="label">رقم العقد المفسوخ</td><td>{v(rc["contract_number"])}</td></tr>
      <tr><td class="label">تاريخ تحرير العقد</td><td>{v(rc["contract_date"])}</td></tr>
      <tr><td class="label">تاريخ الفسخ</td><td>{terminate_date}</td></tr>
      <tr><td class="label">سبب الفسخ</td><td>{v(rc.get("end_reason"))}</td></tr>
    </table>
    <div class="sign">
      <div class="sign-box"><div class="line">توقيع الطرف الأول (صاحب الرخصة)</div></div>
      <div class="sign-box"><div class="line">توقيع الطرف الثاني (السائق)</div></div>
    </div>
    <div class="footer">{v(rc["contract_number"])} &#8212; فسخ عقد الكراء &#8212; {today_str}</div>
    </div>"""

    # ضغط الصفحة لتتسع في ورقة واحدة عند الطباعة
    compact_css = """<style>
@media print {
  @page { size: A4 portrait; margin: 8mm 10mm; }
  body  { padding: 0 !important; background: #fff !important; }
  .doc  { padding: 10px !important; border: none !important; max-width: 100% !important; }
  .header { padding-bottom: 6px !important; margin-bottom: 8px !important; }
  .header h1 { font-size: 13px !important; }
  .header p  { font-size: 10px !important; margin-top: 2px !important; }
  .danger { padding: 4px 8px !important; font-size: 11px !important; margin-bottom: 8px !important; }
  table  { margin-bottom: 6px !important; }
  td     { padding: 3px 6px !important; font-size: 10px !important; }
  td.sep, td.sep-warn, td.sep-red { padding: 3px 6px !important; font-size: 10px !important; }
  td.label { font-size: 10px !important; }
  .sign  { margin-top: 10px !important; }
  .sign-box .line { margin-top: 20px !important; font-size: 10px !important; }
  .footer { font-size: 9px !important; margin-top: 6px !important; }
}
</style>"""
    body = compact_css + body

    return Response(html_page("فسخ عقد كراء الرخصة", body), mimetype="text/html; charset=utf-8")


# ════════════════════════════════════════
# فسخ عقد المناوب (قديم)
# ════════════════════════════════════════

@print_bp.route("/api/print/deputy-termination/<int:driver_id_param>")
@require_auth
def print_deputy_termination(account, driver_id_param):
    with get_db() as conn:
        driver = conn.execute("SELECT id FROM drivers WHERE account_id=?", (account["id"],)).fetchone()
        if not driver or driver["id"] != driver_id_param: return "غير مصرح", 403
        dc = conn.execute("""
            SELECT dc.*, d.nom_ar, d.prenom_ar, d.nin,
                   dep.nom_ar as dep_nom, dep.prenom_ar as dep_prenom, dep.nin as dep_nin
            FROM deputy_contracts dc
            JOIN drivers d    ON d.id   = dc.driver_id
            JOIN deputies dep ON dep.id = dc.deputy_id
            WHERE dc.driver_id=? AND dc.is_current=0
            ORDER BY dc.updated_at DESC LIMIT 1
        """, (driver["id"],)).fetchone()
        if not dc: return "لا يوجد عقد منتهٍ", 404

    dc = dict(dc)
    body = f"""<div class="doc">
    <div class="header"><h1>&#128661; وثيقة فسخ عقد عمل السائق المناوب</h1><p>محررة بتاريخ: {datetime.now().strftime("%Y-%m-%d")}</p></div>
    <table>
      <tr><td class="sep" colspan="2">الطرف الأول &#8212; صاحب العمل</td></tr>
      <tr><td class="label">الاسم واللقب</td><td>{v(dc["prenom_ar"])} {v(dc["nom_ar"])}</td></tr>
      <tr><td class="label">NIN</td><td>{v(dc["nin"])}</td></tr>
      <tr><td class="sep" colspan="2">الطرف الثاني &#8212; المناوب</td></tr>
      <tr><td class="label">الاسم واللقب</td><td>{v(dc["dep_prenom"])} {v(dc["dep_nom"])}</td></tr>
      <tr><td class="label">NIN</td><td>{v(dc["dep_nin"])}</td></tr>
      <tr><td class="sep" colspan="2">&#128203; بيانات الفسخ</td></tr>
      <tr><td class="label">رقم العقد الأصلي</td><td>{v(dc["contract_number"])}</td></tr>
      <tr><td class="label">تاريخ إبرام العقد</td><td>{v(dc["contract_date"])}</td></tr>
      <tr><td class="label">تاريخ الفسخ</td><td>{v(dc["end_date"])}</td></tr>
      <tr><td class="label">سبب الفسخ</td><td>{v(dc["end_reason"])}</td></tr>
    </table>
    <div class="sign">
      <div class="sign-box"><div class="line">توقيع الطرف الأول</div></div>
      <div class="sign-box"><div class="line">توقيع الطرف الثاني</div></div>
    </div>
    </div>"""
    return Response(html_page("وثيقة فسخ عقد المناوب", body), mimetype="text/html; charset=utf-8")


# ════════════════════════════════════════
# شهادة إدارية — سائق سيارة الأجرة
# GET /api/print/admin-cert-driver
# ════════════════════════════════════════

def _dmy(val):
    s = str(val or "").strip()[:10]
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", s)
    return f"{m.group(3)}/{m.group(2)}/{m.group(1)}" if m else s


def _request_letter(title, sender_rows, body_html, info_rows, purpose, today_str):
    """طلب خطّي رسمي يقدّمه المعني للإدارة (وليس شهادة صادرة عنها)."""
    import html as _h
    purpose = (purpose or "").strip()
    # الغرض اختياري: إن لم يُذكر تُحذف عبارة «وذلك لغرض» وتُختم الجملة بنقطة
    purpose_tail = (f" وذلك لغرض: <strong>{_h.escape(purpose)}</strong>." if purpose else "")
    if not purpose:
        body_html = body_html.rstrip().rstrip("،,").rstrip() + "."
    d10 = datetime.strptime(today_str, "%Y-%m-%d").strftime("%d/%m/%Y")
    sender = "".join(f"<div><span style='color:#374151'>{k}:</span> <strong>{val}</strong></div>" for k, val in sender_rows)
    info = "".join(f"<tr><td class='label'>{k}</td><td>{val}</td></tr>" for k, val in info_rows)
    return f"""<div class="doc" style="font-size:14px;line-height:2">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:20px;margin-bottom:26px">
      <div style="font-size:13.5px;line-height:1.9">{sender}</div>
      <div style="font-size:13.5px;white-space:nowrap">البيض في: <strong dir="ltr">{d10}</strong></div>
    </div>
    <div style="text-align:center;font-size:15px;font-weight:700;margin-bottom:6px">إلى السيد: مدير النقل لولاية البيض</div>
    <div style="margin:22px 0 18px;font-size:15px"><strong style="text-decoration:underline">الموضوع:</strong> {title}</div>
    <div style="text-indent:28px;text-align:justify">{body_html}{purpose_tail}</div>
    <div style="margin:18px 0 6px;font-weight:700;font-size:13.5px">وإليكم المعلومات الخاصة بي:</div>
    <table>{info}</table>
    <div style="text-indent:28px;margin-top:18px">وفي انتظار ردّكم الإيجابي، تقبّلوا منّي سيدي المدير فائق عبارات التقدير والاحترام.</div>
    <div style="display:flex;justify-content:flex-start;margin-top:30px">
      <div style="text-align:center;min-width:220px;margin-right:auto">
        <div style="font-weight:700">إمضاء المعني</div>
        <div style="height:70px"></div>
      </div>
    </div>
    <div class="footer">طلب شهادة إدارية &#8212; {d10}</div>
    </div>"""


@print_bp.route("/api/print/admin-cert-driver")
@require_auth
def print_admin_cert_driver(account):
    with get_db() as conn:
        driver = conn.execute("SELECT * FROM drivers WHERE account_id=?", (account["id"],)).fetchone()
        if not driver:
            return "السائق غير موجود", 404
        d, lic, veh, doo, act, rc, dep = drv_full(conn, driver["id"])

    today_str = datetime.now().strftime("%Y-%m-%d")
    act_label = ACTIVITY_LABELS.get(act.get("activity_type", ""), act.get("activity_type", ""))
    name = f"{v(d.get('nom_ar'))} {v(d.get('prenom_ar'))}"
    body = (f"أنا الممضي أسفله السيد <strong>{name}</strong>، سائق سيارة أجرة "
            f"(<strong>{act_label or '&#8212;'}</strong>) بموجب رقم الباب <strong>{v(doo.get('door_number'))}</strong>، "
            f"يشرّفني أن أتقدّم إلى سيادتكم بطلبي هذا والمتمثّل في منحي <strong>شهادة إدارية بمثابة شهادة عمل</strong> "
            f"تثبت مزاولتي لنشاط النقل بواسطة سيارة الأجرة،")
    info = [
        ("اللقب والاسم", name),
        ("تاريخ ومكان الميلاد", f"{_dmy(d.get('date_naissance')) or '&#8212;'} ب{v(d.get('lieu_naissance_ar'))}"),
        ("رقم التعريف الوطني", v(d.get('nin'))),
        ("رقم رخصة السياقة", v(lic.get('num_permis'))),
        ("رقم الباب", v(doo.get('door_number'))),
        ("نمط النشاط", act_label or "&#8212;"),
        ("المركبة", f"{v(veh.get('num_immatriculation'))} &#8212; {v(veh.get('marque'))}"),
    ]
    sender = [("اللقب والاسم", name), ("العنوان", v(d.get('adresse'))), ("الهاتف", v(d.get('telephone')))]
    html_body = _request_letter("طلب شهادة إدارية", sender, body, info, request.args.get("purpose"), today_str)
    return Response(html_page("طلب شهادة إدارية — سائق", html_body), mimetype="text/html; charset=utf-8")


# ════════════════════════════════════════
# طلب شهادة إدارية — سائق مناوب (يقدّمه المناوب)
# GET /api/print/admin-cert-deputy
# ════════════════════════════════════════

@print_bp.route("/api/print/admin-cert-deputy")
@require_auth
def print_admin_cert_deputy(account):
    with get_db() as conn:
        driver = conn.execute("SELECT * FROM drivers WHERE account_id=?", (account["id"],)).fetchone()
        if not driver:
            return "السائق غير موجود", 404
        d, lic, veh, doo, act, rc, dep = drv_full(conn, driver["id"])
        dc = conn.execute("SELECT * FROM deputy_contracts WHERE driver_id=? AND is_current=1", (driver["id"],)).fetchone()
        dc = dict(dc) if dc else {}

    today_str = datetime.now().strftime("%Y-%m-%d")
    act_label = ACTIVITY_LABELS.get(act.get("activity_type", ""), act.get("activity_type", ""))
    dep_name = f"{v(dep.get('nom_ar'))} {v(dep.get('prenom_ar'))}"
    owner = f"{v(d.get('nom_ar'))} {v(d.get('prenom_ar'))}"
    body = (f"أنا الممضي أسفله السيد <strong>{dep_name}</strong>، أعمل سائقاً مناوباً لدى السيد <strong>{owner}</strong> "
            f"صاحب رقم الباب <strong>{v(doo.get('door_number'))}</strong> بموجب عقد العمل رقم <strong>{v(dc.get('contract_number'))}</strong>، "
            f"يشرّفني أن أتقدّم إلى سيادتكم بطلبي هذا والمتمثّل في منحي <strong>شهادة إدارية بمثابة شهادة عمل</strong> "
            f"تثبت عملي كسائق مناوب في نشاط النقل بواسطة سيارة الأجرة،")
    info = [
        ("اللقب والاسم", dep_name),
        ("تاريخ ومكان الميلاد", f"{_dmy(dep.get('date_naissance')) or '&#8212;'} ب{v(dep.get('lieu_naissance'))}"),
        ("رقم التعريف الوطني", v(dep.get('nin'))),
        ("رقم رخصة السياقة", v(dep.get('num_permis'))),
        ("صاحب العمل", owner),
        ("رقم الباب", v(doo.get('door_number'))),
        ("المركبة", f"{v(veh.get('num_immatriculation'))} &#8212; {v(veh.get('marque'))}"),
        ("عقد العمل", f"{v(dc.get('contract_number'))} (إلى {_dmy(dc.get('end_date')) or '&#8212;'})"),
    ]
    sender = [("اللقب والاسم", dep_name), ("العنوان", v(dep.get('adresse'))), ("الهاتف", v(dep.get('telephone')))]
    html_body = _request_letter("طلب شهادة إدارية", sender, body, info, request.args.get("purpose"), today_str)
    return Response(html_page("طلب شهادة إدارية — مناوب", html_body), mimetype="text/html; charset=utf-8")


# ════════════════════════════════════════
# الشهادة الإدارية (بمثابة شهادة عمل) — تحرّرها الإدارة
# GET /api/admin/print/work-cert/<driver_id>?kind=driver|deputy
# ════════════════════════════════════════
@print_bp.route("/api/admin/print/work-cert/<int:target_driver_id>")
@require_admin
def print_work_certificate(account, target_driver_id):
    kind = "deputy" if request.args.get("kind") == "deputy" else "driver"
    with get_db() as conn:
        drv = conn.execute("SELECT * FROM drivers WHERE id=?", (target_driver_id,)).fetchone()
        if not drv:
            return "السائق غير موجود", 404
        d, lic, veh, doo, act, rc, dep = drv_full(conn, target_driver_id)
        first_act = conn.execute("SELECT MIN(date_start) FROM activity_history WHERE driver_id=?", (target_driver_id,)).fetchone()[0]
        stop = conn.execute("""SELECT status_type, date_start FROM status_history WHERE driver_id=? AND date_end IS NULL
                               ORDER BY id DESC LIMIT 1""", (target_driver_id,)).fetchone()
        dc = conn.execute("SELECT * FROM deputy_contracts WHERE driver_id=? AND is_current=1", (target_driver_id,)).fetchone()
        dc = dict(dc) if dc else {}
    today = datetime.now().strftime("%Y-%m-%d")
    act_label = ACTIVITY_LABELS.get(act.get("activity_type", ""), act.get("activity_type", "")) or "نقل الأشخاص"
    owner = f"{v(d.get('nom_ar'))} {v(d.get('prenom_ar'))}"
    door = v(doo.get("door_number"))
    stopped = d.get("statut") in ("توقف_مؤقت", "توقف_نهائي")
    if kind == "deputy":
        if not dep or not dc:
            return Response("<p dir=rtl style='font-family:sans-serif;padding:30px'>⚠️ لا يوجد سائق مناوب بعقد عمل ساري لهذا السائق.</p>",
                            mimetype="text/html; charset=utf-8")
        name = f"{v(dep.get('nom_ar'))} {v(dep.get('prenom_ar'))}"
        born = f"{_dmy(dep.get('date_naissance')) or '&#8212;'} ب{v(dep.get('lieu_naissance'))}"
        nin, permis = v(dep.get("nin")), v(dep.get("num_permis"))
        core = (f"يعمل <strong>سائقاً مناوباً</strong> لدى السيد <strong>{owner}</strong> صاحب رقم الباب <strong>{door}</strong>، "
                f"في نشاط النقل بواسطة سيارة الأجرة (<strong>{act_label}</strong>)، بالمركبة ذات رقم التسجيل "
                f"<strong dir='ltr'>{v(veh.get('num_immatriculation'))}</strong>، بموجب عقد العمل رقم <strong>{v(dc.get('contract_number'))}</strong> "
                f"الساري من <strong>{_dmy(dc.get('contract_date'))}</strong> إلى <strong>{_dmy(dc.get('end_date'))}</strong>.")
    else:
        name = owner
        born = f"{_dmy(d.get('date_naissance')) or '&#8212;'} ب{v(d.get('lieu_naissance_ar'))}"
        nin, permis = v(d.get("nin")), v(lic.get("num_permis"))
        since = _dmy(first_act or d.get("created_at"))
        if stopped and stop:
            core = (f"مارس نشاط النقل بواسطة سيارة الأجرة (<strong>{act_label}</strong>) ابتداءً من <strong>{since}</strong>، "
                    f"وهو في حالة <strong>{str(d.get('statut')).replace('_', ' ')}</strong> منذ <strong>{_dmy(stop['date_start'])}</strong>.")
        else:
            mode = "بصفته صاحب الرخصة (مستفيد)" if doo.get("exploitation_mode") == "مستفيد" else (
                f"بموجب عقد كراء رخصة الاستغلال رقم <strong>{v(rc.get('contract_number'))}</strong>")
            core = (f"يمارس نشاط النقل بواسطة سيارة الأجرة (<strong>{act_label}</strong>) ابتداءً من <strong>{since}</strong> إلى يومنا هذا، "
                    f"تحت رقم الباب <strong>{door}</strong> {mode}، بالمركبة ذات رقم التسجيل "
                    f"<strong dir='ltr'>{v(veh.get('num_immatriculation'))}</strong>.")
    body = f"""<div class="doc" style="font-size:14.5px;line-height:2.1">
    <div style="text-align:center;line-height:1.8;margin-bottom:14px">
      <div style="font-weight:800">الجمهورية الجزائرية الديمقراطية الشعبية</div>
      <div>وزارة الداخلية والجماعات المحلية والنقل</div>
      <div style="font-weight:700">مديرية النقل لولاية البيض</div>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:13.5px;margin-bottom:22px">
      <div>الرقم: ............ / م.ن.و.ب / {today[:4]}</div>
      <div>البيض في: <strong dir="ltr">{_dmy(today)}</strong></div>
    </div>
    <div style="text-align:center;font-size:20px;font-weight:800;text-decoration:underline;margin-bottom:6px">شهادة إدارية</div>
    <div style="text-align:center;font-size:13.5px;color:#374151;margin-bottom:22px">(بمثابة شهادة عمل)</div>
    <div style="text-indent:28px;text-align:justify">
      يشهد السيد مدير النقل لولاية البيض أنّ السيد(ة): <strong>{name}</strong>، المولود(ة) بتاريخ {born}،
      الحامل(ة) لبطاقة التعريف الوطنية رقم <strong dir="ltr">{nin}</strong> ورخصة السياقة رقم <strong dir="ltr">{permis}</strong>،
      {core}
    </div>
    <div style="text-indent:28px;margin-top:16px">سُلّمت هذه الشهادة للمعني(ة) بناءً على طلبه(ا) لاستعمالها في حدود ما يسمح به القانون.</div>
    <div style="display:flex;margin-top:36px">
      <div style="text-align:center;min-width:240px;margin-right:auto">
        <div style="font-weight:800">مدير النقل</div>
        <div style="height:90px"></div>
      </div>
    </div>
    <div class="footer">شهادة إدارية (شهادة عمل) &#8212; {name} &#8212; {_dmy(today)}</div>
    </div>"""
    return Response(html_page("شهادة إدارية — شهادة عمل", body), mimetype="text/html; charset=utf-8")


# ════════════════════════════════════════
# رخصة استغلال سيارة أجرة — تصدر عند قبول طلب رسمي
# GET /api/admin/print/license/<req_id>
# يستخدمها المدير فقط
# ════════════════════════════════════════

# خريطة نوع الطلب → نوع الرخصة ومحيط النقل
LICENSE_MAP = {
    "تجديد_وثائق_استغلال": None,   # يحتاج نوع النشاط
    "تغيير_سيارة":             None,   # يحتاج نوع النشاط
    "تغيير_باب":               None,   # يحتاج نوع النشاط
    "تغيير_نشاط":             None,   # يستخدم النشاط الجديد
}

ACTIVITY_LICENSE_TYPE = {
    "فردية_حضرية":    "خدمة سيارة أجرة فردية حضرية",
    "جماعية_حضرية":   "خدمة سيارة أجرة جماعية حضرية",
    "مابين_البلديات": "خدمة سيارة أجرة ما بين البلديات",
    "مابين_الولايات": "خدمة سيارة أجرة ما بين الولايات",
}

# نمط الرخصة حسب نوع النشاط
ACTIVITY_MUHIT = {
    "فردية_حضرية":    "سيارة أجرة فردية حضرية",
    "جماعية_حضرية":   "سيارة أجرة جماعية حضرية",
    "مابين_البلديات": "سيارة أجرة مابين البلديات",
    "مابين_الولايات": "سيارة أجرة مابين الولايات",
}

@print_bp.route("/api/admin/print/license/<int:req_id>")
@require_admin
def print_exploitation_license(account, req_id):
    """طباعة رخصة الاستغلال بعد قبول الطلب"""
    with get_db() as conn:
        req = conn.execute("SELECT * FROM requests WHERE id=?", (req_id,)).fetchone()
        if not req: return "الطلب غير موجود", 404
        req = dict(req)

        d, lic, veh, doo, act, rc, dep = drv_full(conn, req["driver_id"])

        req_data = {}
        try: req_data = json.loads(req.get("request_data") or "{}")
        except: pass

    today_str = datetime.now().strftime("%Y-%m-%d")
    today_display = datetime.now().strftime("%Y/%m/%d")
    rt = req["request_type"]

    # تحديد نوع النشاط الفعلي حسب نوع الطلب
    if rt == "تغيير_نشاط":
        activity_type = req_data.get("activity_type_new", act.get("activity_type", ""))
    else:
        activity_type = act.get("activity_type", "")

    muhit     = ACTIVITY_MUHIT.get(activity_type, "سيارة أجرة")
    lic_type  = ACTIVITY_LICENSE_TYPE.get(activity_type, muhit)

    # رقم التسجيل حسب نوع الطلب
    if rt == "تغيير_سيارة":
        immat = (req_data.get("new_num_immatriculation") or
                 req_data.get("num_immatriculation") or
                 veh.get("num_immatriculation") or "")
    else:
        immat = veh.get("num_immatriculation", "")

    # إذا ما زال فارغاً → خذ آخر مركبة من التاريخ
    if not immat:
        with get_db() as _conn2:
            _last = _conn2.execute(
                "SELECT num_immatriculation FROM vehicles WHERE driver_id=? ORDER BY id DESC LIMIT 1",
                (req["driver_id"],)
            ).fetchone()
            if _last:
                immat = _last["num_immatriculation"] or ""

    # الصنف والطراز والرقم التسلسلي حسب نوع الطلب
    if rt == "تغيير_سيارة":
        marque       = (req_data.get("new_marque")       or req_data.get("marque")       or veh.get("marque", ""))
        type_veh     = (req_data.get("new_type_vehicule") or req_data.get("type_vehicule") or veh.get("type_vehicule", ""))
        num_serie    = (req_data.get("new_num_serie")     or req_data.get("num_serie")     or veh.get("num_serie", ""))
    else:
        marque    = veh.get("marque", "")
        type_veh  = veh.get("type_vehicule", "")
        num_serie = veh.get("num_serie", "")

    # رقم الباب حسب نوع الطلب
    if rt == "تغيير_باب":
        door_number = req_data.get("door_number") or doo.get("door_number") or ""
    else:
        door_number = doo.get("door_number", "")

    body = f"""<div class="doc" style="max-width:680px;">
    <div style="text-align:center;padding-bottom:18px;border-bottom:2px solid #125950;margin-bottom:16px;">
      <div style="font-size:14px;font-weight:800;color:#1a3a33;الجمهورية الجزائرية الديمقراطية الشعبية">
        الجمهورية الجزائرية الديمقراطية الشعبية
      </div>
      <div style="font-size:13px;color:#374151;margin-top:4px;">
        وزارة الداخلية والجماعات المحلية والنقل
      </div>
      <div style="font-size:12px;color:#374151;margin-top:2px;">مديرية النقل لولاية البيض</div>
    </div>

    <div style="display:flex;justify-content:space-between;margin-bottom:16px;">
      <div style="font-size:12px;"><strong>الرقم:</strong> &nbsp;&nbsp;{req.get('request_number', '')}</div>
    </div>

    <div style="text-align:center;font-size:16px;font-weight:800;color:#125950;
                text-decoration:underline;margin-bottom:18px;">
      رخصة مؤقتة لاستغلال {lic_type}
    </div>

    <div style="margin-bottom:12px;font-size:13px;">ان مدير النقل لولاية البيض:</div>

    <div style="font-size:12px;color:#374151;margin-bottom:6px;padding-right:12px;line-height:2;">
      - بمقتضى المرسوم التنفيذي 230/12 المؤرخ في 03 رجب عام 1433 الموافق ل 24مايو 2012 والمتضمن تنظيم النقل بواسطة سيارات الأجرة المعدل والمتمم.
    </div>
    <div style="font-size:12px;color:#374151;margin-bottom:18px;padding-right:12px;line-height:2;">
      - بمقتضى القرار المؤرخ في 11 ذي القعدة عام 1437 الموافق ل 14 غشت سنة 2016 الذي يحدد نماذج الوثائق المرتبطة بممارسة نشاط سيارة الأجرة.
    </div>

    <div style="margin-bottom:8px;font-size:13px;">- يقرر ما يأتي-</div>

    <div style="font-size:12px;color:#374151;margin-bottom:18px;padding-right:12px;line-height:2.2;">
      <strong>المادة الأولى :</strong>
      عملا بأحكام القرار المرسوم التنفيذي 230/12 المؤرخ في 03 رجب عام 1433 الموافق ل 24 مايو 2012
      والمذكور أعلاه تسلم رخصة استغلال {lic_type}
    </div>

    <div style="font-size:13px;line-height:2.2;padding-right:16px;">
      <div><strong>اللقب :</strong> &nbsp;&nbsp;&nbsp;{v(d.get("nom_ar"))}</div>
      <div><strong>الاسم :</strong> &nbsp;&nbsp;&nbsp;{v(d.get("prenom_ar"))}</div>
      <div><strong>بلدية الالحاق :</strong> {(doo.get("exploitation_commune") or "البيض")}</div>
      <div><strong>محيط النقل الحضري الملحق به :</strong> &nbsp;&nbsp;{muhit}</div>
      <div><strong>رقم التسجيل :</strong> &nbsp;&nbsp;<span dir="ltr">{v(immat)}</span></div>
      <div><strong>الصنف :</strong> &nbsp;&nbsp;{v(marque)}</div>
      <div><strong>الطراز :</strong> &nbsp;&nbsp;{v(type_veh)}</div>
      <div><strong>الرقم التسلسلي في الطراز :</strong> &nbsp;&nbsp;{v(num_serie)}</div>
      <div><strong>رقم الباب :</strong> &nbsp;&nbsp;&nbsp;{v(door_number)}</div>
    </div>

    <div style="margin-top:16px;font-size:13px;">
      <strong>✕ تاريخ انتهاء صلاحية هذه الرخصة الى غاية:</strong>
      &nbsp;&nbsp;
      <span dir="ltr">{(v(rc.get('end_date')) or '…………………………………………………………')}</span>
    </div>

    <div style="margin-top:40px;text-align:center;">
      <div style="font-size:13px;">
        حرر بالبيض في : <span dir="ltr">{today_display}</span>
      </div>
      <div style="font-size:13px;font-weight:700;margin-top:6px;">
        المدير
      </div>
    </div>
    <div class="footer">{v(req["request_number"])} — رخصة استغلال — {today_str}</div>
    </div>"""

    return Response(html_page(f"رخصة {lic_type}", body), mimetype="text/html; charset=utf-8")


# ════════════════════════════════════════
# الشهادة التاريخية للمدير
# ════════════════════════════════════════

# ════════════════════════════════════════
# رخصة الاستغلال السارية للسائق — من ملف السائق في لوحة الإدارة
# GET /api/admin/print/current-license/<driver_id>
# تُعاد طباعة آخر رخصة صادرة (آخر طلب مقبول مُنشئ لرخصة)
# ════════════════════════════════════════
_LICENSE_ISSUING_TYPES = ("تجديد_وثائق_استغلال", "تغيير_سيارة", "تغيير_باب", "تغيير_نشاط", "استئناف")

def _notice_page(title, msg):
    body = (f'<div style="max-width:560px;margin:60px auto;padding:28px;border:1.5px solid #125950;'
            f'border-radius:10px;text-align:center;font-family:Segoe UI,Arial;direction:rtl">'
            f'<h2 style="color:#125950;margin-bottom:12px">{title}</h2>'
            f'<p style="color:#374151;line-height:1.9">{msg}</p></div>')
    return Response(body, mimetype="text/html; charset=utf-8")

@print_bp.route("/api/admin/print/current-license/<int:target_driver_id>")
@require_admin
def print_current_license(account, target_driver_id):
    with get_db() as conn:
        drv = conn.execute("SELECT statut FROM drivers WHERE id=?", (target_driver_id,)).fetchone()
        if not drv:
            return _notice_page("رخصة الاستغلال", "السائق غير موجود."), 404
        statut = drv["statut"] or ""
        if statut.startswith("توقف"):
            return _notice_page("رخصة الاستغلال",
                f"النشاط متوقف حاليًا ({statut.replace('_', ' ')}) — رخصة الاستغلال غير سارية."
                "<br>تُحرَّر رخصة جديدة عند قبول طلب استئناف النشاط.")
        ph = ",".join("?" * len(_LICENSE_ISSUING_TYPES))
        req = conn.execute(
            f"""SELECT id FROM requests WHERE driver_id=? AND statut='مقبول'
                AND request_type IN ({ph}) ORDER BY id DESC LIMIT 1""",
            (target_driver_id, *_LICENSE_ISSUING_TYPES)).fetchone()
    if not req:
        return _notice_page("رخصة الاستغلال",
            "لم تُحرَّر أي رخصة استغلال لهذا السائق عبر المنصة بعد.<br>"
            "تُحرَّر الرخصة عند قبول أحد الطلبات: تجديد وثائق الاستغلال، تغيير المركبة، تغيير رقم الباب، تغيير النشاط أو استئناف النشاط."), 404
    return print_exploitation_license.__wrapped__(req_id=req["id"], account=account)


@print_bp.route("/api/admin/print/history/<int:target_driver_id>")
@require_admin
def print_history_certificate(account, target_driver_id):
    """
    الشهادة التاريخية — مبنية من المصادر الأصلية الموثوقة:
      • الحالات: من جدول الطلبات (توقف/استئناف) بتاريخ التقديم الفعلي — لا من status_history
      • المناوبون: من عقود المناوب
      • الكراء: من عقود الكراء مع حالة كل عقد وسبب انتهائه
    """
    def d10(x):
        return (str(x)[:10] if x else None)

    NONE_ROW = '<tr><td colspan="{n}" style="text-align:center;color:#6b7280">لا توجد سجلات</td></tr>'
    STATE_LABEL = {"توقف_مؤقت": "توقف مؤقت", "توقف_نهائي": "توقف نهائي", "استئناف": "نشط (استئناف)", "نشط": "نشط"}

    with get_db() as conn:
        d = conn.execute("SELECT * FROM drivers WHERE id=?", (target_driver_id,)).fetchone()
        if not d: return "السائق غير موجود", 404
        d = dict(d)
        lic = conn.execute("SELECT * FROM driver_licenses WHERE driver_id=? AND is_current=1", (target_driver_id,)).fetchone()
        vehicles_hist = [dict(x) for x in conn.execute("""
            SELECT vh.*, veh.num_immatriculation, veh.marque, veh.type_vehicule
            FROM vehicles_history vh JOIN vehicles veh ON veh.id=vh.vehicle_id
            WHERE vh.driver_id=? ORDER BY vh.id""", (target_driver_id,)).fetchall()]
        current_veh = conn.execute("SELECT * FROM vehicles WHERE driver_id=? AND is_current=1", (target_driver_id,)).fetchone()
        activity_hist = [dict(x) for x in conn.execute(
            "SELECT * FROM activity_history WHERE driver_id=? AND date_end IS NOT NULL ORDER BY id", (target_driver_id,)).fetchall()]
        current_act = conn.execute("SELECT * FROM activity WHERE driver_id=? AND is_current=1", (target_driver_id,)).fetchone()
        open_act = conn.execute(
            "SELECT date_start FROM activity_history WHERE driver_id=? AND date_end IS NULL ORDER BY id DESC LIMIT 1",
            (target_driver_id,)).fetchone()
        status_events = [dict(x) for x in conn.execute("""
            SELECT id, request_number, request_type, statut, notes,
                   created_at AS submitted_at,
                   COALESCE(processed_at, created_at) AS created_at
            FROM requests
            WHERE driver_id=? AND request_type IN ('توقف_مؤقت','توقف_نهائي','استئناف')
              AND statut = 'مقبول'
            ORDER BY COALESCE(processed_at, created_at), id""", (target_driver_id,)).fetchall()]
        dep_contracts = [dict(x) for x in conn.execute("""
            SELECT dc.*, dep.nom_ar, dep.prenom_ar, dep.nin, dep.num_permis
            FROM deputy_contracts dc JOIN deputies dep ON dep.id=dc.deputy_id
            WHERE dc.driver_id=? ORDER BY dc.id""", (target_driver_id,)).fetchall()]
        contracts_hist = [dict(x) for x in conn.execute("""
            SELECT rc.*, dl.door_number, b.nom_ar AS ben_nom, b.prenom_ar AS ben_prenom
            FROM rental_contracts rc
            JOIN door_licenses dl ON dl.id=rc.door_license_id
            JOIN beneficiaries b  ON b.id=rc.beneficiary_id
            WHERE rc.driver_id=? ORDER BY rc.id""", (target_driver_id,)).fetchall()]
        stats = conn.execute("""
            SELECT COUNT(*) AS total,
                   SUM(statut='مقبول') AS ok, SUM(statut IN ('جديد','قيد_المعالجة')) AS pending,
                   SUM(statut='مرفوض') AS rej
            FROM requests WHERE driver_id=?""", (target_driver_id,)).fetchone()

    today = datetime.now().strftime("%Y-%m-%d")
    CUR = ' style="background:#e4f5ec"'

    # ── 1. المركبات ──
    veh_rows = "".join(
        f"<tr><td>{v(x.get('num_immatriculation'))}</td><td>{v(x.get('marque'))} {v(x.get('type_vehicule'))}</td>"
        f"<td>{v(d10(x.get('date_start')) or 'غير مسجّل')}</td><td>{v(d10(x.get('date_end')))}</td>"
        f"<td>{v(x.get('change_reason'))}</td></tr>" for x in vehicles_hist)
    if current_veh:
        cv = dict(current_veh)
        veh_rows += (f"<tr style='background:#e4f5ec'><td>{v(cv.get('num_immatriculation'))}</td>"
                     f"<td>{v(cv.get('marque'))} {v(cv.get('type_vehicule'))}</td><td>{v(d10(cv.get('created_at')))}</td>"
                     f"<td>حتى تاريخه</td><td>المركبة الحالية &#9989;</td></tr>")

    # ── 2. أنماط النشاط ──
    act_rows = "".join(
        f"<tr><td>{ACTIVITY_LABELS.get(x.get('activity_type',''), v(x.get('activity_type')))}</td>"
        f"<td>{v(d10(x.get('date_start')))}</td><td>{v(d10(x.get('date_end')))}</td></tr>" for x in activity_hist)
    if current_act:
        ca = dict(current_act)
        act_rows += (f"<tr style='background:#e4f5ec'><td>{ACTIVITY_LABELS.get(ca.get('activity_type',''), v(ca.get('activity_type')))}</td>"
                     f"<td>{v(d10(open_act['date_start'] if open_act else ca.get('created_at')))}</td><td>حتى تاريخه &#9989;</td></tr>")

    # ── 3. مسار الحالات (من الطلبات) ──
    periods = []
    start = d.get("created_at")
    periods.append({"state": "نشط", "start": start, "req": "تسجيل الملف", "notes": "بداية النشاط في النظام"})
    for ev in status_events:
        st = ev["request_type"]
        if STATE_LABEL[st] == STATE_LABEL[periods[-1]["state"]] or (st == "استئناف" and periods[-1]["state"] == "نشط"):
            continue  # حدث مكرر لنفس الحالة — لا يغيّر المسار
        periods.append({"state": st, "start": ev["created_at"], "req": ev["request_number"],
                        "submitted": ev.get("submitted_at"),
                        "notes": ev.get("notes") or "لا توجد ملاحظات"})
    stat_rows = ""
    for i, p in enumerate(periods):
        end = periods[i+1]["start"] if i+1 < len(periods) else None
        def _dt(x):
            x = str(x)
            return datetime.strptime(x[:19], "%Y-%m-%d %H:%M:%S") if len(x) >= 19 else datetime.strptime(x[:10], "%Y-%m-%d")
        try:
            delta = (_dt(end) if end else datetime.now()) - _dt(p["start"])
            if delta.days >= 1:
                days = f"{delta.days} يوم"
            else:
                h, m = delta.seconds // 3600, (delta.seconds % 3600) // 60
                days = f"{h} سا {m} د" if h else f"{max(m,1)} دقيقة"
        except Exception:
            days = "غير محسوبة"
        style = " style='background:#e4f5ec'" if not end else (" style='background:#fef2f2'" if p["state"].startswith("توقف") else "")
        stat_rows += (f"<tr{style}><td>{STATE_LABEL[p['state']]}</td><td>{v(str(p['start'])[:16])}</td>"
                      f"<td>{v(str(end)[:16]) if end else 'حتى تاريخه'}</td><td>{days}</td>"
                      f"<td>{v(p['req'])}<br><small style='color:#6b7280'>قُدّم: {str(p.get('submitted') or p['start'])[:10]}</small></td><td>{v(p['notes'])}</td></tr>")

    # ── 4. المناوبون (عقود العمل) ──
    dep_rows = ""
    for x in dep_contracts:
        if x.get("is_current"):
            to, st = f"ساري حتى {v(d10(x.get('end_date')))}", "ساري &#9989;"
        else:
            to, st = v(d10(x.get("end_date")) or "غير مسجّل"), f"منتهٍ — {v(x.get('end_reason') or 'غير محدد')}"
        dep_rows += (f"<tr{CUR if x.get('is_current') else ''}>"
                     f"<td>{v(x.get('prenom_ar'))} {v(x.get('nom_ar'))}</td><td>{v(x.get('nin'))}</td>"
                     f"<td>{v(x.get('contract_number'))}</td><td>{v(d10(x.get('contract_date')))}</td>"
                     f"<td>{to}</td><td>{st}</td></tr>")

    # ── 5. عقود الكراء ──
    rent_rows = ""
    for x in contracts_hist:
        rent = f"{x['monthly_rent']} دج" if x.get("monthly_rent") else "غير محدد"
        if x.get("is_current"):
            to, st = f"ساري حتى {v(d10(x.get('end_date')))}", "ساري &#9989;"
        else:
            to = v(d10(x.get("end_date")) or "غير مسجّل")
            st = f"مفسوخ — {v(x.get('end_reason'))}" if x.get("end_reason") else "مؤرشف"
        rent_rows += (f"<tr{CUR if x.get('is_current') else ''}>"
                      f"<td>{v(x.get('contract_number'))}</td><td>{v(x.get('door_number'))}</td>"
                      f"<td>{v(x.get('ben_prenom'))} {v(x.get('ben_nom'))}</td><td>{rent}</td>"
                      f"<td>{v(d10(x.get('contract_date')))}</td><td>{to}</td><td>{st}</td></tr>")

    H = 'style="background:#f4f8f7;font-weight:700"'
    body = f"""<div class="doc">
    <div class="header"><h1>&#128220; الشهادة التاريخية — مسار النشاط المهني</h1><p>سائق سيارة الأجرة &#8212; صادرة بتاريخ: {today}</p></div>
    <table>
      <tr><td class="sep" colspan="2">&#128100; بيانات السائق</td></tr>
      <tr><td class="label">الاسم واللقب</td><td>{v(d.get("prenom_ar"))} {v(d.get("nom_ar"))}</td></tr>
      <tr><td class="label">NIN</td><td>{v(d.get("nin"))}</td></tr>
      <tr><td class="label">تاريخ ومكان الميلاد</td><td>{v(d.get("date_naissance"))} &#8212; {v(d.get("lieu_naissance_ar"))}</td></tr>
      <tr><td class="label">العنوان</td><td>{v(d.get("adresse"))}</td></tr>
      <tr><td class="label">الهاتف</td><td>{v(d.get("telephone"))}</td></tr>
      <tr><td class="label">رقم رخصة السياقة</td><td>{v(lic["num_permis"] if lic else None)}</td></tr>
      <tr><td class="label">تاريخ التسجيل في النظام</td><td>{v(d10(d.get("created_at")))}</td></tr>
      <tr><td class="label">الحالة الحالية</td><td><strong>{v(d.get("statut"))}</strong></td></tr>
      <tr><td class="label">إجمالي الطلبات</td><td>{stats["total"] or 0} (مقبولة: {stats["ok"] or 0} — قيد المعالجة: {stats["pending"] or 0} — مرفوضة: {stats["rej"] or 0})</td></tr>
    </table>
    <h3>&#128202; مسار حالات النشاط (توقف / استئناف) — بتاريخ موافقة الإدارة</h3>
    <table><tr {H}><td>الحالة</td><td>من</td><td>إلى</td><td>المدة</td><td>رقم الطلب</td><td>ملاحظات</td></tr>
    {stat_rows or NONE_ROW.format(n=6)}</table>
    <h3>&#128664; تاريخ المركبات</h3>
    <table><tr {H}><td>رقم التسجيل</td><td>الماركة/النوع</td><td>من</td><td>إلى</td><td>السبب</td></tr>
    {veh_rows or NONE_ROW.format(n=5)}</table>
    <h3>&#128260; تاريخ أنماط النشاط</h3>
    <table><tr {H}><td>نمط النشاط</td><td>من</td><td>إلى</td></tr>
    {act_rows or NONE_ROW.format(n=3)}</table>
    <h3>&#128100; تاريخ المناوبين (عقود العمل)</h3>
    <table><tr {H}><td>المناوب</td><td>NIN</td><td>رقم العقد</td><td>من</td><td>إلى</td><td>الحالة</td></tr>
    {dep_rows or NONE_ROW.format(n=6)}</table>
    <h3>&#128682; تاريخ عقود كراء الرخصة</h3>
    <table><tr {H}><td>رقم العقد</td><td>رقم الباب</td><td>صاحب الرخصة</td><td>الإيجار الشهري</td><td>من</td><td>إلى</td><td>الحالة</td></tr>
    {rent_rows or NONE_ROW.format(n=7)}</table>
    <div class="sign">
      <div class="sign-box"><div class="line">المدير &#8212; ختم وتوقيع</div></div>
      <div class="sign-box"><div class="line">تاريخ الإصدار: {today}</div></div>
    </div>
    </div>"""
    return Response(html_page("الشهادة التاريخية الشاملة", body), mimetype="text/html; charset=utf-8")


# ════════════════════════════════════════
# فسخ عقد المناوب (بالعقد)
# ════════════════════════════════════════

@print_bp.route("/api/print/deputy-contract-termination/<int:contract_id>")
@require_auth
def print_deputy_contract_termination(account, contract_id):
    with get_db() as conn:
        driver = conn.execute("SELECT id FROM drivers WHERE account_id=?", (account["id"],)).fetchone()
        if not driver: return "غير موجود", 404
        dc = conn.execute("""
            SELECT dc.*,
                   d.nom_ar, d.prenom_ar, d.nin, d.telephone, d.adresse,
                   dl.num_permis, dl.date_expiration,
                   veh.num_immatriculation, veh.marque, veh.type_vehicule, veh.num_serie, veh.nb_places, veh.annee_circulation,
                   door.door_number,
                   dep.nom_ar as dep_nom, dep.prenom_ar as dep_prenom,
                   dep.nin as dep_nin, dep.telephone as dep_tel, dep.adresse as dep_adresse,
                   dep.num_permis as dep_permis, dep.date_expiration_permis as dep_exp
            FROM deputy_contracts dc
            JOIN drivers d    ON d.id   = dc.driver_id
            JOIN deputies dep ON dep.id = dc.deputy_id
            LEFT JOIN driver_licenses dl  ON dl.driver_id=d.id AND dl.is_current=1
            LEFT JOIN vehicles veh        ON veh.driver_id=d.id AND veh.is_current=1
            LEFT JOIN door_licenses door  ON door.current_driver_id=d.id AND door.is_active=1
            WHERE dc.id=? AND dc.driver_id=?
        """, (contract_id, driver["id"])).fetchone()
        if not dc: return "العقد غير موجود", 404

    dc = dict(dc)
    today_str = datetime.now().strftime("%Y-%m-%d")
    body = f"""<div class="doc">
    <div class="header"><h1>&#128661; محضر فسخ عقد عمل سائق مناوب</h1><p>محرر بتاريخ: {today_str}</p></div>
    <div class="danger">&#9888;&#65039; وثيقة فسخ عقد العمل &#8212; رقم العقد: {v(dc["contract_number"])}</div>
    <table>
      <tr><td class="sep" colspan="2">الطرف الأول &#8212; صاحب العمل (السائق الأصلي)</td></tr>
      <tr><td class="label">الاسم واللقب</td><td>{v(dc["prenom_ar"])} {v(dc["nom_ar"])}</td></tr>
      <tr><td class="label">NIN</td><td>{v(dc["nin"])}</td></tr>
      <tr><td class="label">الهاتف</td><td>{v(dc["telephone"])}</td></tr>
      <tr><td class="label">رقم رخصة السياقة</td><td>{v(dc["num_permis"])}</td></tr>
      <tr><td class="label">رقم الباب</td><td>{v(dc["door_number"])}</td></tr>
      <tr><td class="label">رقم التسجيل</td><td>{v(dc["num_immatriculation"])} &#8212; {v(dc["marque"])}</td></tr>
      <tr><td class="sep-red" colspan="2">الطرف الثاني &#8212; السائق المناوب (المفسوخ عقده)</td></tr>
      <tr><td class="label">الاسم واللقب</td><td>{v(dc["dep_prenom"])} {v(dc["dep_nom"])}</td></tr>
      <tr><td class="label">NIN</td><td>{v(dc["dep_nin"])}</td></tr>
      <tr><td class="label">الهاتف</td><td>{v(dc["dep_tel"])}</td></tr>
      <tr><td class="label">رقم رخصة السياقة</td><td>{v(dc["dep_permis"])}</td></tr>
      <tr><td class="label">تاريخ انتهاء الرخصة</td><td>{v(dc["dep_exp"])}</td></tr>
      <tr><td class="sep-red" colspan="2">&#128203; بيانات الفسخ</td></tr>
      <tr><td class="label">رقم العقد المفسوخ</td><td>{v(dc["contract_number"])}</td></tr>
      <tr><td class="label">تاريخ إبرام العقد</td><td>{v(dc["contract_date"])}</td></tr>
      <tr><td class="label">تاريخ انتهاء العقد</td><td>{v(dc["end_date"])}</td></tr>
      <tr><td class="label">تاريخ الفسخ</td><td>{(dc["end_date"] or today_str)[:10] if not dc["is_current"] else today_str}</td></tr>
      <tr><td class="label">سبب الفسخ</td><td>{v(dc["end_reason"]) if not dc["is_current"] else "العقد ساري — لم يُفسخ بعد"}</td></tr>
    </table>
    <div class="sign">
      <div class="sign-box"><div class="line">توقيع الطرف الأول (صاحب العمل)</div></div>
      <div class="sign-box"><div class="line">توقيع الطرف الثاني (المناوب)</div></div>
    </div>
    <div class="footer">{v(dc["contract_number"])} &#8212; فسخ العقد &#8212; {today_str}</div>
    </div>"""
    return Response(html_page("فسخ عقد مناوب", body), mimetype="text/html; charset=utf-8")
