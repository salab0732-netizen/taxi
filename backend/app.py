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


def ocr_with_claude(image_base64: str, mime_type: str, prompt: str) -> dict:
    """OCR بـ Claude API كـ fallback لـ Gemini"""
    api_key = load_claude_key()
    if not api_key:
        raise RuntimeError("claude_key.txt غير موجود")

    payload = json.dumps({
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": 1024,
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
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=payload,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01"
        }
    )
    with urllib.request.urlopen(req, timeout=45) as resp:
        result = json.loads(resp.read().decode("utf-8"))

    text = result["content"][0]["text"].strip()
    text = text.replace("```json", "").replace("```", "").strip()
    start = text.find("{")
    end   = text.rfind("}") + 1
    if start >= 0 and end > start:
        text = text[start:end]
    return json.loads(text)

@app.route("/api/ocr", methods=["POST"])
def ocr():
    data = request.get_json()
    if not data or not data.get("image_base64"):
        return jsonify({"error": "no image"}), 400

    api_key = load_api_key()
    if not api_key:
        return jsonify({"error": "Gemini API key not found in gemini_key.txt"}), 500

    prompt = (
        "You are an expert OCR system for Algerian driving licenses and ID cards.\n"
        "CRITICAL RULES:\n"
        "1. Extract ONLY data that is ACTUALLY VISIBLE in the image. NEVER invent or guess values.\n"
        "2. If a field is not clearly readable, return empty string \"\" for it.\n"
        "3. Dates format: YYYY-MM-DD only (example: 1990-05-23).\n"
        "4. nin = National ID number, exactly 18 digits.\n"
        "5. categories = array of license categories visible on the card, e.g. [\"B\"] or [\"B\",\"C\"].\n"
        "6. nom/prenom = French name in UPPERCASE as printed on card.\n"
        "7. nomAr/prenomAr = Arabic name exactly as printed.\n"
        "Return ONLY a valid JSON object, no markdown, no explanation, no backticks:\n"
        "{\"nomAr\":\"\",\"prenomAr\":\"\",\"nom\":\"\",\"prenom\":\"\","
        "\"dateNaissance\":\"\",\"lieuNaissance\":\"\",\"wilayaNaissance\":\"\","
        "\"nin\":\"\",\"numPermis\":\"\","
        "\"dateDelivrance\":\"\",\"dateExpiration\":\"\",\"lieuDelivrance\":\"\","
        "\"categories\":[]}"
    )

    mime = data.get("mime_type", "image/jpeg")
    payload = json.dumps({
        "contents": [{
            "parts": [
                {"inline_data": {"mime_type": mime, "data": data["image_base64"]}},
                {"text": prompt}
            ]
        }],
        "generationConfig": {"temperature": 0, "maxOutputTokens": 2048}
    }).encode("utf-8")

    MODELS = [
        "gemini-2.5-flash",
        "gemini-1.5-flash",
        "gemini-1.5-flash-8b",
    ]
    last_err = ""
    model_idx = 0
    for attempt in range(5):
        model = MODELS[min(model_idx, len(MODELS)-1)]
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        req = urllib.request.Request(url, data=payload,
            headers={"Content-Type": "application/json"}, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=45) as resp:
                result = json.loads(resp.read().decode("utf-8"))
            text = result["candidates"][0]["content"]["parts"][0]["text"].strip()
            # تنظيف شامل: إزالة backticks وأي نص قبل/بعد JSON
            text = text.replace("```json", "").replace("```", "").strip()
            # استخراج أول كتلة JSON صالحة
            start = text.find("{")
            end   = text.rfind("}") + 1
            if start >= 0 and end > start:
                text = text[start:end]
            extracted = json.loads(text)
            return jsonify({"success": True, "data": extracted})
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8")
            last_err = f"Gemini HTTP {e.code} ({model}): {body[:200]}"
            print(f"[attempt {attempt+1}] {last_err}")
            if e.code in (503, 429, 500):
                # الموديل مشغول — جرّب الموديل التالي
                model_idx += 1
                import time; time.sleep(1)
                continue
            break  # خطأ آخر لا فائدة من إعادة المحاولة
        except json.JSONDecodeError as e:
            last_err = f"JSON parse error (attempt {attempt+1}): {e}"
            print(f"[attempt {attempt+1}] OCR JSON error: {e}")
            print(f"  raw text: {text[:400]!r}")
            if attempt >= 4:
                break
            import time; time.sleep(1)
        except Exception as e:
            last_err = str(e)
            print(f"[attempt {attempt+1}] OCR error: {e}")
            break
    # ── Gemini فشل كلياً — جرّب Claude كـ fallback ──────────────
    claude_key = load_claude_key()
    if claude_key:
        try:
            print(f"[Claude fallback] جاري المحاولة...")
            extracted = ocr_with_claude(
                data["image_base64"],
                data.get("mime_type", "image/jpeg"),
                prompt
            )
            print(f"[Claude fallback] ✅ نجح")
            return jsonify({"success": True, "data": extracted, "source": "claude"})
        except Exception as ce:
            print(f"[Claude fallback] ❌ فشل: {ce}")
            last_err += f" | Claude: {ce}"

    return jsonify({"error": last_err}), 500

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

