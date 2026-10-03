const BASE = window.location.hostname === "localhost"
  ? "/api"
  : window.location.origin + "/api";

// تنبيه المستخدم عند فشل القراءة الآلية بدل الفشل الصامت
function notifyOcrError(res) {
  const err = res?.error || res?.ocr?.error;
  if (err) {
    window.alert("⚠️ تعذّرت القراءة الآلية للوثيقة.\nأعد رفع صورة أوضح (JPG/PNG) أو ملف PDF صحيح، أو أدخل البيانات يدوياً.\n\nالتفاصيل: " + String(err).slice(0, 160));
  }
  return res;
}

function headers(token) {
  const h = { "Content-Type": "application/json" };
  if (token) h["X-Token"] = token;
  return h;
}

export const api = {

  register: (username, password, role="driver", extra={}) =>
    fetch(`${BASE}/auth/register`, {
      method: "POST", headers: headers(),
      body: JSON.stringify({ username, password, role, ...extra }),
    }).then(r => r.json()),

  getCompanyProfile: (token) =>
    fetch(`${BASE}/company/profile`, { headers: headers(token) }).then(r => r.json()),

  saveCompanyProfile: (token, data) =>
    fetch(`${BASE}/company/profile`, {
      method: "POST", headers: headers(token),
      body: JSON.stringify(data),
    }).then(r => r.json()),

  // ── فضاء الشركة: مركبات وسائقون ──
  companyList: (token, kind) =>
    fetch(`${BASE}/company/${kind}`, { headers: headers(token) }).then(r => r.json()),

  companySave: (token, kind, data, id=null) =>
    fetch(`${BASE}/company/${kind}${id ? "/" + id : ""}`, {
      method: id ? "PUT" : "POST", headers: headers(token),
      body: JSON.stringify(data),
    }).then(r => r.json()),

  companyDelete: (token, kind, id) =>
    fetch(`${BASE}/company/${kind}/${id}`, {
      method: "DELETE", headers: headers(token),
    }).then(r => r.json()),

  // ── طلبات توظيف السائقين الأجراء ──
  companyHireRequests: (token) =>
    fetch(`${BASE}/company/hire-requests`, { headers: headers(token) }).then(r => r.json()),

  companyCreateHireRequest: (token, data) =>
    fetch(`${BASE}/company/hire-requests`, {
      method: "POST", headers: headers(token), body: JSON.stringify(data),
    }).then(r => r.json()),

  companyTerminateHire: (token, id) =>
    fetch(`${BASE}/company/hire-requests/${id}/terminate`, {
      method: "POST", headers: headers(token), body: "{}",
    }).then(r => r.json()),

  // kind: hire-job-request | hire-contract | hire-termination | hire-permit
  companyPrintUrl: (token, kind, id) => `${BASE}/company/print/${kind}/${id}?token=${token}`,

  adminHireRequests: (token, statut="") =>
    fetch(`${BASE}/admin/hire-requests?statut=${encodeURIComponent(statut)}`, { headers: headers(token) })
      .then(r => r.json()),

  adminProcessHire: (token, id, statut, admin_notes="") =>
    fetch(`${BASE}/admin/hire-requests/${id}`, {
      method: "PUT", headers: headers(token), body: JSON.stringify({ statut, admin_notes }),
    }).then(r => r.json()),

  adminCompanyPrintUrl: (token, kind, id) => `${BASE}/admin/print/company/${kind}/${id}?token=${token}`,
  companyCardUrl:      (token) => `${BASE}/company/print-company/card?token=${token}`,
  adminCompanyDocUrl:  (token, doc, cid) => `${BASE}/admin/print-company/${doc}/${cid}?token=${token}`,

  // ── تغيير مركبة الشركة (طلب رسمي للإدارة) ──
  companyChangeVehicle: (token, vehicleId, data) =>
    fetch(`${BASE}/company/vehicles/${vehicleId}/change`, {
      method: "POST", headers: headers(token), body: JSON.stringify(data),
    }).then(r => r.json()),

  companyVehicleRequests: (token) =>
    fetch(`${BASE}/company/vehicle-requests`, { headers: headers(token) }).then(r => r.json()),

  adminVehicleRequests: (token, statut="") =>
    fetch(`${BASE}/admin/company/vehicle-requests?statut=${encodeURIComponent(statut)}`, { headers: headers(token) })
      .then(r => r.json()),

  adminProcessVehicleRequest: (token, id, statut, admin_notes="") =>
    fetch(`${BASE}/admin/company/vehicle-requests/${id}`, {
      method: "PUT", headers: headers(token), body: JSON.stringify({ statut, admin_notes }),
    }).then(r => r.json()),

  companyLinkDriver: (token, vehicleId, driverId) =>
    fetch(`${BASE}/company/vehicles/${vehicleId}/driver`, {
      method: "PUT", headers: headers(token),
      body: JSON.stringify({ driver_id: driverId || null }),
    }).then(r => r.json()),

  login: (username, password, space) =>
    fetch(`${BASE}/auth/login`, {
      method: "POST", headers: headers(),
      body: JSON.stringify({ username, password, space: space || "driver" }),
    }).then(r => r.json()),

  logout: (token) =>
    fetch(`${BASE}/auth/logout`, {
      method: "POST", headers: headers(token),
    }).then(r => r.json()),

  me: (token) =>
    fetch(`${BASE}/auth/me`, { headers: headers(token) }).then(r => r.json()),

  // ════════════════════════════════
  // ملف السائق
  // ════════════════════════════════

  getProfile: (token) =>
    fetch(`${BASE}/driver/profile`, { headers: headers(token) }).then(r => r.json()),

  saveIdentity: (token, data) =>
    fetch(`${BASE}/driver/identity`, {
      method: "PUT", headers: headers(token),
      body: JSON.stringify(data),
    }).then(r => r.json()),

  saveLicense: (token, data) =>
    fetch(`${BASE}/driver/license`, {
      method: "PUT", headers: headers(token),
      body: JSON.stringify(data),
    }).then(r => r.json()),

  saveVehicle: (token, data) =>
    fetch(`${BASE}/driver/vehicle`, {
      method: "PUT", headers: headers(token),
      body: JSON.stringify(data),
    }).then(r => r.json()),

  saveDoor: (token, data) =>
    fetch(`${BASE}/driver/door`, {
      method: "PUT", headers: headers(token),
      body: JSON.stringify(data),
    }).then(r => r.json()),

  saveDeputy: (token, data) =>
    fetch(`${BASE}/driver/deputy`, {
      method: "PUT", headers: headers(token),
      body: JSON.stringify(data),
    }).then(r => r.json()),

  createDeputyContract: (token) =>
    fetch(`${BASE}/driver/deputy-contract`, {
      method: "POST", headers: headers(token),
      body: JSON.stringify({}),
    }).then(r => r.json()),

  createRentalContract: (token, data) =>
    fetch(`${BASE}/driver/rental-contract`, {
      method: "POST", headers: headers(token),
      body: JSON.stringify(data),
    }).then(r => r.json()),

  terminateRentalContract: (token) =>
    fetch(`${BASE}/driver/rental-contract/terminate`, {
      method: "POST", headers: headers(token),
      body: JSON.stringify({}),
    }).then(r => r.json()),

  // ════════════════════════════════
  // OCR
  // ════════════════════════════════

  ocrPermis: (token, image_base64, mime_type="image/jpeg") =>
    fetch(`${BASE}/ocr/permis`, {
      method: "POST", headers: headers(token),
      body: JSON.stringify({ image_base64, mime_type }),
    }).then(r => r.json()).then(notifyOcrError),

  ocrCarteGrise: (token, image_base64, mime_type="image/jpeg") =>
    fetch(`${BASE}/ocr/carte-grise`, {
      method: "POST", headers: headers(token),
      body: JSON.stringify({ image_base64, mime_type }),
    }).then(r => r.json()).then(notifyOcrError),

  ocrCni: (token, image_base64, mime_type="image/jpeg") =>
    fetch(`${BASE}/ocr/cni`, {
      method: "POST", headers: headers(token),
      body: JSON.stringify({ image_base64, mime_type }),
    }).then(r => r.json()).then(notifyOcrError),

  ocrDecision: (token, image_base64, mime_type="image/jpeg") =>
    fetch(`${BASE}/ocr/decision`, {
      method: "POST", headers: headers(token),
      body: JSON.stringify({ image_base64, mime_type }),
    }).then(r => r.json()).then(notifyOcrError),

  // ════════════════════════════════
  // الطلبات
  // ════════════════════════════════

  getRequests: (token) =>
    fetch(`${BASE}/requests`, { headers: headers(token) }).then(r => r.json()),

  // submitRequest و createRequest — نفس الـ endpoint
  submitRequest: (token, data) =>
    fetch(`${BASE}/requests`, {
      method: "POST", headers: headers(token),
      body: JSON.stringify(data),
    }).then(r => r.json()),

  createRequest: (token, data) =>
    fetch(`${BASE}/requests`, {
      method: "POST", headers: headers(token),
      body: JSON.stringify(data),
    }).then(r => r.json()),

  // ════════════════════════════════
  // التنبيهات
  // ════════════════════════════════

  getNotifications: (token) =>
    fetch(`${BASE}/notifications`, { headers: headers(token) }).then(r => r.json()),

  markAllRead: (token) =>
    fetch(`${BASE}/notifications/read-all`, {
      method: "PUT", headers: headers(token),
    }).then(r => r.json()),

  // ════════════════════════════════
  // المدير
  // ════════════════════════════════

  adminStats: (token) =>
    fetch(`${BASE}/admin/stats`, { headers: headers(token) }).then(r => r.json()),

  adminRequests: (token, params = {}) => {
    const q = new URLSearchParams(params).toString();
    return fetch(`${BASE}/admin/requests?${q}`, { headers: headers(token) }).then(r => r.json());
  },

  adminUpdateRequest: (token, id, data) =>
    fetch(`${BASE}/admin/requests/${id}`, {
      method: "PUT", headers: headers(token),
      body: JSON.stringify(data),
    }).then(r => r.json()),

  adminDrivers: (token, params = {}) => {
    const q = new URLSearchParams(params).toString();
    return fetch(`${BASE}/admin/drivers?${q}`, { headers: headers(token) }).then(r => r.json());
  },

  adminDriverFull: (token, id) =>
    fetch(`${BASE}/admin/drivers/${id}`, { headers: headers(token) }).then(r => r.json()),

  // ════════════════════════════════
  // الطباعة — token عبر query param
  // ════════════════════════════════

  // ═══ طباعة العقود ═══
  printRentalContract:              (id, token) => `${BASE}/print/rental-contract/${id}?token=${token}`,
  printRentalContractTermination:   (id, token) => `${BASE}/print/rental-contract-termination/${id}?token=${token}`,
  printDeputyContract:              (id, token) => `${BASE}/print/deputy-contract/${id}?token=${token}`,
  printDeputyJobRequest:            (id, token) => `${BASE}/print/deputy-job-request/${id}?token=${token}`,
  printDeputyContractTermination:   (id, token) => `${BASE}/print/deputy-contract-termination/${id}?token=${token}`,

  // ═══ طباعة الطلبات الرسمية ═══
  printRequest:   (id, token) => `${BASE}/print/request/${id}?token=${token}`,
  printRenewal:   (id, token) => `${BASE}/print/request-renewal/${id}?token=${token}`,
  printActivity:  (id, token) => `${BASE}/print/request-activity/${id}?token=${token}`,
  printStopFinal: (id, token) => `${BASE}/print/request-stop-final/${id}?token=${token}`,
  printStopTemp:  (id, token) => `${BASE}/print/request-stop-temp/${id}?token=${token}`,
  printResume:    (id, token) => `${BASE}/print/request-resume/${id}?token=${token}`,

  // ═══ شهادة تاريخية (مدير فقط) ═══
  printHistory:            (id, token) => `${BASE}/admin/print/history/${id}?token=${token}`,
  // ═══ رخصة الاستغلال (مدير فقط — تصدر بعد قبول الطلب) ═══
  printLicense:            (id, token) => `${BASE}/admin/print/license/${id}?token=${token}`,

  // ═══ شهادات إدارية ═══
  printAdminCertDriver:    (token) => `${BASE}/print/admin-cert-driver?token=${token}`,
  printAdminCertDeputy:    (token) => `${BASE}/print/admin-cert-deputy?token=${token}`,

  // ═══ رخصة السائق الإضافي (للسائق نفسه — بعد الموافقة) ═══
  printMyDeputyPermit:     (token) => `${BASE}/print/my-deputy-permit?token=${token}`,
};

