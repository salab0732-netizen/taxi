from flask import Flask, request, jsonify, Response, send_from_directory
from flask_cors import CORS
import sqlite3, base64, json, urllib.request, urllib.error, os, sys
from datetime import datetime
from pathlib import Path

app  = Flask(__name__, static_folder=None)  # نُعطّل static الافتراضي — نتحكم به يدوياً في route مخصص
CORS(app)

# ── مسارات ثابتة ──────────────────────────────────────────────
# __file__ = موقع app.py الفعلي → يُستخدم لكل موارد البرنامج
APP_DIR    = Path(__file__).resolve().parent
DB_PATH    = APP_DIR / "registrations.db"
IMAGES_DIR = APP_DIR / "images"
IMAGES_DIR.mkdir(exist_ok=True)

# ── قاعدة البيانات ────────────────────────────────────────────
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as conn:
        conn.execute("""CREATE TABLE IF NOT EXISTS candidates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT DEFAULT (datetime('now','localtime')),
            nom_ar TEXT, prenom_ar TEXT, nom_fr TEXT, prenom_fr TEXT,
            date_naissance TEXT, lieu_naissance TEXT, wilaya_naissance TEXT,
            adresse TEXT, commune TEXT, wilaya TEXT,
            nationalite TEXT DEFAULT 'جزائري',
            nin TEXT UNIQUE,
            telephone TEXT, telephone2 TEXT,
            num_permis TEXT, date_delivrance TEXT, date_expiration TEXT,
            lieu_delivrance TEXT, wilaya_delivrance TEXT, categories TEXT,
            image_permis_path TEXT, notes TEXT, statut TEXT DEFAULT 'جديد'
        )""")
        conn.execute("""CREATE TABLE IF NOT EXISTS vehicles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            candidate_id INTEGER REFERENCES candidates(id),
            created_at TEXT DEFAULT (datetime('now','localtime')),
            num_immatriculation TEXT, num_precedent TEXT,
            marque TEXT, type_vehicule TEXT, modele TEXT,
            num_serie TEXT, genre TEXT, carrosserie TEXT,
            energie TEXT, puissance TEXT,
            nb_places TEXT, poids_total TEXT, charge_utile TEXT,
            annee_circulation TEXT,
            date_delivrance TEXT, lieu_delivrance TEXT, wilaya_delivrance TEXT,
            quittance_num TEXT, quittance_montant TEXT, quittance_date TEXT,
            proprietaire_nom TEXT, proprietaire_prenom TEXT,
            proprietaire_dob TEXT, proprietaire_lieu TEXT,
            proprietaire_adresse TEXT, proprietaire_commune TEXT,
            proprietaire_wilaya TEXT, profession TEXT,
            image_carte_grise_path TEXT
        )""")
        conn.execute("""CREATE TABLE IF NOT EXISTS companies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT DEFAULT (datetime('now','localtime')),
            nom_societe TEXT, registre_commerce TEXT, numero_agreement TEXT,
            nom_responsable TEXT, prenom_responsable TEXT,
            telephone TEXT, telephone2 TEXT, email TEXT,
            adresse TEXT, wilaya TEXT,
            nb_vehicules TEXT, type_vehicules TEXT, notes TEXT
        )""")
        conn.commit()
    print("DB ready:", DB_PATH)

# ── تحميل مفتاح Gemini ────────────────────────────────────────
def load_api_key():
    """
    يبحث عن gemini_key.txt في:
    1. نفس مجلد app.py  (APP_DIR)
    2. مجلد العمل الحالي (cwd)
    3. متغير البيئة GEMINI_API_KEY
    """
    for d in [APP_DIR, Path(os.getcwd())]:
        f = d / "gemini_key.txt"
        if f.exists():
            key = f.read_text(encoding="utf-8").strip()
            if key and len(key) > 10 and not key.startswith(("ضع", "#")):
                print(f"[Gemini] key loaded from {f} ({key[:8]}...)")
                return key
    env = os.environ.get("GEMINI_API_KEY", "")
    if env:
        return env
    print(f"[Gemini] key not found — APP_DIR={APP_DIR}  cwd={os.getcwd()}")
    return ""

