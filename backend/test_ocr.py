import sys, os
sys.path.insert(0, os.path.dirname(__file__))
import app as flask_app

with flask_app.app.test_client() as c:
    r = c.post("/api/ocr-carte-grise",
        json={"image_base64": "dGVzdA==", "mime_type": "image/jpeg"})
    print("status:", r.status_code)
    try:
        print("json:", r.get_json())
    except:
        print("raw:", r.data[:500])
