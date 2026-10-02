# 🚕 ملف الحوار — المستشار والمنفذ

---

## ✅ توثيق منطق عقد المناوب ودورة حياته 2026-09-15

### التسلسل الصحيح: 3 خطوات مرتبطة

```
خطوة 1: حفظ بيانات المناوب (OCR رخصة سياقته)
        ↓
        DeputyTab → PUT /api/driver/deputy
        ↓
        deputies: سجل جديد (is_current=1)
        deputies_history: date_start مفتوح (date_end = NULL)

خطوة 2: إنشاء عقد العمل
        ↓
        DeputyTab → POST /api/driver/deputy-contract
        ↓
        deputy_contracts: عقد جديد (is_current=1, مدة سنة)

خطوة 3: طلب التصريح الرسمي (يذهب للمدير)
        ↓
        DeputyTab → POST /api/requests {request_type: "تصريح_مناوب"}
        ↓
        requests: طلب جديد (statut=جديد) ← يظهر عند المدير
```

### ما يظهر للسائق بعد الخطوات الثلاث

| الزر | الشرط | ماذا يطبع |
|------|-------|----------|
| طباعة طلب توظيف | `deputyCtId` موجود | `printDeputyJobRequest(contractId)` |
| طباعة عقد العمل | `deputyCtId` موجود | `printDeputyContract(contractId)` |
| طباعة فسخ العقد | `deputyCtId` موجود | `printDeputyContractTermination(contractId)` |
| رخصة السائق الإضافي | `deputyCtId` موجود | `printMyDeputyPermit(token)` |

---

### منطق فسخ العقد وأثره على النظام

```
السائق ينقر "طباعة فسخ العقد" ← فقط يطبع PDF، ليس إجراءاً
                        ↓
المدير هو من ينفذ الفسخ فعلياً (save_deputy أو من لوحة الإدارة)
                        ↓
عند حفظ مناوب جديد (save_deputy):
  ├── deputy_contracts: is_current=0، end_date=اليوم، end_reason=استبدال_المناوب
  ├── deputies: is_current=0
  └── deputies_history: date_end=اليوم، end_reason=استبدال
```

### حالة السائق بعد فسخ العقد (deputyCtId = null و لا يوجد مناوب جديد)

| العنصر | الحالة | السبب |
|-------|-------|------|
| تبويب المناوب (DeputyTab) | يظهر فارغاً تماماً | `deputy={}` → `hasDeputy=false` → `mode=edit` |
| زر "طباعة طلب توظيف" | معطّل (disabled) | `deputyCtId=null` |
| زر "طباعة عقد" | معطّل (disabled) | `deputyCtId=null` |
| زر "طباعة فسخ العقد" | معطّل (disabled) | `deputyCtId=null` |
| رخصة السائق الإضافي | تظهر رسالة "لم تصدر بعد" | `perm=null` → HTML توضيحي |

> **السبب الجذري**: بعد فسخ العقد لا يوجد عقد نشط → `profile.deputy_contract = null` → `deputyCtId = null` → كل الأزرار معطّلة

---

### الخطوات الصحيحة بعد الفسخ

```
1. السائق يختار "تغيير المناوب" → تظهر خانات الإدخال فارغة تماماً
2. يرفع رخصة المناوب الجديد → OCR يملأ الحقول
3. يحفظ → مناوب جديد في DB + أرشفة القديم تلقائياً
4. ينشئ عقد العمل → deputyCtId يصبح متاحاً
5. ينشئ طلب تصريح للمدير → يظهر في تبويب (الطلبات)
6. بعد موافقة المدير → السائق يطبع الرخصة من تبويب المناوب
```

---

### جدول حالات العرض في DeputyTab

| الحالة | mode | ما يظهر |
|-------|------|----------|
| لا يوجد مناوب إطلاقاً | edit | خانات إدخال فارغة |
| مناوب موجود، لا عقد | view | بيانات المناوب + زر "إنشاء عقد" |
| مناوب + عقد نشط | view | بيانات + أزرار طباعة فعالة |
| فسخ العقد (لا مناوب جديد) | edit | خانات فارغة + كل الأزرار disabled |

> **ملاحظة مهمة**: بعد الفسخ، `profile.deputy = {}` و `profile.deputy_contract = null`
> - `hasDeputy = !!deputy.num_permis = false`
> - `contractId = profile?.deputy_contract?.id = undefined`
> - `mode` يبقى `view` (initي) → **هذا خطأ محتمل!** إذا `mode="view"` ولا يوجد مناوب → تظهر بيانات فارغة
> - **الإصلاح المطلوب**: `useState(hasDeputy ? "view" : "edit")` هو الصحيح وهذا مطبّق فعلاً

