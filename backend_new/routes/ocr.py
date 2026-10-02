from flask import Blueprint, request, jsonify
from utils import require_auth
from pathlib import Path
import base64, json, urllib.request, urllib.error

ocr_bp = Blueprint("ocr", __name__)

APP_DIR = Path(__file__).resolve().parent.parent


def get_gemini_key() -> str:
    key_file = APP_DIR / "gemini_key"
    if key_file.exists():
        return key_file.read_text().strip()
    import os
    return os.environ.get("GEMINI_API_KEY", "")

def get_claude_key() -> str:
    key_file = APP_DIR / "claude_key"
    if key_file.exists():
        return key_file.read_text().strip()
    import os
    return os.environ.get("ANTHROPIC_API_KEY", "")


def call_claude(image_base64: str, prompt: str, mime_type: str = "image/jpeg") -> dict:
    """يرسل صورة لـ Claude API ويعيد JSON مستخرج (fallback)"""
    api_key = get_claude_key()
    if not api_key:
        return {"error": "مفتاح Claude غير موجود"}

    url = "https://api.anthropic.com/v1/messages"
    payload = {
        "model": "claude-haiku-4-5",
        "max_tokens": 2048,
        "messages": [{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": mime_type,
                        "data": image_base64
                    }
                },
                {"type": "text", "text": prompt}
            ]
        }]
    }

    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode(),
            headers={
                "Content-Type": "application/json",
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01"
            },
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read())
            text = result["content"][0]["text"]

            import re
            text = text.strip()
            text = re.sub(r'^```json\s*\n?', '', text)
            text = re.sub(r'^```\s*\n?', '', text)
            text = re.sub(r'\n?\s*```$', '', text)
            text = text.strip()
            brace = text.find('{')
            if brace > 0:
                text = text[brace:]
            rbrace = text.rfind('}')
            if rbrace != -1 and rbrace < len(text) - 1:
                text = text[:rbrace+1]

            return json.loads(text)

    except json.JSONDecodeError as e:
        return {"error": f"Claude JSON parse error: {str(e)}"}
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        import sys
        print(f"[Claude] HTTP {e.code}: {body[:300]}", file=sys.stderr)
        return {"error": f"Claude HTTP {e.code}: {body[:200]}"}
    except Exception as e:
        import sys
        print(f"[Claude] Exception: {str(e)}", file=sys.stderr)
        return {"error": f"Claude exception: {str(e)}"}


def call_ocr(image_base64: str, prompt: str, mime_type: str = "image/jpeg") -> dict:
    """يحاول Gemini أولاً، ثم Claude كـ fallback"""
    import sys
    result = call_gemini(image_base64, prompt, mime_type)
    if "error" in result:
        print(f"[OCR] Gemini failed: {result['error'][:100]} — trying Claude...", file=sys.stderr)
        result = call_claude(image_base64, prompt, mime_type)
        if "error" not in result:
            result["_provider"] = "claude"
            print(f"[OCR] Claude succeeded! keys={list(result.keys())[:5]}", file=sys.stderr)
        else:
            print(f"[OCR] Claude also failed: {result['error'][:200]}", file=sys.stderr)
    else:
        print(f"[OCR] Gemini succeeded.", file=sys.stderr)
    return result