# ── تحميل مفتاح Claude ────────────────────────────────────────
def load_claude_key():
    f = APP_DIR / "claude_key.txt"
    if f.exists():
        key = f.read_text(encoding="utf-8").strip()
        if key and not key.startswith("#") and len(key) > 10:
            return key
    return os.environ.get("ANTHROPIC_API_KEY", "")

# ── إرسال طلب Gemini (يدعم كلا صيغتي المفتاح) ─────────────────
def _gemini_request(model, api_ver, payload_bytes, api_key):
    """
    AIzaSy... → ?key= في URL
    AQ...     → x-goog-api-key في header (صيغة OAuth2 الجديدة)
    """
    base = "https://generativelanguage.googleapis.com"
    endpoint = f"{base}/{api_ver}/models/{model}:generateContent"
    if api_key.startswith("AIza"):
        url = f"{endpoint}?key={api_key}"
        headers = {"Content-Type": "application/json"}
    else:
        url = endpoint
        headers = {
            "Content-Type": "application/json",
            "x-goog-api-key": api_key,
        }
    req = urllib.request.Request(url, data=payload_bytes,
                                 headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=45) as resp:
        return json.loads(resp.read().decode("utf-8"))

# ── استخراج JSON من رد Gemini ─────────────────────────────────
def _extract_json(result):
    text = result["candidates"][0]["content"]["parts"][0]["text"].strip()
    text = text.replace("```json", "").replace("```", "").strip()
    s, e = text.find("{"), text.rfind("}") + 1
    if s >= 0 < e:
        text = text[s:e]
    return json.loads(text)

# ── OCR عام (يجرّب Gemini ثم Claude) ─────────────────────────
GEMINI_MODELS = [
    ("gemini-2.5-flash",      "v1beta"),
    ("gemini-2.0-flash",      "v1beta"),
    ("gemini-2.0-flash-lite", "v1beta"),
    ("gemini-1.5-flash",      "v1beta"),
    ("gemini-1.5-flash-8b",   "v1beta"),
]

def run_ocr(image_b64, mime, prompt):
    """
    يُرجع (data_dict, source_str) أو يرفع Exception
    """
    api_key  = load_api_key()
    payload  = json.dumps({
        "contents": [{"parts": [
            {"inline_data": {"mime_type": mime, "data": image_b64}},
            {"text": prompt}
        ]}],
        "generationConfig": {"temperature": 0, "maxOutputTokens": 2048}
    }).encode("utf-8")

    last_err = ""
    if api_key:
        for model, ver in GEMINI_MODELS:
            try:
                result = _gemini_request(model, ver, payload, api_key)
                data   = _extract_json(result)
                print(f"[OCR] ✅ {model}")
                return data, model
            except urllib.error.HTTPError as ex:
                body = ex.read().decode("utf-8")
                last_err = f"HTTP {ex.code} ({model}): {body[:120]}"
                print(f"[OCR] {last_err}")
                if ex.code not in (429, 500, 503):
                    break
                import time; time.sleep(1)
            except json.JSONDecodeError as ex:
                last_err = f"JSON ({model}): {ex}"
                print(f"[OCR] {last_err}")
                import time; time.sleep(1)
            except Exception as ex:
                last_err = str(ex)
                print(f"[OCR] {last_err}")
                break
    else:
        last_err = "Gemini key missing"

    # Claude fallback
    claude_key = load_claude_key()
    if claude_key:
        try:
            payload_c = json.dumps({
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 1024,
                "messages": [{"role": "user", "content": [
                    {"type": "image", "source": {
                        "type": "base64", "media_type": mime, "data": image_b64}},
                    {"type": "text", "text": prompt}
                ]}]
            }).encode("utf-8")
            req = urllib.request.Request(
                "https://api.anthropic.com/v1/messages",
                data=payload_c, method="POST",
                headers={"Content-Type": "application/json",
                         "x-api-key": claude_key,
                         "anthropic-version": "2023-06-01"})
            with urllib.request.urlopen(req, timeout=45) as resp:
                res = json.loads(resp.read().decode("utf-8"))
            text = res["content"][0]["text"].strip()
            text = text.replace("```json","").replace("```","").strip()
            s,e = text.find("{"), text.rfind("}")+1
            if s>=0<e: text=text[s:e]
            return json.loads(text), "claude"
        except Exception as ex:
            last_err += f" | Claude: {ex}"
            print(f"[OCR] Claude failed: {ex}")

    raise RuntimeError(last_err or "فشل OCR")

