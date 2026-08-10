# مشروع تسجيل سائقي سيارات الأجرة — PROJECT NOTES
**المستودع:** `salab0732-netizen/taxi`  
**آخر تحديث:** 09 أغسطس 2026  
**الحالة:** ✅ يعمل بشكل كامل

---

## 🔑 قواعد أساسية قبل أي تعديل

1. **قاعدة البيانات** تُنشأ تلقائياً عند أول تشغيل — احذف `registrations.db` عند تغيير هيكل الجداول
2. **Flask static** — يجب دائماً استخدام `Flask(__name__, static_folder=None)` وإلا يتعارض مع route `/static/` المخصص ويسبب 404
3. **Gemini JSON** — يجب دائماً تفعيل `"responseMimeType": "application/json"` في generationConfig لضمان JSON صالح
4. **مفتاح Gemini** — يُقرأ من `APP_DIR/gemini_key.txt` (APP_DIR = `Path(__file__).resolve().parent`)
5. **Babel inline** — لا `import {}` ولا `export default` — استخدم `const {} = React` و`function App()`
6. **لوحة الإدارة** — عند الضغط على "الإدارة" تظهر لوحة بثلاث تبويبات (سائقون/شركات/دفتر المقاعد)

---

## 🏗️ بنية المشروع

```
backend/
├── app.py          ← خادم Flask الرئيسي (كل الـ API)
├── index.html      ← React app كامل (Babel inline)
├── gemini_key.txt  ← مفتاح Gemini (لا يُرفع لـ GitHub)
├── registrations.db← قاعدة البيانات SQLite
├── react.js / react-dom.js / babel.js ← مكتبات frontend
└── images/         ← صور رخص المسجلين
```

---

## 📊 قاعدة البيانات — 4 جداول

| الجدول | المحتوى |
|---|---|
| `candidates` | سائقو سيارات الأجرة + بيانات رخصة السياقة |
| `vehicles` | المركبات (مرتبطة بسائق أو شركة) |
| `companies` | شركات سيارات الأجرة |
| `seat_booklet_registrations` | المترشحون لنيل دفتر المقاعد |

---

## 🌐 API Endpoints

| Endpoint | الوصف |
|---|---|
| `POST /api/ocr` | OCR رخصة السياقة |
| `POST /api/ocr-carte-grise` | OCR البطاقة الرمادية |
| `POST /api/register` | تسجيل سائق |
| `POST /api/register-company` | تسجيل شركة |
| `POST /api/register-seat-booklet` | تسجيل مترشح دفتر المقاعد |
| `GET /api/print-seat-certificate/<id>` | طباعة شهادة تسجيل مع QR |
| `GET /api/admin/candidates` | قائمة السائقين |
| `GET /api/admin/companies` | قائمة الشركات |
| `GET /api/admin/seat-booklet` | قائمة مترشحي دفتر المقاعد |
| `PATCH /api/admin/candidates/<id>` | تحديث حالة سائق |
| `GET /api/admin/export/csv/candidates` | تصدير السائقين Excel |
| `GET /api/admin/export/csv/companies` | تصدير الشركات Excel |
| `GET /api/admin/export/csv/seat-booklet` | تصدير دفتر المقاعد Excel |
| `GET /api/stats` | إحصائيات |
| `GET /api/admin/print/security` | قائمة أمنية قابلة للطباعة |

---

## 📱 صفحات التطبيق (Routing)

| page state | المكوّن | الوصف |
|---|---|---|
| `"landing"` | `LandingPage` | الصفحة الرئيسية (3 خيارات) |
| `"driver"` | تدفق 3 خطوات | رفع رخصة+بطاقة رمادية → مراجعة → تأكيد |
| `"company"` | `CompanyForm` | تسجيل شركة + سائقين + مركبات |
| `"booklet"` | `SeatBookletForm` | تسجيل دفتر المقاعد + طباعة شهادة QR |

---

## 🐛 أبرز الإصلاحات الموثقة

| المشكلة | الحل |
|---|---|
| 404 على react.js/babel.js | `Flask(__name__, static_folder=None)` |
| Gemini يُرجع JSON مكسور | `responseMimeType: application/json` |
| مفتاح AQ.Ab8... مرفوض | `x-goog-api-key` header بدل `?key=` |
| شاشة بيضاء عند + إضافة مركبة | مكون `UploadCarteGrise` كان محذوفاً — أُعيد تعريفه |
| اللقب العربي يُفقد | تحسين prompt بتعليمات صريحة للبحث عن علامة 'اللقب' |
| مكان الميلاد فارغ | طبيعي في الرخص البيومترية الحديثة — لا يُطبع عليها |

---

## ⚠️ ملاحظات أمنية

- توكن GitHub (`ghp_OeUUTW83...`) — يُنصح بإلغائه وإنشاء آخر بعد استقرار المشروع
- مفتاح Gemini محلي في `gemini_key.txt` (مستثنى من Git — صحيح)
- مفتاح Gemini بصيغة `AQ.Ab8...` (OAuth2 جديدة) وليس `AIzaSy...` القديمة