---

### إشكاليات مفتوحة (بعد الفسخ)

| الإشكالية | السبب | الحل |
|---------|-------|------|
| طلب توظيف لا يظهر عند المدير | `deputyCtId=null` → الزر disabled | السائق يجب أن يضيف مناوباً جديداً + ينشئ عقد + يطلب |
| رخصة السائق الإضافي لا تظهر عند المانوب | `deputyCtId=null` → disabled | نفس الحل أعلاه |
| عقد لا يظهر شيئ | رقم عقد قديم في `contractId` | بعد الفسخ `contractId=null` → زر إنشاء يظهر |

## ✅ مُنجز 2026-09-08
- DeputyTab.jsx، print.py، ocr.py، api.js

## ✅ مُنجز 2026-09-09
- DoorTab.jsx، door.py

## ✅ مُنجز 2026-09-10 (المرحلة 1)
- RequestsTab.jsx (4 أزرار طباعة)، App.jsx (#admin hash URL)

## ✅ مُنجز 2026-09-10 (المرحلة 2)
- requests.py + print.py (5 endpoints) + api.js + RequestsTab.jsx (5 طلبات رسمية)

## ✅ مُنجز 2026-09-10 (الفحص الشامل)
### 15 خطأ مكتشف وتم إصلاحه:

| # | الملف | الخطأ | الإصلاح |
|---|-------|-------|---------|
| 1 | driver.py `save_license` | `driver["id"]` بعد branch مشروط → NameError | → `driver_id` |
| 2 | driver.py `save_vehicle` | نفس المشكلة | → `driver_id` |
| 3 | requests.py | `تغيير_نشاط` يُعدّل DB مزدوجاً مع admin.py | حُذف التأثير الفوري — admin يُنفّذ عند القبول |
| 4 | admin.py `تغيير_نشاط` | لا يُغلق `activity_history` القديم بـ `date_end` | أُضيف UPDATE + INSERT صحيح |
| 5 | admin.py `تغيير_نشاط` | لا يُضيف سجل في `activity_history` للنشاط الجديد | أُضيف INSERT |
| 6 | print.py `drv_full` | alias `ben_nom` لكن الكود يطلب `ben_nom_ar` | → `ben_nom or ben_nom_ar` |
| 7 | IdentityTab.jsx | `categories: JSON.stringify(array)` → double encoded | → إرسال array مباشرة |
| 8 | RequestsTab.jsx | `profile?.identity?.statut` غير موجود في profile | → `profile?.driver?.statut` |
| 9 | DoorTab.jsx | يُنشئ عقد كراء جديد في كل حفظ | → فقط إذا `!rental.id` |
| 10 | VehicleTab.jsx `createChangeRequest` | `request_data: {...}` nested لكن requests.py يقرأ root | → نقل للـ root |
| 11 | VehicleTab.jsx `createAndPrint` | نفس المشكلة | → نقل للـ root |
| 12-15 | أخطاء ثانوية | commit مزدوج، تعليقات، alias غير ضروري | نظّف وعُلّق |

---

## هيكل التبويبات
| التبويب | الملف | المحتوى |
|---------|-------|---------|
| 🪪 الهوية | IdentityTab.jsx | OCR رخصة السياقة → حفظ الهوية + الرخصة |
| 🚗 المركبة | VehicleTab.jsx | OCR البطاقة الرمادية → عرض/تغيير + طلب |
| 🚪 الباب | DoorTab.jsx | OCR القرار + هوية المستفيد → عقد كراء |
| 👤 المناوب | DeputyTab.jsx | OCR رخصة → عقد عمل + طباعة |
| 📋 وثائق وطباعة | RequestsTab.jsx | 4 طباعة + 5 طلبات رسمية + سجل |

## الروابط
- السائق:  http://localhost:3000/
- الإدارة: http://localhost:3000/#admin
- عام (ngrok): https://undertook-consent-robotics.ngrok-free.dev

## تدفق الطلبات
1. السائق يُقدّم طلب → يُحفظ في `requests` بـ statut=جديد
2. المدير يرى الطلب في AdminPanel → يقبل/يرفض
3. عند القبول: admin.py يُنفّذ التأثير الفعلي على DB
   - `تغيير_نشاط` → يُحدث `activity` + `activity_history`
   - `استئناف` → statut=نشط + يُغلق status_history
   - `تغيير_سيارة` → يُؤرشف vehicle القديم
   - `تجديد_رخصة_*` → يُضيف رخصة جديدة
4. `توقف_مؤقت` و`توقف_نهائي` و`استئناف`: تأثير فوري (لا ينتظر المدير)

---

## ✅ مُنجز 2026-09-12
- AdminPanel.jsx: استبدال زر "تصدير CSV" بأيقونة Excel خضراء
- admin.py: حذف `/api/admin/export/csv` وإضافة `/api/admin/export/excel`
- الملف xlsx يحتوي على 4 ورقات: السائقون + المركبات + الأبواب والعقود + المناوبون
- requirements.txt: أضيف openpyxl>=3.1.0
- تنبيه: تشغيل `pip install openpyxl` إذا لم يكن مثبتاً

## ✅ مُنجز 2026-09-12 (بعد الظهر)

### قواعد التحقق والتكامل

| القاعدة | الملف | التفاصيل |
|---------|-------|----------|
| NIN مكرر | driver.py `save_identity` | 409 إذا NIN موجود لحساب آخر |
| رقم الباب لسائقَين | driver.py `save_door` | إذا العقد **نشط** → 409 + رسالة واضحة. إذا العقد **منتهي أو غائب** → نقل تلقائي + طلب `تغيير_باب` مقبول |
| نقل ملكية سيارة | driver.py `save_vehicle` | السيارة تُؤرشف من السائق القديم تلقائياً + طلب `تغيير_مركبة` مقبول |
| توقف عن النشاط | requests.py | `توقف_مؤقت` أو `توقف_نهائي` يُفسخ عقد الكراء + يُحرر الباب تلقائياً عبر `_terminate_door_and_contract()` |
| كشف مرئي مكرر | AdminPanel.jsx | السطور بنفس NIN تتلوّن أحمر + علامة ⚠️ |

### ملفات مُعدَّلة اليوم
- `backend_new/routes/driver.py` — تحقق NIN + منطق الباب والسيارة
- `backend_new/routes/requests.py` — دالة `_terminate_door_and_contract` + استدعاؤها
- `frontend_new/src/tabs/DoorTab.jsx` — عرض خطأ `CONTRACT_ACTIVE` بوضوح
- `frontend_new/src/tabs/AdminPanel.jsx` — كشف NIN المكرر مرئياً
- `frontend_new/src/api.js` — أضيف `تغيير_مركبة` لـ REQUEST_TYPES

### منطق الباب (ملخص)
```
سائق جديد يُدخل رقم باب
  ↓
الباب حر؟ → تسجيل مباشر ✅
الباب لسائق آخر؟
  ├── عقد نشط → ❌ 409 "يجب فسخ العقد أولاً"
  └── عقد منتهي/غائب → نقل تلقائي ✅
سائق يتوقف؟ → عقده يُفسخ + بابه يُحرر فوراً ✅
```

## ✅ مُنجز 2026-09-13

### إصلاح التكرار في جدول السائقين

**المشكلة**: سائق واحد يظهر مرتين في لوحة المدير

**السبب الجذري**: غياب `GROUP BY d.id` في استعلام `GET /api/admin/drivers` — جدول `rental_contracts` يُضاعف الصفوف إذا وُجد أكثر من عقد.

**الإصلاح**: `admin.py` → `get_all_drivers()` → أُضيف `GROUP BY d.id` قبل `ORDER BY`

**ملف مُنشأ**: `backend_new/fix_duplicates.py`
- سكريبت احتياطي يكشف السائقين بنفس NIN في حسابات مختلفة
- ينقل البيانات (باب، سيارة، عقد) من المكرر للأصلي
- يحذف السجل والحساب المكرر
- يُشغَّل يدوياً عند الحاجة: `python fix_duplicates.py`

**ملفات مُعدَّلة**:
- `backend_new/routes/admin.py` — أُضيف `GROUP BY d.id` في endpoint السائقين

---

## ✅ مُنجز 2026-09-13 (مساءً)

### تحسين OCR القرار الولائي

**المشكلة**: القرار الولائي لا يُقرأ تلقائياً — الحقول تبقى فارغة بعد رفع الصورة

**الأسباب**:
1. prompt كان قصيراً جداً — لا يُوضّح لـ Gemini أين يجد رقم الباب في النص
2. لا تطبيع لـ `decision_type` و`beneficiary_sifa` — إذا أعاد Gemini "استفادة جديدة" لا تتطابق مع قيم الـ `<select>`
3. لا تعامل مع `door_number` قد يحتوي أحرفاً زائدة

**الإصلاح** في `backend_new/routes/ocr.py`:
- prompt جديد مُفصَّل يشرح أنواع العبارات التي يظهر فيها رقم الباب (عربي + فرنسي)
- prompt يُحدد القيم الثلاث المقبولة لكل حقل بالضبط
- `normalize_decision_type()` — تطبيع نوع القرار
- `normalize_sifa()` — تطبيع صفة المستفيد
- `clean_ocr_result()` — يستدعي التطبيعَين الجديدَين

**ملف مُعدَّل**:
- `backend_new/routes/ocr.py`

---

## ✅ مُنجز 2026-09-14

### تحديث تبويب الباب (DoorTab)

**معلومات جديدة من المستخدم:**
1. رقم الباب لا يوجد في القرار الولائي — يُدخل يدوياً دائماً
2. رقم وتاريخ القرار في أعلى الوثيقة
3. نوع القرار يشمل أرملة مجاهد (تحويل الاستفادة)
4. مكان الاستغلال = بلدية الإلحاق (OCR من القرار)
5. حقل "ولاية رقم الباب" أصبح "بلدية الإلحاق" — 22 بلدية لولاية البيض

**تغييرات الملفات:**
- `frontend_new/src/api.js` — أضيف `COMMUNES_WILAYAS` (22 بلدية البيض) + `getCommunesByWilaya()` + `SIFA_OPTIONS` أضيف أرملة_مجاهد
- `frontend_new/src/tabs/DoorTab.jsx` — خانة "بلدية الإلحاق" قائمة منسدلة + رقم الباب يدوي فقط
- `backend_new/routes/ocr.py` — prompt جديد: حذف door_number + إضافة exploitation_commune + أرملة_مجاهد
- `backend_new/routes/driver.py` — حفظ exploitation_commune في door_fields
- `backend_new/database.py` — أضيف `exploitation_commune` TEXT في migrate_db

**لتطبيق التغيير على قاعدة البيانات الموجودة:**
```
python database.py
```

---

## ✅ مُنجز 2026-09-15 (مساءً)

### تحديث تبويب الباب — منطق الفسخ والتجديد

**المتطلب الجديد**: عند فسخ عقد الكراء يُفتح تلقائياً **وضع التجديد** بدلاً من الوضع القديم.

#### التسلسل الجديد بعد الفسخ:

```
السائق يضغط "فسخ عقد الكراء"
        ↓
يظهر زر "طباعة محضر الفسخ" فوراً
        ↓
يُفتح تلقائياً "وضع التجديد" (pageMode = "renew")
        ↓
الخطوة 1: القرار الولائي الجديد
  ├── checkbox: تغيير رقم الباب؟
  │     نعم → يدخل رقم الباب الجديد
  │     لا  → يبقى رقم الباب الحالي (مقفول)
  └── OCR القرار + بيانات القرار
        ↓
الخطوة 2: المستفيد الجديد (OCR بطاقة الهوية)
        ↓
الخطوة 3: إنشاء عقد الكراء الجديد
  + إنشاء طلب رسمي تلقائياً:
    ├── تغيير الباب → request_type: "تغيير_باب"
    └── بدون تغيير → request_type: "تجديد_وثائق_استغلال"
        ↓
الخطوة 4: أزرار الطباعة
  ├── 🖨️ طباعة عقد الكراء الجديد (دائماً)
  ├── 🖨️ طباعة طلب تغيير رقم الباب (إذا تغيير الباب)
  ├── 🖨️ طباعة طلب تجديد وثائق الاستغلال (إذا بدون تغيير)
  └── 🖨️ محضر فسخ العقد القديم (دائماً إن وُجد)
```

**ملاحظة**: تغيير رقم الباب عبر زر "بدء إجراء تغيير رقم الباب" (في الأسفل) يبقى مساراً مستقلاً كما كان.

**الملف المُعدَّل**:
- `frontend_new/src/tabs/DoorTab.jsx` — أعيدت كتابته كاملاً

---


### ما تم إصلاحه

| # | المشكلة | الملف | الإصلاح |
|---|--------|-------|--------|
| 1 | Route مكرر `/api/driver/door` | driver.py | حُذف `save_door()` القديم — الصحيح في door.py |
| 2 | `generate_number("REQ")` بدون معاملات | driver.py | → `generate_number("REQ", "requests", "request_number")` |
| 3 | `import csv` غير مستعمل | admin.py | حُذف |
| 4 | `exploitation_commune` غائب من `init_db()` | database.py | أُضيف للجدول |
| 5 | ملفات سكريبت مؤقتة (10 ملفات) | backend_new/ | استبدلت بتعليق واضح |

### ملفات جاهزة للحذف يدوياً
```
backend_new/fix_all.py
backend_new/fix_all2.py
backend_new/fix_drivers.py
backend_new/patch_frontend.py
backend_new/migrate_add_proprietaire_ar.py
backend_new/migrate_remove_modele.py
backend_new/migrate_vehicles_proprietaire.py
backend_new/diagnose.py
backend_new/test_api.py
backend_new/test_system.py
```

---

## ✅ إصلاح شامل لمنطق المناوب 2026-09-15

### مشكلة 1: طلب توظيف مناوب لا يظهر عند المدير
- **السبب**: `createContract()` كان ينشئ العقد فقط دون إرسال طلب
- **الإصلاح**: بعد إنشاء العقد → يرسل تلقائياً `request_type: تصريح_مناوب` ليظهر في تبويب (الطلبات) عند المدير

### مشكلة 2: رخصة السائق الإضافي تظهر فقط في الإدارة وليس عند السائق
- **السبب**: الرابط `/api/print/deputy-permit/{driverId}` يستخدم `@require_admin` فلا يعمل للسائق
- **الإصلاح**: endpoint جديد `GET /api/print/my-deputy-permit` يستخدم `@require_auth` (صلاحية سائق)

### مشكلة 3: زر فسخ العقد كان مجرد طباعة بدون فسخ فعلي
- **السبب**: لم يكن هناك endpoint للفسخ من جهة السائق — الزر كان يفتح PDF فقط
- **الإصلاح**: `POST /api/driver/deputy-contract/terminate` → يفسخ فعلياً + يأرشف المناوب + يفتح PDF المحضر

### الملفات المعدّلة
- `frontend_new/src/tabs/DeputyTab.jsx` — أعيد كتابته كاملاً
- `backend_new/routes/print.py` — أضيف `GET /api/print/my-deputy-permit`
- `backend_new/routes/deputy.py` — أضيف `POST /api/driver/deputy-contract/terminate`
- `frontend_new/src/api.js` — أضيف `printMyDeputyPermit`

---

---

## ✅ مُنجز 2026-10-02 — استئناف النشاط بملف كامل + رخصة جديدة

- طلب الاستئناف يُرفق بـ: المركبة (نفسها/جديدة + بطاقة رمادية) + الباب (نفسه/جديد + قرار ولائي + مستفيد) + عقد كراء جديد (أو صفة مستفيد)
- لا شيء يتغيّر قبل الموافقة. عند القبول (`status_flow.apply_status_request` → `resume_flow.apply_resume`):
  مركبة جديدة تُؤرشف القديمة، الباب يُربط، عقد كراء جديد سنة من تاريخ القبول
- المدير يرى ملخص الملف في بطاقة الطلب، وبعد القبول يطبع «رخصة الاستغلال» (أضيف `استئناف` لـ LICENSE_REQUEST_TYPES)
- طلبات الاستئناف القديمة (بلا ملف) تبقى تعمل بالمنطق السابق
- ملفات: `routes/resume_flow.py` (جديد)، `requests.py`، `status_flow.py`، `driver.py` (resume_door)، `ResumeRequestForm.jsx` (جديد)، `RequestsTab.jsx`، `AdminPanel.jsx`
- رفض `تغيير_سيارة` يُرجع المركبة السابقة (`admin._revert_vehicle_change`)

---

## ✅ مُنجز 2026-10-02 — إعادة تصميم الواجهة بالكامل

- نظام تصميم موحّد: `frontend_new/src/ui/` (theme.css، kit.jsx، Icon.jsx، Shell.jsx، خط IBM Plex Sans Arabic محلي)
- أيقونات SVG بدل الإيموجي — بدون أي مكتبة جديدة (لا حاجة لـ npm install)
- صفحة دخول جديدة، فضاء السائق (شريط تقدّم + تنقل سفلي للهاتف)، لوحة الإدارة والشركات بقائمة جانبية
- نوافذ تأكيد وإشعارات منبثقة بدل alert/confirm/prompt
- المنطق والـ API لم يتغيّرا — النسخة السابقة: `frontend_new/_backup_ui_20261002/`
