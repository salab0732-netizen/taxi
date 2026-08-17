══════════════════════════════════════════════════════════════
ملف سياق مشروع TAXI — للمحادثة الجديدة مع Claude
══════════════════════════════════════════════════════════════

━━━ 1. المستودع ━━━

الرابط     : https://github.com/salab0732-netizen/taxi
الفرع      : main
اللغة      : JavaScript (React/Babel) + Python (Flask)
الحالة     : ✅ يعمل بشكل كامل

━━━ 2. الاتصال بـ GitHub ━━━

TOKEN = "YOUR_GITHUB_TOKEN"
REPO  = "salab0732-netizen/taxi"

أسرع طريقة للتعديل:
  1. git -C /home/claude/taxi_repo pull
  2. str_replace مباشر على الملف
  3. git -C /home/claude/taxi_repo add . && git commit -m "..." && git push

━━━ 3. هيكل المشروع ━━━

taxi/
├── backend/
│   ├── app.py              ← خادم Flask الرئيسي (كل الـ API)
│   ├── index.html          ← React app كامل (Babel inline — يُولَّد بـ build.py)
│   ├── gemini_key.txt      ← مفتاح Gemini (لا يُرفع لـ GitHub)
│   ├── claude_key.txt      ← مفتاح Claude (لا يُرفع لـ GitHub)
│   ├── registrations.db    ← قاعدة البيانات SQLite (تُنشأ تلقائياً)
│   ├── react.js / react-dom.js / babel.js  ← مكتبات frontend
│   ├── requirements.txt    ← flask==3.0.3 + flask-cors==4.0.1
│   └── images/             ← صور رخص المسجلين
│
├── frontend/               ← ملفات React المنفصلة (المصدر)
│   ├── 01_constants.js     ← API_BASE، WILAYAS، INITIAL_FORM، extractCarteGriseData
│   ├── 02_upload.js        ← رفع صورة رخصة السياقة + OCR
│   ├── 03_carte_grise.js   ← رفع البطاقة الرمادية + OCR
│   ├── 04_vehicle_review.js← مراجعة بيانات المركبة
│   ├── 05_company.js       ← تسجيل الشركات
│   ├── 06_seat_booklet.js  ← دفتر المقاعد
│   ├── 07_heritage.js      ← ذوو الحقوق
│   ├── 08_admin_main.js    ← لوحة الإدارة
│   └── 09_boot.js          ← نقطة الدخول (ReactDOM.render)
│
├── build.py                ← يدمج frontend/* → backend/index.html ويرفع لـ GitHub
├── run.py                  ← تشغيل Flask
└── start.bat               ← تشغيل بنقرة واحدة (Windows)

━━━ 4. قاعدة البيانات — 4 جداول ━━━

candidates   ← سائقو سيارات الأجرة + بيانات رخصة السياقة + NIN
vehicles     ← المركبات (مرتبطة بـ candidate_id أو company_id)
companies    ← شركات سيارات الأجرة
seat_booklet_registrations ← المترشحون لنيل دفتر المقاعد

━━━ 5. API Endpoints ━━━

POST /api/ocr-carte-grise   ← OCR البطاقة الرمادية بـ Gemini
POST /api/ocr-permis        ← OCR رخصة السياقة بـ Gemini
POST /api/candidates        ← تسجيل سائق جديد
GET  /api/candidates        ← قائمة السائقين
GET  /api/candidates/<id>   ← بيانات سائق محدد
PUT  /api/candidates/<id>   ← تعديل بيانات سائق
DELETE /api/candidates/<id> ← حذف سائق
POST /api/companies         ← تسجيل شركة
GET  /api/companies         ← قائمة الشركات
GET  /api/stats             ← إحصائيات عامة

━━━ 6. قواعد ثابتة لـ Claude ━━━

1. **Flask static**: دائماً `Flask(__name__, static_folder=None)` — لا تغيّر هذا أبداً
2. **Gemini JSON**: دائماً `"responseMimeType": "application/json"` في generationConfig
3. **مفتاح Gemini**: يُقرأ من `APP_DIR/gemini_key.txt` (APP_DIR = Path(__file__).resolve().parent)
4. **مفتاح Claude**: يُقرأ من `APP_DIR/claude_key.txt`
5. **Babel inline**: لا `import {}` ولا `export default` — استخدم `const {} = React` و`function App()`
6. **build.py**: بعد أي تعديل في frontend/*.js → شغّل `python build.py` لدمج الملفات
7. **قاعدة البيانات**: احذف `registrations.db` عند تغيير هيكل الجداول
8. **API_BASE**: في frontend يُحدَّد تلقائياً (localhost:5000 محلياً، /api عند النشر)

━━━ 7. بنية INITIAL_FORM (الحقول الرئيسية) ━━━

بيانات السائق:
  nomAr, prenomAr          ← الاسم واللقب بالعربية
  nom, prenom              ← بالفرنسية
  dateNaissance            ← DD/MM/YYYY
  lieuNaissance            ← مكان الميلاد
  wilayaNaissance          ← الولاية
  nin                      ← رقم التعريف الوطني (18 رقم)
  telephone, telephone2    ← أرقام الهاتف
  adresse, commune, wilaya ← العنوان

بيانات الرخصة:
  numPermis                ← رقم الرخصة
  dateDelivrance           ← تاريخ الإصدار
  dateExpiration           ← تاريخ الانتهاء
  lieuDelivrance           ← مكان الإصدار
  categories               ← مصفوفة (["B","C"...])

بيانات المركبة (من البطاقة الرمادية):
  numImmatriculation       ← رقم التسجيل
  marque                   ← العلامة التجارية
  typeVehicule             ← نوع المركبة
  modele                   ← الموديل
  numSerie                 ← رقم الهيكل (VIN)
  genre, energie           ← النوع ونوع الوقود
  puissance                ← القدرة
  nbPlaces                 ← عدد المقاعد
  anneeCirculation         ← سنة التسيير
  numPrecedent             ← الرقم السابق

━━━ 8. نظام البناء (build.py) ━━━

الملفات بالترتيب الصحيح:
  01_constants.js → 02_upload.js → 03_carte_grise.js →
  04_vehicle_review.js → 05_company.js → 06_seat_booklet.js →
  07_heritage.js → 08_admin_main.js → 09_boot.js

يُدمج في: backend/index.html (بين <script type="text/babel"> ... </script>)

━━━ 9. التشغيل المحلي على Windows ━━━

cd C:\Users\dtv32\taxi  (أو المجلد المناسب)
python run.py
الرابط: http://localhost:5000

أو: start.bat (بنقرة واحدة)

━━━ 10. Prompt إعادة الانطلاق ━━━

انسخ هذا في محادثة Claude جديدة:

```
أنت تعمل على مشروع TAXI موجود على:
https://github.com/salab0732-netizen/taxi

TOKEN = "YOUR_GITHUB_TOKEN"
REPO  = "salab0732-netizen/taxi"

اقرأ TAXI_CONTEXT.md أولاً من المستودع، ثم واصل المهمة مباشرة.
```

══════════════════════════════════════════════════════════════
