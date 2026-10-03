# ════════════════════════════════════════════════════════════
# الشهادة الإدارية (بمثابة شهادة عمل) — نموذج المديرية
#   GET  /api/admin/work-cert/prepare?nin=...|driver_id=...
#        يبحث عن الشخص في كامل البرنامج (سائق مستغل، مناوب لدى سائق آخر،
#        سائق أجير لدى شركة) ويقترح فترات النشاط وصفته في كل فترة.
#   POST /api/admin/work-cert/render
#        يُحرّر الشهادة بالبيانات التي راجعها/عدّلها الموظف يدويًا.
# ════════════════════════════════════════════════════════════
import html as _h
import json
import re
from datetime import datetime, timedelta
from flask import Blueprint, Response, request, jsonify
from database import get_db
from utils import require_admin

work_cert_bp = Blueprint("work_cert", __name__)

SIFAT = ["مستغل", "مناوب", "سائق أجير"]


def _d(val):
    """YYYY-MM-DD من أي تاريخ/توقيت."""
    s = str(val or "").strip()[:10]
    return s if re.match(r"^\d{4}-\d{2}-\d{2}$", s) else ""


def _dmy(val):
    s = _d(val)
    return f"{s[8:10]}/{s[5:7]}/{s[0:4]}" if s else ""


def _ymd_slash(val):
    s = _d(val)
    return s.replace("-", "/") if s else ""


def _e(val):
    return _h.escape(str(val)) if val not in (None, "", "None") else ""


def _row(conn, sql, args=()):
    r = conn.execute(sql, args).fetchone()
    return dict(r) if r else None


def _merge(periods):
    """دمج الفترات المتتالية لنفس الصفة ونفس الجهة إذا كان الفاصل ≤ يوم واحد."""
    out = []
    for p in sorted(periods, key=lambda x: (x["start"] or "")):
        if out:
            q = out[-1]
            same = q["sifa"] == p["sifa"] and q.get("key") == p.get("key")
            if same:
                q_end = q["end"] or "9999-12-31"
                gap_ok = (not q["end"]) or (
                    datetime.strptime(p["start"], "%Y-%m-%d") <= datetime.strptime(q_end, "%Y-%m-%d") + timedelta(days=1))
                if gap_ok:
                    if q["end"] and (not p["end"] or p["end"] > q["end"]):
                        q["end"], q["end_kind"] = p["end"], p.get("end_kind", "")
                    if not p["end"]:
                        q["end"], q["end_kind"] = None, ""
                    continue
        out.append(dict(p))
    return out


def _exploitant_periods(conn, driver_id, created_at):
    first = conn.execute("SELECT MIN(date_start) FROM activity_history WHERE driver_id=?", (driver_id,)).fetchone()[0]
    start = _d(first) or _d(created_at)
    if not start:
        return []
    periods, cur = [], {"sifa": "مستغل", "start": start, "end": None, "end_kind": "", "key": f"drv{driver_id}"}
    for s in conn.execute("SELECT status_type, date_start FROM status_history WHERE driver_id=? ORDER BY date_start, id",
                          (driver_id,)).fetchall():
        st, ds = s["status_type"], _d(s["date_start"])
        if not ds:
            continue
        if st.startswith("توقف"):
            if cur:
                cur["end"] = ds
                cur["end_kind"] = "final" if st == "توقف_نهائي" else "temp"
                periods.append(cur); cur = None
        elif st == "استئناف":
            if cur is None:
                cur = {"sifa": "مستغل", "start": ds, "end": None, "end_kind": "", "key": f"drv{driver_id}"}
    if cur:
        periods.append(cur)
    door = _row(conn, """SELECT door_number FROM door_licenses WHERE current_driver_id=? AND is_active=1""", (driver_id,))
    for p in periods:
        p["source"] = "سائق مستغل لرخصة سيارة أجرة" + (f" — رقم الباب {door['door_number']}" if door else "")
    return _merge(periods)


