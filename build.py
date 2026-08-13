#!/usr/bin/env python3
"""
build.py — Graphify Build System
تشغيل: python build.py [اسم_الملف_اختياري]

مثال:
  python build.py                    # يدمج ويرفع كل شيء
  python build.py 05_company         # يدمج ويرفع بعد تعديل ملف شركة فقط
  python build.py 07_heritage        # بعد تعديل صفحة ذوي الحقوق

كيف يعمل:
  1. يقرأ الملفات المنفصلة من frontend/
  2. يدمجها في backend/index.html
  3. يرفع فقط index.html إلى GitHub (توفيراً للتوكن)
  4. يرفع الملف المعدَّل إن حدّدته
"""

import sys, os, urllib.request, json, base64
from pathlib import Path

# ── إعدادات ──────────────────────────────────────────────────
REPO  = "salab0732-netizen/taxi"
BRANCH = "main"

# الملفات بالترتيب
FRONTEND_FILES = [
    "frontend/01_constants.js",
    "frontend/02_upload.js",
    "frontend/03_carte_grise.js",
    "frontend/04_vehicle_review.js",
    "frontend/05_company.js",
    "frontend/06_seat_booklet.js",
    "frontend/07_heritage.js",
    "frontend/08_admin_main.js",
    "frontend/09_boot.js",
]

HTML_HEAD = """<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>تسجيل سائقي سيارات الأجرة</title>
<script src="/static/react.js"></script>
<script src="/static/react-dom.js"></script>
<script src="/static/babel.js"></script>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; background: linear-gradient(135deg,#f0fdf4,#ecfdf5,#f9fafb); min-height: 100vh; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>
<div id="root"><div style="text-align:center;padding:60px;color:#6b7280;font-size:16px">جاري التحميل...</div></div>
<script type="text/babel">
const { useState, useRef, useCallback, useEffect } = React;
"""

HTML_FOOT = """
</script>
</body>
</html>"""

# ── أدوات GitHub API ──────────────────────────────────────────
def load_token():
    for f in [Path("github_token.txt"), Path.home()/"github_token.txt"]:
        if f.exists():
            t = f.read_text().strip()
            if t: return t
    t = os.environ.get("GITHUB_TOKEN","")
    if t: return t
    raise RuntimeError("ضع مفتاح GitHub في github_token.txt بجانب build.py")

def gh(url, data=None, method="GET", token=""):
    req = urllib.request.Request(url, data=data, method=method,
        headers={"Authorization": f"token {token}",
                 "User-Agent": "python",
                 "Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

def get_sha(path, token):
    try:
        d = gh(f"https://api.github.com/repos/{REPO}/contents/{path}", token=token)
        return d["sha"]
    except: return None

def push(path, content, token, message="build: auto"):
    sha = get_sha(path, token)
    pd = {"message": message,
          "content": base64.b64encode(content.encode("utf-8")).decode(),
          "branch": BRANCH}
    if sha: pd["sha"] = sha
    result = gh(f"https://api.github.com/repos/{REPO}/contents/{path}",
                data=json.dumps(pd).encode(), method="PUT", token=token)
    return result.get("commit",{}).get("sha","")[:7]

# ── البناء ───────────────────────────────────────────────────
def build(changed_file=None):
    token = load_token()
    root  = Path(__file__).parent

    print("\n🔨 Graphify Build")
    print("="*40)

    # 1. قراءة ودمج الملفات
    combined = ""
    for rel_path in FRONTEND_FILES:
        local = root / rel_path
        if not local.exists():
            print(f"  ⚠️  {rel_path} not found locally — fetching from GitHub...")
            d = gh(f"https://api.github.com/repos/{REPO}/contents/{rel_path}", token=token)
            chunk = base64.b64decode(d["content"]).decode("utf-8")
            local.parent.mkdir(parents=True, exist_ok=True)
            local.write_text(chunk, encoding="utf-8")
        else:
            chunk = local.read_text(encoding="utf-8")
        combined += f"\n// ═══ {rel_path} ═══\n" + chunk + "\n"
        flag = "✏️ " if changed_file and changed_file in rel_path else "  "
        print(f"  {flag}📄 {rel_path}: {len(chunk):,} chars")

    # 2. بناء index.html
    new_html = HTML_HEAD + combined + HTML_FOOT
    print(f"\n📦 index.html: {len(new_html):,} chars")

    # 3. رفع index.html
    sha7 = push("backend/index.html", new_html, token,
                 f"build: rebuild index.html{f' after {changed_file}' if changed_file else ''}")
    print(f"✅ backend/index.html -> {sha7}")

    # 4. رفع الملف المعدَّل (إن حُدِّد)
    if changed_file:
        for rel_path in FRONTEND_FILES:
            if changed_file in rel_path:
                local = root / rel_path
                if local.exists():
                    sha7 = push(rel_path, local.read_text(encoding="utf-8"), token,
                                f"feat: تعديل {rel_path}")
                    print(f"✅ {rel_path} -> {sha7}")
                break

    print("\n✅ البناء اكتمل!")
    print("="*40)
    print("نزّل ZIP جديد أو نفّذ: git pull")

if __name__ == "__main__":
    changed = sys.argv[1] if len(sys.argv) > 1 else None
    build(changed)
