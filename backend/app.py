from flask import Flask, request, jsonify, Response, send_from_directory
from flask_cors import CORS
import sqlite3, base64, json, urllib.request, urllib.error, os
from datetime import datetime
from pathlib import Path

app = Flask(__name__)
CORS(app)

DB_PATH = Path(__file__).parent / "registrations.db"
IMAGES_DIR = Path(__file__).parent / "images"
IMAGES_DIR.mkdir(exist_ok=True)

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
            nationalite TEXT DEFAULT 'جزائري', nin TEXT UNIQUE,
            telephone TEXT, telephone2 TEXT, adresse TEXT,
            num_permis TEXT, date_delivrance TEXT, date_expiration TEXT,
            lieu_delivrance TEXT, categories TEXT,
            image_path TEXT, notes TEXT, statut TEXT DEFAULT 'جديد')""")
        conn.commit()
    print("DB ready:", DB_PATH)

def load_api_key():
    key_file = Path(__file__).parent / "gemini_key.txt"
    if key_file.exists():
        key = key_file.read_text(encoding="utf-8").strip()
        if key and not key.startswith("ضع"):
            return key
    return os.environ.get("GEMINI_API_KEY", "")

@app.route("/api/ocr", methods=["POST"])
def ocr():
    data = request.get_json()
    if not data or not data.get("image_base64"):
        return jsonify({"error": "no image"}), 400

    api_key = load_api_key()
    if not api_key:
        return jsonify({"error": "Gemini API key not found in gemini_key.txt"}), 500

    prompt = (
        'أنت خبير في قراءة رخص السياقة الجزائرية. استخرج البيانات من الصورة وأعد JSON فقط.\n'
        'قواعد مهمة:\n'
        '- أعد JSON فقط، بدون أي نص قبله أو بعده، بدون backticks\n'
        '- التواريخ بصيغة YYYY-MM-DD فقط (مثال: 1990-05-23)\n'
        '- إذا لم تجد قيمة اتركها فارغة "" تماماً\n'
        '- nomAr و prenomAr: الاسم واللقب بالعربية\n'
        '- nom و prenom: الاسم واللقب بالفرنسية (بأحرف كبيرة)\n'
        '- nin: رقم التعريف الوطني (NIN) 18 رقم\n'
        '- numPermis: رقم رخصة السياقة\n'
        '- categories: مصفوفة فئات الرخصة مثل ["B"] أو ["B","C"]\n'
        '{\n'
        '  "nomAr":"","prenomAr":"",\n'
        '  "nom":"","prenom":"",\n'
        '  "dateNaissance":"","lieuNaissance":"","wilayaNaissance":"",\n'
        '  "nin":"","numPermis":"",\n'
        '  "dateDelivrance":"","dateExpiration":"","lieuDelivrance":"",\n'
        '  "categories":[]\n'
        '}'
    )

    mime = data.get("mime_type", "image/jpeg")
    payload = json.dumps({
        "contents": [{
            "parts": [
                {"inline_data": {"mime_type": mime, "data": data["image_base64"]}},
                {"text": prompt}
            ]
        }],
        "generationConfig": {"temperature": 0, "maxOutputTokens": 1000}
    }).encode("utf-8")

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
    req = urllib.request.Request(url, data=payload,
        headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode("utf-8"))
        text = result["candidates"][0]["content"]["parts"][0]["text"].strip()
        text = text.replace("```json","").replace("```","").strip()
        extracted = json.loads(text)
        return jsonify({"success": True, "data": extracted})
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        print(f"Gemini HTTP error {e.code}: {body}")
        return jsonify({"error": f"Gemini error {e.code}: {body}"}), 500
    except Exception as e:
        print(f"OCR error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/register", methods=["POST"])
def register():
    data = request.get_json()
    if not data:
        return jsonify({"error": "invalid"}), 400
    image_path = None
    if data.get("image_base64"):
        try:
            img = base64.b64decode(data["image_base64"])
            fn = f"{(data.get('nin') or 'x').replace('/','_')}_{datetime.now().strftime('%Y%m%d%H%M%S')}.jpg"
            (IMAGES_DIR / fn).write_bytes(img)
            image_path = fn
        except Exception as e:
            print("img err:", e)
    with get_db() as conn:
        if conn.execute("SELECT id FROM candidates WHERE nin=?", (data.get("nin"),)).fetchone():
            return jsonify({"error": "هذا الرقم التعريفي مسجل مسبقاً"}), 409
        conn.execute("""INSERT INTO candidates
            (nom_ar,prenom_ar,nom_fr,prenom_fr,date_naissance,lieu_naissance,
             wilaya_naissance,nationalite,nin,telephone,telephone2,adresse,
             num_permis,date_delivrance,date_expiration,lieu_delivrance,
             categories,image_path,notes)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (data.get("nomAr"), data.get("prenomAr"), data.get("nom"), data.get("prenom"),
             data.get("dateNaissance"), data.get("lieuNaissance"), data.get("wilayaNaissance"),
             data.get("nationalite","جزائري"), data.get("nin"),
             data.get("telephone"), data.get("telephone2"), data.get("adresse"),
             data.get("numPermis"), data.get("dateDelivrance"), data.get("dateExpiration"),
             data.get("lieuDelivrance"),
             json.dumps(data.get("categories",[]), ensure_ascii=False),
             image_path, data.get("notes")))
        conn.commit()
        cid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    print(f"New: {data.get('nomAr')} {data.get('prenomAr')} NIN:{data.get('nin')}")
    return jsonify({"success": True, "id": cid}), 201