def call_gemini(image_base64: str, prompt: str, mime_type: str = "image/jpeg") -> dict:
    """يرسل صورة أو PDF لـ Gemini ويعيد JSON مستخرج"""
    api_key = get_gemini_key()
    if not api_key:
        return {"error": "مفتاح Gemini غير موجود"}

    url = (
        "https://generativelanguage.googleapis.com/v1beta/"
        f"models/gemini-3.6-flash:generateContent?key={api_key}"
    )

    # PDF يُرسل كـ inline_data بنفس الطريقة
    payload = {
        "contents": [{
            "parts": [
                {"text": prompt},
                {"inline_data": {
                    "mime_type": mime_type,
                    "data": image_base64
                }}
            ]
        }],
        "generationConfig": {"temperature": 0.1}
    }

    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())
            text = result["candidates"][0]["content"]["parts"][0]["text"]

            # === تنظيف شامل ===
            import re
            text = text.strip()

            # إزالة ```json أو ``` من البداية
            text = re.sub(r'^```json\s*\n?', '', text)
            text = re.sub(r'^```\s*\n?', '', text)

            # إزالة ``` من النهاية
            text = re.sub(r'\n?\s*```$', '', text)
            text = text.strip()

            # إذا كان هناك نص قبل { — خذ فقط ما بعد أول {
            brace = text.find('{')
            if brace > 0:
                text = text[brace:]

            # إذا كان هناك نص بعد } الأخيرة — اقطع عندها
            rbrace = text.rfind('}')
            if rbrace != -1 and rbrace < len(text) - 1:
                text = text[:rbrace+1]

            return json.loads(text)

    except json.JSONDecodeError as e:
        return {"error": f"JSON parse error: {str(e)}", "raw": text if 'text' in dir() else ""}
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        return {"error": f"HTTP {e.code}: {body[:200]}"}
    except Exception as e:
        return {"error": str(e)}


def clean_date(val):
    """يحوّل أي صيغة تاريخ إلى YYYY-MM-DD
    يدعم: YYYY-MM-DD / DD/MM/YYYY / DD mois YYYY (فرنسي أو عربي دارج)
    """
    if not val or not isinstance(val, str): return None
    import re
    val = val.strip()

    # YYYY-MM-DD → حوّل إلى DD/MM/YYYY
    m = re.match(r'^(\d{4})-(\d{2})-(\d{2})$', val)
    if m:
        y, mo, d = m.group(1), m.group(2), m.group(3)
        if mo == "00" and d == "00":
            return f"00/00/{y}"
        return f"{d}/{mo}/{y}"

    # YYYY.XX.XX أو YYYY/XX/XX — بطاقة قديمة يوم وشهر مجهولان (مثال: 1961.XX.XX)
    m = re.match(r'^(\d{4})[./](XX|xx|\?\?)[./](XX|xx|\?\?)$', val, re.IGNORECASE)
    if m:
        return f"00/00/{m.group(1)}"

    # YYYY.MM.XX أو YYYY.XX.DD — أحد الحقلين مجهول
    m = re.match(r'^(\d{4})[./](\d{1,2}|XX|xx)[./](\d{1,2}|XX|xx)$', val, re.IGNORECASE)
    if m:
        y = m.group(1)
        mo_raw = m.group(2); dd_raw = m.group(3)
        mo = "00" if mo_raw.upper() == "XX" else mo_raw.zfill(2)
        dd = "00" if dd_raw.upper() == "XX" else dd_raw.zfill(2)
        return f"{dd}/{mo}/{y}"

    # YYYY.MM.DD أو YYYY/MM/DD (صيغة البطاقة الجزائرية الجديدة)
    m = re.match(r'^(\d{4})[./](\d{1,2})[./](\d{1,2})$', val)
    if m:
        return f"{m.group(3).zfill(2)}/{m.group(2).zfill(2)}/{m.group(1)}"

    # DD/MM/YYYY أو DD-MM-YYYY
    m = re.match(r'^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$', val)
    if m:
        return f"{m.group(1).zfill(2)}/{m.group(2).zfill(2)}/{m.group(3)}"

    # DD mois YYYY — فرنسي أو عربي دارج جزائري
    MONTHS = {
        # فرنسي
        "janvier":1, "fevrier":2, "février":2, "mars":3, "avril":4,
        "mai":5, "juin":6, "juillet":7, "aout":8, "août":8,
        "septembre":9, "octobre":10, "novembre":11, "decembre":12, "décembre":12,
        # عربي دارج جزائري
        "جانفي":1, "جانفيي":1, "فيفري":2, "فيفريي":2,
        "مارس":3, "أفريل":4, "افريل":4,
        "ماي":5, "جوان":6, "جويلية":7, "جويلي":7,
        "أوت":8, "اوت":8,
        "سبتمبر":9, "سبتمبره":9,
        "أكتوبر":10, "اكتوبر":10,
        "نوفمبر":11, "نوفمبره":11,
        "ديسمبر":12, "ديسمبره":12,
    }
    m = re.match(r'^(\d{1,2})\s+([\u0600-\u06ffa-z\u00e0-\u00ff]+)\s+(\d{4})$', val, re.IGNORECASE)
    if m:
        day, month_str, year = m.group(1), m.group(2).lower(), m.group(3)
        month_num = MONTHS.get(month_str)
        if month_num:
            return f"{year}-{str(month_num).zfill(2)}-{day.zfill(2)}"

    # سنة مجردة YYYY (مثال: 1961) — بطاقة قديمة شهر/يوم غير مقروءين
    m = re.match(r'^(\d{4})$', val)
    if m:
        y = int(m.group(1))
        if 1920 <= y <= 2010:
            return f"00/00/{m.group(1)}"

    return None