# ══════════════════════════════════════════════════════════════
# Routes
# ══════════════════════════════════════════════════════════════

PROMPT_PERMIS = (
    "You are an expert OCR system for Algerian driving licenses.\n"
    "RULES: Extract ONLY visible data. NEVER invent. Empty=''."
    " Dates: YYYY-MM-DD. nin=18 digits. categories=array.\n"
    "Return ONLY JSON:\n"
    '{"nomAr":"","prenomAr":"","nom":"","prenom":"",'
    '"dateNaissance":"","lieuNaissance":"","wilayaNaissance":"",'
    '"adresse":"","commune":"","wilaya":"",'
    '"nin":"","numPermis":"",'
    '"dateDelivrance":"","dateExpiration":"",'
    '"lieuDelivrance":"","wilayaDelivrance":"",'
    '"categories":[]}'
)

PROMPT_CARTE_GRISE = (
    "You are an expert OCR system for Algerian vehicle registration cards (Carte Grise).\n"
    "RULES: Extract ONLY visible data. NEVER invent. Empty=''."
    " Dates: YYYY-MM-DD.\n"
    "Return ONLY JSON:\n"
    '{"numImmatriculation":"","numPrecedent":"",'
    '"marque":"","typeVehicule":"","modele":"",'
    '"numSerie":"","genre":"","carrosserie":"",'
    '"energie":"","puissance":"",'
    '"nbPlaces":"","poidsTotal":"","chargeUtile":"",'
    '"anneeCirculation":"",'
    '"dateDelivrance":"","lieuDelivrance":"","wilayaDelivrance":"",'
    '"quittanceNum":"","quittanceMontant":"","quittanceDate":"",'
    '"proprietaireNom":"","proprietairePrenom":"",'
    '"proprietaireDateNaissance":"",'
    '"proprietaireLieu":"","proprietaireAdresse":"",'
    '"proprietaireCommune":"","proprietaireWilaya":"",'
    '"profession":""}'
)

@app.route("/api/ocr", methods=["POST"])
def ocr():
    d = request.get_json()
    if not d or not d.get("image_base64"):
        return jsonify({"error": "no image"}), 400
    try:
        data, src = run_ocr(d["image_base64"],
                            d.get("mime_type","image/jpeg"),
                            PROMPT_PERMIS)
        return jsonify({"success": True, "data": data, "source": src})
    except Exception as ex:
        return jsonify({"error": str(ex)}), 500

@app.route("/api/ocr-carte-grise", methods=["POST"])
def ocr_carte_grise():
    d = request.get_json()
    if not d or not d.get("image_base64"):
        return jsonify({"error": "no image"}), 400
    try:
        data, src = run_ocr(d["image_base64"],
                            d.get("mime_type","image/jpeg"),
                            PROMPT_CARTE_GRISE)
        return jsonify({"success": True, "data": data, "source": src})
    except Exception as ex:
        return jsonify({"error": str(ex)}), 500