def _deputy_periods(conn, nin):
    rows = conn.execute(
        """SELECT dc.id, dc.driver_id, dc.contract_date, dc.end_date, dc.end_reason, dc.is_current, dc.updated_at,
                  d.nom_ar AS h_nom, d.prenom_ar AS h_prenom
           FROM deputy_contracts dc
           JOIN deputies dp ON dp.id = dc.deputy_id
           LEFT JOIN drivers d ON d.id = dc.driver_id
           WHERE dp.nin = ? ORDER BY dc.contract_date, dc.id""", (nin,)).fetchall()
    today = datetime.now().strftime("%Y-%m-%d")
    out = []
    for r in rows:
        start = _d(r["contract_date"])
        if not start:
            continue
        if r["is_current"] and not r["end_reason"]:
            end = None if not _d(r["end_date"]) or _d(r["end_date"]) >= today else _d(r["end_date"])
        else:
            end = _d(r["end_date"]) or _d(r["updated_at"]) or start
        host = f"{r['h_nom'] or ''} {r['h_prenom'] or ''}".strip()
        out.append({"sifa": "مناوب", "start": start, "end": end,
                    "end_kind": "",
                    "key": f"host{r['driver_id']}",
                    "source": f"سائق مناوب لدى السيد {host}" if host else "سائق مناوب"})
    return _merge(out)


def _company_periods(conn, nin):
    rows = conn.execute(
        """SELECT h.contract_start, h.contract_end, h.terminated_at, h.is_current, h.company_id,
                  c.nom_ar AS co_ar, c.nom_fr AS co_fr
           FROM company_hire_requests h
           JOIN company_drivers cd ON cd.id = h.driver_id
           LEFT JOIN companies c ON c.id = h.company_id
           WHERE cd.nin = ? AND h.statut = 'مقبول' ORDER BY h.contract_start""", (nin,)).fetchall()
    today = datetime.now().strftime("%Y-%m-%d")
    out = []
    for r in rows:
        start = _d(r["contract_start"])
        if not start:
            continue
        if r["terminated_at"]:
            end = _d(r["terminated_at"])
        else:
            ce = _d(r["contract_end"])
            end = None if (r["is_current"] and (not ce or ce >= today)) else ce
        co = r["co_ar"] or r["co_fr"] or ""
        out.append({"sifa": "سائق أجير", "start": start, "end": end, "end_kind": "",
                    "key": f"co{r['company_id']}", "source": f"سائق أجير لدى شركة {co}".strip()})
    return _merge(out)


@work_cert_bp.route("/api/admin/work-cert/prepare")
@require_admin
def work_cert_prepare(account):
    nin = (request.args.get("nin") or "").strip()
    driver_id = request.args.get("driver_id", type=int)
    with get_db() as conn:
        drv = None
        if driver_id:
            drv = _row(conn, "SELECT * FROM drivers WHERE id=?", (driver_id,))
            if drv and not nin:
                nin = (drv.get("nin") or "").strip()
        if nin and not drv:
            drv = _row(conn, "SELECT * FROM drivers WHERE nin=? ORDER BY id DESC LIMIT 1", (nin,))
        dep = _row(conn, "SELECT * FROM deputies WHERE nin=? ORDER BY id DESC LIMIT 1", (nin,)) if nin else None
        cod = _row(conn, "SELECT * FROM company_drivers WHERE nin=? ORDER BY id DESC LIMIT 1", (nin,)) if nin else None
        if not (drv or dep or cod):
            return jsonify({"error": "لم يُعثر على أي شخص بهذا الرقم في البرنامج"}), 404

        person = {"nom": "", "prenom": "", "date_naissance": "", "lieu_naissance": "", "nin": nin,
                  "num_permis": "", "permis_date": "", "permis_commune": "", "adresse": "", "telephone": "", "sexe": ""}
        def fill(**kw):
            for k, val in kw.items():
                if val and not person.get(k):
                    person[k] = str(val).strip()
        if drv:
            lic = _row(conn, "SELECT * FROM driver_licenses WHERE driver_id=? AND is_current=1 ORDER BY id DESC LIMIT 1", (drv["id"],)) or {}
            fill(nom=drv.get("nom_ar"), prenom=drv.get("prenom_ar"), date_naissance=_d(drv.get("date_naissance")),
                 lieu_naissance=drv.get("lieu_naissance_ar"), num_permis=lic.get("num_permis"),
                 permis_date=_d(lic.get("date_delivrance")), permis_commune=lic.get("lieu_delivrance"),
                 adresse=drv.get("adresse"), telephone=drv.get("telephone"), sexe=drv.get("sexe"))
        if dep:
            fill(nom=dep.get("nom_ar"), prenom=dep.get("prenom_ar"), date_naissance=_d(dep.get("date_naissance")),
                 lieu_naissance=dep.get("lieu_naissance"), num_permis=dep.get("num_permis"),
                 permis_date=_d(dep.get("date_delivrance_permis")), permis_commune=dep.get("lieu_delivrance_permis"),
                 adresse=dep.get("adresse"), telephone=dep.get("telephone"))
        if cod:
            fill(nom=cod.get("nom_ar"), prenom=cod.get("prenom_ar"), date_naissance=_d(cod.get("date_naissance")),
                 lieu_naissance=cod.get("lieu_naissance"), num_permis=cod.get("num_permis"),
                 permis_date=_d(cod.get("date_delivrance")), permis_commune=cod.get("lieu_delivrance"),
                 telephone=cod.get("telephone"))

        periods = []
        if drv:
            periods += _exploitant_periods(conn, drv["id"], drv.get("created_at"))
        if nin:
            periods += _deputy_periods(conn, nin)
            periods += _company_periods(conn, nin)

    periods.sort(key=lambda p: p["start"] or "")
    for p in periods:
        p.pop("key", None)
    found_in = [x for x, ok in (("سائق مستغل", drv), ("سائق مناوب", dep), ("سائق لدى شركة", cod)) if ok]
    with get_db() as conn:
        history = history_for(conn, nin) if nin else []
    return jsonify({"person": person, "periods": periods, "found_in": found_in, "history": history,
                    "driver_id": drv["id"] if drv else None,
                    "today": datetime.now().strftime("%Y-%m-%d")})


