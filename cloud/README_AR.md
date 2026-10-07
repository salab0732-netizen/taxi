# النسخة السحابية — منصة تسيير سيارات الأجرة (Oracle Cloud)

هذه **نسخة ثانية مستقلة** من البرنامج، مهيّأة للعمل على خادم Oracle Cloud مجاني.
النسخة الأصلية على حاسوبك (`F:\taxi-main`) لم تُمسّ وتبقى تعمل كما هي.

> ⚠️ هذا المجلد يحتوي أسراراً (مفاتيح القراءة الآلية، إعدادات Google وSMS) وقاعدة البيانات — لا تشاركه ولا ترفعه إلى GitHub.

## محتوى الحزمة
| المجلد | المحتوى |
|---|---|
| `backend/` | الخادم + قاعدة البيانات (نسخة بتاريخ التحضير) + الإعدادات |
| `frontend/` | الواجهة جاهزة (مبنية) |
| `frontend_src/` | مصدر الواجهة (لإعادة البناء مستقبلاً) |
| `deploy/setup.sh` | التثبيت الكامل بأمر واحد |
| `deploy/update.sh` | تحديث الشيفرة لاحقاً دون المساس بالبيانات |
| `deploy/download_db.sh` | نسخة فورية من قاعدة البيانات |

## ما يقوم به التثبيت تلقائياً
- خادم دائم (يُعاد تشغيله تلقائياً عند أي توقف أو إعادة إقلاع)
- رابط ثابت مع **HTTPS** مجاني (Caddy + Let's Encrypt)
- فتح المنافذ 80/443 في جدار حماية الخادم
- نسخة احتياطية يومية لقاعدة البيانات الساعة 02:30 (يُحتفظ بـ 30 يوماً)

---

## ⭐ التثبيت على خادم «كفاءة» الحالي (kafaa-a1) — الطريقة المعتمدة

الخادم `kafaa-a1` (Ampere 4 OCPU / 24 GB) يستعمل كامل الحصّة المجانية، لذلك يُثبَّت البرنامج **بجانب كفاءة على نفس الآلة**:
- منفذ داخلي خاص **8901** وملف Caddy مستقل (`/etc/caddy/centres/taxi-platform.caddy`) — **لا يُعدَّل أي إعداد لكفاءة**.
- الرابط: **https://taxi.kafaa-albayadh.duckdns.org** (يعمل تلقائياً — DuckDNS يقبل الأسماء الفرعية، لا تسجيل جديد).
- المنفذان 80/443 مفتوحان مسبقاً (لكفاءة).

من **PowerShell** على حاسوبك:
```powershell
scp -o StrictHostKeyChecking=accept-new -i C:\KAFAA_Wallet\ssh-key-a1.key F:\taxi-main\cloud_version\taxi-cloud.zip ubuntu@kafaa-albayadh.duckdns.org:~/
ssh -i C:\KAFAA_Wallet\ssh-key-a1.key ubuntu@kafaa-albayadh.duckdns.org
```
ثم على الخادم:
```bash
rm -rf taxi-cloud && unzip -q -o taxi-cloud.zip && bash taxi-cloud/deploy/setup.sh
```
في النهاية: «✅ الخادم يعمل» + الرابط. جرّب: `https://taxi.kafaa-albayadh.duckdns.org` و`/#admin`.

تحقّق أن كفاءة ما زالت تعمل: `https://kafaa-albayadh.duckdns.org/api/ping`

---

## الخطوات (لخادم جديد مستقل — للمرجع)

### 1) إنشاء حساب Oracle Cloud
1. ادخل إلى https://www.oracle.com/cloud/free/ ← **Start for free**
2. اختر **منطقة رئيسية قريبة** (مثل *France Central – Marseille* أو *Spain Central – Madrid*) — لا تتغيّر لاحقاً.
3. تحقّق بالبطاقة البنكية (لا يُقتطع شيء).
4. **مهم:** بعد التفعيل، رقِّ الحساب إلى **Pay As You Go** (Billing ← Upgrade) مع البقاء ضمن الموارد المجانية — يمنع استرجاع الخادم الخامل.

### 2) إنشاء الخادم
Compute ← Instances ← **Create instance**
- **Image:** Canonical **Ubuntu 24.04**
- **Shape:** Ampere ← `VM.Standard.A1.Flex` — **2 OCPU / 12 GB** (مجاني)
- **Networking:** اترك «Assign a public IPv4 address» مفعّلاً
- **SSH keys:** اضغط **Save private key** واحفظ الملف (مثلاً `C:\oracle\taxi.key`)
- Create ← انسخ **Public IP** الخادم.

### 3) فتح المنفذين 80 و443 في شبكة أوراكل
Networking ← Virtual Cloud Networks ← (الشبكة) ← Subnet ← **Default Security List** ← **Add Ingress Rules**:
- Source CIDR `0.0.0.0/0` — TCP — Destination port `80`
- Source CIDR `0.0.0.0/0` — TCP — Destination port `443`

### 4) رفع الحزمة وتثبيتها (من PowerShell على حاسوبك)
```powershell
# صلاحيات ملف المفتاح (مرة واحدة)
icacls C:\oracle\taxi.key /inheritance:r /grant:r "$($env:USERNAME):(R)"

# رفع الحزمة (استبدل IP بعنوان خادمك)
scp -i C:\oracle\taxi.key F:\taxi-main\cloud_version\taxi-cloud.zip ubuntu@IP:~

# الدخول للخادم
ssh -i C:\oracle\taxi.key ubuntu@IP
```
ثم على الخادم:
```bash
sudo apt-get install -y unzip && unzip -o taxi-cloud.zip && bash taxi-cloud/deploy/setup.sh
```
- بدون نطاق: يُنشأ رابط تلقائي مثل `https://140-238-1-2.sslip.io`
- بنطاقك الخاص (بعد توجيهه إلى IP الخادم): `bash taxi-cloud/deploy/setup.sh taxi.mondomaine.dz`

في النهاية يظهر **رابط البرنامج**. افتحه، ولوحة الإدارة على `/#admin`.

### 5) الدخول بـ Google
في Google Cloud Console ← Credentials ← (OAuth Client) أضف في *Authorized redirect URIs*:
`https://<رابطك>/api/auth/google/callback`

### 6) تطبيق الأندرويد
غيّر عنوان الخادم في التطبيق إلى الرابط الجديد (بدل رابط ngrok).

---

## الانتقال الفعلي (تجنّب تضارب البيانات)
النسختان مستقلتان: **ما يُدخل في إحداهما لا يظهر في الأخرى.**
قاعدة البيانات في الحزمة نسخة بتاريخ تحضيرها. يوم الانتقال النهائي:
1. أوقف العمل على النسخة المحلية.
2. ارفع أحدث قاعدة بيانات واستبدلها على الخادم:
```powershell
scp -i C:\oracle\taxi.key F:\taxi-main\backend_new\registrations.db ubuntu@IP:~/new.db
ssh -i C:\oracle\taxi.key ubuntu@IP "sudo systemctl stop taxi && sudo cp /opt/taxi/backend/registrations.db /opt/taxi/backups/before_cutover.db && sudo cp ~/new.db /opt/taxi/backend/registrations.db && sudo chown taxi:taxi /opt/taxi/backend/registrations.db && sudo systemctl start taxi"
```
3. من ذلك اليوم يعمل الجميع على الرابط السحابي فقط.

## أوامر مفيدة على الخادم
| الغرض | الأمر |
|---|---|
| حالة الخادم | `sudo systemctl status taxi` |
| آخر الأخطاء | `sudo journalctl -u taxi -n 50` |
| إعادة التشغيل | `sudo systemctl restart taxi` |
| نسخة فورية من القاعدة | `bash taxi-cloud/deploy/download_db.sh` |
| تنزيل نسخة إلى حاسوبك | `scp -i C:\oracle\taxi.key ubuntu@IP:/opt/taxi/backups/<الملف> .` |
| تحديث الشيفرة | ارفع حزمة جديدة ثم `bash taxi-cloud/deploy/update.sh` |