@app.route("/api/admin/candidates")
def get_candidates():
    s = request.args.get("q","").strip()
    st = request.args.get("statut","")
    page = int(request.args.get("page",1))
    lim = int(request.args.get("limit",100))
    where, params = [], []
    if s:
        where.append("(nom_ar LIKE ? OR prenom_ar LIKE ? OR nin LIKE ? OR telephone LIKE ? OR num_permis LIKE ?)")
        params += [f"%{s}%"]*5
    if st:
        where.append("statut=?"); params.append(st)
    w = ("WHERE "+" AND ".join(where)) if where else ""
    with get_db() as conn:
        total = conn.execute(f"SELECT COUNT(*) FROM candidates {w}", params).fetchone()[0]
        rows = conn.execute(f"SELECT * FROM candidates {w} ORDER BY created_at DESC LIMIT ? OFFSET ?",
                            params+[lim,(page-1)*lim]).fetchall()
    def fmt(r):
        d = dict(r)
        try: d["categories"] = json.loads(d["categories"] or "[]")
        except: d["categories"] = []
        return d
    return jsonify({"total": total, "candidates": [fmt(r) for r in rows]})

@app.route("/api/admin/candidates/<int:cid>", methods=["PATCH"])
def update_candidate(cid):
    data = request.get_json()
    upd = {k:v for k,v in data.items() if k in ["statut","notes","telephone","adresse"]}
    if not upd: return jsonify({"error":"no fields"}), 400
    sql = ", ".join(f"{k}=?" for k in upd)
    with get_db() as conn:
        conn.execute(f"UPDATE candidates SET {sql} WHERE id=?", list(upd.values())+[cid])
        conn.commit()
    return jsonify({"success": True})

@app.route("/api/admin/images/<path:fn>")
def serve_image(fn):
    return send_from_directory(IMAGES_DIR, fn)

@app.route("/api/admin/export/csv")
def export_csv():
    import csv, io
    with get_db() as conn:
        rows = conn.execute("""SELECT created_at,nom_ar,prenom_ar,nom_fr,prenom_fr,
            date_naissance,lieu_naissance,wilaya_naissance,nin,telephone,telephone2,
            adresse,num_permis,date_delivrance,date_expiration,lieu_delivrance,
            categories,statut,notes FROM candidates ORDER BY created_at DESC""").fetchall()
    out = io.StringIO()
    w = csv.writer(out)
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

@app.route("/api/stats")
def stats():
    with get_db() as conn:
        total   = conn.execute("SELECT COUNT(*) FROM candidates").fetchone()[0]
        today   = conn.execute("SELECT COUNT(*) FROM candidates WHERE date(created_at)=date('now','localtime')").fetchone()[0]
        jadid   = conn.execute("SELECT COUNT(*) FROM candidates WHERE statut='جديد'").fetchone()[0]
        maqboul = conn.execute("SELECT COUNT(*) FROM candidates WHERE statut='مقبول'").fetchone()[0]
    return jsonify({"total":total,"today":today,"jadid":jadid,"maqboul":maqboul})

@app.after_request
def remove_csp(response):
    response.headers.pop("Content-Security-Policy", None)
    response.headers.pop("X-Content-Security-Policy", None)
    response.headers["Cross-Origin-Opener-Policy"] = "unsafe-none"
    return response

@app.route("/")
def index():
    return Response(get_html(), mimetype="text/html; charset=utf-8")

def get_html():
    return open(Path(__file__).parent / "index.html", encoding="utf-8").read()

if __name__ == "__main__":
    init_db()
    print("\n" + "="*40)
    print("  Taxi Registration Server")
    print("  http://localhost:5000")
    print("="*40 + "\n")
    app.run(host="0.0.0.0", port=5000, debug=False)