CERT_STYLE = """
<style>
  @page { size: A4 portrait; margin: 16mm 18mm; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #eef0f3; font-family: "Traditional Arabic", "Arabic Typesetting", "Amiri", "Times New Roman", serif;
         direction: rtl; color: #000; }
  .sheet { width: 210mm; min-height: 297mm; margin: 14px auto; background: #fff; padding: 18mm 20mm;
           box-shadow: 0 2px 14px rgba(0,0,0,.15); font-size: 17px; line-height: 2; }
  .rep { text-align: center; font-weight: 700; font-size: 19px; }
  .adm { margin-top: 6px; font-weight: 700; font-size: 16.5px; line-height: 1.9; }
  .adm u { text-underline-offset: 3px; }
  .title { margin: 46px auto 34px; width: max-content; padding: 6px 34px; background: #d9d9d9;
           font-size: 30px; font-weight: 700; text-align: center; }
  .lead { font-weight: 700; margin-bottom: 6px; }
  .body b { font-weight: 700; }
  .per { margin: 2px 0; padding-right: 6px; }
  .issued { text-align: center; margin-top: 18px; font-weight: 700; }
  .sign { margin-top: 22px; display: flex; justify-content: flex-end; }
  .sign > div { text-align: center; min-width: 260px; font-weight: 700; }
  .dots { letter-spacing: 1px; }
  .btn { display: block; margin: 0 auto 18px; padding: 10px 26px; border: 0; border-radius: 8px; background: #125950;
         color: #fff; font: 700 15px "Segoe UI", Tahoma, sans-serif; cursor: pointer; }
  @media print { body { background: #fff; } .sheet { margin: 0; box-shadow: none; width: auto; min-height: auto; padding: 0; } .btn { display: none; } }
</style>
"""


