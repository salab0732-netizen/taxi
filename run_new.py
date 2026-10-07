"""
تشغيل ngrok فقط — Backend و Frontend يشغّلهما START.bat
"""
import subprocess, time, urllib.request, json, os
from pathlib import Path

ROOT     = Path(__file__).parent
URL_FILE = ROOT / "current-url.txt"

def get_ngrok_url():
    for _ in range(30):
        try:
            with urllib.request.urlopen("http://127.0.0.1:4040/api/tunnels", timeout=2) as r:
                data = json.loads(r.read())
                for t in data.get("tunnels", []):
                    url = t.get("public_url", "")
                    if url.startswith("https://"):
                        return url
        except:
            pass
        time.sleep(1)
    return None

if __name__ == "__main__":
    print("\n" + "="*55)
    print("  🚕 نظام إدارة سيارات الأجرة")
    print("="*55)
    print("\n⏳ تشغيل ngrok...")

    proc = subprocess.Popen(
        ["ngrok", "http", "127.0.0.1:3600"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )

    url = get_ngrok_url()
    if url:
        URL_FILE.write_text(url, encoding="utf-8")
        print("\n" + "="*55)
        print(f"  🚕 رابط البرنامج: {url}")
        print(f"  📱 شارك هذا الرابط مع السائقين")
        print("="*55 + "\n")
        os.startfile(url)
    else:
        print("❌ تعذّر الحصول على رابط ngrok")
        print("   تأكد أن ngrok مثبت وأن لديك حساب")

    proc.wait()
