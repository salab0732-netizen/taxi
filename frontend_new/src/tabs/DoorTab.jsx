import { useState, useEffect } from "react";
import { api, fileToBase64, WILAYAS, SIFA_OPTIONS, getCommunesByWilaya } from "../api.js";
import { Input, SaveBtn, SuccessMsg, ErrorMsg, ImageUpload } from "../App.jsx";
import { Card, Alert, Button, Badge, DescList, fmtDate, fmtVal, confirmDialog } from "../ui/kit.jsx";
import Icon from "../ui/Icon.jsx";

const COLOR = "#125950";
const DEFAULT_DOOR_WILAYA = "البيض";

// تحويل التاريخ من DD/MM/YYYY إلى YYYY-MM-DD (ISO)
// يُبقي التواريخ الناقصة 00/00/YYYY كما هي
function toISO(d) {
  if (!d) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d; // ISO بالفعل
  const m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return d;
  const [, dd, mm, yyyy] = m;
  if (dd === "00" || mm === "00") return `00/00/${yyyy}`; // تاريخ ناقص — نُبقيه
  return `${yyyy}-${mm}-${dd}`;
}

const STEPS = [
  { key:"terminate",   num:1, label:"فسخ العقد القديم",     icon:"ban" },
  { key:"beneficiary", num:2, label:"المستفيد الجديد",       icon:"user" },
  { key:"decision",    num:3, label:"القرار الولائي الجديد", icon:"fileText" },
  { key:"contract",    num:4, label:"عقد الكراء الجديد",     icon:"fileSignature" },
];

function CommuneSelect({ wilaya, value, onChange }) {
  const communes = getCommunesByWilaya(wilaya);
  if (communes.length === 0)
    return <input className="input" value={value} onChange={e=>onChange(e.target.value)} placeholder="أدخل البلدية يدوياً"/>;
  return (
    <select className="select" value={value} onChange={e=>onChange(e.target.value)}>
      <option value="">— اختر البلدية —</option>
      {communes.map(c=><option key={c} value={c}>{c}</option>)}
    </select>
  );
}