@app.route("/api/register", methods=["POST"])
def register():
    data = request.get_json()
    if not data: return jsonify({"error": "invalid"}), 400
    image_path = None
    if data.get("image_base64"):
        try:
            img = base64.b64decode(data["image_base64"])
            fn  = f"{(data.get('nin') or 'x').replace('/','_')}_{datetime.now().strftime('%Y%m%d%H%M%S')}.jpg"
            (IMAGES_DIR / fn).write_bytes(img)
            image_path = fn
        except Exception as ex:
            print("img err:", ex)
    with get_db() as conn:
        if conn.execute("SELECT id FROM candidates WHERE nin=?",
                        (data.get("nin"),)).fetchone():
            return jsonify({"error": "هذا الرقم التعريفي مسجل مسبقاً"}), 409
        c = conn.cursor()
        c.execute("""INSERT INTO candidates
            (nom_ar,prenom_ar,nom_fr,prenom_fr,
             date_naissance,lieu_naissance,wilaya_naissance,adresse,commune,wilaya,
             nationalite,nin,telephone,telephone2,
             num_permis,date_delivrance,date_expiration,lieu_delivrance,wilaya_delivrance,
             categories,image_permis_path,notes)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", (
            data.get("nomAr"),       data.get("prenomAr"),
            data.get("nom"),         data.get("prenom"),
            data.get("dateNaissance"),data.get("lieuNaissance"),
            data.get("wilayaNaissance"),data.get("adresse"),
            data.get("commune"),     data.get("wilaya"),
            data.get("nationalite","جزائري"), data.get("nin"),
            data.get("telephone"),   data.get("telephone2"),
            data.get("numPermis"),   data.get("dateDelivrance"),
            data.get("dateExpiration"),data.get("lieuDelivrance"),
            data.get("wilayaDelivrance"),
            json.dumps(data.get("categories",[]), ensure_ascii=False),
            image_path,              data.get("notes")
        ))
        cid = c.lastrowid
        # حفظ المركبة إن وُجدت
        if data.get("numImmatriculation","").strip():
            c.execute("""INSERT OR REPLACE INTO vehicles
                (candidate_id,num_immatriculation,num_precedent,
                 marque,type_vehicule,modele,num_serie,
                 genre,carrosserie,energie,puissance,
                 nb_places,poids_total,charge_utile,annee_circulation,
                 date_delivrance,lieu_delivrance,wilaya_delivrance,
                 quittance_num,quittance_montant,quittance_date,
                 proprietaire_nom,proprietaire_prenom,proprietaire_dob,
                 proprietaire_lieu,proprietaire_adresse,
                 proprietaire_commune,proprietaire_wilaya,profession)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", (
                cid,
                data.get("numImmatriculation",""), data.get("numPrecedent",""),
                data.get("marque",""),              data.get("typeVehicule",""),
                data.get("modele",""),              data.get("numSerie",""),
                data.get("genre",""),               data.get("carrosserie",""),
                data.get("energie",""),             data.get("puissance",""),
                data.get("nbPlaces",""),            data.get("poidsTotal",""),
                data.get("chargeUtile",""),         data.get("anneeCirculation",""),
                data.get("vehiculeDateDelivrance",""),data.get("vehiculeLieuDelivrance",""),
                data.get("vehiculeWilayaDelivrance",""),
                data.get("quittanceNum",""),        data.get("quittanceMontant",""),
                data.get("quittanceDate",""),
                data.get("proprietaireNom",""),     data.get("proprietairePrenom",""),
                data.get("proprietaireDateNaissance",""),data.get("proprietaireLieu",""),
                data.get("proprietaireAdresse",""), data.get("proprietaireCommune",""),
                data.get("proprietaireWilaya",""),  data.get("profession",""),
            ))
        conn.commit()
    print(f"New candidate: {data.get('nomAr')} NIN:{data.get('nin')}")
    return jsonify({"success": True, "id": cid}), 201