def normalize_energie(val: str) -> str:
    """يحوّل قيمة الطاقة من أي لغة إلى القيمة العربية المعتمدة في الواجهة"""
    if not val or not isinstance(val, str):
        return None
    v = val.strip().lower()
    mapping = {
        # غازوال
        "diesel": "غازوال", "gazole": "غازوال", "gazoil": "غازوال",
        "gasoil": "غازوال", "go": "غازوال", "gas oil": "غازوال",
        "غازوال": "غازوال", "ديزل": "غازوال",
        # بنزين
        "essence": "بنزين", "gasoline": "بنزين", "petrol": "بنزين",
        "sp95": "بنزين", "sp98": "بنزين", "super": "بنزين",
        "بنزين": "بنزين", "عادي": "بنزين",
        # غاز
        "gpl": "غاز", "gpl/c": "غاز", "lpg": "غاز", "gaz": "غاز",
        "gnv": "غاز", "cng": "غاز", "غاز": "غاز",
        # كهرباء
        "electrique": "كهرباء", "electric": "كهرباء", "ev": "كهرباء",
        "كهرباء": "كهرباء",
        # هجين
        "hybride": "هجين", "hybrid": "هجين", "هجين": "هجين",
    }
    return mapping.get(v, val)  # إذا ما وُجد → أبقِ القيمة الأصلية


def normalize_decision_type(val: str) -> str:
    """يطبّع نوع القرار الولائي إلى القيمة المعتمدة"""
    if not val or not isinstance(val, str):
        return None
    v = val.strip().lower()
    # استفادة
    if any(w in v for w in ["استفادة", "استفاده", "bénéficiaire", "beneficiaire",
                              "attribution", "منحة", "منح"]):
        # تحويل استفادة يجب أن يُفحص أولاً
        if any(w in v for w in ["تحويل", "transfert", "نقل"]):
            return "تحويل_استفادة"
        return "استفادة"
    # تحويل ولاية
    if any(w in v for w in ["تحويل_ولاية", "تحويل ولاية", "wilaya", "inter-wilaya",
                              "بين الولايات", "من ولاية"]):
        return "تحويل_ولاية"
    # تحويل استفادة
    if any(w in v for w in ["تحويل_استفادة", "تحويل استفادة", "transfert", "نقل"]):
        return "تحويل_استفادة"
    return val  # أعد القيمة كما هي إذا لم تُعرَف


def normalize_sifa(val: str) -> str:
    """يطبّع صفة المستفيد إلى القيمة المعتمدة"""
    if not val or not isinstance(val, str):
        return None
    v = val.strip()
    if "شهيد" in v:
        return "ابن_شهيد"
    if "أرملة" in v or "ارملة" in v or "veuve" in v.lower():
        return "أرملة_مجاهد"
    if "ابن" in v and "مجاهد" in v:
        return "ابن_مجاهد"
    if "مجاهد" in v:
        return "مجاهد"
    return val