export default function DoorTab({ token, profile, onSaved }) {
  const door   = profile?.door   || {};
  const rental = profile?.rental || {};

  // ══ وضع الصفحة الرئيسي ══
  // "normal"   : عرض عادي — عقد الكراء الحالي + الأقسام المعتادة
  // "renew"    : بعد فسخ العقد — إدخال قرار + مستفيد جديدَين (مع إمكانية تغيير الباب)
  const [pageMode, setPageMode] = useState("normal");

  // ══ بيانات القرار الحالي ══
  const [doorForm, setDoorForm] = useState({
    door_number:          door.door_number          || "",
    wilaya:               door.wilaya               || DEFAULT_DOOR_WILAYA,
    exploitation_commune: door.exploitation_commune || "",
    decision_type:        door.decision_type        || "",
    decision_number:      door.decision_number      || "",
    decision_date:        door.decision_date        || "",
    decision_wilaya:      door.decision_wilaya      || "",
  });
  // صفة الاستغلال: "مستأجر" (عقد كراء) أو "مستفيد" (صاحب الرخصة يستغلها بنفسه — بلا عقد)
  const [exploitMode, setExploitMode] = useState(door.exploitation_mode || "مستأجر");
  useEffect(() => { setExploitMode(door.exploitation_mode || "مستأجر"); }, [door.id, door.exploitation_mode]);
  const isBeneficiary = (door.exploitation_mode || "مستأجر") === "مستفيد";
  const [benef, setBenef] = useState({
    ben_nom_ar:         door.ben_nom_ar        || "",
    ben_prenom_ar:      door.ben_prenom_ar      || "",
    ben_nom_fr:         door.ben_nom_fr         || "",
    ben_prenom_fr:      door.ben_prenom_fr      || "",
    ben_date_naissance: toISO(door.ben_date_naissance || ""),
    ben_lieu_naissance: door.ben_lieu_naissance || "",
    ben_nin:            door.ben_nin            || "",
    ben_wilaya:         door.ben_wilaya         || "",
    ben_sexe:           door.ben_sexe           || "",
    ben_groupe_sanguin: door.ben_groupe_sanguin || "",
    ben_sifa:           door.sifa               || "",
    ben_telephone:      door.ben_telephone      || "",
    ben_num_cni:        door.ben_num_cni        || "",
    ben_date_cni:       toISO(door.ben_date_cni || ""),
    ben_adresse:        door.ben_adresse        || "",
  });

  const [decisionImg,    setDecisionImg]    = useState(null);
  const [decisionPrev,   setDecisionPrev]   = useState(null);
  const [decisionPdf,    setDecisionPdf]    = useState(false);
  const [benCniRectoB64, setBenCniRectoB64] = useState(null);
  const [benCniRectoPrev,setBenCniRectoPrev]= useState(null);
  const [benCniRectoPdf, setBenCniRectoPdf] = useState(false);
  const [benCniVersoB64, setBenCniVersoB64] = useState(null);
  const [benCniVersoPrev,setBenCniVersoPrev]= useState(null);
  const [benCniVersoPdf, setBenCniVersoPdf] = useState(false);
  const [ocrDecLoading,  setOcrDecLoading]  = useState(false);
  const [ocrDecDone,     setOcrDecDone]     = useState(false);
  const [ocrBenLoading,  setOcrBenLoading]  = useState(false);
  const [ocrBenDone,     setOcrBenDone]     = useState(false);
  const [ocrBenVersoDone,setOcrBenVersoDone]= useState(false);

  // ══ عقد الكراء ══
  const [contractLoading,  setContractLoading]  = useState(false);
  const [contractSuccess,  setContractSuccess]  = useState("");
  const [contractError,    setContractError]    = useState("");
  const [renewContractLoading, setRenewContractLoading] = useState(false);
  const [monthlyRent,      setMonthlyRent]      = useState("");
  // عرض الإيجار الشهري للعقد الحالي بدل حقل فارغ
  useEffect(() => {
    if (profile?.rental?.monthly_rent != null) setMonthlyRent(String(profile.rental.monthly_rent));
  }, [profile?.rental?.id, profile?.rental?.monthly_rent]);

  // ══ فسخ العقد ══
  const [terminateLoading, setTerminateLoading] = useState(false);
  const [terminateError,   setTerminateError]   = useState("");
  const [confirmTerminate, setConfirmTerminate] = useState(false);
  // id العقد المفسوخ — للطباعة بعده
  const [terminatedContractId, setTerminatedContractId] = useState(null);

  // ══ حفظ الوثائق الأولي ══
  const [saving,   setSaving]   = useState(false);
  const [success,  setSuccess]  = useState("");
  const [error,    setError]    = useState("");

  // ══ وضع التجديد (بعد الفسخ) — قرار + مستفيد جديدَين ══
  const [changeDoor,      setChangeDoor]      = useState(false); // هل يريد تغيير الباب؟
  const [renewStep,       setRenewStep]       = useState(1);     // 1=قرار  2=مستفيد  3=عقد
  const [renewError,      setRenewError]      = useState("");
  const [renewMsg,        setRenewMsg]        = useState("");
  const [newDoorForm,     setNewDoorForm]     = useState({
    door_number:"", wilaya:DEFAULT_DOOR_WILAYA, exploitation_commune:"",
    decision_type:"", decision_number:"", decision_date:"", decision_wilaya:"",
  });
  const [newBenef, setNewBenef] = useState({
    ben_nom_ar:"", ben_prenom_ar:"", ben_nom_fr:"", ben_prenom_fr:"",
    ben_date_naissance:"", ben_lieu_naissance:"", ben_nin:"", ben_wilaya:"",
    ben_sifa:"", ben_telephone:"", ben_adresse:"",
  });
  const [newDecImg,      setNewDecImg]      = useState(null);
  const [newDecPrev,     setNewDecPrev]     = useState(null);
  const [newDecPdf,      setNewDecPdf]      = useState(false);
  const [newOcrDecLoad,  setNewOcrDecLoad]  = useState(false);
  const [newRectoB64,    setNewRectoB64]    = useState(null);
  const [newRectoPrev,   setNewRectoPrev]   = useState(null);
  const [newRectoPdf,    setNewRectoPdf]    = useState(false);
  const [newVersoB64,    setNewVersoB64]    = useState(null);
  const [newVersoPrev,   setNewVersoPrev]   = useState(null);
  const [newVersoPdf,    setNewVersoPdf]    = useState(false);
  const [newOcrBenLoad,  setNewOcrBenLoad]  = useState(false);
  const [newContractId,  setNewContractId]  = useState(null);
  const [newContractNum, setNewContractNum] = useState("");
  const [newContractDates,setNewContractDates]= useState(null);
  // id الطلب الرسمي لتغيير الباب (إن وُجد) — للطباعة
  const [changeDoorReqId, setChangeDoorReqId] = useState(null);
  // id الطلب الرسمي لتجديد وثائق الاستغلال — للطباعة
  const [renewDocsReqId,  setRenewDocsReqId]  = useState(null);

  // ══ تحديث القرار الولائي (وضع مستقل) ══
  const [updDecForm,    setUpdDecForm]    = useState({
    door_number:"", wilaya:DEFAULT_DOOR_WILAYA, exploitation_commune:"",
    decision_type:"", decision_number:"", decision_date:"", decision_wilaya:"",
  });
  const [updDecImg,     setUpdDecImg]     = useState(null);
  const [updDecPrev,    setUpdDecPrev]    = useState(null);
  const [updDecPdf,     setUpdDecPdf]     = useState(false);
  const [updDecOcrLoad, setUpdDecOcrLoad] = useState(false);
  const [updDecError,   setUpdDecError]   = useState("");
  const [updDecSuccess, setUpdDecSuccess] = useState("");
  const [updDecSaving,  setUpdDecSaving]  = useState(false);
  const [updDecReqId,   setUpdDecReqId]   = useState(null);

  // ══ تغيير رقم الباب — الوضع القديم (الزر الأسفل) ══
  const [changeMode,  setChangeMode]  = useState(false);
  const [changeStep,  setChangeStep]  = useState(1);
  const [stepDone,    setStepDone]    = useState({});
  const [changeError, setChangeError] = useState("");
  const [changeMsg,   setChangeMsg]   = useState("");
  const [chNewDoorForm, setChNewDoorForm] = useState({
    door_number:"", wilaya:DEFAULT_DOOR_WILAYA, exploitation_commune:"",
    decision_type:"", decision_number:"", decision_date:"", decision_wilaya:"",
  });
  const [chNewBenef, setChNewBenef] = useState({
    ben_nom_ar:"", ben_prenom_ar:"", ben_nom_fr:"", ben_prenom_fr:"",
    ben_date_naissance:"", ben_lieu_naissance:"", ben_nin:"", ben_wilaya:"",
    ben_sifa:"", ben_telephone:"", ben_adresse:"",
  });
  const [chNewDecImg,    setChNewDecImg]    = useState(null);
  const [chNewDecPrev,   setChNewDecPrev]   = useState(null);
  const [chNewDecPdf,    setChNewDecPdf]    = useState(false);
  const [chOcrDecLoad,   setChOcrDecLoad]   = useState(false);
  const [chNewRectoB64,  setChNewRectoB64]  = useState(null);
  const [chNewRectoPrev, setChNewRectoPrev] = useState(null);
  const [chNewRectoPdf,  setChNewRectoPdf]  = useState(false);
  const [chNewVersoB64,  setChNewVersoB64]  = useState(null);
  const [chNewVersoPrev, setChNewVersoPrev] = useState(null);
  const [chNewVersoPdf,  setChNewVersoPdf]  = useState(false);
  const [chOcrBenLoad,   setChOcrBenLoad]   = useState(false);
  const [chNewContractNum, setChNewContractNum] = useState("");
  const [chNewContractDates, setChNewContractDates] = useState(null);
  const [chChangeDoorReqId, setChChangeDoorReqId] = useState(null);

  // ══ مزامنة الـ state مع profile عند تحديثه ══
  useEffect(() => {
    if (changeMode || pageMode !== "normal") return;
    const d = profile?.door || {};
    setDoorForm({
      door_number:          d.door_number          || "",
      wilaya:               d.wilaya               || DEFAULT_DOOR_WILAYA,
      exploitation_commune: d.exploitation_commune || "",
      decision_type:        d.decision_type        || "",
      decision_number:      d.decision_number      || "",
      decision_date:        d.decision_date        || "",
      decision_wilaya:      d.decision_wilaya      || "",
    });
    const nin0 = d.ben_nin || "";
    const sexe0   = d.ben_sexe   || (nin0.length>=1 ? ninSexe(nin0)   : "") || "";
    const wilaya0 = d.ben_wilaya || (nin0.length>=9 ? ninWilaya(nin0) : "") || "";
    setBenef({
      ben_nom_ar:         d.ben_nom_ar        || "",
      ben_prenom_ar:      d.ben_prenom_ar      || "",
      ben_nom_fr:         d.ben_nom_fr         || "",
      ben_prenom_fr:      d.ben_prenom_fr      || "",
      ben_date_naissance: toISO(d.ben_date_naissance || ""),
      ben_lieu_naissance: d.ben_lieu_naissance || "",
      ben_nin:            nin0,
      ben_wilaya:         wilaya0,
      ben_sexe:           sexe0,
      ben_groupe_sanguin: d.ben_groupe_sanguin || "",
      ben_sifa:           d.sifa              || "",
      ben_telephone:      d.ben_telephone      || "",
      ben_num_cni:        d.ben_num_cni        || "",
      ben_date_cni:       toISO(d.ben_date_cni || ""),
      ben_adresse:        d.ben_adresse        || "",
    });
  }, [profile]); // eslint-disable-line react-hooks/exhaustive-deps

  const updDoor    = (k,v) => setDoorForm(p=>({...p,[k]:v}));
  const updBenef   = (k,v) => setBenef(p=>({...p,[k]:v}));

  // style للحقل: أحمر إذا فارغ بعد OCR
  const decCls = (key, base="input") => base + (ocrDecDone && !doorForm[key] ? " is-invalid" : "");
  const benCls = (key, base="input") => base + (ocrBenDone && !benef[key] ? " is-invalid" : "");
  const decPh = (label) => ocrDecDone ? `لم يُقرأ — صحّح يدوياً` : `يُملأ تلقائياً من OCR — ${label}`;
  const benPh    = (label) => ocrBenDone      ? `لم يُقرأ — صحّح يدوياً`              : `يُملأ تلقائياً من الوجه الأمامي — ${label}`;
  // style للحقول التي تأتي من الوجه الخلفي (Nom/Prénom بالفرنسية)
  const benVersoCls = (key, base="input") => base + (ocrBenVersoDone && !benef[key] ? " is-invalid" : "");
  const benVersoPh = (label) => ocrBenVersoDone ? `لم يُقرأ — صحّح يدوياً` : `يُملأ من ظهر البطاقة — ${label}`;
  const updNewDoor = (k,v) => setNewDoorForm(p=>({...p,[k]:v}));
  const updNewBen  = (k,v) => setNewBenef(p=>({...p,[k]:v}));
  const updChDoor  = (k,v) => setChNewDoorForm(p=>({...p,[k]:v}));
  const updChBen   = (k,v) => setChNewBenef(p=>({...p,[k]:v}));

  // ══════════════════════════════════════════
  // OCR — القرار الحالي
  // ══════════════════════════════════════════
  async function handleDecisionImg(file) {
    const isPdf = file.type==="application/pdf";
    setDecisionPdf(isPdf); setDecisionPrev(isPdf?null:URL.createObjectURL(file)); setOcrDecLoading(true);
    const{data,mimeType}=await fileToBase64(file); setDecisionImg(data);
    try{
      const r=await api.ocrDecision(token,data,mimeType);
      if(r.ocr&&!r.ocr.error){
        const o=r.ocr;
        setDoorForm(p=>({...p,
          decision_type:   o.decision_type   ||p.decision_type,
          decision_number: o.decision_number ||p.decision_number,
          decision_date:   o.decision_date   ||p.decision_date,
          decision_wilaya: o.decision_wilaya ||p.decision_wilaya,
          exploitation_commune: o.exploitation_commune||p.exploitation_commune,
        }));
        if(o.beneficiary_nom) setBenef(p=>({...p,
          ben_nom_ar:   o.beneficiary_nom    ||p.ben_nom_ar,
          ben_prenom_ar:o.beneficiary_prenom ||p.ben_prenom_ar,
          ben_sifa:     o.beneficiary_sifa   ||p.ben_sifa,
        }));
      }
    }catch{}
    setOcrDecDone(true);
    setOcrDecLoading(false);
  }

  // استخراج سنة الميلاد وشهرها من NIN كـ fallback إذا فشل OCR
  function dateFromNin(nin) {
    if (!nin || nin.length < 7) return null;
    // NIN الجزائري: الرقم[0]=جنس، [1-4]=سنة، [5-6]=شهر
    const year  = nin.slice(1, 5);
    // NIN قد يختلف شهره عن البطاقة القديمة — نُرجع سنة فقط
    if (!/^\d{4}$/.test(year)) return null;
    const y = parseInt(year);
    if (y < 1920 || y > 2010) return null;
    return `00/00/${year}`; // اليوم والشهر 00 — يُصحَّح يدوياً من البطاقة
  }

  // استخراج الجنس من الرقم الأول للـ NIN (1=ذكر، 2=أنثى)
  function ninSexe(nin) {
    if (!nin || nin.length < 1) return "";
    if (nin[0] === "1") return "ذكر";
    if (nin[0] === "2") return "أنثى";
    return "";
  }

  // استخراج الولاية من رمز الولاية في NIN (الخانتان [7-8])
  function ninWilaya(nin) {
    if (!nin || nin.length < 9) return "";
    const code = parseInt(nin.slice(7, 9), 10);
    if (isNaN(code) || code < 1 || code > 58) return "";
    return WILAYAS[code - 1] || "";
  }

  // استخراج اسم الولاية من حقل سلطة الإصدار (autorite_delivrance)
  // مثال: "بلدية سكيكدة" → "سكيكدة"
  function wilayaFromAutorite(autorite) {
    if (!autorite) return "";
    for (const w of WILAYAS) {
      if (autorite.includes(w)) return w;
    }
    return "";
  }


  async function handleBenCniRecto(file) {
    const isPdf=file.type==="application/pdf";
    setBenCniRectoPdf(isPdf); setBenCniRectoPrev(isPdf?null:URL.createObjectURL(file)); setOcrBenLoading(true);
    const{data,mimeType}=await fileToBase64(file); setBenCniRectoB64(data);
    try{const r=await api.ocrCni(token,data,mimeType);
      if(r.ocr&&!r.ocr.error){const o=r.ocr;
        const nin = o.nin || benef.ben_nin || "";
        const dateFallback = (!o.date_naissance && nin) ? dateFromNin(nin) : null;
        const infSexe   = (!o.sexe   && nin.length>=1) ? ninSexe(nin)   : "";
        const infWilaya = (!o.wilaya && nin.length>=9) ? ninWilaya(nin) : "";
        const autWilaya = wilayaFromAutorite(o.autorite_delivrance);
        setBenef(p=>({...p,
          ben_nom_ar:o.nom_ar||p.ben_nom_ar, ben_prenom_ar:o.prenom_ar||p.ben_prenom_ar,
          ben_nom_fr:o.nom_fr||p.ben_nom_fr, ben_prenom_fr:o.prenom_fr||p.ben_prenom_fr,
          ben_date_naissance:toISO(o.date_naissance)||dateFallback||p.ben_date_naissance,
          ben_lieu_naissance:o.lieu_naissance_ar||p.ben_lieu_naissance,
          ben_nin:o.nin||p.ben_nin,
          ben_sexe:o.sexe||infSexe||p.ben_sexe,
          ben_wilaya:autWilaya||o.wilaya||infWilaya||p.ben_wilaya,
          ben_num_cni:o.num_document_cni||p.ben_num_cni,
          ben_date_cni:toISO(o.date_delivrance_cni)||p.ben_date_cni,
          ben_groupe_sanguin:o.groupe_sanguin||p.ben_groupe_sanguin,
        }));
      }
    }catch{}
    setOcrBenDone(true);
    setOcrBenLoading(false);
  }

  async function handleBenCniVerso(file) {
    const isPdf=file.type==="application/pdf";
    setBenCniVersoPdf(isPdf); setBenCniVersoPrev(isPdf?null:URL.createObjectURL(file));
    const{data,mimeType}=await fileToBase64(file); setBenCniVersoB64(data);
    // OCR الوجه الثاني — الاسم بالفرنسية فقط (تاريخ الميلاد يُؤخذ من الوجه الأمامي)
    try{const r=await api.ocrCni(token,data,mimeType);
      if(r.ocr&&!r.ocr.error){const o=r.ocr;
        setBenef(p=>({...p,
          ben_nom_fr:   o.nom_fr   ||p.ben_nom_fr,
          ben_prenom_fr:o.prenom_fr||p.ben_prenom_fr,
          // تاريخ الميلاد يُؤخذ فقط من الوجه الأمامي للبطاقة
          ben_lieu_naissance:o.lieu_naissance_ar||o.lieu_naissance_fr||p.ben_lieu_naissance,
          ben_adresse:  o.adresse  ||p.ben_adresse,
          ben_num_cni:  o.num_document_cni  ||p.ben_num_cni,
          ben_date_cni: o.date_delivrance_cni||p.ben_date_cni,
        }));
      }
    }catch{}
    setOcrBenVersoDone(true);
  }

  // ══════════════════════════════════════════
  // OCR — القرار الجديد (وضع التجديد)
  // ══════════════════════════════════════════
  async function handleNewDecisionImg(file) {
    const isPdf=file.type==="application/pdf";
    setNewDecPdf(isPdf); setNewDecPrev(isPdf?null:URL.createObjectURL(file)); setNewOcrDecLoad(true);
    const{data,mimeType}=await fileToBase64(file); setNewDecImg(data);
    try{const r=await api.ocrDecision(token,data,mimeType);
      if(r.ocr&&!r.ocr.error){const o=r.ocr;
        setNewDoorForm(p=>({...p,
          decision_type:   o.decision_type   ||p.decision_type,
          decision_number: o.decision_number ||p.decision_number,
          decision_date:   o.decision_date   ||p.decision_date,
          decision_wilaya: o.decision_wilaya ||p.decision_wilaya,
          exploitation_commune: o.exploitation_commune||p.exploitation_commune,
        }));
        if(o.beneficiary_nom) setNewBenef(p=>({...p,
          ben_nom_ar:   o.beneficiary_nom    ||p.ben_nom_ar,
          ben_prenom_ar:o.beneficiary_prenom ||p.ben_prenom_ar,
          ben_sifa:     o.beneficiary_sifa   ||p.ben_sifa,
        }));
      }
    }catch{}setNewOcrDecLoad(false);
  }

  async function handleNewBenRecto(file) {
    const isPdf=file.type==="application/pdf";
    setNewRectoPdf(isPdf); setNewRectoPrev(isPdf?null:URL.createObjectURL(file)); setNewOcrBenLoad(true);
    const{data,mimeType}=await fileToBase64(file); setNewRectoB64(data);
    try{const r=await api.ocrCni(token,data,mimeType);
      if(r.ocr&&!r.ocr.error){const o=r.ocr;
        const ninN=o.nin||"";
        const infSexeN  =(!o.sexe   &&ninN.length>=1)?ninSexe(ninN)  :"";
        const infWilayaN=(!o.wilaya &&ninN.length>=9)?ninWilaya(ninN):"";
        const autWilayaN=wilayaFromAutorite(o.autorite_delivrance);
        setNewBenef(p=>({...p,
          ben_nom_ar:o.nom_ar||p.ben_nom_ar, ben_prenom_ar:o.prenom_ar||p.ben_prenom_ar,
          ben_nom_fr:o.nom_fr||p.ben_nom_fr, ben_prenom_fr:o.prenom_fr||p.ben_prenom_fr,
          ben_date_naissance:toISO(o.date_naissance)||p.ben_date_naissance,
          ben_lieu_naissance:o.lieu_naissance_ar||p.ben_lieu_naissance,
          ben_nin:o.nin||p.ben_nin,
          ben_sexe:o.sexe||infSexeN||p.ben_sexe,
          ben_wilaya:autWilayaN||o.wilaya||infWilayaN||p.ben_wilaya,
          ben_num_cni:o.num_document_cni||p.ben_num_cni,
          ben_date_cni:toISO(o.date_delivrance_cni)||p.ben_date_cni,
          ben_groupe_sanguin:o.groupe_sanguin||p.ben_groupe_sanguin,
        }));
      }
    }catch{}setNewOcrBenLoad(false);
  }

  async function handleNewBenVerso(file) {
    const isPdf=file.type==="application/pdf";
    setNewVersoPdf(isPdf); setNewVersoPrev(isPdf?null:URL.createObjectURL(file));
    const{data,mimeType}=await fileToBase64(file); setNewVersoB64(data);
    try{const r=await api.ocrCni(token,data,mimeType);
      if(r.ocr&&!r.ocr.error){const o=r.ocr;
        setNewBenef(p=>({...p,
          ben_nom_fr:   o.nom_fr   ||p.ben_nom_fr,
          ben_prenom_fr:o.prenom_fr||p.ben_prenom_fr,
          // تاريخ الميلاد يُؤخذ فقط من الوجه الأمامي للبطاقة
          ben_lieu_naissance:o.lieu_naissance_ar||o.lieu_naissance_fr||p.ben_lieu_naissance,
          ben_adresse:  o.adresse  ||p.ben_adresse,
        }));
      }
    }catch{}
  }

  // ══════════════════════════════════════════
  // OCR — القرار في وضع تغيير الباب (الزر الأسفل)
  // ══════════════════════════════════════════
  async function handleChDecisionImg(file) {
    const isPdf=file.type==="application/pdf";
    setChNewDecPdf(isPdf); setChNewDecPrev(isPdf?null:URL.createObjectURL(file)); setChOcrDecLoad(true);
    const{data,mimeType}=await fileToBase64(file); setChNewDecImg(data);
    try{const r=await api.ocrDecision(token,data,mimeType);
      if(r.ocr&&!r.ocr.error){const o=r.ocr;
        setChNewDoorForm(p=>({...p,
          decision_type:   o.decision_type   ||p.decision_type,
          decision_number: o.decision_number ||p.decision_number,
          decision_date:   o.decision_date   ||p.decision_date,
          decision_wilaya: o.decision_wilaya ||p.decision_wilaya,
          exploitation_commune: o.exploitation_commune||p.exploitation_commune,
        }));
      }
    }catch{}setChOcrDecLoad(false);
  }

  async function handleChBenRecto(file) {
    const isPdf=file.type==="application/pdf";
    setChNewRectoPdf(isPdf); setChNewRectoPrev(isPdf?null:URL.createObjectURL(file)); setChOcrBenLoad(true);
    const{data,mimeType}=await fileToBase64(file); setChNewRectoB64(data);
    try{const r=await api.ocrCni(token,data,mimeType);
      if(r.ocr&&!r.ocr.error){const o=r.ocr;
        const ninC=o.nin||"";
        const infSexeC  =(!o.sexe   &&ninC.length>=1)?ninSexe(ninC)  :"";
        const infWilayaC=(!o.wilaya &&ninC.length>=9)?ninWilaya(ninC):"";
        const autWilayaC=wilayaFromAutorite(o.autorite_delivrance);
        setChNewBenef(p=>({...p,
          ben_nom_ar:o.nom_ar||p.ben_nom_ar, ben_prenom_ar:o.prenom_ar||p.ben_prenom_ar,
          ben_nom_fr:o.nom_fr||p.ben_nom_fr, ben_prenom_fr:o.prenom_fr||p.ben_prenom_fr,
          ben_date_naissance:toISO(o.date_naissance)||p.ben_date_naissance,
          ben_lieu_naissance:o.lieu_naissance_ar||p.ben_lieu_naissance,
          ben_nin:o.nin||p.ben_nin,
          ben_sexe:o.sexe||infSexeC||p.ben_sexe,
          ben_wilaya:autWilayaC||o.wilaya||infWilayaC||p.ben_wilaya,
          ben_num_cni:o.num_document_cni||p.ben_num_cni,
          ben_date_cni:toISO(o.date_delivrance_cni)||p.ben_date_cni,
          ben_groupe_sanguin:o.groupe_sanguin||p.ben_groupe_sanguin,
        }));
      }
    }catch{}setChOcrBenLoad(false);
  }

  async function handleChBenVerso(file) {
    const isPdf=file.type==="application/pdf";
    setChNewVersoPdf(isPdf); setChNewVersoPrev(isPdf?null:URL.createObjectURL(file));
    const{data,mimeType}=await fileToBase64(file); setChNewVersoB64(data);
    try{const r=await api.ocrCni(token,data,mimeType);
      if(r.ocr&&!r.ocr.error){const o=r.ocr;
        setChNewBenef(p=>({...p,
          ben_nom_fr:   o.nom_fr   ||p.ben_nom_fr,
          ben_prenom_fr:o.prenom_fr||p.ben_prenom_fr,
          // تاريخ الميلاد يُؤخذ فقط من الوجه الأمامي للبطاقة
          ben_lieu_naissance:o.lieu_naissance_ar||o.lieu_naissance_fr||p.ben_lieu_naissance,
          ben_adresse:  o.adresse  ||p.ben_adresse,
        }));
      }
    }catch{}
  }

  // ══════════════════════════════════════════
  // OCR — تحديث القرار الولائي (مستقل)
  // ══════════════════════════════════════════
  async function handleUpdDecisionImg(file) {
    const isPdf=file.type==="application/pdf";
    setUpdDecPdf(isPdf); setUpdDecPrev(isPdf?null:URL.createObjectURL(file)); setUpdDecOcrLoad(true);
    const{data,mimeType}=await fileToBase64(file); setUpdDecImg(data);
    try{const r=await api.ocrDecision(token,data,mimeType);
      if(r.ocr&&!r.ocr.error){const o=r.ocr;
        setUpdDecForm(p=>({...p,
          decision_type:   o.decision_type   ||p.decision_type,
          decision_number: o.decision_number ||p.decision_number,
          decision_date:   o.decision_date   ||p.decision_date,
          decision_wilaya: o.decision_wilaya ||p.decision_wilaya,
          exploitation_commune: o.exploitation_commune||p.exploitation_commune,
        }));
      }
    }catch{}
    setUpdDecOcrLoad(false);
  }

  // ══════════════════════════════════════════
  // حفظ الوثائق الأولية
  // ══════════════════════════════════════════
  async function save() {
    setError(""); setSuccess(""); setSaving(true);
    // OCR-first: يجب رفع صورة القرار الولائي أولاً
    if(!decisionImg){
      setError("⚠️ يجب رفع صورة القرار الولائي أولاً — البيانات تُدخل تلقائياً عبر OCR فقط");
      setSaving(false);return;
    }
    // OCR-first: يجب رفع بطاقة هوية المستفيد أولاً
    if(!benCniRectoB64){
      setError("⚠️ يجب رفع بطاقة هوية المستفيد (الوجه) أولاً — البيانات تُدخل تلقائياً عبر OCR فقط");
      setSaving(false);return;
    }
    // التحقق من حقول القرار الولائي
    if(!doorForm.door_number){setError("رقم الباب مطلوب — تأكد من وضوح الصورة أو صحّحه يدوياً");setSaving(false);return;}
    if(!doorForm.exploitation_commune){setError("بلدية الإلحاق مطلوبة");setSaving(false);return;}
    // التحقق من حقول المستفيد
    const missingBen = [];
    if(!benef.ben_nom_ar) missingBen.push("اللقب (عربي)");
    if(!benef.ben_nin) missingBen.push("NIN");
    if(missingBen.length>0){
      setError(`⚠️ الحقول التالية لم يقرأها OCR — صحّحها يدوياً: ${missingBen.join("، ")}`);
      setSaving(false);return;
    }
    try {
      const r=await api.saveDoor(token,{exploitation_mode:exploitMode,...doorForm,...benef,
        image_decision_base64:decisionImg,
        ben_image_cni_recto_base64:benCniRectoB64,
        ben_image_cni_verso_base64:benCniVersoB64,
      });
      if(!r.success){
        if(r.code==="CONTRACT_ACTIVE")
          setError(`⚠️ رقم الباب ${doorForm.door_number} لديه عقد كراء ساري المفعول باسم السائق [${r.owner_name}] — يجب فسخ عقده أولاً`);
        else
          setError(r.error||"خطأ في الحفظ");
        setSaving(false);return;
      }
      setSaving(false);setSuccess("تم حفظ رقم الباب والمستفيد ✅");
      await onSaved();
    } catch {
      setSaving(false);
      setError("❌ خطأ في الاتصال بالخادم — تأكد من الاتصال وحاول مجدداً");
    }
  }

  // ══════════════════════════════════════════
  // إنشاء / تجديد عقد الكراء (الوضع العادي)
  // ══════════════════════════════════════════
  async function handleCreateContract() {
    setContractError(""); setContractSuccess(""); setContractLoading(true);
    if(!(parseInt(monthlyRent)>0)){const m="أدخل مبلغ الإيجار الشهري أولاً"; setContractError&&setContractError(m); setChangeError&&setChangeError(m); setRenewError&&setRenewError(m); setContractLoading&&setContractLoading(false); setRenewContractLoading&&setRenewContractLoading(false); return;}
    const rc=await api.createRentalContract(token,{monthly_rent: parseInt(monthlyRent)||0});
    if(!rc.success){setContractError(rc.error||"خطأ في إنشاء عقد الكراء");setContractLoading(false);return;}
    const cDate=(rc.contract_date||"").slice(0,10);
    const eDate=(rc.end_date||"").slice(0,10);
    setContractSuccess(`✅ تم إنشاء عقد الكراء — رقم: ${rc.contract_number} | من: ${cDate} | إلى: ${eDate}`);
    setContractLoading(false);onSaved();
  }

  // ══════════════════════════════════════════
  // فسخ عقد الكراء (في الوضع العادي)
  // → يفسخ + يُظهر زر الطباعة + يفتح وضع التجديد
  // ══════════════════════════════════════════
  async function handleTerminateContract() {
    if(!confirmTerminate){setConfirmTerminate(true);return;}
    setTerminateError(""); setTerminateLoading(true);
    try{
      const oldId = rental.id; // نحتفظ بـ id قبل onSaved
      const r=await api.terminateRentalContract(token);
      if(!r.success){
        setTerminateError(r.error||"خطأ في فسخ العقد");
        setTerminateLoading(false); setConfirmTerminate(false);return;
      }
      setTerminatedContractId(oldId);
      setContractSuccess(""); // إزالة رسالة إنشاء العقد السابق بعد الفسخ
      setConfirmTerminate(false);
      // فتح وضع التجديد تلقائياً بعد الفسخ
      enterRenewMode();
      onSaved();
    }catch{setTerminateError("خطأ في الاتصال");}
    setTerminateLoading(false);
  }

  // ══════════════════════════════════════════
  // وضع التجديد — الدخول والخروج
  // ══════════════════════════════════════════
  function enterRenewMode() {
    setPageMode("renew");
    setRenewStep(1);
    setRenewError(""); setRenewMsg("");
    setChangeDoor(false);
    setNewDoorForm({door_number:"",wilaya:DEFAULT_DOOR_WILAYA,exploitation_commune:"",
      decision_type:"",decision_number:"",decision_date:"",decision_wilaya:""});
    setNewBenef({ben_nom_ar:"",ben_prenom_ar:"",ben_nom_fr:"",ben_prenom_fr:"",
      ben_date_naissance:"",ben_lieu_naissance:"",ben_nin:"",ben_wilaya:"",
      ben_sifa:"",ben_telephone:"",ben_adresse:"",
      ben_num_cni:"",ben_date_cni:"",ben_sexe:"",ben_groupe_sanguin:""});
    setNewDecImg(null); setNewDecPrev(null);
    setNewRectoB64(null); setNewRectoPrev(null);
    setNewVersoB64(null); setNewVersoPrev(null);
    setNewContractId(null); setNewContractNum(""); setNewContractDates(null);
    setChangeDoorReqId(null); setRenewDocsReqId(null);
  }

  function exitRenewMode() {
    setPageMode("normal");
    setRenewStep(1); setRenewError(""); setRenewMsg(""); setChangeDoor(false);
  }

  // ══════════════════════════════════════════
  // وضع تحديث القرار الولائي (مستقل — بدون فسخ)
  // ══════════════════════════════════════════
  function enterUpdateDecisionMode() {
    // نملأ الحقول من البيانات الحالية
    setUpdDecForm({
      door_number:          door.door_number          || "",
      wilaya:               door.wilaya               || DEFAULT_DOOR_WILAYA,
      exploitation_commune: door.exploitation_commune || "",
      decision_type:        door.decision_type        || "",
      decision_number:      door.decision_number      || "",
      decision_date:        door.decision_date        || "",
      decision_wilaya:      door.decision_wilaya      || "",
    });
    setUpdDecImg(null); setUpdDecPrev(null); setUpdDecPdf(false);
    setUpdDecError(""); setUpdDecSuccess(""); setUpdDecReqId(null);
    setPageMode("update_decision");
  }

  function exitUpdateDecisionMode() {
    setPageMode("normal");
    setUpdDecError(""); setUpdDecSuccess(""); setUpdDecReqId(null);
  }

  async function saveUpdateDecision() {
    setUpdDecError(""); setUpdDecSuccess(""); setUpdDecSaving(true);
    if(!updDecForm.door_number){setUpdDecError("رقم الباب مطلوب");setUpdDecSaving(false);return;}
    if(!updDecForm.exploitation_commune){setUpdDecError("بلدية الإلحاق مطلوبة");setUpdDecSaving(false);return;}
    // نمرر بيانات المستفيد الحالية بدون صور CNI (لا تغيير للمستفيد)
    const payload = {
      ...updDecForm,
      ben_nom_ar:         door.ben_nom_ar         || "",
      ben_prenom_ar:      door.ben_prenom_ar       || "",
      ben_nom_fr:         door.ben_nom_fr          || "",
      ben_prenom_fr:      door.ben_prenom_fr       || "",
      ben_date_naissance: door.ben_date_naissance  || "",
      ben_lieu_naissance: door.ben_lieu_naissance  || "",
      ben_nin:            door.ben_nin             || "",
      ben_wilaya:         door.ben_wilaya          || "",
      ben_sifa:           door.sifa                || "",
      ben_telephone:      door.ben_telephone       || "",
      ben_adresse:        door.ben_adresse         || "",
      ben_num_cni:        door.ben_num_cni         || "",
      ben_date_cni:       door.ben_date_cni        || "",
      image_decision_base64: updDecImg,
    };
    try{
      const r = await api.saveDoor(token, {...payload, exploitation_mode:exploitMode});
      if(!r.success){setUpdDecError(r.error||"خطأ في الحفظ");setUpdDecSaving(false);return;}
      // إنشاء طلب رسمي تجديد وثائق استغلال
      const req = await api.createRequest(token,{
        request_type:"تجديد_وثائق_استغلال",
        notes:`تحديث القرار الولائي — الباب: ${updDecForm.door_number}`,
      });
      if(req.success) setUpdDecReqId(req.request_id);
      setUpdDecSuccess("✅ تم تحديث القرار الولائي بنجاح");
      setUpdDecSaving(false);
      await onSaved();
    }catch{
      setUpdDecError("❌ خطأ في الاتصال بالخادم");
      setUpdDecSaving(false);
    }
  }

  // ══════════════════════════════════════════
  // خطوة 2 — تأكيد القرار الولائي + حفظ كل البيانات
  // ══════════════════════════════════════════
  async function renewStepDecision() {
    setRenewError("");
    const doorNum = changeDoor ? newDoorForm.door_number : (door.door_number||"");
    if(!doorNum){setRenewError("رقم الباب مطلوب");return;}
    if(!newDoorForm.exploitation_commune&&!door.exploitation_commune){setRenewError("بلدية الإلحاق مطلوبة");return;}
    // ندمج بيانات الباب: إذا لا يريد تغيير الباب نستعمل البيانات الحالية
    const doorData = changeDoor ? newDoorForm : {
      door_number:          door.door_number,
      wilaya:               door.wilaya||DEFAULT_DOOR_WILAYA,
      exploitation_commune: newDoorForm.exploitation_commune||door.exploitation_commune||"",
      decision_type:        newDoorForm.decision_type||door.decision_type||"",
      decision_number:      newDoorForm.decision_number||door.decision_number||"",
      decision_date:        newDoorForm.decision_date||door.decision_date||"",
      decision_wilaya:      newDoorForm.decision_wilaya||door.decision_wilaya||"",
    };
    const r=await api.saveDoor(token,{exploitation_mode:exploitMode,...doorData,...newBenef,
      image_decision_base64:newDecImg,
      ben_image_cni_recto_base64:newRectoB64,
      ben_image_cni_verso_base64:newVersoB64,
    });
    if(!r.success){
      if(r.code==="CONTRACT_ACTIVE")
        setRenewError(`⚠️ رقم الباب ${doorData.door_number} لديه عقد كراء ساري المفعول — يجب فسخه أولاً`);
      else
        setRenewError(r.error||"خطأ في الحفظ");
      return;
    }
    setRenewMsg(`✅ تم حفظ القرار والمستفيد — الباب: ${doorData.door_number}`);
    setRenewStep(3); onSaved();
  }

  // ══════════════════════════════════════════
  // خطوة 1 — التحقق من بيانات المستفيد والمتابعة
  // ══════════════════════════════════════════
  function renewStepBeneficiary() {
    setRenewError("");
    if(!newBenef.ben_nom_ar||!newBenef.ben_nin){setRenewError("اسم المستفيد و NIN مطلوبان");return;}
    setRenewMsg("✅ تم تسجيل بيانات المستفيد"); setRenewStep(2);
  }

  // ══════════════════════════════════════════
  // خطوة 3 — إنشاء عقد الكراء الجديد
  // ══════════════════════════════════════════
  async function renewStepContract() {
    if(renewContractLoading) return;
    setRenewError(""); setRenewContractLoading(true);
    if(!(parseInt(monthlyRent)>0)){const m="أدخل مبلغ الإيجار الشهري أولاً"; setContractError&&setContractError(m); setChangeError&&setChangeError(m); setRenewError&&setRenewError(m); setContractLoading&&setContractLoading(false); setRenewContractLoading&&setRenewContractLoading(false); return;}
    const rc=await api.createRentalContract(token,{monthly_rent: parseInt(monthlyRent)||0});
    if(!rc.success){setRenewError(rc.error||"خطأ في إنشاء عقد الكراء");setRenewContractLoading(false);return;}
    const cDate=(rc.contract_date||"").slice(0,10);
    const eDate=(rc.end_date||"").slice(0,10);
    setNewContractId(rc.contract_id||null);
    setNewContractNum(rc.contract_number);
    setNewContractDates({date:cDate,end:eDate});

    // إنشاء طلب رسمي تلقائياً
    if(changeDoor){
      // طلب تغيير رقم الباب
      const req=await api.createRequest(token,{
        request_type:"تغيير_باب",
        door_number: newDoorForm.door_number,
        notes:`تغيير رقم الباب من ${door.door_number||"—"} إلى ${newDoorForm.door_number}`,
      });
      if(req.success) setChangeDoorReqId(req.request_id);
    } else {
      // طلب تجديد وثائق الاستغلال
      const req=await api.createRequest(token,{
        request_type:"تجديد_وثائق_استغلال",
        notes:`تجديد عقد الكراء — الباب: ${door.door_number||"—"}`,
      });
      if(req.success) setRenewDocsReqId(req.request_id);
    }

    setRenewContractLoading(false);
    setRenewMsg("✅ اكتمل إنشاء عقد الكراء الجديد");
    setRenewStep(4); onSaved();
  }

  // ══════════════════════════════════════════
  // تغيير رقم الباب (زر الأسفل — مسار مستقل)
  // ══════════════════════════════════════════
  function startChangeMode() {
    setChangeMode(true); setChangeStep(rental.id?1:2); setStepDone({});
    setChangeError(""); setChangeMsg("");
    setChNewDoorForm({door_number:"",wilaya:DEFAULT_DOOR_WILAYA,exploitation_commune:"",
      decision_type:"",decision_number:"",decision_date:"",decision_wilaya:""});
    setChNewBenef({ben_nom_ar:"",ben_prenom_ar:"",ben_nom_fr:"",ben_prenom_fr:"",
      ben_date_naissance:"",ben_lieu_naissance:"",ben_nin:"",ben_wilaya:"",
      ben_sifa:"",ben_telephone:"",ben_adresse:"",
      ben_num_cni:"",ben_date_cni:"",ben_sexe:"",ben_groupe_sanguin:""});
    setChNewDecImg(null); setChNewDecPrev(null);
    setChNewRectoB64(null); setChNewRectoPrev(null);
    setChNewVersoB64(null); setChNewVersoPrev(null);
    setChNewContractNum(""); setChNewContractDates(null);
    setChChangeDoorReqId(null);
  }
  function cancelChangeMode(){
    setChangeMode(false);setChangeStep(1);setStepDone({});
    setChangeError("");setChangeMsg("");
    onSaved(); // أعد تحميل البيانات لمزامنة الفورم
  }

  async function chStepTerminate(){
    setChangeError(""); setChangeMsg(""); setTerminateLoading(true);
    try{
      const r=await api.terminateRentalContract(token);
      if(!r.success){setChangeError(r.error||"خطأ في فسخ العقد القديم");setTerminateLoading(false);return;}
      setTerminatedContractId(rental.id);
      setStepDone(p=>({...p,1:true}));
      setChangeMsg(`✅ تم فسخ العقد رقم ${r.contract_number||""} — اطبع المحضر ثم تابع`);
      // ═══ تفريغ كامل لجميع الحقول بعد الفسخ ═══
      setBenef({ben_nom_ar:"",ben_prenom_ar:"",ben_nom_fr:"",ben_prenom_fr:"",
        ben_date_naissance:"",ben_lieu_naissance:"",ben_nin:"",ben_wilaya:"",
        ben_sifa:"",ben_telephone:"",ben_num_cni:"",ben_date_cni:"",ben_adresse:"",
        ben_sexe:"",ben_groupe_sanguin:""});
      setDecisionImg(null); setDecisionPrev(null);
      setBenCniRectoB64(null); setBenCniRectoPrev(null);
      setBenCniVersoB64(null); setBenCniVersoPrev(null);
      setOcrDecDone(false); setOcrBenDone(false); setOcrBenVersoDone(false);
      setContractSuccess(""); setContractError(""); setMonthlyRent("");
      // نبقى في step 1 حتى يطبع المستخدم المحضر ثم يضغط "المتابعة"
      onSaved();
    }catch{setChangeError("خطأ في الاتصال");}
    setTerminateLoading(false);
  }

  async function chStepDecision(){
    setChangeError(""); setChangeMsg("");
    if(!chNewDoorForm.door_number){setChangeError("رقم الباب الجديد مطلوب");return;}
    if(!chNewDoorForm.decision_number||!chNewDoorForm.decision_date){setChangeError("رقم القرار الولائي وتاريخه مطلوبان");return;}
    if(door.door_number && String(chNewDoorForm.door_number).trim()===String(door.door_number).trim()){setChangeError(`رقم الباب الجديد يجب أن يختلف عن الرقم الحالي (${door.door_number})`);return;}
    if(!chNewDoorForm.exploitation_commune){setChangeError("بلدية الإلحاق مطلوبة");return;}
    const r=await api.saveDoor(token,{exploitation_mode:exploitMode,...chNewDoorForm,...chNewBenef,
      image_decision_base64:chNewDecImg,
      ben_image_cni_recto_base64:chNewRectoB64,
      ben_image_cni_verso_base64:chNewVersoB64,
    });
    if(!r.success){
      if(r.code==="CONTRACT_ACTIVE")
        setChangeError(`⚠️ رقم الباب ${chNewDoorForm.door_number} لديه عقد كراء ساري — يجب فسخه أولاً`);
      else
        setChangeError(r.error||"خطأ في الحفظ");
      return;
    }
    setStepDone(p=>({...p,3:true}));
    setChangeMsg(`✅ تم حفظ رقم الباب (${chNewDoorForm.door_number}) والمستفيد والقرار`);
    setChangeStep(4); onSaved();
  }

  function chStepBeneficiary(){
    setChangeError(""); setChangeMsg("");
    if(!chNewBenef.ben_nom_ar||!chNewBenef.ben_nin){setChangeError("اسم المستفيد الجديد و NIN مطلوبان");return;}
    setStepDone(p=>({...p,2:true}));
    setChangeMsg("✅ تم إدخال بيانات المستفيد — أدخل القرار الولائي الآن");
    setChangeStep(3);
  }

  async function chStepContract(){
    setChangeError(""); setChangeMsg("");
    if(!(parseInt(monthlyRent)>0)){const m="أدخل مبلغ الإيجار الشهري أولاً"; setContractError&&setContractError(m); setChangeError&&setChangeError(m); setRenewError&&setRenewError(m); setContractLoading&&setContractLoading(false); setRenewContractLoading&&setRenewContractLoading(false); return;}
    const rc=await api.createRentalContract(token,{monthly_rent: parseInt(monthlyRent)||0});
    if(!rc.success){setChangeError(rc.error||"خطأ في إنشاء عقد الكراء الجديد");return;}
    const cDate=(rc.contract_date||"").slice(0,10);
    const eDate=(rc.end_date||"").slice(0,10);
    setChNewContractNum(rc.contract_number); setChNewContractDates({date:cDate,end:eDate});
    setStepDone(p=>({...p,4:true}));

    // إنشاء طلب تغيير رقم الباب
    const reqData = {
      request_type: "تغيير_باب",
      door_number:     chNewDoorForm.door_number,
      decision_type:   chNewDoorForm.decision_type,
      decision_number: chNewDoorForm.decision_number,
      decision_date:   chNewDoorForm.decision_date,
      new_beneficiary_name: (chNewBenef.ben_nom_ar||"") + " " + (chNewBenef.ben_prenom_ar||""),
    };
    const rq = await api.createRequest(token, reqData);
    if(rq && rq.request_id) setChChangeDoorReqId(rq.request_id);

    setChangeMsg(`✅ اكتمل — عقد الكراء: ${rc.contract_number} (${cDate} → ${eDate})`);
    setChangeStep(5); onSaved();
  }

  // ══════════════════════════════════════════════════════════════════
  // العرض
  // ══════════════════════════════════════════════════════════════════

  // ── وضع تحديث القرار الولائي (مستقل) ────────────────────────────
  if (pageMode === "update_decision") {
    const updDec = (k,v) => setUpdDecForm(p=>({...p,[k]:v}));
    return (
      <div>
        <Alert tone="warning" icon="fileText" title="تحديث القرار الولائي"
          action={<Button size="sm" variant="secondary" icon="x" onClick={exitUpdateDecisionMode}>إلغاء</Button>}>
          الباب الحالي: <b>{door.door_number||"—"}</b> — المستفيد والعقد لا يتغيّران.
        </Alert>

        {updDecError  &&<Msg bg="#fef2f2" c="#b91c1c">❌ {updDecError}</Msg>}
        {updDecSuccess&&<Msg bg="#f0fdf4" c="#166534">{updDecSuccess}</Msg>}

        {!updDecSuccess&&(
          <Section title="📋 بيانات القرار الولائي الجديد">
            <Banner bg="#fefce8" c="#92400e">
              📷 ارفع صورة القرار الولائي الجديد لاستخراج البيانات تلقائياً عبر OCR
            </Banner>
            <ImageUpload label="صورة القرار الجديد (OCR تلقائي)"
              preview={updDecPrev} loading={updDecOcrLoad} isPdf={updDecPdf}
              onImage={handleUpdDecisionImg}/>
            {updDecOcrLoad&&<Banner bg="#eff6ff" c="#1d4ed8">🔍 جارٍ استخراج بيانات القرار...</Banner>}

            <div className="grid grid-2" style={{gap:"0 16px"}}>
              <Input label="رقم الباب" required>
                <input className="input" value={updDecForm.door_number}
                  onChange={e=>updDec("door_number",e.target.value)}/>
              </Input>
              <Input label="بلدية الإلحاق" required>
                <CommuneSelect wilaya={updDecForm.wilaya||DEFAULT_DOOR_WILAYA}
                  value={updDecForm.exploitation_commune}
                  onChange={v=>updDec("exploitation_commune",v)}/>
              </Input>
              <Input label="نوع القرار">
                <select className="select" value={updDecForm.decision_type}
                  onChange={e=>updDec("decision_type",e.target.value)}>
                  <option value="">— اختر —</option>
                  <option value="استفادة">استفادة</option>
                  <option value="تحويل_استفادة">تحويل استفادة</option>
                  <option value="تحويل_ولاية">تحويل من ولاية لولاية</option>
                </select>
              </Input>
              <Input label="رقم القرار">
                <input className="input" value={updDecForm.decision_number}
                  onChange={e=>updDec("decision_number",e.target.value)}/>
              </Input>
              <Input label="تاريخ القرار">
                <input type="date" className="input" value={updDecForm.decision_date}
                  onChange={e=>updDec("decision_date",e.target.value)}/>
              </Input>
              <Input label="ولاية إصدار القرار">
                <select className="select" value={updDecForm.decision_wilaya}
                  onChange={e=>updDec("decision_wilaya",e.target.value)}>
                  <option value="">— اختر —</option>
                  {WILAYAS.map(w=><option key={w}>{w}</option>)}
                </select>
              </Input>
            </div>

            <Banner bg="#e0f2fe" c="#0369a1">
              ℹ️ المستفيد الحالي: <strong>{door.ben_nom_ar||"—"} {door.ben_prenom_ar||""}</strong> — لن يتغير
            </Banner>

            <SaveBtn onClick={saveUpdateDecision} loading={updDecSaving}
              label="💾 حفظ القرار الجديد"/>
          </Section>
        )}

        {/* أزرار الطباعة بعد الحفظ */}
        {updDecSuccess&&(
          <Section title="🖨️ طباعة الوثائق">
            <DoneBox>تم تحديث القرار الولائي بنجاح!</DoneBox>
            <div className="grid grid-2" style={{gap:10,marginBottom:10}}>
              {updDecReqId&&(
                <Btn color="#0369a1" bg="#e0f2fe" fullWidth
                  onClick={()=>window.open(api.printRenewal(updDecReqId,token),"_blank")}>
                  🖨️ طباعة طلب تجديد وثائق الاستغلال
                </Btn>
              )}
              {rental.id&&(
                <Btn color="#125950" bg="#d1fae5" fullWidth
                  onClick={()=>window.open(api.printRentalContract(rental.id,token),"_blank")}>
                  🖨️ طباعة عقد الكراء الحالي
                </Btn>
              )}
            </div>
            <Btn color="#125950" bg="#d1fae5" fullWidth onClick={exitUpdateDecisionMode}>
              🔙 العودة للوضع العادي
            </Btn>
          </Section>
        )}
      </div>
    );
  }

  // ── وضع التجديد (بعد فسخ العقد) ──────────────────────────────────
  if (pageMode === "renew") {
    return (
      <div>
        <Alert tone="info" icon="refresh" title="تجديد عقد الكراء"
          action={<div className="row-wrap" style={{gap:8}}>
            <label className="check" style={{fontSize:13}}>
              <input type="checkbox" checked={changeDoor}
                onChange={e=>{setChangeDoor(e.target.checked);setRenewStep(1);setRenewError("");setRenewMsg("");}}/>
              تغيير رقم الباب
            </label>
            <Button size="sm" variant="secondary" icon="x" onClick={exitRenewMode}>إلغاء</Button>
          </div>}>
          أدخل المستفيد والقرار الولائي ثم أنشئ عقد الكراء الجديد.
        </Alert>

        {/* زر طباعة محضر الفسخ القديم */}
        {terminatedContractId&&(
          <div style={{marginBottom:16}}>
            <Btn color="#dc2626" bg="#fee2e2" fullWidth
              onClick={()=>window.open(api.printRentalContractTermination(terminatedContractId,token),"_blank")}>
              🖨️ طباعة محضر فسخ العقد القديم
            </Btn>
          </div>
        )}

        {renewError&&<Msg bg="#fef2f2" c="#b91c1c">❌ {renewError}</Msg>}
        {renewMsg&&renewStep<=3&&<Msg bg="#f0fdf4" c="#166534">{renewMsg}</Msg>}

        {/* ── خطوة 1: المستفيد الجديد ── */}
        {renewStep===1&&(
          <Section title="👤 بيانات المستفيد الجديد">
            <Banner bg="#e0f2fe" c="#0369a1">📷 ارفع بطاقة هوية المستفيد — ستُملأ بياناته تلقائياً</Banner>
            <div className="grid grid-2" style={{marginBottom:16}}>
              <ImageUpload label="بطاقة الهوية — الوجه" preview={newRectoPrev} loading={newOcrBenLoad} isPdf={newRectoPdf} onImage={handleNewBenRecto}/>
              <ImageUpload label="بطاقة الهوية — الظهر" preview={newVersoPrev} loading={false} isPdf={newVersoPdf} onImage={handleNewBenVerso}/>
            </div>
            {newOcrBenLoad&&<Banner bg="#eff6ff" c="#1d4ed8">🔍 جارٍ استخراج بيانات المستفيد...</Banner>}
            <div className="grid grid-2" style={{gap:"0 16px"}}>
              <Input label="اللقب (عربي)" required><input className="input" value={newBenef.ben_nom_ar} dir="rtl" onChange={e=>updNewBen("ben_nom_ar",e.target.value)}/></Input>
              <Input label="الاسم (عربي)" required><input className="input" value={newBenef.ben_prenom_ar} dir="rtl" onChange={e=>updNewBen("ben_prenom_ar",e.target.value)}/></Input>
              <Input label="Nom"><input className="input" value={newBenef.ben_nom_fr} onChange={e=>updNewBen("ben_nom_fr",e.target.value)}/></Input>
              <Input label="Prénom"><input className="input" value={newBenef.ben_prenom_fr} onChange={e=>updNewBen("ben_prenom_fr",e.target.value)}/></Input>
              <Input label="تاريخ الميلاد"><input type="text" className="input" value={newBenef.ben_date_naissance} onChange={e=>updNewBen("ben_date_naissance",e.target.value)} placeholder="YYYY-MM-DD أو 00/00/YYYY" dir="ltr" maxLength={10}/></Input>
              <Input label="مكان الميلاد"><input className="input" value={newBenef.ben_lieu_naissance} dir="rtl" onChange={e=>updNewBen("ben_lieu_naissance",e.target.value)}/></Input>
              <Input label="NIN" required><input className="input" value={newBenef.ben_nin} onChange={e=>{
                const v=e.target.value; updNewBen("ben_nin",v);
                if(!newBenef.ben_sexe&&v.length>=1){const s=ninSexe(v);if(s)updNewBen("ben_sexe",s);}
                if(!newBenef.ben_wilaya&&v.length>=9){const w=ninWilaya(v);if(w)updNewBen("ben_wilaya",w);}
              }} maxLength={18}/></Input>
              <Input label="الولاية"><select className="select" value={newBenef.ben_wilaya} onChange={e=>updNewBen("ben_wilaya",e.target.value)}><option value="">— اختر —</option>{WILAYAS.map(w=><option key={w}>{w}</option>)}</select></Input>
              <Input label="رقم بطاقة التعريف (ب.ت.و)"><input className="input" value={newBenef.ben_num_cni} onChange={e=>updNewBen("ben_num_cni",e.target.value)} dir="ltr" placeholder="XXXXXXXXXX"/></Input>
              <Input label="تاريخ إصدار البطاقة"><input type="date" className="input" value={newBenef.ben_date_cni} onChange={e=>updNewBen("ben_date_cni",e.target.value)}/></Input>
              <Input label="الجنس"><select className="select" value={newBenef.ben_sexe} onChange={e=>updNewBen("ben_sexe",e.target.value)}><option value="">— اختر —</option><option value="ذكر">ذكر</option><option value="أنثى">أنثى</option></select></Input>
              <Input label="فصيلة الدم"><input className="input" value={newBenef.ben_groupe_sanguin} onChange={e=>updNewBen("ben_groupe_sanguin",e.target.value)} placeholder="A+, B-, O+..." dir="ltr" maxLength={5}/></Input>
              
              
            </div>
            <Btn color="#125950" bg="#d1fae5" onClick={renewStepBeneficiary}>
              ✅ تأكيد بيانات المستفيد والمتابعة
            </Btn>
          </Section>
        )}

        {/* ── خطوة 2: القرار الولائي الجديد ── */}
        {renewStep>=2&&(
          <Section title={changeDoor?"📋 القرار الولائي الجديد + رقم الباب الجديد":"📋 القرار الولائي الجديد"}>
            {renewStep===2&&(
              <>
                <ImageUpload label="صورة القرار الجديد (OCR تلقائي)"
                  preview={newDecPrev} loading={newOcrDecLoad} isPdf={newDecPdf} onImage={handleNewDecisionImg}/>
                {newOcrDecLoad&&<Banner bg="#eff6ff" c="#1d4ed8">🔍 جارٍ استخراج بيانات القرار...</Banner>}
                <div className="grid grid-2" style={{gap:"0 16px"}}>
                  <Input label="رقم القرار">
                    <input className="input" value={newDoorForm.decision_number}
                      onChange={e=>updNewDoor("decision_number",e.target.value)}/>
                  </Input>
                  <Input label="تاريخ القرار">
                    <input type="date" className="input" value={newDoorForm.decision_date}
                      onChange={e=>updNewDoor("decision_date",e.target.value)}/>
                  </Input>
                  {changeDoor?(
                    <Input label="رقم الباب الجديد" required>
                      <input className="input" style={{borderColor:"var(--gold-500)",background:"var(--gold-50)",fontWeight:700}}
                        value={newDoorForm.door_number}
                        onChange={e=>updNewDoor("door_number",e.target.value)}
                        placeholder="رقم الباب الجديد"/>
                    </Input>
                  ):(
                    <Input label="رقم الباب الحالي">
                      <input className="input locked"
                        value={door.door_number||""} readOnly/>
                    </Input>
                  )}
                  <Input label="بلدية الإلحاق" required>
                    <CommuneSelect
                      wilaya={newDoorForm.wilaya||DEFAULT_DOOR_WILAYA}
                      value={newDoorForm.exploitation_commune||door.exploitation_commune||""}
                      onChange={v=>updNewDoor("exploitation_commune",v)}/>
                  </Input>
                  <Input label="صفة الاستغلال" required>
                    <select className="select" value={exploitMode} onChange={e=>setExploitMode(e.target.value)}>
                      <option value="مستأجر">مستأجر — يستغل الرخصة بعقد كراء</option>
                      <option value="مستفيد">مستفيد — صاحب الرخصة يستغلها بنفسه (بلا عقد)</option>
                    </select>
                  </Input>
                  <Input label="صفة المستفيد" required>
                    <select className="select" value={newBenef.ben_sifa} onChange={e=>updNewBen("ben_sifa",e.target.value)}>
                      <option value="">— اختر —</option>
                      {SIFA_OPTIONS.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </Input>
                  <Input label="ولاية إصدار القرار">
                    <select className="select" value={newDoorForm.decision_wilaya}
                      onChange={e=>updNewDoor("decision_wilaya",e.target.value)}>
                      <option value="">— اختر —</option>
                      {WILAYAS.map(w=><option key={w}>{w}</option>)}
                    </select>
                  </Input>
                </div>
                <div style={{marginTop:6}}>
                  <div className="section-title">معلومات إضافية</div>
                  <div className="grid grid-2" style={{gap:"0 16px"}}>
                    <Input label="رقم الهاتف (ذو الحق)"><input className="input" value={newBenef.ben_telephone} onChange={e=>updNewBen("ben_telephone",e.target.value)} placeholder="05XXXXXXXX" maxLength={10}/></Input>
                    <Input label="العنوان (من البطاقة)"><input className="input" value={newBenef.ben_adresse} dir="rtl" onChange={e=>updNewBen("ben_adresse",e.target.value)}/></Input>
                  </div>
                </div>
                <Btn color="#125950" bg="#d1fae5" onClick={renewStepDecision}>
                  ✅ حفظ القرار والمتابعة
                </Btn>
              </>
            )}
            {renewStep>=3&&(
              <Msg bg="#f0fdf4" c="#166534">✅ تم حفظ القرار والمستفيد</Msg>
            )}
          </Section>
        )}

        {/* ── خطوة 3: إنشاء عقد الكراء ── */}
        {renewStep>=3&&(
          <Section title="📄 إنشاء عقد الكراء الجديد">
            {renewStep===3&&(
              <>
                <Banner bg="#eff6ff" c="#1d4ed8">
                  ℹ️ سيُنشأ عقد كراء جديد لمدة <strong>سنة واحدة (01)</strong> تلقائياً
                  {changeDoor&&<span> — الباب الجديد: <strong>{newDoorForm.door_number}</strong></span>}
                </Banner>
                {exploitMode==="مستفيد" ? (
                  <Msg bg="#f0fdf4" c="#166534">✅ صفة الاستغلال «مستفيد» — لا يلزم عقد كراء.</Msg>
                ) : (<>
                <Input label="الإيجار الشهري (دج)" required>
                  <input className="input" style={{width:220}} type="number" min="1" value={monthlyRent}
                    onChange={e=>setMonthlyRent(e.target.value)} placeholder="مثال: 6000" dir="ltr"/>
                </Input>
                <Btn color="#1d4ed8" bg="#dbeafe" onClick={renewStepContract} disabled={renewContractLoading}>
                  {renewContractLoading?"⏳ جارٍ إنشاء العقد...":"📄 إنشاء عقد الكراء الجديد"}
                </Btn>
                </>)}
              </>
            )}
            {renewStep>=4&&(
              <Msg bg="#f0fdf4" c="#166534">
                ✅ عقد الكراء: <strong>{newContractNum}</strong>
                {newContractDates&&<> | من: {newContractDates.date} → إلى: {newContractDates.end}</>}
              </Msg>
            )}
          </Section>
        )}

        {/* ── خطوة 4: أزرار الطباعة ── */}
        {renewStep>=4&&(
          <Section title="🖨️ طباعة الوثائق">
            <DoneBox>{changeDoor?"اكتمل تغيير رقم الباب وإنشاء العقد الجديد!":"اكتمل تجديد العقد!"}</DoneBox>

            <div className="grid grid-2" style={{gap:10,marginBottom:10}}>
              {/* طباعة العقد الجديد — دائماً */}
              {profile?.rental?.id&&(
                <Btn color="#125950" bg="#d1fae5" fullWidth
                  onClick={()=>window.open(api.printRentalContract(profile.rental.id,token),"_blank")}>
                  🖨️ طباعة عقد الكراء الجديد
                </Btn>
              )}

              {/* إذا تغيير الباب → طباعة طلب تغيير رقم الباب */}
              {changeDoor&&changeDoorReqId&&(
                <Btn color="#d97706" bg="#fef3c7" fullWidth
                  onClick={()=>window.open(api.printRequest(changeDoorReqId,token),"_blank")}>
                  🖨️ طباعة طلب تغيير رقم الباب
                </Btn>
              )}

              {/* إذا لا تغيير للباب → طباعة طلب تجديد وثائق الاستغلال */}
              {!changeDoor&&renewDocsReqId&&(
                <Btn color="#0369a1" bg="#e0f2fe" fullWidth
                  onClick={()=>window.open(api.printRenewal(renewDocsReqId,token),"_blank")}>
                  🖨️ طباعة طلب تجديد وثائق الاستغلال
                </Btn>
              )}

              {/* محضر الفسخ القديم */}
              {terminatedContractId&&(
                <Btn color="#dc2626" bg="#fee2e2" fullWidth
                  onClick={()=>window.open(api.printRentalContractTermination(terminatedContractId,token),"_blank")}>
                  🖨️ محضر فسخ العقد القديم
                </Btn>
              )}
            </div>

            <Btn color="#125950" bg="#d1fae5" fullWidth onClick={exitRenewMode}>
              🔙 العودة للوضع العادي
            </Btn>
          </Section>
        )}
      </div>
    );
  }

  // ── الوضع العادي ────────────────────────────────────────────────
  return (
    <div>
      {door.door_number && !changeMode && (
        <div className="card" style={{padding:20,marginBottom:18,display:"flex",gap:18,alignItems:"center",flexWrap:"wrap"}}>
          <div style={{width:72,height:72,borderRadius:18,display:"grid",placeItems:"center",background:"linear-gradient(140deg,var(--gold-500),#ffd862)",color:"#3b2a00",boxShadow:"0 10px 24px -12px rgba(242,183,5,.8)"}}>
            <div style={{textAlign:"center",lineHeight:1.1}}><div style={{fontSize:10,fontWeight:600,opacity:.75}}>الباب</div><div style={{fontSize:24,fontWeight:700}}>{door.door_number}</div></div>
          </div>
          <div style={{flex:1,minWidth:200}}>
            <div className="cell-sub">صاحب الرخصة (المستفيد)</div>
            <div style={{fontSize:17,fontWeight:700,color:"var(--ink)"}}>{door.ben_prenom_ar||""} {door.ben_nom_ar||""}</div>
            <div className="row-wrap" style={{gap:6,marginTop:6}}>
              {door.sifa&&<Badge tone="gold" size="sm">{String(door.sifa).replace(/_/g," ")}</Badge>}
              {isBeneficiary && <Badge tone="violet" size="sm">يستغلها بنفسه</Badge>}
              {door.exploitation_commune&&<Badge size="sm" icon="mapPin">{door.exploitation_commune}</Badge>}
              {door.decision_number&&<Badge size="sm" icon="fileText">قرار ولائي رقم: {door.decision_number} — مؤرخ في: {fmtDate(door.decision_date)||"......"}</Badge>}
            </div>
          </div>
          {!isBeneficiary&&(rental.id
            ? <Badge tone="success" dot>عقد ساري حتى {fmtDate(rental.end_date)}</Badge>
            : <Badge tone="warning" dot>لا يوجد عقد كراء ساري</Badge>)}
        </div>
      )}
      {/* ══ الأقسام الأصلية: مخفية في وضع تغيير الباب (changeMode) ══ */}
      {!changeMode&&(<>
      {rental.id ? (<>
      {/* ══ قراءة فقط — يوجد عقد ساري ══ */}
      <Section title="👤 بيانات المستفيد من رقم الباب">
        <Alert tone="warning" icon="lock" style={{marginBottom:16}}> البيانات مقفلة — لتغيير المستفيد أو رقم الباب يجب <strong>فسخ العقد الحالي</strong> أولاً ثم اتباع إجراءات التجديد
        </Alert>
        <div className="grid grid-2" style={{gap:"0 32px"}}>
          {(()=>{const rows=[["اللقب (عربي)",benef.ben_nom_ar,"rtl"],["الاسم (عربي)",benef.ben_prenom_ar,"rtl"],["Nom",benef.ben_nom_fr,"ltr"],["Prénom",benef.ben_prenom_fr,"ltr"],["تاريخ الميلاد",benef.ben_date_naissance,"ltr"],["مكان الميلاد",benef.ben_lieu_naissance,"rtl"],["NIN",benef.ben_nin,"ltr"],["الولاية",benef.ben_wilaya,"rtl"],["رقم البطاقة",benef.ben_num_cni,"ltr"],["تاريخ الإصدار",benef.ben_date_cni,"ltr"],["الجنس",benef.ben_sexe,"rtl"],["فصيلة الدم",benef.ben_groupe_sanguin,"ltr"],["الهاتف",benef.ben_telephone,"ltr"],["العنوان",benef.ben_adresse,"rtl"]].map(([label,value,dir])=>({label,value:/^\d{4}-\d{2}-\d{2}/.test(value||"")?fmtDate(value):fmtVal(value),ltr:dir==="ltr"})); return <div className="span-all"><DescList items={rows}/></div>;})()}
        </div>
      </Section>
      <Section title="📋 القرار الولائي">
        <div className="grid grid-2" style={{gap:"0 32px"}}>
          {(()=>{const rows=[["رقم القرار",doorForm.decision_number,"ltr"],["تاريخ القرار",doorForm.decision_date,"ltr"],["رقم الباب",doorForm.door_number,"ltr"],["بلدية الإلحاق",doorForm.exploitation_commune,"rtl"],["صفة المستفيد",benef.ben_sifa,"rtl"],["ولاية إصدار القرار",doorForm.decision_wilaya,"rtl"]].map(([label,value,dir])=>({label,value:/^\d{4}-\d{2}-\d{2}/.test(value||"")?fmtDate(value):fmtVal(value),ltr:dir==="ltr"})); return <div className="span-all"><DescList items={rows}/></div>;})()}
        </div>
      </Section>
      </>) : (<>
      {/* بيانات المستفيد */}
      <Section title="👤 بيانات المستفيد من رقم الباب">
        {door.door_number
          ? <Banner bg="#f0fdf4" c="#166534">✏️ يمكنك تعديل البيانات مباشرةً ثم الحفظ — رفع الصور اختياري عند التحديث</Banner>
          : <Banner bg="#e0f2fe" c="#0369a1">📷 ارفع بطاقة هوية المستفيد — ستُملأ بياناته تلقائياً عبر OCR (مطلوب للإدخال الأول)</Banner>
        }
        <div className="grid grid-2" style={{marginBottom:16}}>
          <ImageUpload label="بطاقة الهوية — الوجه" preview={benCniRectoPrev} loading={ocrBenLoading} isPdf={benCniRectoPdf} onImage={handleBenCniRecto}/>
          <ImageUpload label="بطاقة الهوية — الظهر" preview={benCniVersoPrev} loading={false} isPdf={benCniVersoPdf} onImage={handleBenCniVerso}/>
        </div>
        {ocrBenLoading&&<Banner bg="#eff6ff" c="#1d4ed8">🔍 جارٍ استخراج بيانات المستفيد...</Banner>}
        {ocrBenDone&&<Banner bg="#f0fdf4" c="#166534">✅ تم قراءة بطاقة الهوية — راجع الحقول المحددة بالأحمر وصحّحها إن لزم</Banner>}
        <div className="grid grid-2" style={{gap:"0 16px"}}>
          <Input label="اللقب (عربي)" required><input className={benCls("ben_nom_ar")} value={benef.ben_nom_ar} dir="rtl" onChange={e=>updBenef("ben_nom_ar",e.target.value)} placeholder={benPh("اللقب")}/></Input>
          <Input label="الاسم (عربي)" required><input className={benCls("ben_prenom_ar")} value={benef.ben_prenom_ar} dir="rtl" onChange={e=>updBenef("ben_prenom_ar",e.target.value)} placeholder={benPh("الاسم")}/></Input>
          <Input label="Nom"><input className={benVersoCls("ben_nom_fr")} value={benef.ben_nom_fr} onChange={e=>updBenef("ben_nom_fr",e.target.value)} placeholder={benVersoPh("Nom")}/></Input>
          <Input label="Prénom"><input className={benVersoCls("ben_prenom_fr")} value={benef.ben_prenom_fr} onChange={e=>updBenef("ben_prenom_fr",e.target.value)} placeholder={benVersoPh("Prénom")}/></Input>
          <Input label="تاريخ الميلاد" required>
            <input type="text" className={benCls("ben_date_naissance")} value={benef.ben_date_naissance} onChange={e=>updBenef("ben_date_naissance",e.target.value)} placeholder="YYYY-MM-DD أو 00/00/YYYY" dir="ltr" maxLength={10}/>
            {ocrBenDone && !benef.ben_date_naissance && <span style={{fontSize:11,color:"#dc2626",marginTop:2,display:"block"}}>⚠️ لم يُقرأ تاريخ الميلاد — أدخله يدوياً من البطاقة</span>}
            {ocrBenDone && benef.ben_date_naissance?.endsWith("-01") && <span style={{fontSize:11,color:"#d97706",marginTop:2,display:"block"}}>⚠️ اليوم تقريبي (01) — صحّحه من البطاقة</span>}
          </Input>
          <Input label="مكان الميلاد"><input className={benCls("ben_lieu_naissance")} value={benef.ben_lieu_naissance} dir="rtl" onChange={e=>updBenef("ben_lieu_naissance",e.target.value)} placeholder={benPh("مكان الميلاد")}/></Input>
          <Input label="NIN" required><input className={benCls("ben_nin")} value={benef.ben_nin} onChange={e=>{
                const v=e.target.value; updBenef("ben_nin",v);
                if(!benef.ben_sexe&&v.length>=1){const s=ninSexe(v);if(s)updBenef("ben_sexe",s);}
                if(!benef.ben_wilaya&&v.length>=9){const w=ninWilaya(v);if(w)updBenef("ben_wilaya",w);}
              }} placeholder={benPh("NIN")} maxLength={18}/></Input>
          <Input label="الولاية"><select className={benCls("ben_wilaya","select")} value={benef.ben_wilaya} onChange={e=>updBenef("ben_wilaya",e.target.value)}><option value="">— اختر —</option>{WILAYAS.map(w=><option key={w}>{w}</option>)}</select></Input>
        </div>
        <div className="grid grid-2" style={{gap:"0 16px"}}>
          <Input label="رقم بطاقة التعريف (ب.ت.و)"><input className="input" value={benef.ben_num_cni} onChange={e=>updBenef("ben_num_cni",e.target.value)} dir="ltr" placeholder="XXXXXXXXXX"/></Input>
          <Input label="تاريخ إصدار البطاقة"><input type="date" className="input" value={benef.ben_date_cni} onChange={e=>updBenef("ben_date_cni",e.target.value)}/></Input>
          <Input label="الجنس"><select className={benCls("ben_sexe","select")} value={benef.ben_sexe} onChange={e=>updBenef("ben_sexe",e.target.value)}><option value="">— اختر —</option><option value="ذكر">ذكر</option><option value="أنثى">أنثى</option></select></Input>
          <Input label="فصيلة الدم"><input className={benCls("ben_groupe_sanguin")} value={benef.ben_groupe_sanguin} onChange={e=>updBenef("ben_groupe_sanguin",e.target.value)} placeholder={benPh("فصيلة الدم")} dir="ltr" maxLength={5}/></Input>
        </div>
      </Section>

      {/* القرار الولائي */}
      <Section title="📋 القرار الولائي">
        {door.door_number
          ? <Banner bg="#f0fdf4" c="#166534">✏️ يمكنك تعديل بيانات القرار مباشرةً ثم الحفظ</Banner>
          : <Banner bg="#fefce8" c="#92400e">📷 ارفع صورة القرار الولائي — ستُملأ بياناته تلقائياً عبر OCR (مطلوب للإدخال الأول)</Banner>
        }
        <ImageUpload label="صورة القرار الولائي (OCR تلقائي)"
          preview={decisionPrev} loading={ocrDecLoading} isPdf={decisionPdf} onImage={handleDecisionImg}/>
        {ocrDecLoading&&<Banner bg="#eff6ff" c="#1d4ed8">🔍 جارٍ استخراج بيانات القرار...</Banner>}
        {ocrDecDone&&<Banner bg="#f0fdf4" c="#166534">✅ تم قراءة القرار — راجع الحقول المحددة بالأحمر وصحّحها إن لزم</Banner>}
        <div className="grid grid-2" style={{gap:"0 16px"}}>
          <Input label="رقم القرار">
            <input className={decCls("decision_number")} value={doorForm.decision_number}
              onChange={e=>updDoor("decision_number",e.target.value)} placeholder={decPh("رقم القرار")}/>
          </Input>
          <Input label="تاريخ القرار">
            <input type="date" className={decCls("decision_date")} value={doorForm.decision_date}
              onChange={e=>updDoor("decision_date",e.target.value)}/>
          </Input>
          <Input label="رقم الباب" required>
            <input className={decCls("door_number")} value={doorForm.door_number}
              onChange={e=>updDoor("door_number",e.target.value)} placeholder={decPh("رقم الباب")}/>
          </Input>
          <Input label="بلدية الإلحاق" required>
            <CommuneSelect wilaya={doorForm.wilaya} value={doorForm.exploitation_commune}
              onChange={v=>updDoor("exploitation_commune",v)}/>
          </Input>
          <Input label="صفة الاستغلال" required>
                    <select className="select" value={exploitMode} onChange={e=>setExploitMode(e.target.value)}>
                      <option value="مستأجر">مستأجر — يستغل الرخصة بعقد كراء</option>
                      <option value="مستفيد">مستفيد — صاحب الرخصة يستغلها بنفسه (بلا عقد)</option>
                    </select>
                  </Input>
                  <Input label="صفة المستفيد" required>
            <select className={benCls("ben_sifa","select")} value={benef.ben_sifa} onChange={e=>updBenef("ben_sifa",e.target.value)}>
              <option value="">— اختر —</option>
              {SIFA_OPTIONS.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Input>
          <Input label="ولاية إصدار القرار">
            <select className={decCls("decision_wilaya","select")} value={doorForm.decision_wilaya} onChange={e=>updDoor("decision_wilaya",e.target.value)}>
              <option value="">— اختر —</option>
              {WILAYAS.map(w=><option key={w}>{w}</option>)}
            </select>
          </Input>
        </div>
        <div style={{marginTop:6}}>
          <div className="section-title">معلومات إضافية</div>
          <div className="grid grid-2" style={{gap:"0 16px"}}>
            <Input label="رقم الهاتف (ذو الحق)"><input className="input" value={benef.ben_telephone} onChange={e=>updBenef("ben_telephone",e.target.value)} placeholder="05XXXXXXXX" maxLength={10}/></Input>
            <Input label="العنوان (من البطاقة)"><input className="input" value={benef.ben_adresse} dir="rtl" onChange={e=>updBenef("ben_adresse",e.target.value)}/></Input>
          </div>
        </div>
      </Section>

      <ErrorMsg msg={error}/><SuccessMsg msg={success}/>
      <SaveBtn onClick={save} loading={saving} label="💾 حفظ رقم الباب + المستفيد"/>
      </>)}

      {/* ══ صفة الاستغلال: مستفيد ⇒ لا عقد كراء ══ */}
      {isBeneficiary && door.door_number && (
        <Section title="📄 صفة الاستغلال">
          <Msg bg="#f0fdf4" c="#166534">✅ <strong>مستفيد</strong> — صاحب الرخصة يستغلها بنفسه، لا يلزم عقد كراء.</Msg>
        </Section>
      )}
      {/* ══ عقد الكراء ══ */}
      {!isBeneficiary && <Section title="📄 عقد الكراء">
        <Banner bg="#eff6ff" c="#1d4ed8">
          ℹ️ مدة العقد <strong>سنة واحدة (01)</strong> تلقائياً من تاريخ التحرير
          &nbsp;—&nbsp;لا يمكن التجديد إلا قبل <strong>7 أيام</strong> من الانتهاء
        </Banner>
        {rental.id&&<ContractStatus rental={rental}/>}
        {contractError  &&<Msg bg="#fef2f2" c="#b91c1c">❌ {contractError}</Msg>}
        {contractSuccess&&<Msg bg="#f0fdf4" c="#166534">{contractSuccess}</Msg>}
        {!door.door_number?(
          <Banner bg="#fef9c3" c="#92400e">⚠️ يجب حفظ بيانات رقم الباب والمستفيد أولاً قبل إنشاء عقد الكراء</Banner>
        ):(<>
        <Input label="الإيجار الشهري (دج)">
          <input className="input" style={{width:220}} type="number" min="0" value={monthlyRent}
            onChange={e=>setMonthlyRent(e.target.value)} placeholder="0" dir="ltr"/>
        </Input>
        <Btn color="#1d4ed8" bg="#dbeafe" onClick={handleCreateContract} disabled={contractLoading} fullWidth>
          {contractLoading?"⏳ جارٍ...":rental.id?"🔄 تجديد عقد الكراء":"📄 إنشاء عقد الكراء"}
        </Btn></>)}
        {rental.id&&(
          <Btn color="#125950" bg="#d1fae5" fullWidth topMargin
            onClick={()=>window.open(api.printRentalContract(rental.id,token),"_blank")}>
            🖨️ طباعة عقد الكراء
          </Btn>
        )}
      </Section>}

      </>)}
      {/* ══ فسخ عقد الكراء ══ */}
      {rental.id&&!changeMode&&(
        <Section title="🚫 فسخ عقد الكراء">
          <Banner bg="#fef2f2" c="#991b1b">⚠️ سيتم إنهاء العقد الحالي نهائياً — لا يمكن التراجع</Banner>
          {terminateError&&<Msg bg="#fef2f2" c="#b91c1c">❌ {terminateError}</Msg>}
          {!confirmTerminate?(
            <Btn color="#dc2626" bg="#fee2e2" onClick={()=>setConfirmTerminate(true)}>🚫 فسخ عقد الكراء</Btn>
          ):(
            <div>
              <Msg bg="#fef9c3" c="#92400e">⚠️ هل أنت متأكد من فسخ العقد <strong>{rental.contract_number}</strong>؟</Msg>
              <div className="row-wrap" style={{marginTop:12}}>
                <Btn color="#dc2626" bg="#fee2e2" onClick={handleTerminateContract} disabled={terminateLoading}>
                  {terminateLoading?"⏳ جارٍ الفسخ...":"✅ نعم، أفسخ العقد"}
                </Btn>
                <Btn color="#6b7280" bg="#f3f4f6" onClick={()=>setConfirmTerminate(false)}>❌ إلغاء</Btn>
              </div>
            </div>
          )}
        </Section>
      )}

      {/* ══ تغيير رقم الباب ══ */}
      {!changeMode?(
        <Section title="🔄 تغيير رقم الباب">
          <Banner bg="#fefce8" c="#854d0e">
            ⚠️ تغيير رقم الباب يستلزم: فسخ العقد القديم (إن وجد) + قرار ولائي جديد + مستفيد جديد + عقد كراء جديد
            {door.door_number&&<span style={{fontWeight:700,marginRight:6}}>— الرقم الحالي: {door.door_number}</span>}
          </Banner>
          <Btn color="#d97706" bg="#fef3c7" onClick={startChangeMode}>🔄 بدء إجراء تغيير رقم الباب</Btn>
        </Section>
      ):(
        <Section title="🔄 إجراء تغيير رقم الباب">
          <StepBar steps={STEPS} current={changeStep} done={stepDone} hasOldContract={!!rental.id}/>
          {changeError&&<Msg bg="#fef2f2" c="#b91c1c">❌ {changeError}</Msg>}
          {changeMsg&&changeStep<=4&&<Msg bg="#f0fdf4" c="#166534">{changeMsg}</Msg>}

          {changeStep===1&&(
            <div>
              {rental.id&&!stepDone[1]&&(
                <>
                  <Banner bg="#fef2f2" c="#991b1b">
                    📃 العقد الحالي الذي سيُفسخ: <strong>{rental.contract_number}</strong>
                    &nbsp;|&nbsp;{(rental.contract_date||"").slice(0,10)}{rental.end_date&&<> → {(rental.end_date||"").slice(0,10)}</>}
                  </Banner>
                  <div className="row-wrap">
                    <Btn color="#dc2626" bg="#fee2e2" onClick={chStepTerminate} disabled={terminateLoading}>
                      {terminateLoading?"⏳ جارٍ الفسخ...":"🚫 فسخ العقد القديم"}
                    </Btn>
                    <Btn color="#6b7280" bg="#f3f4f6" onClick={cancelChangeMode}>إلغاء</Btn>
                  </div>
                </>
              )}
              {stepDone[1]&&terminatedContractId&&(
                <div className="stack-sm" style={{marginTop:8}}>
                  <Btn color="#125950" bg="#d1fae5" fullWidth
                    onClick={()=>window.open(api.printRentalContractTermination(terminatedContractId,token),"_blank")}>
                    🖨️ طباعة محضر فسخ العقد — ثم انتقل للخطوة التالية
                  </Btn>
                  <Btn color="#1d4ed8" bg="#dbeafe" fullWidth topMargin onClick={()=>setChangeStep(2)}>
                    ← المتابعة إلى إدخال المستفيد الجديد
                  </Btn>
                </div>
              )}
            </div>
          )}

          {changeStep===2&&(
            <div>
              <Banner bg="#e0f2fe" c="#0369a1">👤 أدخل بيانات هوية المستفيد الجديد</Banner>
              <div className="grid grid-2" style={{marginBottom:16}}>
                <ImageUpload label="بطاقة هوية المستفيد — الوجه" preview={chNewRectoPrev} loading={chOcrBenLoad} isPdf={chNewRectoPdf} onImage={handleChBenRecto}/>
                <ImageUpload label="بطاقة هوية المستفيد — الظهر" preview={chNewVersoPrev} loading={false} isPdf={chNewVersoPdf} onImage={handleChBenVerso}/>
              </div>
              {chOcrBenLoad&&<Banner bg="#eff6ff" c="#1d4ed8">🔍 جارٍ الاستخراج...</Banner>}
              <div className="grid grid-2" style={{gap:"0 16px"}}>
                <Input label="اللقب (عربي)" required><input className="input" value={chNewBenef.ben_nom_ar} dir="rtl" onChange={e=>updChBen("ben_nom_ar",e.target.value)}/></Input>
                <Input label="الاسم (عربي)" required><input className="input" value={chNewBenef.ben_prenom_ar} dir="rtl" onChange={e=>updChBen("ben_prenom_ar",e.target.value)}/></Input>
                <Input label="Nom"><input className="input" value={chNewBenef.ben_nom_fr} onChange={e=>updChBen("ben_nom_fr",e.target.value)}/></Input>
                <Input label="Prénom"><input className="input" value={chNewBenef.ben_prenom_fr} onChange={e=>updChBen("ben_prenom_fr",e.target.value)}/></Input>
                <Input label="تاريخ الميلاد"><input type="text" className="input" value={chNewBenef.ben_date_naissance} onChange={e=>updChBen("ben_date_naissance",e.target.value)} placeholder="YYYY-MM-DD أو 00/00/YYYY" dir="ltr" maxLength={10}/></Input>
                <Input label="مكان الميلاد"><input className="input" value={chNewBenef.ben_lieu_naissance} dir="rtl" onChange={e=>updChBen("ben_lieu_naissance",e.target.value)}/></Input>
                <Input label="NIN" required><input className="input" value={chNewBenef.ben_nin} onChange={e=>{
                const v=e.target.value; updChBen("ben_nin",v);
                if(!chNewBenef.ben_sexe&&v.length>=1){const s=ninSexe(v);if(s)updChBen("ben_sexe",s);}
                if(!chNewBenef.ben_wilaya&&v.length>=9){const w=ninWilaya(v);if(w)updChBen("ben_wilaya",w);}
              }} maxLength={18}/></Input>
                <Input label="الولاية"><select className="select" value={chNewBenef.ben_wilaya} onChange={e=>updChBen("ben_wilaya",e.target.value)}><option value="">— اختر —</option>{WILAYAS.map(w=><option key={w}>{w}</option>)}</select></Input>
                <Input label="رقم بطاقة التعريف (ب.ت.و)"><input className="input" value={chNewBenef.ben_num_cni} onChange={e=>updChBen("ben_num_cni",e.target.value)} dir="ltr" placeholder="XXXXXXXXXX"/></Input>
                <Input label="تاريخ إصدار البطاقة"><input type="date" className="input" value={chNewBenef.ben_date_cni} onChange={e=>updChBen("ben_date_cni",e.target.value)}/></Input>
                <Input label="الجنس"><select className="select" value={chNewBenef.ben_sexe} onChange={e=>updChBen("ben_sexe",e.target.value)}><option value="">— اختر —</option><option value="ذكر">ذكر</option><option value="أنثى">أنثى</option></select></Input>
                <Input label="فصيلة الدم"><input className="input" value={chNewBenef.ben_groupe_sanguin} onChange={e=>updChBen("ben_groupe_sanguin",e.target.value)} placeholder="A+, B-, O+..." dir="ltr" maxLength={5}/></Input>
                
                
              </div>
              <div className="row-wrap" style={{marginTop:12}}>
                <Btn color="#125950" bg="#d1fae5" onClick={chStepBeneficiary}>✅ حفظ المستفيد والمتابعة</Btn>
                <Btn color="#6b7280" bg="#f3f4f6" onClick={cancelChangeMode}>إلغاء</Btn>
              </div>
            </div>
          )}

          {changeStep===3&&(
            <div>
              <Banner bg="#eff6ff" c="#1d4ed8">📋 أدخل بيانات القرار الولائي الجديد ورقم الباب</Banner>
              <ImageUpload label="صورة القرار الجديد (OCR تلقائي)"
                preview={chNewDecPrev} loading={chOcrDecLoad} isPdf={chNewDecPdf} onImage={handleChDecisionImg}/>
              {chOcrDecLoad&&<Banner bg="#eff6ff" c="#1d4ed8">🔍 جارٍ الاستخراج...</Banner>}
              <div className="grid grid-2" style={{gap:"0 16px"}}>
                <Input label="رقم القرار">
                  <input className="input" value={chNewDoorForm.decision_number} onChange={e=>updChDoor("decision_number",e.target.value)}/>
                </Input>
                <Input label="تاريخ القرار">
                  <input type="date" className="input" value={chNewDoorForm.decision_date} onChange={e=>updChDoor("decision_date",e.target.value)}/>
                </Input>
                <Input label="رقم الباب الجديد" required>
                  <input className="input" style={{borderColor:"var(--gold-500)",background:"var(--gold-50)",fontWeight:700}}
                    value={chNewDoorForm.door_number}
                    onChange={e=>updChDoor("door_number",e.target.value)}
                    placeholder="رقم الباب الجديد" autoFocus/>
                </Input>
                <Input label="بلدية الإلحاق" required>
                  <CommuneSelect wilaya={chNewDoorForm.wilaya} value={chNewDoorForm.exploitation_commune}
                    onChange={v=>updChDoor("exploitation_commune",v)}/>
                </Input>
                <Input label="صفة الاستغلال" required>
                    <select className="select" value={exploitMode} onChange={e=>setExploitMode(e.target.value)}>
                      <option value="مستأجر">مستأجر — يستغل الرخصة بعقد كراء</option>
                      <option value="مستفيد">مستفيد — صاحب الرخصة يستغلها بنفسه (بلا عقد)</option>
                    </select>
                  </Input>
                  <Input label="صفة المستفيد" required>
                  <select className="select" value={chNewBenef.ben_sifa} onChange={e=>updChBen("ben_sifa",e.target.value)}>
                    <option value="">— اختر —</option>
                    {SIFA_OPTIONS.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </Input>
                <Input label="ولاية إصدار القرار">
                  <select className="select" value={chNewDoorForm.decision_wilaya} onChange={e=>updChDoor("decision_wilaya",e.target.value)}>
                    <option value="">— اختر —</option>
                    {WILAYAS.map(w=><option key={w}>{w}</option>)}
                  </select>
                </Input>
              </div>
              <div style={{marginTop:6}}>
                <div className="section-title">معلومات إضافية</div>
                <div className="grid grid-2" style={{gap:"0 16px"}}>
                  <Input label="رقم الهاتف (ذو الحق)"><input className="input" value={chNewBenef.ben_telephone} onChange={e=>updChBen("ben_telephone",e.target.value)} placeholder="05XXXXXXXX" maxLength={10}/></Input>
                  <Input label="العنوان (من البطاقة)"><input className="input" value={chNewBenef.ben_adresse} dir="rtl" onChange={e=>updChBen("ben_adresse",e.target.value)}/></Input>
                </div>
              </div>
              <div className="row-wrap" style={{marginTop:12}}>
                <Btn color="#125950" bg="#d1fae5" onClick={chStepDecision}>✅ تأكيد القرار والمتابعة</Btn>
                <Btn color="#6b7280" bg="#f3f4f6" onClick={cancelChangeMode}>إلغاء</Btn>
              </div>
            </div>
          )}

          {changeStep===4&&(
            <div>
              <Banner bg="#eff6ff" c="#1d4ed8">
                📄 سيُنشأ عقد الكراء الجديد لمدة <strong>سنة واحدة (01)</strong> — رقم الباب: {chNewDoorForm.door_number}
              </Banner>
              {exploitMode==="مستفيد" ? (
                <>
                  <Msg bg="#f0fdf4" c="#166534">✅ صفة الاستغلال «مستفيد» — لا يلزم عقد كراء. اكتمل تغيير رقم الباب.</Msg>
                  <Btn color="#125950" bg="#d1fae5" onClick={()=>{cancelChangeMode(); onSaved();}}>🔙 العودة للوضع العادي</Btn>
                </>
              ) : (<>
              <Input label="الإيجار الشهري (دج)" required>
                <input className="input" style={{width:220}} type="number" min="1" value={monthlyRent}
                  onChange={e=>setMonthlyRent(e.target.value)} placeholder="مثال: 6000" dir="ltr"/>
              </Input>
              <div className="row-wrap" style={{marginTop:12}}>
                <Btn color="#1d4ed8" bg="#dbeafe" onClick={chStepContract}>📄 إنشاء عقد الكراء الجديد (سنة)</Btn>
                <Btn color="#6b7280" bg="#f3f4f6" onClick={cancelChangeMode}>إلغاء</Btn>
              </div>
              </>)}
            </div>
          )}

          {changeStep===5&&(
            <div>
              <DoneBox sub={<>
                  رقم الباب الجديد: <strong>{chNewDoorForm.door_number}</strong>
                  &nbsp;|&nbsp;عقد الكراء: <strong className="mono">{chNewContractNum}</strong>
                  {chNewContractDates&&<>&nbsp;|&nbsp;من: {chNewContractDates.date} → إلى: {chNewContractDates.end}</>}
                </>}>اكتمل تغيير رقم الباب بنجاح!</DoneBox>
              <div className="grid grid-2" style={{gap:10,marginBottom:12}}>
                {terminatedContractId&&(
                  <Btn color="#dc2626" bg="#fee2e2" fullWidth
                    onClick={()=>window.open(api.printRentalContractTermination(terminatedContractId,token),"_blank")}>
                    🖨️ طباعة محضر الفسخ القديم
                  </Btn>
                )}
                <Btn color="#125950" bg="#d1fae5" fullWidth
                  onClick={()=>window.open(api.printRentalContract(profile?.rental?.id||rental.id,token),"_blank")}>
                  🖨️ طباعة عقد الكراء الجديد
                </Btn>
              </div>
              {chChangeDoorReqId&&(
                <Btn color="#7c3aed" bg="#ede9fe" fullWidth style={{marginBottom:8}}
                  onClick={()=>window.open(api.printRequest(chChangeDoorReqId,token),"_blank")}>
                  🖨️ طباعة طلب تغيير رقم الباب
                </Btn>
              )}
              <Btn color="#125950" bg="#d1fae5" fullWidth onClick={cancelChangeMode}>🔙 العودة للوضع العادي</Btn>
            </div>
          )}
        </Section>
      )}
    </div>
  );
}

// ════════════════════════════════════════
// ContractStatus — حالة عقد الكراء الحالي
// ════════════════════════════════════════
function ContractStatus({ rental }) {
  if(!rental?.id) return null;
  const today   = new Date();
  const endStr  = (rental.end_date||"").slice(0,10);
  const startStr= (rental.contract_date||"").slice(0,10);
  const endDate = endStr?new Date(endStr+"T00:00:00"):null;
  const diffDays= endDate?Math.ceil((endDate-today)/86400000):null;
  let tone="success", label="";
  if(diffDays!==null){
    if     (diffDays<0)   {tone="danger"; label=`انتهى منذ ${Math.abs(diffDays)} يوم`;}
    else if(diffDays<=7)  {tone="warning";label=`ينتهي خلال ${diffDays} يوم — يمكن التجديد الآن`;}
    else if(diffDays<=30) {tone="info";   label=`متبقٍ ${diffDays} يوم`;}
    else                  {label=`متبقٍ ${diffDays} يوم`;}
  }
  const pct=endDate&&startStr?Math.max(0,Math.min(100,(1-diffDays/365)*100)):50;
  const colors={success:"var(--success)",warning:"var(--warning)",info:"var(--info)",danger:"var(--danger)"};
  return (
    <div className="card flat" style={{padding:16,marginBottom:16}}>
      <div className="between" style={{marginBottom:10,flexWrap:"wrap"}}>
        <div className="row" style={{gap:10}}>
          <div className={`icon-tile sm tone-${tone}`}><Icon name="fileSignature" size={16}/></div>
          <div>
            <div className="cell-sub">العقد الساري</div>
            <div className="cell-title mono">{rental.contract_number}</div>
          </div>
        </div>
        <Badge tone={tone} dot>{label}</Badge>
      </div>
      {diffDays!==null&&<div className="progress"><span style={{width:`${pct}%`,background:colors[tone]}}/></div>}
      <div className="between cell-sub" style={{marginTop:6}}>
        <span>بدأ: {fmtDate(startStr)||"—"}</span>
        <span>ينتهي: {fmtDate(endStr)||"غير محدد"}</span>
      </div>
    </div>
  );
}

// ════════════════════════════════════════
// StepBar — مؤشر خطوات الإجراء
// ════════════════════════════════════════
function StepBar({ steps, current, done, hasOldContract }) {
  const vis=hasOldContract?steps:steps.filter(s=>s.key!=="terminate");
  return (
    <div style={{display:"flex",alignItems:"flex-start",marginBottom:22,overflowX:"auto",paddingBottom:4}}>
      {vis.map((s,i)=>{
        const isDone=done[s.num]||current>s.num, isCurrent=current===s.num;
        return (
          <div key={s.key} style={{display:"flex",alignItems:"flex-start",flex:i<vis.length-1?1:"none"}}>
            <div style={{textAlign:"center",minWidth:84}}>
              <div style={{width:38,height:38,borderRadius:12,margin:"0 auto 6px",display:"grid",placeItems:"center",
                background:isDone?"var(--brand-600)":isCurrent?"var(--gold-500)":"var(--neutral-bg)",
                color:isDone?"#fff":isCurrent?"#3b2a00":"var(--subtle)",
                boxShadow:isCurrent?"0 0 0 4px var(--gold-100)":"none",transition:"all .2s"}}>
                <Icon name={isDone?"check":s.icon} size={17}/>
              </div>
              <div style={{fontSize:12,color:isCurrent?"var(--ink)":"var(--muted)",fontWeight:isCurrent?700:500,whiteSpace:"nowrap"}}>{s.label}</div>
            </div>
            {i<vis.length-1&&<div style={{flex:1,height:2,borderRadius:2,background:isDone?"var(--brand-500)":"var(--line)",minWidth:20,margin:"18px 4px 0"}}/>}
          </div>
        );
      })}
    </div>
  );
}

// ════════════════════════════════════════
// مكوّنات مساعدة (بنمط نظام التصميم)
// ════════════════════════════════════════
const stripEmoji = t => typeof t === "string" ? t.replace(/^(?:[\s\uFE0F\u200D]|\p{Extended_Pictographic}|[^\p{L}\p{N}«(])+/u, "") : t;
function cleanKids(children) {
  const arr = Array.isArray(children) ? children : [children];
  let first = true;
  return arr.map((c, i) => {
    if (first && typeof c === "string" && c.trim()) { first = false; return stripEmoji(c); }
    if (first && c && typeof c !== "string") first = false;
    return c;
  });
}
const firstText = children => (Array.isArray(children) ? children : [children]).filter(c => typeof c === "string").join(" ");
const ICON_RULES = [["طباعة","printer"],["محضر","printer"],["فسخ","ban"],["إلغاء","x"],["العودة","arrowRight"],["المتابعة","arrowLeft"],
  ["إنشاء","fileSignature"],["تجديد","refresh"],["تغيير","repeat"],["حفظ","check"],["تأكيد","check"],["بدء","play"]];
const pickIcon = t => (ICON_RULES.find(([k]) => t.includes(k)) || [])[1];
const SECTION_ICONS = [["المستفيد","user"],["القرار","fileText"],["عقد الكراء","fileSignature"],["فسخ","ban"],["تغيير رقم الباب","repeat"],
  ["طباعة","printer"],["صفة الاستغلال","shieldCheck"],["رقم الباب","door"]];
const TONE_BY_BG = { "#fef2f2":"danger","#fee2e2":"danger","#f0fdf4":"success","#d1fae5":"success","#eff6ff":"info","#e0f2fe":"info","#dbeafe":"info",
  "#fefce8":"warning","#fef9c3":"warning","#fef3c7":"warning","#fffbeb":"warning" };

function Section({title,children}){
  const t = stripEmoji(title);
  const icon = (SECTION_ICONS.find(([k]) => t.includes(k)) || [])[1] || "door";
  const tone = t.includes("فسخ") ? "danger" : t.includes("تغيير") ? "gold" : t.includes("القرار") ? "info" : "brand";
  return <Card title={t} icon={icon} tone={tone} style={{marginBottom:18}}>{children}</Card>;
}
function Banner({bg,children}){
  return <Alert tone={TONE_BY_BG[bg]||"info"} style={{marginBottom:14}}>{cleanKids(children)}</Alert>;
}
function Msg({bg,children}){
  return <Alert tone={TONE_BY_BG[bg]||"info"} style={{marginBottom:12}}>{cleanKids(children)}</Alert>;
}
const VARIANT_BY_COLOR = { "#dc2626":"danger-soft","#125950":"primary","#1d4ed8":"primary","#6b7280":"secondary","#d97706":"warning-soft",
  "#0369a1":"secondary","#7c3aed":"violet-soft" };
function Btn({color,onClick,disabled,fullWidth,topMargin,children}){
  const txt = firstText(children);
  let variant = VARIANT_BY_COLOR[color] || "secondary";
  if (variant === "primary" && txt.includes("طباعة")) variant = "secondary";
  return (
    <Button variant={variant} icon={pickIcon(txt)} onClick={onClick} disabled={disabled} block={fullWidth}
      style={{marginTop:topMargin?10:4}}>{cleanKids(children)}</Button>
  );
}
function DoneBox({children,sub}){
  return (
    <div style={{textAlign:"center",padding:"22px 16px",marginBottom:16,borderRadius:16,background:"var(--success-bg)",border:"1px solid var(--success-line)"}}>
      <div className="icon-tile lg tone-success" style={{margin:"0 auto 10px"}}><Icon name="checkCircle" size={26}/></div>
      <div style={{fontSize:16,fontWeight:700,color:"var(--success)"}}>{children}</div>
      {sub&&<div style={{fontSize:13,color:"var(--text-2)",marginTop:6}}>{sub}</div>}
    </div>
  );
}