@app.route("/api/register-company", methods=["POST"])
def register_company():
    data = request.get_json()
    if not data: return jsonify({"error": "no data"}), 400
    required = ["nomSociete","registreCommerce","telephone","wilaya","nomResponsable"]
    missing  = [f for f in required if not data.get(f,"").strip()]
    if missing: return jsonify({"error": f"حقول مطلوبة: {', '.join(missing)}"}), 400
    with get_db() as conn:
        c = conn.cursor()
        c.execute("""INSERT INTO companies
            (created_at,nom_societe,registre_commerce,numero_agreement,
             nom_responsable,prenom_responsable,telephone,telephone2,
             email,adresse,wilaya,nb_vehicules,type_vehicules,notes)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", (
            datetime.now().isoformat(timespec="seconds"),
            data.get("nomSociete",""),      data.get("registreCommerce",""),
            data.get("numeroAgreement",""), data.get("nomResponsable",""),
            data.get("prenomResponsable",""),data.get("telephone",""),
            data.get("telephone2",""),      data.get("email",""),
            data.get("adresse",""),         data.get("wilaya",""),
            data.get("nbVehicules",""),     data.get("typeVehicules",""),
            data.get("notes",""),
        ))
        conn.commit()
        return jsonify({"success": True, "id": c.lastrowid})

@app.route("/api/admin/candidates")
def get_candidates():
    s    = request.args.get("q","").strip()
    st   = request.args.get("statut","")
    page = int(request.args.get("page",1))
    lim  = int(request.args.get("limit",100))
    where, params = [], []
    if s:
        where.append("(nom_ar LIKE ? OR prenom_ar LIKE ? OR nin LIKE ? OR telephone LIKE ? OR num_permis LIKE ?)")
        params += [f"%{s}%"]*5
    if st:
        where.append("statut=?"); params.append(st)
    w = ("WHERE "+" AND ".join(where)) if where else ""
    with get_db() as conn:
        total = conn.execute(f"SELECT COUNT(*) FROM candidates {w}", params).fetchone()[0]
        rows  = conn.execute(
            f"SELECT * FROM candidates {w} ORDER BY created_at DESC LIMIT ? OFFSET ?",
            params+[lim,(page-1)*lim]).fetchall()
    def fmt(r):
        d = dict(r)
        try: d["categories"] = json.loads(d.get("categories") or "[]")
        except: d["categories"] = []
        return d
    return jsonify({"total": total, "candidates": [fmt(r) for r in rows]})

@app.route("/api/admin/candidates/<int:cid>", methods=["PATCH"])
def update_candidate(cid):
    data = request.get_json()
    upd  = {k:v for k,v in data.items() if k in ["statut","notes","telephone","adresse"]}
    if not upd: return jsonify({"error":"no fields"}),400
    sql = ", ".join(f"{k}=?" for k in upd)
    with get_db() as conn:
        conn.execute(f"UPDATE candidates SET {sql} WHERE id=?",
                     list(upd.values())+[cid])
        conn.commit()
    return jsonify({"success": True})

@app.route("/api/admin/images/<path:fn>")
def serve_image(fn):
    return send_from_directory(IMAGES_DIR, fn)

@app.route("/api/stats")
def stats():
    with get_db() as conn:
        total   = conn.execute("SELECT COUNT(*) FROM candidates").fetchone()[0]
        today   = conn.execute("SELECT COUNT(*) FROM candidates WHERE date(created_at)=date('now','localtime')").fetchone()[0]
        jadid   = conn.execute("SELECT COUNT(*) FROM candidates WHERE statut='جديد'").fetchone()[0]
        maqboul = conn.execute("SELECT COUNT(*) FROM candidates WHERE statut='مقبول'").fetchone()[0]
    return jsonify({"total":total,"today":today,"jadid":jadid,"maqboul":maqboul})

@app.route("/api/admin/export/csv")
def export_csv():
    import csv, io
    with get_db() as conn:
        rows = conn.execute("""SELECT created_at,nom_ar,prenom_ar,nom_fr,prenom_fr,
            date_naissance,lieu_naissance,wilaya_naissance,nin,telephone,telephone2,
            adresse,num_permis,date_delivrance,date_expiration,lieu_delivrance,
            categories,statut,notes FROM candidates ORDER BY created_at DESC""").fetchall()
    out = io.StringIO()
    w   = csv.writer(out)
    w.writerow(["Date","LaqabAr","IsmAr","Nom","Prenom","Naissance","Lieu","Wilaya",
                "NIN","Tel","Tel2","Adresse","Permis","Delivrance","Expiration",
                "LieuDel","Categories","Statut","Notes"])
    for r in rows:
        row = list(r)
        try: row[16] = " / ".join(json.loads(row[16] or "[]"))
        except: pass
        w.writerow(row)
    return Response("\ufeff"+out.getvalue(), mimetype="text/csv; charset=utf-8",
        headers={"Content-Disposition":"attachment; filename=candidates.csv"})

@app.route("/api/admin/print/security")
def print_security():
    page   = int(request.args.get("page",1))
    limit  = 30
    offset = (page-1)*limit
    with get_db() as conn:
        total = conn.execute("SELECT COUNT(*) FROM candidates").fetchone()[0]
        rows  = conn.execute("""SELECT id,nom_ar,prenom_ar,date_naissance,
            lieu_naissance,wilaya_naissance,adresse,telephone
            FROM candidates ORDER BY created_at DESC LIMIT ? OFFSET ?""",
            [limit,offset]).fetchall()
    total_pages = max(1,-(-total//limit))
    rows_html = ""
    for i,r in enumerate(rows,start=offset+1):
        lieu = (r["lieu_naissance"] or "")+((" — "+r["wilaya_naissance"]) if r["wilaya_naissance"] else "")
        rows_html += f"<tr><td>{i}</td><td>{r['nom_ar'] or ''} {r['prenom_ar'] or ''}</td><td>{r['date_naissance'] or ''}</td><td>{lieu}</td><td>{r['adresse'] or ''}</td><td>{r['telephone'] or ''}</td></tr>"
    nav = ""
    if page>1: nav += f'<a href="?page={page-1}">◀ السابق</a> '
    if page<total_pages: nav += f' <a href="?page={page+1}">التالي ▶</a>'
    html = f"""<!DOCTYPE html><html dir="rtl" lang="ar"><head>
<meta charset="UTF-8"><title>قائمة المرشحين</title>
<style>body{{font-family:serif;font-size:12px;direction:rtl}}
table{{width:100%;border-collapse:collapse}}
th{{background:#1a6b3c;color:#fff;padding:6px;border:1px solid #000}}
td{{padding:5px;border:1px solid #555;font-size:11px}}
.nav a{{margin:0 10px;color:#1a6b3c}}
@media print{{.nav,.btn{{display:none}}}}</style></head>
<body><h2 style="text-align:center">قائمة المرشحين — الصفحة {page}/{total_pages}</h2>
<button class="btn" onclick="window.print()">🖨️ طباعة</button>
<table><thead><tr><th>الرقم</th><th>الاسم</th><th>الميلاد</th><th>المكان</th><th>العنوان</th><th>الهاتف</th></tr></thead>
<tbody>{rows_html}</tbody></table>
<div class="nav">{nav}</div></body></html>"""
    return Response(html, mimetype="text/html; charset=utf-8")

@app.after_request
def add_headers(r):
    r.headers.pop("Content-Security-Policy", None)
    r.headers["Cross-Origin-Opener-Policy"] = "unsafe-none"
    return r

@app.route("/")
def index():
    return Response((APP_DIR/"index.html").read_text(encoding="utf-8"),
                    mimetype="text/html; charset=utf-8")

@app.route("/static/<path:filename>")
def static_files(filename):
    # يقدم ملفات static من نفس مجلد backend
    f = APP_DIR / filename
    if not f.exists():
        f = APP_DIR / "static" / filename
    if not f.exists():
        return f"Not found: {filename}", 404
    mt = "application/javascript" if filename.endswith(".js") else "text/plain"
    return Response(f.read_bytes(), mimetype=mt)

if __name__ == "__main__":
    init_db()
    print("\n"+"="*40)
    print(f"  Taxi Registration Server")
    print(f"  http://localhost:5000")
    print(f"  APP_DIR: {APP_DIR}")
    print("="*40+"\n")
    app.run(host="0.0.0.0", port=5000, debug=True)