def _render(p, periods, cert_no, issue_date, place):
    """يبني صفحة الشهادة بنفس قالب وثائق البرنامج."""
    periods = sorted([x for x in periods if _d(x.get("start"))], key=lambda x: _d(x.get("start")))
    today = issue_date
    place = _e(place or "البيض")
    cert_no = _e(cert_no or "")
    year = issue_date[:4]
    dots = '<span class="dots">..........</span>'
    f = lambda k: _e(p.get(k)) or dots
    fem = (p.get("sexe") or "").strip() in ("أنثى", "انثى", "F")
    t = (lambda m, w: w if fem else m)

    any_open = any(not _d(x.get("end")) for x in periods)
    verb = t("يزاول", "تزاول") if any_open else t("مارس", "مارست")

    lines = []
    for x in periods:
        sifa = _e(x.get("sifa") or "مستغل")
        start = _dmy(x.get("start"))
        end = _d(x.get("end"))
        if not end:
            to = f"<strong>{_dmy(today)}</strong> (إلى يومنا هذا)"
        else:
            note = " (تاريخ توقفه النهائي)" if x.get("end_kind") == "final" else ""
            to = f"<strong>{_dmy(end)}</strong>{note}"
        extra = _e(x.get("detail"))
        lines.append(f'<div>- بصفة <strong>{sifa}</strong>{(" " + extra) if extra else ""}، ابتداءً من <strong>{start}</strong> '
                     f'إلى غاية {to}.</div>')

    born = f"{_dmy(p.get('date_naissance')) or dots} ب{f('lieu_naissance')}"
    permis_date = _dmy(p.get("permis_date")) or dots
    name = f"{_e(p.get('nom'))} {_e(p.get('prenom'))}".strip()
    # نفس قالب وثائق البرنامج (الإطار، الخط، الترويسة) — routes/print.py
    body = f"""<div class="doc" style="font-size:14.5px;line-height:2.1">
    <div style="text-align:center;line-height:1.8;margin-bottom:14px">
      <div style="font-weight:800">الجمهورية الجزائرية الديمقراطية الشعبية</div>
      <div>وزارة الداخلية والجماعات المحلية والنقل</div>
      <div style="font-weight:700">مديرية النقل لولاية البيض</div>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:13.5px;margin-bottom:22px">
      <div>الرقم: {cert_no or '............'} / م.ن.و.ب / {year}</div>
      <div>{place} في: <strong dir="ltr">{_dmy(issue_date)}</strong></div>
    </div>
    <div style="text-align:center;font-size:20px;font-weight:800;text-decoration:underline;margin-bottom:22px">شهادة إدارية</div>
    <div style="font-weight:700">يشهد السيد مدير النقل لولاية البيض بأنّ:</div>
    <div style="text-indent:28px;text-align:justify">
      {t("السيد", "السيدة")}: <strong>{name or dots}</strong>، {t("المولود", "المولودة")} بتاريخ <strong>{born}</strong>،
      {t("الحامل", "الحاملة")} لرخصة السياقة رقم <strong dir="ltr">{f('num_permis')}</strong> الصادرة بتاريخ <strong>{permis_date}</strong>
      عن <strong>{f('permis_commune')}</strong>، ورقم التعريف الوطني <strong dir="ltr">{f('nin')}</strong>،
      {t("الساكن", "الساكنة")} بـ <strong>{f('adresse')}</strong>، رقم الهاتف <strong dir="ltr">{f('telephone')}</strong>.
    </div>
    <div style="text-indent:28px;margin-top:6px">{verb} نشاط النقل بواسطة سيارة الأجرة على النحو التالي:</div>
    <div style="padding-right:28px">{''.join(lines)}</div>
    <div style="text-indent:28px;margin-top:16px">سُلّمت هذه الشهادة للمعني(ة) للإدلاء بها في حدود ما يسمح به القانون.</div>
    <div style="display:flex;margin-top:36px">
      <div style="text-align:center;min-width:240px;margin-right:auto">
        <div style="font-weight:800">مدير النقل</div>
        <div style="height:90px"></div>
      </div>
    </div>
    <div class="footer">شهادة إدارية &#8212; {name} &#8212; {_dmy(issue_date)}</div>
    </div>"""
    from routes.print import html_page
    return html_page(f"شهادة إدارية — {name}", body)


# ════════════════════════════════════════
# أرشيف الشهادات الإدارية — ترقيم تلقائي وحفظ البيانات لإعادة الاستعمال
# ════════════════════════════════════════
def _ensure_table(conn):
    conn.execute("""CREATE TABLE IF NOT EXISTS work_certificates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cert_year INTEGER NOT NULL,
        cert_serial INTEGER NOT NULL,
        cert_number TEXT NOT NULL,
        nin TEXT, driver_id INTEGER,
        person_json TEXT, periods_json TEXT,
        place TEXT, issue_date TEXT,
        issued_by INTEGER,
        created_at TEXT DEFAULT (datetime('now','localtime')))""")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_wc_nin ON work_certificates(nin)")
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_wc_num ON work_certificates(cert_year, cert_serial)")


def _next_serial(conn, year):
    r = conn.execute("SELECT COALESCE(MAX(cert_serial),0) FROM work_certificates WHERE cert_year=?", (year,)).fetchone()
    return (r[0] or 0) + 1


def _clean_periods(periods):
    out = []
    for x in periods or []:
        if not _d(x.get("start")):
            continue
        out.append({"sifa": str(x.get("sifa") or "مستغل")[:30], "start": _d(x.get("start")),
                    "end": _d(x.get("end")), "end_kind": "final" if x.get("end_kind") == "final" else "",
                    "detail": str(x.get("detail") or "")[:200], "source": str(x.get("source") or "")[:200]})
    return out