def clean_ocr_result(data: dict) -> dict:
    """ينظّف نتيجة OCR: يُصحّح التواريخ ويحوّل null strings إلى None ويطبّع الطاقة"""
    # حقول تُحوَّل إلى DD/MM/YYYY (حقول نصية للعرض فقط)
    DATE_FIELDS = [
        "date_delivrance_cni", "date_expiration_cni",
    ]
    # حقول تبقى YYYY-MM-DD (لـ <input type="date"> في الواجهة)
    ISO_DATE_FIELDS = [
        "date_naissance",
        "decision_date",
        "date_delivrance", "date_expiration",
        "quittance_date", "proprietaire_dob",
    ]
    result = {}
    for k, v in data.items():
        if k in DATE_FIELDS:
            result[k] = clean_date(v)
        elif k in ISO_DATE_FIELDS:
            # يبقى YYYY-MM-DD لـ <input type="date">
            import re as _re2
            if v and isinstance(v, str) and v not in ("null",""):
                _v2 = v.strip()
                # YYYY-MM-DD بالفعل
                if _re2.match(r'^\d{4}-\d{2}-\d{2}$', _v2):
                    result[k] = _v2
                # DD/MM/YYYY أو DD-MM-YYYY
                elif _re2.match(r'^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$', _v2):
                    _m = _re2.match(r'^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$', _v2)
                    result[k] = f"{_m.group(3)}-{_m.group(2).zfill(2)}-{_m.group(1).zfill(2)}"
                # YYYY.MM.DD أو YYYY/MM/DD
                elif _re2.match(r'^(\d{4})[./](\d{1,2})[./](\d{1,2})$', _v2):
                    _m = _re2.match(r'^(\d{4})[./](\d{1,2})[./](\d{1,2})$', _v2)
                    result[k] = f"{_m.group(1)}-{_m.group(2).zfill(2)}-{_m.group(3).zfill(2)}"
                # DD.MM.YYYY
                elif _re2.match(r'^(\d{1,2})\.(\d{1,2})\.(\d{4})$', _v2):
                    _m = _re2.match(r'^(\d{1,2})\.(\d{1,2})\.(\d{4})$', _v2)
                    result[k] = f"{_m.group(3)}-{_m.group(2).zfill(2)}-{_m.group(1).zfill(2)}"
                else:
                    result[k] = _v2
            else:
                result[k] = None
        elif k == "energie":
            result[k] = normalize_energie(v) if v and v not in ("null", "") else None
        elif k == "decision_type":
            result[k] = normalize_decision_type(v) if v and v not in ("null", "") else None
        elif k == "beneficiary_sifa":
            result[k] = normalize_sifa(v) if v and v not in ("null", "") else None
        elif v in ("null", ""):
            result[k] = None
        else:
            result[k] = v
    return result


# ════════════════════════════════════════
# POST /api/ocr/permis
# استخراج بيانات رخصة السياقة
# ════════════════════════════════════════

