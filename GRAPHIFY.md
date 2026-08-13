# 🔨 Graphify — دليل التعديل الاقتصادي

## المشكلة التي يحلها
`backend/index.html` = 95KB = ~24,000 token في كل تعديل.
مع Graphify: كل تعديل = ملف واحد صغير + رفع index.html فقط.

## هيكل الملفات

```
frontend/
├── 01_constants.js       ~  700 tokens  (الثوابت + WILAYAS + INITIAL_FORM)
├── 02_upload.js          ~ 1,800 tokens (UploadDocuments + UploadStep)
├── 03_carte_grise.js     ~  700 tokens  (UploadCarteGrise)
├── 04_vehicle_review.js  ~ 9,500 tokens (ReviewStep + ReviewVehicle + StepBar + AdminPanel)
├── 05_company.js         ~ 5,000 tokens (CompanyForm)
├── 06_seat_booklet.js    ~ 1,600 tokens (SeatBookletForm)
├── 07_heritage.js        ~ 2,600 tokens (HeritageLicenseForm)
├── 08_admin_main.js      ~ 1,700 tokens (App component)
└── 09_boot.js            ~    20 tokens (ReactDOM.render)

backend/
└── index.html            ← يُنشأ تلقائياً بدمج الملفات أعلاه (لا تعدّله يدوياً)
```

## كيفية الاستخدام

### 1. ضع مفتاح GitHub
```
echo "ghp_..." > github_token.txt
```

### 2. عدّل الملف المناسب فقط
| تريد تعديل | عدّل الملف |
|---|---|
| نموذج الشركة | `frontend/05_company.js` |
| صفحة دفتر المقاعد | `frontend/06_seat_booklet.js` |
| صفحة ذوي الحقوق | `frontend/07_heritage.js` |
| لوحة الإدارة | `frontend/04_vehicle_review.js` |
| الصفحة الرئيسية | `frontend/08_admin_main.js` |
| ثوابت / بيانات | `frontend/01_constants.js` |

### 3. شغّل Build
```bash
# بعد تعديل ملف شركة
python build.py 05_company

# بعد تعديل ذوي الحقوق
python build.py 07_heritage

# بناء كامل (كل الملفات)
python build.py
```

### 4. طبّق على الخادم
```bash
git pull
# أو نزّل ZIP جديد
```

## توفير التوكن

| الطريقة | التوكن المستهلك |
|---|---|
| تعديل index.html مباشرة | ~24,000 token لكل رسالة |
| Graphify (ملف واحد) | 700 → 9,500 token حسب الملف |
| **التوفير** | **60% → 97%** |

## ملاحظة مهم للنماذج AI
عند طلب تعديل في المحادثة، اذكر الملف المحدد:
- "عدّل `05_company.js` لإضافة..."
- "في `07_heritage.js`، أضف حقل..."
هذا يوجّه النموذج لجلب وتعديل الملف الصغير فقط.
