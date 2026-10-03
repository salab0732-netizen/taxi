# ════════════════════════════════════════════════════════════
# اتجاه التواريخ في الوثائق المطبوعة (عربي: من اليمين إلى اليسار)
# 03/10/2026 تُكتب بحيث يُقرأ اليوم أولاً من اليمين: ‏2026/10/03 بصرياً
# تُطبَّق على كل صفحات HTML التي يولّدها الخادم (الرخص، الشهادات، العقود، الطلبات)
# ════════════════════════════════════════════════════════════
import re

_DATE = re.compile(r"(?<![\d/.\-])(\d{1,2})/(\d{1,2})/(\d{4})(?![\d/])")
_SKIP = re.compile(r"<(title|style|script|textarea)\b.*?</\1\s*>", re.S | re.I)
_RLM = "&#8207;"
# رقم/سنة (رقم الاعتماد، رقم الشهادة…): 12/2026 ← تُقرأ من اليمين: الرقم ثم السنة
_NUM_YEAR = re.compile(r"(?<![\d/.\-])(\d{1,6})/((?:19|20)\d{2})(?![\d/])")


def _fix_text(txt):
    txt = _DATE.sub(lambda m: f'<bdi dir="rtl">{m.group(1)}{_RLM}/{_RLM}{m.group(2)}{_RLM}/{_RLM}{m.group(3)}</bdi>', txt)
    return _NUM_YEAR.sub(lambda m: f'<bdi dir="rtl">{m.group(1)}{_RLM}/{_RLM}{m.group(2)}</bdi>', txt)


def rtl_dates(html: str) -> str:
    out, pos = [], 0
    # نحمي title/style/script ثم نعالج النصوص فقط (خارج الوسوم وخصائصها)
    for m in _SKIP.finditer(html):
        out.append(_fix_segment(html[pos:m.start()]))
        out.append(m.group(0))
        pos = m.end()
    out.append(_fix_segment(html[pos:]))
    return "".join(out)


def _fix_segment(seg):
    parts = re.split(r"(<[^>]*>)", seg)
    return "".join(p if p.startswith("<") else _fix_text(p) for p in parts)


def register(app):
    @app.after_request
    def _rtl_dates_after(resp):
        try:
            if resp.mimetype == "text/html" and not resp.direct_passthrough:
                body = resp.get_data(as_text=True)
                if "/" in body:
                    resp.set_data(rtl_dates(body))
        except Exception:
            pass
        return resp