@ocr_bp.route("/api/ocr/permis", methods=["POST"])
@require_auth
def ocr_permis(account):
    data = request.get_json() or {}
    img_b64   = data.get("image_base64", "")
    mime_type = data.get("mime_type", "image/jpeg")
    if not img_b64:
        return jsonify({"error": "الصورة مطلوبة"}), 400

    prompt = """أنت خبير دقيق في قراءة وثائق رخص السياقة الجزائرية.

مهمتك: استخراج كل بيانات رخصة السياقة بدقة متناهية وصرامة تامة.

قواعد صارمة:
- اقرأ كل حرف ورقم بدقة — لا تخترع ولا تُكمّل
- الأرقام: لا تبدّل بين 0/O أو 1/I أو 6/G
- التواريخ: أعدها دائماً بصيغة YYYY-MM-DD
- رقم الرخصة: اقرأه حرفاً بحرف كما هو مكتوب
- الفئات: قائمة بالأحرف الكبيرة فقط مثل ["B"] أو ["B", "C", "D"]
- الأسماء: حافظ على الكتابة الأصلية بدون تعديل
- إذا لم تجد قيمة بوضوح: أعد null — لا تخمّن

أعد هذا JSON فقط بدون أي نص إضافي:
{
  "num_permis": "رقم الرخصة كما هو مكتوب حرفياً",
  "nom_ar": "اللقب بالعربية كما هو",
  "prenom_ar": "الاسم بالعربية كما هو",
  "nom_fr": "اللقب بالحروف اللاتينية كما هو",
  "prenom_fr": "الاسم بالحروف اللاتينية كما هو",
  "date_naissance": "تاريخ الميلاد — أعده كما هو على البطاقة (YYYY.MM.DD أو YYYY.XX.XX أو سنة فقط مثل 1961)، لا تحوّله",
  "lieu_naissance": "مكان الميلاد كما هو",
  "nin": "رقم التعريف الوطني 18 رقماً إن وُجد",
  "date_delivrance": "تاريخ الإصدار YYYY-MM-DD",
  "date_expiration": "تاريخ الانتهاء YYYY-MM-DD",
  "lieu_delivrance": "مكان الإصدار كما هو",
  "wilaya_delivrance": "الولاية كما هي",
  "categories": ["B"]
}
أعد JSON فقط."""

    result = call_ocr(img_b64, prompt, mime_type)
    if "error" not in result:
        result = clean_ocr_result(result)
    return jsonify({"ocr": result})


# ════════════════════════════════════════
# POST /api/ocr/carte-grise
# استخراج بيانات البطاقة الرمادية
# ════════════════════════════════════════

@ocr_bp.route("/api/ocr/carte-grise", methods=["POST"])
@require_auth
def ocr_carte_grise(account):
    data = request.get_json() or {}
    img_b64   = data.get("image_base64", "")
    mime_type = data.get("mime_type", "image/jpeg")
    if not img_b64:
        return jsonify({"error": "الصورة مطلوبة"}), 400

    prompt = """أنت خبير في قراءة البطاقات الرمادية الجزائرية (carte grise).
استخرج البيانات التالية وأعدها كـ JSON فقط بدون أي نص إضافي.

ملاحظات مهمة:
- حقل "genre" هو النوع كما هو مكتوب في البطاقة الرمادية (مثال: TCP، VT، حافلة صغيرة)
- حقل "energie" أعده بالفرنسية كما هو في البطاقة (مثال: DIESEL، ESSENCE، GPL/C)
- حقل "proprietaire_nom_ar" و"proprietaire_prenom_ar": اللقب والاسم بالعربية كما هو في البطاقة
- حقل "proprietaire_nom" و"proprietaire_prenom": اللقب والاسم بالفرنسية أو حروف لاتينية
- افحص البطاقة بعناية شديدة قبل اعتبار أي حقل غير موجود؛ الحقول التالية غالباً ما تكون
  مطبوعة بأرقام أو رموز صغيرة في أعلى/أسفل البطاقة ويجب البحث عنها جيداً قبل إرجاع null:
  "carrosserie" (يُختصر أحياناً CARR.)، "nb_places" (يُكتب أحياناً PLACES أو NBRE PLACES)،
  "poids_total" (P.T.C.)، "charge_utile" (C.U.)، "date_delivrance" (تاريخ التسليم/الإصدار
  المطبوع أسفل البطاقة بجانب الختم أو التوقيع)، "wilaya_delivrance" (رمز الولاية أو اسمها
  بجانب مكان التسليم)
- استخرج القيمة حتى لو كانت مكتوبة بخط اليد أو غير واضحة تماماً، واكتب أقرب قراءة ممكنة
  بدلاً من إرجاع null مباشرة

{
  "num_immatriculation": "رقم التسجيل",
  "num_precedent": "الرقم السابق إن وجد",
  "marque": "الصنف — MARQUE",
  "type_vehicule": "الطراز — TYPE",
  "num_serie": "الرقم التسلسلي في الطراز",
  "genre": "النوع — GENRE كما هو مكتوب",
  "carrosserie": "الهيكل — CARROSSERIE",
  "energie": "الطاقة — ENERGIE كما هو مكتوب (DIESEL/ESSENCE/GPL...)",
  "puissance": "القوة — PUISSANCE",
  "nb_places": "عدد المقاعد — PLACES ASSISES",
  "poids_total": "جملة الحمولة — POIDS TOTAL EN CHARGE",
  "charge_utile": "الحمولة المقيدة — CHARGE UTILE",
  "annee_circulation": "سنة أول استعمال — ANNEE",
  "date_delivrance": "تاريخ التسليم YYYY-MM-DD",
  "lieu_delivrance": "مكان التسليم",
  "wilaya_delivrance": "الولاية",
  "quittance_num": "رقم الوصل",
  "quittance_montant": "مبلغ الوصل",
  "quittance_date": "تاريخ الوصل YYYY-MM-DD",
  "proprietaire_nom_ar": "لقب المالك بالعربية",
  "proprietaire_prenom_ar": "اسم المالك بالعربية",
  "proprietaire_nom": "لقب المالك بالفرنسية أو اللاتينية",
  "proprietaire_prenom": "اسم المالك بالفرنسية أو اللاتينية",
  "proprietaire_dob": "تاريخ ميلاد المالك YYYY-MM-DD",
  "proprietaire_lieu": "مكان ميلاد المالك",
  "proprietaire_adresse": "عنوان المالك",
  "proprietaire_commune": "بلدية المالك",
  "proprietaire_wilaya": "ولاية المالك",
  "profession": "المهنة"
}
إذا لم تجد قيمة اكتب null. أعد JSON فقط."""

    result = call_ocr(img_b64, prompt, mime_type)
    if "error" not in result:
        result = clean_ocr_result(result)
    return jsonify({"ocr": result})