@app.route("/api/admin/print/security")
def print_security():
    page  = int(request.args.get("page", 1))
    limit = 30
    offset = (page - 1) * limit
    with get_db() as conn:
        total = conn.execute("SELECT COUNT(*) FROM candidates").fetchone()[0]
        rows  = conn.execute("""
            SELECT id, nom_ar, prenom_ar, date_naissance,
                   lieu_naissance, wilaya_naissance, adresse, telephone
            FROM candidates ORDER BY created_at DESC
            LIMIT ? OFFSET ?""", [limit, offset]).fetchall()
    total_pages = max(1, -(-total // limit))
    rows_html = ""
    for i, r in enumerate(rows, start=offset+1):
        lieu = (r["lieu_naissance"] or "") + (" — " + r["wilaya_naissance"] if r["wilaya_naissance"] else "")
        rows_html += f"""
        <tr>
          <td>{i}</td>
          <td>{r['nom_ar'] or ''} {r['prenom_ar'] or ''}</td>
          <td>{r['date_naissance'] or ''}</td>
          <td>{lieu}</td>
          <td>{r['adresse'] or ''}</td>
          <td>{r['telephone'] or ''}</td>
        </tr>"""
    nav = ""
    if page > 1:
        nav += f'<a href="?page={page-1}">◀ السابق</a> '
    if page < total_pages:
        nav += f' <a href="?page={page+1}">التالي ▶</a>'
    html = f"""<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>قائمة المرشحين — للمصالح الأمنية</title>
<style>
  @page {{ size: A4 portrait; margin: 18mm 12mm; }}
  body {{ font-family: 'Times New Roman', serif; font-size: 12px; color: #000; direction: rtl; }}
  .header {{ text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 16px; }}
  .header h2 {{ font-size: 16px; margin: 0 0 4px; }}
  .header p  {{ font-size: 11px; margin: 2px 0; color: #333; }}
  table {{ width: 100%; border-collapse: collapse; }}
  th {{ background: #1a6b3c; color: #fff; padding: 6px 4px; font-size: 11px; text-align: center; border: 1px solid #000; }}
  td {{ padding: 5px 4px; border: 1px solid #555; font-size: 11px; vertical-align: top; text-align: center; }}
  tr:nth-child(even) td {{ background: #f5f5f5; }}
  .footer {{ margin-top: 20px; font-size: 11px; color: #555; text-align: center; }}
  .sign-row {{ display:flex; justify-content:space-between; margin-top:30px; font-size:11px; }}
  .nav {{ text-align:center; margin: 10px 0; }}
  .nav a {{ margin: 0 10px; color: #1a6b3c; font-size: 13px; text-decoration:none; }}
  @media print {{
    .nav, .print-btn {{ display: none !important; }}
    body {{ margin: 0; }}
  }}
  .print-btn {{
    display:block; margin:12px auto; padding:8px 28px;
    background:#1a6b3c; color:#fff; border:none; border-radius:6px;
    font-size:14px; cursor:pointer;
  }}
</style>
</head>
<body>
<div class="header">
  <h2>الجمهورية الجزائرية الديمقراطية الشعبية</h2>
  <p>مدرسة تعليم قيادة سيارات الأجرة</p>
  <p><strong>قائمة المرشحين للتحقيق الإداري</strong></p>
  <p>الصفحة {page} من {total_pages} — إجمالي المرشحين: {total}</p>
</div>
<button class="print-btn" onclick="window.print()">🖨️ طباعة</button>
<table>
  <thead>
    <tr>
      <th style="width:5%">الرقم</th>
      <th style="width:22%">الاسم واللقب</th>
      <th style="width:13%">تاريخ الميلاد</th>
      <th style="width:18%">مكان الميلاد</th>
      <th style="width:25%">العنوان</th>
      <th style="width:12%">رقم الهاتف</th>
    </tr>
  </thead>
  <tbody>{rows_html}</tbody>
</table>
<div class="footer">
  تاريخ الإصدار: {__import__('datetime').date.today().strftime('%Y/%m/%d')}
  &nbsp;|&nbsp; عدد المرشحين في هذه الصفحة: {len(rows)}
</div>
<div class="sign-row">
  <div>توقيع المدير: ___________________</div>
  <div>الختم الرسمي</div>
  <div>تاريخ الإرسال: ___________________</div>
</div>
<div class="nav">{nav}</div>
</body>
</html>"""
    return Response(html, mimetype="text/html; charset=utf-8")

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

STATIC_LIBS = {
    "react.js":     "react.js",
    "react-dom.js": "react-dom.js",
    "babel.js":     "babel.js",
}

@app.route("/static/<name>")
def static_lib(name):
    if name not in STATIC_LIBS:
        return "Not found", 404
    file_path = Path(__file__).parent / STATIC_LIBS[name]
    if not file_path.exists():
        return f"Missing file: {name}", 500
    return Response(file_path.read_bytes(), mimetype="application/javascript")

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