// ════════════════════════════════
// Helpers
// ════════════════════════════════

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve({
      data:     e.target.result.split(",")[1],
      mimeType: file.type || "image/jpeg",
      isPdf:    file.type === "application/pdf",
    });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const WILAYAS = [
  "أدرار","الشلف","الأغواط","أم البواقي","باتنة","بجاية","بسكرة","بشار",
  "البليدة","البويرة","تمنراست","تبسة","تلمسان","تيارت","تيزي وزو","الجزائر",
  "الجلفة","جيجل","سطيف","سعيدة","سكيكدة","سيدي بلعباس","عنابة","قالمة",
  "قسنطينة","المدية","مستغانم","المسيلة","معسكر","ورقلة","وهران","البيض",
  "إليزي","برج بوعريريج","بومرداس","الطارف","تندوف","تيسمسيلت","الوادي",
  "خنشلة","سوق أهراس","تيبازة","ميلة","عين الدفلى","النعامة","عين تيموشنت",
  "غرداية","غليزان","المغير","المنيعة","أولاد جلال","برج باجي مختار",
  "بني عباس","تيميمون","تقرت","جانت","عين صالح","عين قزام"
];

// ════════════════════════════════
// بلديات كل ولاية
// يمكن إضافة ولايات أخرى لاحقاً بنفس الصيغة
// ════════════════════════════════
export const COMMUNES_WILAYAS = {
  "البيض": [
    "البيض",
    "بوعلام",
    "الأبيض سيدي الشيخ",
    "بريزينة",
    "الشقيق",
    "العقلة",
    "الكراكدة",
    "المحرة",
    "ستيتن",
    "سيدي عمر",
    "سيدي سليمان",
    "تيوت",
    "تلعلالت",
    "عرباوات",
    "عين الأروي",
    "عين الصفراء",
    "غاسول",
    "قصاب وادي",
    "لعبيضات",
    "مشرية",
    "واد المخيل",
    "ولتام",
  ],
  // يمكن إضافة ولايات أخرى هنا:
  // "الأغواط": ["الأغواط", "آفلو", ...],
};