# ════════════════════════════════════════
# POST /api/ocr/cni
# استخراج بيانات بطاقة التعريف الوطنية
# ════════════════════════════════════════

@ocr_bp.route("/api/ocr/cni", methods=["POST"])
@require_auth
def ocr_cni(account):
    data = request.get_json() or {}
    img_b64   = data.get("image_base64", "")
    mime_type = data.get("mime_type", "image/jpeg")
    if not img_b64:
        return jsonify({"error": "الصورة مطلوبة"}), 400

    prompt = """أنت خبير في قراءة بطاقات التعريف الوطنية الجزائرية (الوجه الأمامي أو الخلفي).

═══ قواعد القراءة ═══
• الوجه الأمامي يحتوي: اللقب/الاسم بالعربية، رقم التعريف الوطني (NIN) 18 رقماً، تاريخ ومكان الميلاد
• الوجه الخلفي يحتوي: Nom/Prénom بالفرنسية، شريط MRZ (ثلاثة أسطر من الأحرف والأرقام)
• تاريخ الميلاد في الوجه الأمامي يكون بصيغة YYYY.MM.DD (نقاط) — أعده كـ YYYY-MM-DD
• إذا كان تاريخ الميلاد يحتوي على XX مثل 1961.XX.XX (يوم وشهر مجهولان) → أعده حرفياً كما هو: "1961.XX.XX"
• إذا كان الوجه الخلفي: اقرأ السطر الثاني من MRZ (6 أرقام أولى = تاريخ الميلاد YYMMDD)
  مثال: "8006167M..." → السنة=1980، الشهر=06، اليوم=16 → 1980-06-16
• "Nom:" يقابل اللقب بالفرنسية (nom_fr)، "Prénom(s):" يقابل الاسم بالفرنسية (prenom_fr)

استخرج البيانات وأعدها كـ JSON فقط:
{
  "nom_ar": "اللقب بالعربية",
  "prenom_ar": "الاسم بالعربية",
  "nom_fr": "اللقب بالفرنسية",
  "prenom_fr": "الاسم بالفرنسية",
  "date_naissance": "تاريخ الميلاد — أعده كما هو على البطاقة (YYYY.MM.DD أو YYYY.XX.XX أو سنة فقط مثل 1961)، لا تحوّله",
  "lieu_naissance_ar": "مكان الميلاد بالعربية",
  "lieu_naissance_fr": "مكان الميلاد بالفرنسية",
  "wilaya_naissance": "ولاية الميلاد",
  "commune": "البلدية",
  "wilaya": "الولاية",
  "adresse": "العنوان",
  "nin": "رقم التعريف الوطني 18 رقم",
  "sexe": "الجنس: ذكر أو أنثى",
  "groupe_sanguin": "فصيلة الدم مثل O+ أو A-",
  "autorite_delivrance": "سلطة الإصدار مثل بلدية البيض",
  "date_delivrance_cni": "تاريخ إصدار البطاقة YYYY-MM-DD",
  "date_expiration_cni": "تاريخ انتهاء البطاقة YYYY-MM-DD",
  "num_document_cni": "رقم الوثيقة الظاهر أعلى البطاقة أو في MRZ"
}
إذا لم تجد قيمة اكتب null. أعد JSON فقط."""

    result = call_ocr(img_b64, prompt, mime_type)
    if "error" not in result:
        result = clean_ocr_result(result)
        # ── استنتاج الجنس من NIN إذا لم يُقرأ من البطاقة ──
        # NIN الجزائري: الرقم الأول 1=ذكر، 2=أنثى
        if not result.get("sexe"):
            nin = result.get("nin") or ""
            if nin and nin[0] == "1":
                result["sexe"] = "ذكر"
            elif nin and nin[0] == "2":
                result["sexe"] = "أنثى"
        else:
            # تطبيع قيمة الجنس (OCR قد يُعيد صيغاً مختلفة)
            s = str(result["sexe"]).strip()
            if any(x in s for x in ["ذكر", "مذكر", "Masc", "M", "male", "Male"]):
                result["sexe"] = "ذكر"
            elif any(x in s for x in ["أنثى", "انثى", "Fém", "F", "female", "Female"]):
                result["sexe"] = "أنثى"
    return jsonify({"ocr": result})


