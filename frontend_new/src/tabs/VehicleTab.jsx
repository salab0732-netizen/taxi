import { useState, useEffect } from "react";
import { api, fileToBase64, WILAYAS } from "../api.js";
import { SaveBtn, SuccessMsg, ErrorMsg } from "../App.jsx";
import { Card, Field, TextInput, Select, Dropzone, Alert, Button, Badge, DescList, fmtDate, confirmDialog } from "../ui/kit.jsx";

// تحويل رموز الطاقة في البطاقة الرمادية إلى القيم المعتمدة في النظام
function normEnergie(e) {
  if (!e) return e;
  const k = String(e).trim().toUpperCase();
  const MAP = { ES:"بنزين", ESS:"بنزين", ESSENCE:"بنزين", SP:"بنزين",
                GO:"غازوال", GAZOIL:"غازوال", GASOIL:"غازوال", DIESEL:"غازوال",
                GPL:"غاز", GN:"غاز", EL:"كهرباء", ELEC:"كهرباء", HY:"هجين", EH:"هجين", GH:"هجين" };
  return MAP[k] || e;
}

const COLOR = "#125950";
const ENERGIES = ["بنزين", "غازوال", "غاز", "كهرباء", "هجين"];


export default function VehicleTab({ token, profile, onSaved }) {
  const veh = profile?.vehicle || {};
  // تحقق بالـid وليس فقط رقم التسجيل — المركبة موجودة حتى لو كان الرقم فارغاً
  const hasVehicle = !!(veh.id || veh.num_immatriculation);

  const [mode, setMode] = useState("loading");
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    // فقط عند التحميل الأول (mode === "loading") — لا تتدخل في التحولات اللاحقة
    if (profile !== null && mode === "loading") {
      setMode(hasVehicle ? "view" : "edit");
    }
  }, [profile]);

  const emptyForm = {
    num_immatriculation:"", num_precedent:"", marque:"", type_vehicule:"",
    num_serie:"", genre:"", carrosserie:"", energie:"", puissance:"",
    nb_places:"", poids_total:"", charge_utile:"", annee_circulation:"",
    date_delivrance:"", lieu_delivrance:"", wilaya_delivrance:"",
    quittance_num:"", quittance_montant:"", quittance_date:"",
    proprietaire_nom_ar:"", proprietaire_prenom_ar:"",
    proprietaire_nom:"", proprietaire_prenom:"",
    proprietaire_dob:"", proprietaire_lieu:"",
    proprietaire_adresse:"", proprietaire_commune:"", proprietaire_wilaya:"",
    profession:"",
  };

  const [form, setForm] = useState(emptyForm);
  const [imgB64,     setImgB64]     = useState(null);
  const [imgPdf,     setImgPdf]     = useState(false);
  const [preview,    setPreview]    = useState(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrDone,    setOcrDone]    = useState(false);
  const [ocrGotData, setOcrGotData] = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [success,    setSuccess]    = useState("");
  const [error,      setError]      = useState("");

  // طلب تغيير المركبة
  const [reqLoading,  setReqLoading]  = useState(false);
  const [printLoading,setPrintLoading]= useState(false);
  const [reqId,       setReqId]       = useState(profile?.change_vehicle_request?.id || null);
  const [oldVeh,      setOldVeh]      = useState({});  // المركبة القديمة قبل التغيير

  const upd = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // قيمة فارغة = "" أو null أو undefined أو 0 أو "0"
  const isEmpty = (key) => {
    const v = form[key];
    return v === "" || v === null || v === undefined || v === 0 || v === "0";
  };
  // style للحقل: أحمر فقط للحقول الإلزامية الفارغة بعد OCR
  const invalid = (key) => ocrDone && isEmpty(key) && REQUIRED_KEYS.has(key);

  async function handleImage(file) {
    const isPdfFile = file.type === "application/pdf";
    setImgPdf(isPdfFile);
    setPreview(isPdfFile ? null : URL.createObjectURL(file));
    setOcrLoading(true);
    const { data, mimeType } = await fileToBase64(file);
    setImgB64(data);
    try {
      const r = await api.ocrCarteGrise(token, data, mimeType);
      console.log("[OCR] response:", JSON.stringify(r).slice(0, 500));
      if (r.ocr && !r.ocr.error) {
        const o = r.ocr;
        setOcrGotData(true);
        setForm(prev => ({
          ...prev,
          num_immatriculation:    o.num_immatriculation    || prev.num_immatriculation,
          num_precedent:          o.num_precedent          || prev.num_precedent,
          marque:                 o.marque                 || prev.marque,
          type_vehicule:          o.type_vehicule          || prev.type_vehicule,
          num_serie:              o.num_serie              || prev.num_serie,
          genre:                  o.genre                  || prev.genre,
          carrosserie:            o.carrosserie            || prev.carrosserie,
          energie:                normEnergie(o.energie)   || prev.energie,
          puissance:              o.puissance              || prev.puissance,
          nb_places:              (o.nb_places   && o.nb_places   !== "0") ? o.nb_places   : prev.nb_places,
          poids_total:            (o.poids_total && o.poids_total !== "0") ? o.poids_total : prev.poids_total,
          charge_utile:           (o.charge_utile&& o.charge_utile!== "0") ? o.charge_utile: prev.charge_utile,
          annee_circulation:      o.annee_circulation      || prev.annee_circulation,
          date_delivrance:        o.date_delivrance        || prev.date_delivrance,
          lieu_delivrance:        o.lieu_delivrance        || prev.lieu_delivrance,
          wilaya_delivrance:      o.wilaya_delivrance      || prev.wilaya_delivrance,
          quittance_num:          o.quittance_num          || prev.quittance_num,
          quittance_montant:      o.quittance_montant      || prev.quittance_montant,
          quittance_date:         o.quittance_date         || prev.quittance_date,
          proprietaire_nom_ar:    o.proprietaire_nom_ar    || prev.proprietaire_nom_ar,
          proprietaire_prenom_ar: o.proprietaire_prenom_ar || prev.proprietaire_prenom_ar,
          proprietaire_nom:       o.proprietaire_nom       || prev.proprietaire_nom,
          proprietaire_prenom:    o.proprietaire_prenom    || prev.proprietaire_prenom,
          proprietaire_dob:       o.proprietaire_dob       || prev.proprietaire_dob,
          proprietaire_lieu:      o.proprietaire_lieu      || prev.proprietaire_lieu,
          proprietaire_adresse:   o.proprietaire_adresse   || prev.proprietaire_adresse,
          proprietaire_commune:   o.proprietaire_commune   || prev.proprietaire_commune,
          proprietaire_wilaya:    o.proprietaire_wilaya    || prev.proprietaire_wilaya,
          profession:             o.profession             || prev.profession,
        }));
      }
    } catch(err) { console.error("[OCR] exception:", err); }
    setOcrDone(true);
    setOcrLoading(false);
  }

  function startChange() {
    setShowConfirm(false);
    setOldVeh({...veh});   // احفظ المركبة القديمة قبل مسح النموذج
    setForm(emptyForm);
    setImgB64(null); setPreview(null); setOcrDone(false); setOcrGotData(false);
    setSuccess(""); setError("");
    setReqId(null);        // إعادة ضبط reqId — الطلب الجديد سيُنشأ عند الحفظ
    setMode("edit");
  }

  function cancelChange() {
    setMode("view");
    setSuccess(""); setError("");
  }

  // الحقول الأساسية التي يجب أن يقرأها OCR
  const REQUIRED_FIELDS = [
    { key: "num_immatriculation", label: "رقم التسجيل" },
    { key: "marque",              label: "الصنف" },
    { key: "num_serie",           label: "رقم التسلسلي في الطراز" },
    { key: "nb_places",           label: "عدد المقاعد" },
  ];
  const REQUIRED_KEYS = new Set(REQUIRED_FIELDS.map(f => f.key));

  async function save() {
    setError(""); setSuccess(""); setSaving(true);

    // 1. يجب رفع الصورة أولاً — لا إدخال يدوي
    if (!imgB64) {
      setError("⚠️ يجب رفع صورة البطاقة الرمادية أولاً — البيانات تُدخل تلقائياً عبر OCR فقط");
      setSaving(false); return;
    }

    // 2. التحقق من الحقول الأساسية
    const missing = REQUIRED_FIELDS.filter(f => !form[f.key]).map(f => f.label);
    if (missing.length > 0) {
      setError(`⚠️ الحقول التالية لم يقرأها OCR — صحّحها يدوياً قبل الحفظ: ${missing.join("، ")}`);
      setSaving(false); return;
    }

    // احفظ بيانات المركبة القديمة قبل الحفظ
    // oldVeh: محفوظة بـ startChange — أدق من veh الذي قد يكون قديماً (stale)
    const oldVehSnapshot = (oldVeh && oldVeh.num_immatriculation) ? {...oldVeh} : {...veh};
    const newVehSnapshot = {...form};

    try {
      const r = await api.saveVehicle(token, {
        ...form, image_carte_grise_base64: imgB64,
      });
      setSaving(false);
      if (r.success) {
        // أنشئ الطلب الرسمي تلقائياً بالبيانات الصحيحة (قبل تحديث profile)
        if (!reqId) {
          const reqPayload = {
            request_type: "تغيير_سيارة",
            current_num_immatriculation: oldVehSnapshot.num_immatriculation || "",
            current_marque:              oldVehSnapshot.marque              || "",
            current_type_vehicule:       oldVehSnapshot.type_vehicule       || "",
            current_num_serie:           oldVehSnapshot.num_serie           || "",
            current_annee_circulation:   oldVehSnapshot.annee_circulation   || "",
            new_num_immatriculation:     newVehSnapshot.num_immatriculation || "",
            new_marque:                  newVehSnapshot.marque              || "",
            new_type_vehicule:           newVehSnapshot.type_vehicule       || "",
            new_num_serie:               newVehSnapshot.num_serie           || "",
            new_annee_circulation:       newVehSnapshot.annee_circulation   || "",
            num_immatriculation: oldVehSnapshot.num_immatriculation || "",
            marque:              oldVehSnapshot.marque              || "",
          };
          const reqR = await api.createRequest(token, reqPayload);
          if (reqR.success) {
            setReqId(reqR.request_id);
            setSuccess(`تم حفظ المركبة الجديدة ✅ — طلب التغيير مُنشأ: ${reqR.request_number}`);
          } else {
            setSuccess("تم حفظ المركبة الجديدة ✅ — المركبة القديمة أُرشفت تلقائياً");
          }
        } else {
          setSuccess("تم حفظ المركبة الجديدة ✅ — المركبة القديمة أُرشفت تلقائياً");
        }
        // انتظر تحديث الـprofile ثم انتقل لوضع العرض
        await onSaved();
        setMode("view");
      } else setError(r.error || "خطأ في الحفظ");
    } catch {
      setSaving(false);
      setError("❌ خطأ في الاتصال بالخادم — تأكد من الاتصال وحاول مجدداً");
    }
  }

  // ── بناء payload الطلب مع بيانات المركبتين ──
  function buildRequestPayload() {
    // oldVeh = المركبة قبل التغيير (محفوظة في startChange)
    // veh    = المركبة الحالية في DB (بعد الحفظ أصبحت الجديدة)
    const cur = (oldVeh && oldVeh.num_immatriculation) ? oldVeh : veh;
    const nw  = (form.num_immatriculation) ? form : veh;
    return {
      request_type: "تغيير_سيارة",
      // المركبة الحالية (القديمة)
      current_num_immatriculation: cur.num_immatriculation || "",
      current_marque:              cur.marque              || "",
      current_type_vehicule:       cur.type_vehicule       || "",
      current_num_serie:           cur.num_serie           || "",
      current_annee_circulation:   cur.annee_circulation   || "",
      // المركبة الجديدة
      new_num_immatriculation: nw.num_immatriculation || "",
      new_marque:              nw.marque              || "",
      new_type_vehicule:       nw.type_vehicule       || "",
      new_num_serie:           nw.num_serie           || "",
      new_annee_circulation:   nw.annee_circulation   || "",
      // للتوافق مع الكود القديم
      num_immatriculation: cur.num_immatriculation || "",
      marque:              cur.marque              || "",
    };
  }

  // إنشاء طلب تغيير المركبة فقط
  async function createChangeRequest() {
    setError(""); setReqLoading(true);
    const r = await api.createRequest(token, buildRequestPayload());
    setReqLoading(false);
    if (r.success) {
      setReqId(r.request_id);
      setSuccess(`تم إنشاء طلب تغيير المركبة ✅ — رقم: ${r.request_number}`);
      onSaved();
      return r.request_id;
    } else {
      setError(r.error || "خطأ في إنشاء الطلب");
      return null;
    }
  }

  // إنشاء الطلب وطباعته مباشرة في خطوة واحدة
  async function createAndPrint() {
    setError(""); setPrintLoading(true);
    let id = reqId;
    if (!id) {
      const r = await api.createRequest(token, buildRequestPayload());
      if (r.success) {
        setReqId(r.request_id);
        setSuccess(`تم إنشاء طلب تغيير المركبة ✅ — رقم: ${r.request_number}`);
        onSaved();
        id = r.request_id;
      } else {
        setError(r.error || "خطأ في إنشاء الطلب");
        setPrintLoading(false);
        return;
      }
    }
    setPrintLoading(false);
    window.open(api.printRequest(id, token), "_blank");
  }

  // ══════════════════════════════════════════
  if (mode === "loading") return null;

  // ══════════════════════════════════════════
  // وضع العرض
  // ══════════════════════════════════════════
  if (mode === "view") {
    async function askChange() {
      const ok = await confirmDialog({ title: "تغيير المركبة", icon: "repeat", tone: "warning", confirmLabel: "متابعة التغيير",
        message: "ستُدخل مركبة جديدة عبر البطاقة الرمادية. عند الحفظ تُؤرشَف المركبة الحالية تلقائياً ويُنشأ طلب تغيير المركبة للإدارة." });
      if (ok) startChange();
    }
    return (
      <div className="stack">
        <Card title="المركبة الحالية" subtitle="بيانات البطاقة الرمادية المسجّلة في ملفك" icon="car" tone="info"
          actions={<Button variant="secondary" size="sm" icon="repeat" onClick={askChange}>تغيير المركبة</Button>}>
          <div className="row" style={{ gap: 16, marginBottom: 18, flexWrap: "wrap" }}>
            <div style={{ border: "2px solid var(--ink)", borderRadius: 8, padding: "6px 16px", fontFamily: "var(--mono)", fontWeight: 700, fontSize: 20, letterSpacing: ".06em", background: "#fff" }} className="ltr">
              {veh.num_immatriculation || "—"}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 17, color: "var(--ink)" }}>{veh.marque || "—"} {veh.type_vehicule || ""}</div>
              <div className="muted" style={{ fontSize: 13 }}>{[veh.annee_circulation, veh.energie, veh.nb_places && `${veh.nb_places} مقاعد`].filter(Boolean).join(" · ")}</div>
            </div>
          </div>
          <DescList items={[
              { label: "الرقم التسلسلي في الطراز", value: veh.num_serie, ltr: true },
              { label: "النوع", value: veh.genre }, { label: "الهيكل", value: veh.carrosserie },
              { label: "القوة", value: veh.puissance },
              { label: "تاريخ التسليم", value: fmtDate(veh.date_delivrance) }, { label: "ولاية التسليم", value: veh.wilaya_delivrance },
              { label: "المالك", value: `${veh.proprietaire_prenom_ar || ""} ${veh.proprietaire_nom_ar || ""}`.trim() },
              { label: "الرقم السابق", value: veh.num_precedent, ltr: true },
            ]}/>
        </Card>

        <Card title="طلب تغيير المركبة" subtitle="الطلب الرسمي المقدَّم للإدارة — يُطبع ويُودَع" icon="fileText">
          {reqId ? (
            <Alert tone="success" title="طلب التغيير مُنشأ"
              action={<Button size="sm" variant="secondary" icon="printer" onClick={() => window.open(api.printRequest(reqId, token), "_blank")}>طباعة</Button>}>
              يمكنك طباعته مجدداً في أي وقت.
            </Alert>
          ) : (
            <div className="between" style={{ flexWrap: "wrap" }}>
              <span className="muted" style={{ fontSize: 13.5 }}>أنشئ الطلب الرسمي لتغيير المركبة واطبعه مباشرة.</span>
              <Button icon="printer" loading={printLoading} onClick={createAndPrint}>إنشاء وطباعة الطلب</Button>
            </div>
          )}
        </Card>
        <div><ErrorMsg msg={error}/><SuccessMsg msg={success}/></div>
      </div>
    );
  }

  // ══════════════════════════════════════════
  // وضع الإدخال — مركبة جديدة
  // ══════════════════════════════════════════
  const T = (key, label, { required, type = "text", ltr, ...rest } = {}) => (
    <Field label={label} required={required} error={invalid(key) ? "لم يُقرأ آلياً — أدخله يدوياً" : undefined}>
      <TextInput type={type} value={form[key]} invalid={invalid(key)} dir={ltr ? "ltr" : undefined}
        placeholder={ocrDone ? "" : "يُملأ آلياً من البطاقة"} onChange={e => upd(key, e.target.value)} {...rest}/>
    </Field>
  );
  const W = (key, label) => (
    <Field label={label}>
      <Select value={form[key]} onChange={e => upd(key, e.target.value)}>
        <option value="">— اختر —</option>
        {WILAYAS.map(w => <option key={w}>{w}</option>)}
      </Select>
    </Field>
  );

  return (
    <div className="stack">
      {hasVehicle && (
        <Alert tone="warning" icon="repeat" title="إدخال مركبة جديدة"
          action={<Button size="sm" variant="secondary" icon="x" onClick={cancelChange}>إلغاء التغيير</Button>}>
          المركبة الحالية <b className="ltr">{veh.num_immatriculation}</b> ({veh.marque || ""} {veh.type_vehicule || ""}) ستُؤرشَف عند الحفظ.
        </Alert>
      )}

      <Card title="البطاقة الرمادية" subtitle="ارفع صورة البطاقة — تُستخرج البيانات آلياً ويمكنك تصحيحها" icon="scan" tone="info">
        <Dropzone label="ارفع صورة البطاقة الرمادية" icon="scan" preview={preview} isPdf={imgPdf}
          loading={ocrLoading} loadingText="جارٍ قراءة البطاقة الرمادية..." onFile={handleImage}/>
        {!ocrLoading && ocrDone && ocrGotData && <Alert tone="success" style={{ marginTop: 12 }}>تم استخراج البيانات — راجعها وصحّح أي خطأ قبل الحفظ.</Alert>}
        {!ocrLoading && ocrDone && !ocrGotData && <Alert tone="warning" style={{ marginTop: 12 }} title="تعذّرت القراءة الآلية">تحقق من وضوح الصورة وأعد المحاولة، أو أكمل الحقول يدوياً.</Alert>}
        {!ocrLoading && !ocrDone && !imgB64 && <Alert tone="info" style={{ marginTop: 12 }}>رفع صورة البطاقة الرمادية إلزامي قبل الحفظ.</Alert>}
      </Card>

      <Card title="بيانات تسجيل المركبة" icon="car" tone="info">
        <div className="grid grid-3">
          {T("num_immatriculation", "رقم التسجيل", { required: true, ltr: true })}
          {T("num_precedent", "الرقم السابق", { ltr: true })}
          {T("marque", "الصنف — MARQUE", { required: true })}
          {T("type_vehicule", "الطراز — TYPE")}
          {T("num_serie", "الرقم التسلسلي في الطراز", { required: true, ltr: true })}
          {T("genre", "النوع — GENRE")}
          {T("carrosserie", "الهيكل — CARROSSERIE")}
          <Field label="الطاقة — ENERGIE">
            <Select value={ENERGIES.includes(form.energie) ? form.energie : (form.energie ? "__other__" : "")}
              onChange={e => { if (e.target.value !== "__other__") upd("energie", e.target.value); }}>
              <option value="">— اختر —</option>
              {ENERGIES.map(en => <option key={en}>{en}</option>)}
              {form.energie && !ENERGIES.includes(form.energie) && <option value="__other__">{form.energie} (قراءة آلية)</option>}
            </Select>
          </Field>
          {T("puissance", "القوة — PUISSANCE")}
          {T("nb_places", "عدد المقاعد", { required: true, type: "number", min: 1, max: 60 })}
          {T("poids_total", "جملة الحمولة")}
          {T("charge_utile", "الحمولة المقيدة")}
          {T("annee_circulation", "سنة أول استعمال")}
          {T("date_delivrance", "تاريخ التسليم", { type: "date" })}
          {T("lieu_delivrance", "مكان التسليم")}
          {W("wilaya_delivrance", "ولاية التسليم")}
        </div>
      </Card>

      <Card title="الوصل — QUITTANCE" icon="wallet" tone="gold">
        <div className="grid grid-3">
          {T("quittance_num", "رقم الوصل", { ltr: true })}
          {T("quittance_montant", "المبلغ (دج)")}
          {T("quittance_date", "التاريخ", { type: "date" })}
        </div>
      </Card>

      <Card title="بيانات المالك" subtitle="إذا كان السائق هو المالك أدخل بياناته هنا أيضاً" icon="user">
        <div className="grid grid-2">
          {T("proprietaire_nom_ar", "اللقب (عربي)")}
          {T("proprietaire_prenom_ar", "الاسم (عربي)")}
          {T("proprietaire_nom", "Nom", { ltr: true })}
          {T("proprietaire_prenom", "Prénom", { ltr: true })}
          {T("proprietaire_dob", "تاريخ الميلاد", { type: "date" })}
          {T("proprietaire_lieu", "مكان الميلاد")}
          {T("proprietaire_adresse", "العنوان")}
          {T("proprietaire_commune", "البلدية")}
          {W("proprietaire_wilaya", "الولاية")}
          {T("profession", "المهنة")}
        </div>
      </Card>

      <div>
        <ErrorMsg msg={error}/>
        <SuccessMsg msg={success}/>
        <SaveBtn onClick={save} loading={saving}
          label={hasVehicle ? "حفظ المركبة الجديدة وأرشفة الحالية" : "حفظ بيانات المركبة"}/>
      </div>
    </div>
  );
}
