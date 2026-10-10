# ════════════════════════════════════════════════════════════
# env.py — نوع البيئة: production (الإنتاج) أو test (النسخة التجريبية)
#   يُضبط بـ "TAXI_ENV": "test" في config.local.json أو متغير البيئة TAXI_ENV
#   النسخة التجريبية: شريط «تجريبي» في الواجهة، علامة مائية على كل الوثائق،
#   ورمز SMS يظهر على الشاشة بدل إرساله
# ════════════════════════════════════════════════════════════
import json
import os
from pathlib import Path

_cfg_path = Path(__file__).resolve().parent / "config.local.json"
try:
    _cfg = json.loads(_cfg_path.read_text(encoding="utf-8")) if _cfg_path.exists() else {}
except Exception:
    _cfg = {}

TAXI_ENV = (os.environ.get("TAXI_ENV") or _cfg.get("TAXI_ENV") or "production").strip().lower()
IS_TEST = TAXI_ENV == "test"
