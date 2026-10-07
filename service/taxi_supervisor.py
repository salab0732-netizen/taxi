# -*- coding: utf-8 -*-
"""
مشغّل منصة سيارات الأجرة في الخلفية (بدون نوافذ)
- يشغّل: الخادم (Flask) + الواجهة (Vite) + ngrok
- يراقبها كل 5 ثوانٍ ويعيد تشغيل أي جزء يتوقف
- السجلات في مجلد logs\\ (backend.log, frontend.log, ngrok.log, supervisor.log)
- يُشغَّل تلقائياً مع إقلاع الحاسوب عبر «جدولة المهام» (install_autostart.bat)
"""
import os, sys, time, socket, shutil, subprocess, json, urllib.request
from pathlib import Path
from datetime import datetime

ROOT     = Path(__file__).resolve().parent.parent          # F:\taxi-main
BACKEND  = ROOT / "backend_new"
FRONTEND = ROOT / "frontend_new"
LOGS     = ROOT / "logs"
URL_FILE = ROOT / "current-url.txt"
FRONT_PORT = 3600
LOCK_PORT  = 47931          # يمنع تشغيل نسختين من المشغّل
NO_WINDOW  = 0x08000000 if os.name == "nt" else 0

LOGS.mkdir(exist_ok=True)


def log(msg):
    line = f"[{datetime.now():%Y-%m-%d %H:%M:%S}] {msg}\n"
    with open(LOGS / "supervisor.log", "a", encoding="utf-8") as f:
        f.write(line)


def rotate(path, max_mb=5):
    try:
        if path.exists() and path.stat().st_size > max_mb * 1024 * 1024:
            old = path.with_suffix(".old.log")
            if old.exists():
                old.unlink()
            path.rename(old)
    except Exception:
        pass


def find_exe(name, candidates):
    p = shutil.which(name)
    if p:
        return p
    for c in candidates:
        c = os.path.expandvars(c)
        if os.path.exists(c):
            return c
    return None


def python_exe():
    exe = Path(sys.executable)
    py = exe.with_name("python.exe")          # pythonw → python للخادم
    return str(py if py.exists() else exe)


NODE = find_exe("node", [r"C:\Program Files\nodejs\node.exe", r"%ProgramFiles%\nodejs\node.exe",
                         r"%APPDATA%\nvm\current\node.exe", r"%LOCALAPPDATA%\Programs\nodejs\node.exe"])
NGROK = find_exe("ngrok", [str(ROOT / "ngrok.exe"), r"%LOCALAPPDATA%\ngrok\ngrok.exe",
                           r"%USERPROFILE%\ngrok\ngrok.exe", r"C:\ngrok\ngrok.exe",
                           r"%LOCALAPPDATA%\Microsoft\WindowsApps\ngrok.exe", r"C:\ProgramData\chocolatey\bin\ngrok.exe"])


def ngrok_config_args():
    for c in (r"%LOCALAPPDATA%\ngrok\ngrok.yml", r"%USERPROFILE%\AppData\Local\ngrok\ngrok.yml",
              r"%USERPROFILE%\.config\ngrok\ngrok.yml", r"%USERPROFILE%\.ngrok2\ngrok.yml"):
        c = os.path.expandvars(c)
        if os.path.exists(c):
            return ["--config", c]
    return []


def services():
    vite = FRONTEND / "node_modules" / "vite" / "bin" / "vite.js"
    return {
        "backend":  {"cmd": [python_exe(), "app.py"], "cwd": BACKEND},
        "frontend": {"cmd": [NODE, str(vite), "--host", "0.0.0.0", "--port", str(FRONT_PORT), "--strictPort"],
                     "cwd": FRONTEND, "need": NODE},
        "ngrok":    {"cmd": [NGROK, "http", f"127.0.0.1:{FRONT_PORT}", "--log", "stdout"] + ngrok_config_args(),
                     "cwd": ROOT, "need": NGROK, "delay": 6},
    }


def start(name, spec):
    if "need" in spec and not spec["need"]:
        log(f"⚠ {name}: البرنامج غير موجود على الحاسوب — تخطّي")
        return None
    lp = LOGS / f"{name}.log"
    rotate(lp)
    out = open(lp, "a", encoding="utf-8", errors="replace")
    out.write(f"\n===== تشغيل {name} {datetime.now():%Y-%m-%d %H:%M:%S} =====\n"); out.flush()
    env = dict(os.environ, PYTHONIOENCODING="utf-8", PYTHONUNBUFFERED="1", BROWSER="none")
    p = subprocess.Popen(spec["cmd"], cwd=str(spec["cwd"]), stdout=out, stderr=subprocess.STDOUT,
                         stdin=subprocess.DEVNULL, env=env, creationflags=NO_WINDOW)
    log(f"▶ {name} (pid {p.pid})")
    return p


def save_ngrok_url():
    try:
        with urllib.request.urlopen("http://127.0.0.1:4040/api/tunnels", timeout=2) as r:
            for t in json.loads(r.read()).get("tunnels", []):
                if t.get("public_url", "").startswith("https://"):
                    URL_FILE.write_text(t["public_url"], encoding="utf-8")
                    return t["public_url"]
    except Exception:
        return None


def main():
    lock = socket.socket()
    try:
        lock.bind(("127.0.0.1", LOCK_PORT))
    except OSError:
        log("المشغّل يعمل مسبقاً — خروج")
        return
    log(f"=== بدء المشغّل — node={NODE} ngrok={NGROK} python={python_exe()}")
    if os.name == "nt":   # إيقاف نسخة ngrok قديمة (الرابط المجاني لا يقبل نسختين)
        subprocess.call(["taskkill", "/IM", "ngrok.exe", "/F"], stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL, creationflags=NO_WINDOW)
    specs = services()
    procs, fails, url_saved = {}, {}, False
    for name, spec in specs.items():
        if spec.get("delay"):
            time.sleep(spec["delay"])
        procs[name] = start(name, spec)
    while True:
        time.sleep(5)
        for name, spec in specs.items():
            p = procs.get(name)
            if p is not None and p.poll() is not None:
                fails[name] = fails.get(name, 0) + 1
                wait = min(60, 5 * fails[name])
                log(f"✖ {name} توقف (رمز {p.returncode}) — إعادة التشغيل بعد {wait} ث")
                time.sleep(wait)
                procs[name] = start(name, spec)
                if name == "ngrok":
                    url_saved = False
            elif p is not None:
                fails[name] = 0
        if not url_saved:
            u = save_ngrok_url()
            if u:
                url_saved = True
                log(f"🌐 الرابط: {u}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log(f"خطأ فادح: {e!r}")
        raise