# ════════════════════════════════════════
# POST /api/ocr/decision
# استخراج بيانات القرار الولائي
# ════════════════════════════════════════

@ocr_bp.route("/api/ocr/decision", methods=["POST"])
@require_auth
def ocr_decision(account):
    data = request.get_json() or {}
    img_b64   = data.get("image_base64", "")
    mime_type = data.get("mime_type", "image/jpeg")
    if not img_b64:
        return jsonify({"error": "الصورة مطلوبة"}), 400

    prompt = """أنت خبير في قراءة القرارات الولائية الجزائرية المتعلقة برخص استغلال سيارات الأجرة (تاكسي).

هذه وثيقة رسمية صادرة عن الوالي أو مديرية النقل، تمنح صاحبها حق استغلال سيارة أجرة.

⚠️ تنبيه مهم: رقم الباب (رقم الرخصة) لا يظهر في القرار الولائي — لا تبحث عنه ولا تُعيده.

═══ رقم وتاريخ القرار ═══
يظهران في أعلى الوثيقة مكتوبَيْن بخط اليد في فراغات، مثل:
- "القرار رقم ....1170.... المؤرخ في ....13 جوان 2022...."
- "Arrêté N° ...122... du ...12/12/2026..."

قواعد القراءة:
- رقم القرار: اقرأ الأرقام المكتوبة بخط اليد بدقة — لا تخلط بين 1 و7 أو 0 و6
- التاريخ: قد يكون بالفرنسية (janvier=01, février=02, mars=03, avril=04, mai=05, juin=06, juillet=07, août=08, septembre=09, octobre=10, novembre=11, décembre=12) أو بالعربية (جانفي=01, فيفري=02, مارس=03, أفريل=04, ماي=05, جوان=06, جويلية=07, أوت=08, سبتمبر=09, أكتوبر=10, نوفمبر=11, ديسمبر=12)
- أعد التاريخ دائماً بصيغة YYYY-MM-DD (مثال: 13 juin 2022 → 2022-06-13)

═══ مكان الاستغلال (بلدية الإلحاق) ═══
هو البلدية التي يُصرَّح للمستفيد باستغلال الرخصة فيها، يظهر في عبارات مثل:
- "مكان الاستغلال: بلدية البيض"
- "بلدية الإلحاق: البيض"
- "lieu d'exploitation: commune de Bayadh"
- "zone d'exploitation: commune de..."
أعد اسم البلدية فقط بالعربية (مثال: البيض، مشرية، بوعلام)

═══ نوع القرار ═══
أعد إحدى هذه القيم الثلاث فقط:
- "استفادة"         → منح رخصة جديدة لأول مرة (attribution, bénéfice)
- "تحويل_استفادة"   → نقل الرخصة من شخص لآخر داخل نفس الولاية (transfert de bénéfice)
- "تحويل_ولاية"     → نقل الرخصة من ولاية لأخرى (transfert inter-wilaya)

═══ صفة المستفيد ═══
أعد إحدى هذه القيم الأربع فقط:
- "مجاهد"         → المستفيد نفسه مجاهد (moudjahid)
- "ابن_مجاهد"    → المستفيد ابن مجاهد (fils de moudjahid)
- "ابن_شهيد"     → المستفيد ابن شهيد (fils de chahid / martyr)
- "أرملة_مجاهد"  → المستفيدة أرملة مجاهد (veuve de moudjahid)

═══ اسم المستفيد ═══
اللقب والاسم كما هما مكتوبان في القرار (بالعربية أو الفرنسية)

═══ الولاية المُصدِرة ═══
اسم الولاية التي أصدرت القرار (مثال: البيض، الأغواط، مستغانم)

أعد هذا JSON فقط بدون أي نص إضافي:
{
  "decision_number":      "رقم القرار الترتيبي كما هو مكتوب في أعلى الوثيقة",
  "decision_date":        "تاريخ القرار YYYY-MM-DD",
  "decision_wilaya":      "اسم الولاية المُصدِرة للقرار",
  "decision_type":        "استفادة أو تحويل_استفادة أو تحويل_ولاية",
  "exploitation_commune": "اسم بلدية الإلحاق / مكان الاستغلال",
  "beneficiary_nom":      "لقب المستفيد",
  "beneficiary_prenom":   "اسم المستفيد",
  "beneficiary_sifa":     "مجاهد أو ابن_مجاهد أو ابن_شهيد أو أرملة_مجاهد"
}

قواعد صارمة:
- لا تُضِف حقل door_number — رقم الباب غير موجود في هذه الوثيقة
- decision_type: إحدى القيم الثلاث فقط كما هي بالضبط
- beneficiary_sifa: إحدى القيم الأربع فقط كما هي بالضبط
- إذا لم تجد قيمة بوضوح: أعد null
أعد JSON فقط."""

    result = call_ocr(img_b64, prompt, mime_type)
    if "error" not in result:
        result = clean_ocr_result(result)
    return jsonify({"ocr": result})


# ════════════════════════════════════════
# GET /api/ocr/test-claude  — تشخيص مؤقت
# ════════════════════════════════════════
@ocr_bp.route("/api/ocr/test-claude", methods=["GET"])
@require_auth
def test_claude_api(account):
    import urllib.request, urllib.error, json
    api_key = get_claude_key()
    if not api_key:
        return jsonify({"error": "مفتاح غير موجود"})

    # 1. جلب قائمة النماذج المتاحة
    try:
        req = urllib.request.Request(
            "https://api.anthropic.com/v1/models",
            headers={"x-api-key": api_key, "anthropic-version": "2023-06-01"},
            method="GET"
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            models_data = json.loads(resp.read())
            return jsonify({"models": [m.get("id") for m in models_data.get("data", [])]})
    except urllib.error.HTTPError as e:
        return jsonify({"error": f"HTTP {e.code}: {e.read().decode()[:300]}"})
    except Exception as e:
        return jsonify({"error": str(e)})
