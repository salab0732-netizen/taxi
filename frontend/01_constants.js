const { useState, useRef, useCallback, useEffect } = React;



// ==================== CONFIG ====================
// عند النشر بـ ngrok، يكون الـ API على نفس الـ origin
const API_BASE = window.location.hostname === "localhost"
  ? "http://localhost:5000/api"
  : "/api";

// ==================== CONSTANTS ====================
const WILAYAS = [
  "أدرار","الشلف","الأغواط","أم البواقي","باتنة","بجاية","بسكرة","بشار",
  "البليدة","البويرة","تمنراست","تبسة","تلمسان","تيارت","تيزي وزو","الجزائر",
  "الجلفة","جيجل","سطيف","سعيدة","سكيكدة","سيدي بلعباس","عنابة","قالمة",
  "قسنطينة","المدية","مستغانم","المسيلة","معسكر","ورقلة","وهران","البيض",
  "إليزي","برج بوعريريج","بومرداس","الطارف","تندوف","تيسمسيلت","الوادي",
  "خنشلة","سوق أهراس","تيبازة","ميلة","عين الدفلى","النعامة","عين تيموشنت",
  "غرداية","غليزان","المغير","المنيعة","أولاد جلال","برج باجي مختار",
  "بني عباس","تيميمون","تقرت","جانت","عين صالح","عين قزام"
];

const LICENSE_CATEGORIES = ["A","A1","A2","AM","B","B1","BE","C","C1","C1E","CE","D","D1","D1E","DE"];

const INITIAL_FORM = {
  nomAr:"", prenomAr:"", nom:"", prenom:"",
  dateNaissance:"", lieuNaissance:"", wilayaNaissance:"", nationalite:"جزائري",
  nin:"", telephone:"", telephone2:"", adresse:"",
  numPermis:"", dateDelivrance:"", dateExpiration:"",
  lieuDelivrance:"", categories:[], notes:"",
  // بيانات المركبة (من البطاقة الرمادية)
  numImmatriculation:"", marque:"", typeVehicule:"", modele:"",
  numSerie:"", genre:"", energie:"", puissance:"",
  nbPlaces:"", anneeCirculation:"", numPrecedent:"",
};

// ==================== OCR ====================
// ملاحظة: الاستخراج يمر عبر السيرفر الخلفي (/api/ocr) الذي يحمّل مفتاح
// Gemini من backend/gemini_key.txt على الخادم فقط — لا يوجد أي مفتاح
// مكشوف هنا في كود الواجهة الأمامية.
async function extractCarteGriseData(base64Image, mimeType) {
  const res = await fetch(`${API_BASE}/ocr-carte-grise`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_base64: base64Image, mime_type: mimeType })
  });
  const d = await res.json();
  if (!d.success) { console.error("OCR carte grise error:", d.error); return null; }
  return d.data;
}

async function extractLicenseData(base64Image, mimeType) {
  const res = await fetch(`${API_BASE}/ocr`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_base64: base64Image, mime_type: mimeType })
  });
  const d = await res.json();
  if (!d.success) {
    console.error("OCR error:", d.error);
    return null;
  }
  return d.data;
}
const inp = {
  width:"100%", padding:"10px 12px", border:"1.5px solid #d1d5db",
  borderRadius:8, fontSize:14, outline:"none", boxSizing:"border-box",
  fontFamily:"inherit", background:"#fff"
};

// ==================== SUB-COMPONENTS ====================