PERSON_KEYS = ("nom", "prenom", "date_naissance", "lieu_naissance", "nin", "num_permis", "permis_date",
               "permis_commune", "adresse", "telephone", "sexe")


def history_for(conn, nin):
    _ensure_table(conn)
    rows = conn.execute("""SELECT id, cert_number, issue_date, place, person_json, periods_json, created_at
                           FROM work_certificates WHERE nin=? ORDER BY id DESC""", (nin,)).fetchall()
    out = []
    for r in rows:
        try:
            person, periods = json.loads(r["person_json"] or "{}"), json.loads(r["periods_json"] or "[]")
        except Exception:
            person, periods = {}, []
        out.append({"id": r["id"], "cert_number": r["cert_number"], "issue_date": r["issue_date"],
                    "place": r["place"], "created_at": r["created_at"], "person": person, "periods": periods})
    return out


@work_cert_bp.route("/api/admin/work-cert/next-number")
@require_admin
def work_cert_next_number(account):
    year = int((_d(request.args.get("date")) or datetime.now().strftime("%Y-%m-%d"))[:4])
    with get_db() as conn:
        _ensure_table(conn)
        n = _next_serial(conn, year)
    return jsonify({"cert_number": f"{n:03d}", "year": year})


@work_cert_bp.route("/api/admin/work-cert/history")
@require_admin
def work_cert_history(account):
    nin = (request.args.get("nin") or "").strip()
    with get_db() as conn:
        return jsonify({"items": history_for(conn, nin) if nin else []})


@work_cert_bp.route("/api/admin/work-cert/render", methods=["POST"])
@require_admin
def work_cert_render(account):
    """تحرير شهادة جديدة: رقم تلقائي + حفظ البيانات في قاعدة البيانات."""
    data = request.get_json(silent=True) or {}
    raw = data.get("person") or {}
    person = {k: str(raw.get(k) or "").strip()[:200] for k in PERSON_KEYS}
    periods = _clean_periods(data.get("periods"))
    if not periods:
        return Response("<p dir=rtl style='font-family:sans-serif;padding:30px'>لا توجد أي فترة نشاط صالحة.</p>",
                        mimetype="text/html; charset=utf-8"), 400
    issue_date = _d(data.get("issue_date")) or datetime.now().strftime("%Y-%m-%d")
    place = (data.get("place") or "البيض").strip()[:60]
    year = int(issue_date[:4])
    with get_db() as conn:
        _ensure_table(conn)
        serial = _next_serial(conn, year)
        cert_number = f"{serial:03d}"
        drv = conn.execute("SELECT id FROM drivers WHERE nin=? ORDER BY id DESC LIMIT 1", (person["nin"],)).fetchone() if person["nin"] else None
        cur = conn.execute("""INSERT INTO work_certificates
            (cert_year, cert_serial, cert_number, nin, driver_id, person_json, periods_json, place, issue_date, issued_by)
            VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (year, serial, cert_number, person["nin"] or None, drv["id"] if drv else None,
             json.dumps(person, ensure_ascii=False), json.dumps(periods, ensure_ascii=False),
             place, issue_date, account["id"]))
        cid = cur.lastrowid
    page = _render(person, periods, cert_number, issue_date, place)
    resp = Response(page, mimetype="text/html; charset=utf-8")
    resp.headers["X-Cert-Id"] = str(cid)
    resp.headers["X-Cert-Number"] = f"{cert_number}/{year}"
    return resp


@work_cert_bp.route("/api/admin/work-cert/<int:cid>/print")
@require_admin
def work_cert_reprint(account, cid):
    """إعادة طباعة شهادة محفوظة بنفس رقمها وبياناتها."""
    with get_db() as conn:
        _ensure_table(conn)
        r = conn.execute("SELECT * FROM work_certificates WHERE id=?", (cid,)).fetchone()
    if not r:
        return Response("<p dir=rtl style='font-family:sans-serif;padding:30px'>الشهادة غير موجودة.</p>",
                        mimetype="text/html; charset=utf-8"), 404
    page = _render(json.loads(r["person_json"] or "{}"), json.loads(r["periods_json"] or "[]"),
                   r["cert_number"], r["issue_date"], r["place"])
    return Response(page, mimetype="text/html; charset=utf-8")
