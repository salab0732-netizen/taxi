# 🚕 تطبيق تسجيل سائقي سيارات الأجرة

## هيكل المشروع
```
taxi-registration/
├── backend/
│   ├── app.py              ← خادم Flask
│   ├── requirements.txt
│   ├── registrations.db    ← يُنشأ تلقائياً
│   └── images/             ← صور الرخص
├── frontend/
│   └── src/
│       └── App.jsx         ← واجهة React
└── start.bat               ← تشغيل بنقرة واحدة (Windows)
```

---

## 🖥️ التثبيت (مرة واحدة فقط)

### 1. تثبيت Python 3.10+
```
python --version
```

### 2. تثبيت مكتبات Flask
```bash
cd backend
pip install -r requirements.txt
```

### 3. تثبيت cloudflared (بديل ngrok — مجاني ورابط ثابت)

**Windows:**
- حمّل من: https://github.com/cloudflare/cloudflared/releases/latest
- اختر: `cloudflared-windows-amd64.exe`
- أعد تسميته إلى: `cloudflared.exe`
- ضعه في: `C:\Windows\System32\` (حتى يعمل من أي مكان)

**للتحقق من التثبيت:**
```bash
cloudflared --version
```

---

## 🚀 التشغيل اليومي

### الطريقة السريعة — انقر مزدوجاً على `start.bat`

تفتح نافذتان تلقائياً:
1. **Flask Server** — الخادم
2. **Cloudflare Tunnel** — النفق

### في نافذة Cloudflare ابحث عن سطر مثل:
```
https://something-random.trycloudflare.com
```
**هذا رابطك الدائم — شاركه مع المترشحين** ✅

---

## 📋 الاستخدام

| الجهة | الرابط |
|-------|--------|
| المترشح (هاتف أو حاسوب) | `https://xxxx.trycloudflare.com` |
| لوحة الإدارة | نفس الرابط ← زر "الإدارة" |
| تصدير CSV | من لوحة الإدارة ← زر CSV |

---

## ✅ مقارنة Cloudflare vs ngrok

| | Cloudflare Tunnel | ngrok مجاني |
|--|--|--|
| السعر | مجاني تماماً | مجاني |
| الرابط | ثابت نسبياً | يتغير كل إعادة تشغيل |
| الحساب | لا يلزم | يلزم |
| السرعة | ممتازة | جيدة |

---

## ⚠️ ملاحظات

- **جهاز الإدارة يجب أن يكون مشغّلاً** حتى يعمل التطبيق
- الصور تُحفظ في `backend/images/`
- قاعدة البيانات في `backend/registrations.db` — احتفظ بنسخة احتياطية أسبوعياً
- إذا أُغلق الجهاز وأُعيد تشغيله، شغّل `start.bat` من جديد

---

## 🔒 تأمين لوحة الإدارة (اختياري)
يمكن إضافة كلمة مرور — أخبرني إن أردت ذلك.