// دالة مساعدة: إعادة بلديات ولاية معينة
// إذا الولاية غير موجودة في القائمة → ترجع قائمة فارغة
export function getCommunesByWilaya(wilaya) {
  return COMMUNES_WILAYAS[wilaya] || [];
}

export const LICENSE_CATEGORIES = [
  "A","A1","A2","AM","B","B1","BE","C","C1","C1E","CE","D","D1","D1E","DE"
];

export const ACTIVITY_TYPES = [
  "فردية_حضرية","جماعية_حضرية","مابين_البلديات","مابين_الولايات"
];

export const ACTIVITY_LABELS = {
  "فردية_حضرية":    "فردية حضرية",
  "جماعية_حضرية":   "جماعية حضرية",
  "مابين_البلديات": "ما بين البلديات",
  "مابين_الولايات": "ما بين الولايات",
};

export const SIFA_OPTIONS = [
  { value: "مجاهد",         label: "مجاهد" },
  { value: "ابن_مجاهد",    label: "ابن مجاهد" },
  { value: "ابن_شهيد",     label: "ابن شهيد" },
  { value: "أرملة_مجاهد",  label: "أرملة مجاهد" },
  { value: "خاص",           label: "خاص (ليس من ذوي الحقوق)" },
];

export const REQUEST_TYPES = {
  "تغيير_مركبة":            "تغيير المركبة (نقل ملكية)",
  "تغيير_سيارة":            "تغيير السيارة",
  "تغيير_باب":              "تغيير رقم الباب",
  "تغيير_نشاط":             "تغيير طبيعة النشاط",
  "تصريح_مناوب":            "تصريح بالمستخدمين (مناوب)",
  "توقف_مؤقت":              "توقف مؤقت عن النشاط",
  "توقف_نهائي":             "توقف نهائي عن النشاط",
  "استئناف":                "استئناف النشاط",
  "تجديد_رخصة_سائق":       "تجديد رخصة السياقة",
  "تجديد_رخصة_مناوب":      "تجديد رخصة المناوب",
  "تجديد_وثائق_استغلال":   "تجديد وثائق الاستغلال",
};

