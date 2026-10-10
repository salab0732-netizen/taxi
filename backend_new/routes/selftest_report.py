# ════════════════════════════════════════════════════════════
# تقارير الفحص الشامل (selftest.py) — عرض في لوحة الإدارة وطباعة / حفظ PDF
# ════════════════════════════════════════════════════════════
import html as _h
import json
from flask import Blueprint, jsonify
from database import get_db
from utils import require_admin

selftest_bp = Blueprint("selftest_report", __name__)

_TABLE = """CREATE TABLE IF NOT EXISTS selftest_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (datetime('now','localtime')),
    duration REAL, total INTEGER, passed INTEGER, failed INTEGER, warnings INTEGER, data TEXT)"""


@selftest_bp.route("/api/admin/selftest")
@require_admin
def selftest_list(account):
    with get_db() as conn:
        conn.execute(_TABLE)
        rows = conn.execute("""SELECT id, ts, duration, total, passed, failed, warnings
                               FROM selftest_reports ORDER BY id DESC LIMIT 50""").fetchall()
    return jsonify({"items": [dict(r) for r in rows]})


@selftest_bp.route("/api/admin/selftest/<int:rid>/print")
@require_admin
def selftest_print(account, rid):
    with get_db() as conn:
        conn.execute(_TABLE)
        r = conn.execute("SELECT * FROM selftest_reports WHERE id=?", (rid,)).fetchone()
    if not r:
        return "التقرير غير موجود", 404
    items = json.loads(r["data"] or "[]")
    e = lambda x: _h.escape(str(x or ""))
    icon = {"ok": "✔", "warn": "⚠", "fail": "✘"}
    color = {"ok": "#1d7a54", "warn": "#92400e", "fail": "#b91c1c"}
    label = {"ok": "ناجح", "warn": "تنبيه", "fail": "فاشل"}

    sections, order = {}, []
    for it in items:
        s = it.get("section") or "—"
        if s not in sections:
            sections[s] = []
            order.append(s)
        sections[s].append(it)

    rows = []
    for s in order:
        lst = sections[s]
        f = sum(x["status"] == "fail" for x in lst)
        w = sum(x["status"] == "warn" for x in lst)
        cls = "sep-red" if f else "sep-warn" if w else "sep"
        rows.append(f'<tr><td class="{cls}" colspan="3">{e(s)} — {len(lst) - f - w}/{len(lst)} ناجح'
                    + (f" · {f} فاشل" if f else "") + (f" · {w} تنبيه" if w else "") + "</td></tr>")
        for x in lst:
            st = x.get("status", "ok")
            rows.append(f'<tr><td style="width:26px;color:{color[st]};font-weight:700;text-align:center">{icon[st]}</td>'
                        f'<td>{e(x.get("name"))}</td>'
                        f'<td style="width:34%;color:{color[st] if st != "ok" else "#6b7280"};font-size:12px">'
                        f'{label[st] if st != "ok" else ""}{(" — " + e(x.get("detail"))) if x.get("detail") and st != "ok" else ""}</td></tr>')

    failed, warns = r["failed"] or 0, r["warnings"] or 0
    verdict = ('<div class="badge">النتيجة: البرنامج سليم — كل الاختبارات ناجحة</div>' if not failed and not warns else
               f'<div class="warn">النتيجة: لا أعطال — {warns} تنبيه للمراجعة</div>' if not failed else
               f'<div class="danger">النتيجة: {failed} اختبار فاشل يجب إصلاحه — {warns} تنبيه</div>')
    body = f"""
<style>
  body {{ display:block !important; }}
  .doc.report {{ display:block !important; min-height:auto !important; max-width:820px; }}
  .doc.report table {{ flex:none !important; }}
  .doc.report tr {{ page-break-inside: avoid; }}
  .doc.report td {{ padding:5px 8px !important; font-size:12px !important; }}
  .kpis {{ display:flex; gap:10px; margin-bottom:16px; }}
  .kpi {{ flex:1; border:1px solid #dce2de; border-radius:8px; padding:10px; text-align:center; }}
  .kpi b {{ display:block; font-size:22px; }}
  .kpi span {{ font-size:12px; color:#6b7280; }}
</style>
<div class="doc report">
  <div class="header">
    <p>الجمهورية الجزائرية الديمقراطية الشعبية — ولاية البيض — مديرية النقل</p>
    <h1>تقرير الفحص الشامل لمنصة رخص سيارات الأجرة — رقم {r["id"]}</h1>
    <p>تاريخ الفحص: {e(r["ts"])} — المدة: {r["duration"]:.0f} ثانية</p>
  </div>
  {verdict}
  <div class="kpis">
    <div class="kpi"><b>{r["total"]}</b><span>اختبار</span></div>
    <div class="kpi"><b style="color:#1d7a54">{r["passed"]}</b><span>ناجح</span></div>
    <div class="kpi"><b style="color:#92400e">{warns}</b><span>تنبيه</span></div>
    <div class="kpi"><b style="color:#b91c1c">{failed}</b><span>فاشل</span></div>
  </div>
  <table>{''.join(rows)}</table>
  <div class="footer">يُنشأ هذا التقرير آلياً بواسطة أداة الفحص الشامل (selftest) — للحفظ بصيغة PDF: طباعة ← «حفظ بتنسيق PDF»</div>
</div>"""
    from routes.print import html_page
    return html_page(f"تقرير الفحص الشامل رقم {r['id']}", body)
