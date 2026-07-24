"""
تشغيل التطبيق + ngrok واستخراج الرابط تلقائياً
"""
import subprocess, threading, re, sys, os, time, urllib.request, json
from pathlib import Path

ROOT = Path(__file__).parent
URL_FILE = ROOT / "current-url.txt"

def start_flask():
    os.system(f'start "Flask Server" cmd /k "cd /d {ROOT / "backend"} && python app.py"')

def get_ngrok_url():
    """انتظر حتى يبدأ ngrok ثم اجلب الرابط من API المحلية"""
    for _ in range(30):
        try:
            with urllib.request.urlopen("http://127.0.0.1:4040/api/tunnels", timeout=2) as r:
                data = json.loads(r.read())
                tunnels = data.get("tunnels", [])
                for t in tunnels:
                    url = t.get("public_url", "")
                    if url.startswith("https://"):
                        return url
        except:
            pass
        time.sleep(1)
    return None

def start_ngrok():
    proc = subprocess.Popen(
        ["ngrok", "http", "5000"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )
    print("Waiting for ngrok URL...")
    url = get_ngrok_url()
    if url:
        URL_FILE.write_text(url, encoding="utf-8")
        print("\n" + "="*50)
        print(f"  LINK: {url}")
        print("="*50)
        # فتح الرابط في المتصفح
        os.startfile(url)
    else:
        print("❌ لم يتم الحصول على رابط ngrok. تأكد أن ngrok مثبت.")
    proc.wait()

if __name__ == "__main__":
    print("\nStarting Flask...")
    start_flask()
    time.sleep(2)
    print("Starting ngrok...")
    start_ngrok()