export const STATUT_COLORS = {
  "جديد":           "#3b82f6",
  "قيد_المعالجة":  "#f59e0b",
  "مقبول":          "#22c55e",
  "مرفوض":          "#ef4444",
  "ملغى":           "#9ca3af",
  "نشط":            "#22c55e",
  "توقف_مؤقت":     "#f59e0b",
  "توقف_نهائي":    "#ef4444",
};

// ══════════════════════════════════════
// نظام المراقبة — إرسال أخطاء الفرونتند
// ══════════════════════════════════════
function sendFrontendError(message, stack = "", url = window.location.href) {
  try {
    fetch(`${BASE}/monitor/frontend-error`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, stack, url }),
    }).catch(() => {});
  } catch (e) {}
}

// التقاط الأخطاء غير المعالجة
window.addEventListener("error", (e) => {
  sendFrontendError(e.message, e.error?.stack || "", window.location.href);
});

window.addEventListener("unhandledrejection", (e) => {
  sendFrontendError(
    `Unhandled Promise: ${e.reason?.message || e.reason}`,
    e.reason?.stack || "",
    window.location.href
  );
});

export const monitor = {
  logError: sendFrontendError,
  // حالة الباكند
  getStatus: (token) =>
    fetch(`${BASE}/monitor/status`, {
      headers: { "X-Token": token }
    }).then(r => r.json()),
  getErrors: (token, n = 50) =>
    fetch(`${BASE}/monitor/errors?n=${n}`, {
      headers: { "X-Token": token }
    }).then(r => r.json()),
};
