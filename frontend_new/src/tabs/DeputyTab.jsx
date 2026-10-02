import { useState } from "react";
import { api, fileToBase64, WILAYAS } from "../api.js";
import { SaveBtn, SuccessMsg, ErrorMsg } from "../App.jsx";
import { Card, Field, TextInput, Select, Dropzone, Alert, Button, Badge, DescList, Avatar, EmptyState, fmtDate, confirmDialog } from "../ui/kit.jsx";
import Icon from "../ui/Icon.jsx";

export default function DeputyTab({ token, profile, onSaved }) {
  const deputy    = profile?.deputy || {};
  const hasDeputy = !!deputy.num_permis;

  const [mode,        setMode]        = useState(hasDeputy ? "view" : "edit");
  const [showConfirm, setShowConfirm] = useState(false);

  const emptyForm = {
    nom_ar:"", prenom_ar:"", nom_fr:"", prenom_fr:"",
    date_naissance:"", lieu_naissance:"", nin:"",
    num_permis:"", categories_permis:[],
    date_delivrance_permis:"", date_expiration_permis:"",
    wilaya_permis:"", lieu_delivrance_permis:"",
    telephone:"", adresse:"",
  };
  const [form, setForm] = useState(emptyForm);

  const [permisRectoB64,  setPermisRectoB64]  = useState(null);
  const [permisVersob64,  setPermisVersob64]  = useState(null);
  const [permisPrev,      setPermisPrev]      = useState(null);
  const [permisVersoPrev, setPermisVersoPrev] = useState(null);
  const [permisPdf,       setPermisPdf]       = useState(false);
  const [permisVersoPdf,  setPermisVersoPdf]  = useState(false);
  const [ocrLoading,      setOcrLoading]      = useState(false);
  const [ocrDone,         setOcrDone]         = useState(false);
  const [isSaved,          setIsSaved]          = useState(false);

  const [saving,          setSaving]          = useState(false);
  const [contractLoading, setContractLoading] = useState(false);
  const [terminateLoading,setTerminateLoading]= useState(false);
  const [justTerminated,   setJustTerminated]  = useState(false);
  const [contractId,      setContractId]      = useState(profile?.deputy_contract?.id || null);
  const [contractNum,     setContractNum]     = useState(profile?.deputy_contract?.contract_number || "");
  const [success,         setSuccess]         = useState("");
  const [error,           setError]           = useState("");

  const updManual = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // ══════════════════════════════════════════
  // OCR رخصة السياقة
  // ══════════════════════════════════════════
  async function handlePermisRecto(file) {
    const isPdfFile = file.type === "application/pdf";
    setPermisPdf(isPdfFile);
    setPermisPrev(isPdfFile ? null : URL.createObjectURL(file));
    setOcrLoading(true); setError(""); setOcrDone(false);
    try {
      const { data, mimeType } = await fileToBase64(file);
      setPermisRectoB64(data);
      const r = await api.ocrPermis(token, data, mimeType);
      if (r.ocr && !r.ocr.error) {
        const o = r.ocr;
        setForm(p => ({
          ...p,
          nom_ar:                 o.nom_ar              || p.nom_ar,
          prenom_ar:              o.prenom_ar            || p.prenom_ar,
          nom_fr:                 o.nom_fr              || p.nom_fr,
          prenom_fr:              o.prenom_fr            || p.prenom_fr,
          date_naissance:         o.date_naissance       || p.date_naissance,
          lieu_naissance:         o.lieu_naissance       || p.lieu_naissance,
          nin:                    o.nin                  || p.nin,
          num_permis:             o.num_permis           || p.num_permis,
          categories_permis:      Array.isArray(o.categories) && o.categories.length
                                    ? o.categories : p.categories_permis,
          date_delivrance_permis: o.date_delivrance      || p.date_delivrance_permis,
          date_expiration_permis: o.date_expiration      || p.date_expiration_permis,
          wilaya_permis:          o.wilaya_delivrance    || p.wilaya_permis,
          lieu_delivrance_permis: o.lieu_delivrance      || p.lieu_delivrance_permis,
        }));
        setOcrDone(true);
      } else {
        setError("لم يتم استخراج البيانات — تحقق من جودة الصورة");
      }
    } catch { setError("خطأ في الاتصال بخدمة OCR"); }
    setOcrLoading(false);
  }

  async function handlePermisVerso(file) {
    const isPdfFile = file.type === "application/pdf";
    setPermisVersoPdf(isPdfFile);
    setPermisVersoPrev(isPdfFile ? null : URL.createObjectURL(file));
    const { data } = await fileToBase64(file);
    setPermisVersob64(data);
  }

  function resetOcr() {
    setPermisPrev(null); setPermisRectoB64(null);
    setPermisVersob64(null); setPermisVersoPrev(null);
    setOcrDone(false);
    setIsSaved(false);
    setForm(p => ({ ...p,
      nom_ar:"", prenom_ar:"", nom_fr:"", prenom_fr:"",
      date_naissance:"", lieu_naissance:"", nin:"",
      num_permis:"", categories_permis:[],
      date_delivrance_permis:"", date_expiration_permis:"",
      wilaya_permis:"", lieu_delivrance_permis:"",
    }));
  }

  function startChange() {
    setShowConfirm(false);
    setForm(emptyForm);
    setIsSaved(false);
    resetOcr();
    setSuccess(""); setError("");
    setMode("edit");
  }

  function cancelChange() {
    setMode("view");
    setSuccess(""); setError("");
    resetOcr();
  }

  // ══════════════════════════════════════════
  // حفظ المناوب
  // ══════════════════════════════════════════
  async function save() {
    setError(""); setSuccess(""); setSaving(true);
    if (!form.num_permis)          { setError("ارفع رخصة السياقة أولاً — رقمها مطلوب"); setSaving(false); return; }
    if (!form.nom_ar || !form.prenom_ar) { setError("اللقب والاسم مطلوبان"); setSaving(false); return; }
    const catsOk = Array.isArray(form.categories_permis) ? form.categories_permis.length > 0 : !!form.categories_permis;
    const missing = [
      !form.nin && "NIN", !catsOk && "فئات الرخصة",
      !form.date_expiration_permis && "تاريخ انتهاء الرخصة",
      !form.telephone && "رقم الهاتف", !form.adresse && "العنوان",
    ].filter(Boolean);
    if (missing.length) { setError("حقول مطلوبة: " + missing.join("، ")); setSaving(false); return; }
    const r = await api.saveDeputy(token, {
      ...form,
      image_permis_recto_base64: permisRectoB64,
      image_permis_verso_base64: permisVersob64,
    });
    setSaving(false);
    if (r.success) {
      setSuccess("تم حفظ بيانات المناوب الجديد ✅");
      setIsSaved(true);
      setContractId(null); setContractNum("");
      onSaved(); setMode("view");
    } else { setError(r.error || "خطأ في الحفظ"); }
  }

  // ══════════════════════════════════════════
  // إنشاء العقد + إرسال طلب تصريح_مناوب للمدير
  // ══════════════════════════════════════════
  async function createContract() {
    setError(""); setContractLoading(true);

    // الخطوة 1: إنشاء عقد المناوب
    const r = await api.createDeputyContract(token);
    if (!r.success) {
      setContractLoading(false);
      setError(r.error || "خطأ في إنشاء العقد");
      return;
    }
    const newContractId  = r.contract_id;
    const newContractNum = r.contract_number;
    setContractId(newContractId);
    setContractNum(newContractNum);

    // الخطوة 2: إرسال طلب تصريح_مناوب ليظهر في تبويب الإدارة (الطلبات)
    const dep = profile?.deputy || {};
    const permitReq = await api.submitRequest(token, {
      request_type:      "تصريح_مناوب",
      deputy_nom_ar:     dep.nom_ar,
      deputy_prenom_ar:  dep.prenom_ar,
      deputy_nin:        dep.nin,
      deputy_num_permis: dep.num_permis,
      deputy_expiration: dep.date_expiration_permis,
      notes: `عقد المناوب رقم ${newContractNum} — ينتهي: ${r.end_date}`,
    });

    setContractLoading(false);
    if (permitReq?.error) {
      setError(`تم إنشاء العقد ${newContractNum} لكن تعذّر إرسال طلب التصريح: ${permitReq.error}`);
    } else {
      setSuccess(`تم إنشاء العقد وإرسال الطلب للإدارة ✅ — رقم العقد: ${newContractNum} — الطلب: ${permitReq?.request_number || ""}`);
    }
    onSaved();
  }

  // ══════════════════════════════════════════
  // فسخ العقد فعلياً في قاعدة البيانات ثم الطباعة
  // ══════════════════════════════════════════
  async function terminateAndPrint() {
    if (!(await confirmDialog({ title: "فسخ عقد المناوب", danger: true, confirmLabel: "فسخ العقد",
      message: "سيُفسخ العقد فوراً ويُؤرشف المناوب وتُلغى رخصة السائق الإضافي، ثم يُفتح محضر الفسخ للطباعة." }))) return;

    setError(""); setTerminateLoading(true);

    // الخطوة 1: فسخ العقد في قاعدة البيانات
    const BASE_URL = window.location.hostname === "localhost"
      ? ""
      : window.location.origin;

    const r = await fetch(`${BASE_URL}/api/driver/deputy-contract/terminate`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "X-Token": token },
      body:    "{}",
    }).then(x => x.json()).catch(() => ({ error: "خطأ في الاتصال بالخادم" }));

    if (r.error) {
      setTerminateLoading(false);
      setError(r.error);
      return;
    }

    // الخطوة 2: طباعة محضر الفسخ (بالـ contractId الحالي قبل مسحه)
    window.open(api.printDeputyContractTermination(contractId, token), "_blank");

    setTerminateLoading(false);
    setJustTerminated(true);  // اختياري: المناوب الجديد ليس إلزامياً
    setSuccess("تم فسخ عقد المناوب وأرشفته ✅");

    // تحديث الحالة المحلية
    setContractId(null);
    setContractNum("");
    onSaved();
  }

  const cats    = Array.isArray(form.categories_permis) ? form.categories_permis.join("، ") : form.categories_permis || "";
  const depCats = (() => {
    let c = deputy.categories_permis;
    if (typeof c === "string" && c.trim().startsWith("[")) { try { c = JSON.parse(c); } catch { /* نص عادي */ } }
    return Array.isArray(c) ? c.join("، ") : (c || "—");
  })();

  // ══════════════════════════════════════════
  // وضع العرض (مناوب موجود)
  // ══════════════════════════════════════════
  if (justTerminated) {
    return (
      <Card>
        <EmptyState icon="checkCircle" tone="success" title="تم فسخ عقد المناوب بنجاح"
          text="يمكنك إضافة مناوب جديد في أي وقت — ليس إلزامياً الآن."
          action={<div className="row-wrap" style={{ justifyContent: "center", marginTop: 8 }}>
            <Button icon="userPlus" onClick={() => { setJustTerminated(false); setMode("edit"); }}>إضافة مناوب جديد</Button>
            <Button variant="secondary" onClick={() => setJustTerminated(false)}>لاحقاً</Button>
          </div>}/>
      </Card>
    );
  }

  if (mode === "view") {
    const fullName = `${deputy.prenom_ar || ""} ${deputy.nom_ar || ""}`.trim();
    const expired = deputy.date_expiration_permis && deputy.date_expiration_permis < new Date().toISOString().slice(0, 10);
    async function askChange() {
      const ok = await confirmDialog({ title: "تغيير المناوب", icon: "repeat", tone: "warning", confirmLabel: "متابعة",
        message: "سيُؤرشف المناوب الحالي وعقده عند حفظ المناوب الجديد." });
      if (ok) startChange();
    }
    return (
      <div className="stack">
        <Card title="السائق المناوب الحالي" icon="userPlus" tone="violet"
          actions={<Button size="sm" variant="secondary" icon="repeat" onClick={askChange}>تغيير المناوب</Button>}>
          <div className="row" style={{ gap: 14, marginBottom: 16, flexWrap: "wrap" }}>
            <Avatar name={fullName} size={52}/>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: "var(--ink)" }}>{fullName || "—"}</div>
              <div className="row-wrap" style={{ gap: 6, marginTop: 4 }}>
                <Badge size="sm" icon="idCard">رخصة {deputy.num_permis}</Badge>
                <Badge size="sm" tone={expired ? "danger" : "success"} dot>{expired ? "رخصة منتهية" : `صالحة إلى ${fmtDate(deputy.date_expiration_permis)}`}</Badge>
                {contractId ? <Badge size="sm" tone="info" icon="fileSignature">عقد {contractNum}</Badge> : <Badge size="sm" tone="warning">لا يوجد عقد</Badge>}
              </div>
            </div>
          </div>
          <DescList items={[
              { label: "Nom / Prénom", value: `${deputy.nom_fr || ""} ${deputy.prenom_fr || ""}`.trim(), ltr: true },
              { label: "تاريخ الميلاد", value: fmtDate(deputy.date_naissance) },
              { label: "مكان الميلاد", value: deputy.lieu_naissance },
              { label: "رقم التعريف", value: deputy.nin, ltr: true },
              { label: "الهاتف", value: deputy.telephone, ltr: true },
              { label: "فئات الرخصة", value: depCats },
              { label: "تاريخ الإصدار", value: fmtDate(deputy.date_delivrance_permis) },
              { label: "ولاية الإصدار", value: deputy.wilaya_permis },
              { label: "العنوان", value: deputy.adresse },
            ]}/>
        </Card>

        <Card title="عقد العمل والوثائق" subtitle="عقد لمدة سنة — إنشاؤه يرسل طلب التصريح بالمناوب للإدارة تلقائياً" icon="fileSignature">
          {!contractId ? (
            <div className="stack-sm">
              <Alert tone="info">لا يوجد عقد عمل ساري لهذا المناوب. أنشئ العقد ليُرسَل طلب التصريح للإدارة وتصدر رخصة السائق الإضافي بعد الموافقة.</Alert>
              <SaveBtn onClick={createContract} loading={contractLoading} icon="fileSignature" label="إنشاء عقد المناوب وإرسال الطلب للإدارة"/>
            </div>
          ) : (
            <div className="stack-sm">
              <div className="grid grid-2" style={{ gap: 10 }}>
                <Button variant="secondary" icon="printer" onClick={() => window.open(api.printDeputyJobRequest(contractId, token), "_blank")}>طلب التوظيف</Button>
                <Button variant="secondary" icon="fileSignature" onClick={() => window.open(api.printDeputyContract(contractId, token), "_blank")}>عقد العمل</Button>
              </div>
              <div className="divider-line" style={{ margin: "8px 0" }}/>
              <div className="between" style={{ flexWrap: "wrap" }}>
                <span className="muted" style={{ fontSize: 13 }}>إنهاء العقد يؤرشف المناوب ويلغي رخصة السائق الإضافي.</span>
                <Button variant="danger-soft" icon="ban" loading={terminateLoading} onClick={terminateAndPrint}>فسخ العقد وطباعة المحضر</Button>
              </div>
            </div>
          )}
        </Card>
        <div><ErrorMsg msg={error}/><SuccessMsg msg={success}/></div>
      </div>
    );
  }

  // ══════════════════════════════════════════
  // وضع الإدخال — مناوب جديد
  // ══════════════════════════════════════════
  const L = (key, label, { type = "text", required, ltr, transform, maxLength, lockIf = isSaved } = {}) => (
    <Field label={label} required={required}>
      <TextInput type={type} value={form[key]} readOnly={lockIf} locked={lockIf} dir={ltr ? "ltr" : undefined} maxLength={maxLength}
        placeholder={lockIf ? "" : "يُملأ آلياً أو يدوياً"}
        onChange={e => !lockIf && setForm(p => ({ ...p, [key]: transform ? transform(e.target.value) : e.target.value }))}/>
    </Field>
  );
  return (
    <div className="stack">
      {hasDeputy ? (
        <Alert tone="warning" icon="repeat" title="إدخال مناوب جديد"
          action={<Button size="sm" variant="secondary" icon="x" onClick={cancelChange}>إلغاء</Button>}>
          سيُستبدل المناوب الحالي عند الحفظ.
        </Alert>
      ) : (
        <Alert tone="info" icon="userPlus" title="إضافة سائق مناوب (اختياري)">
          ارفع رخصة سياقة المناوب، ثم أنشئ عقد العمل ليُرسَل طلب التصريح للإدارة.
        </Alert>
      )}

      <Card title="رخصة سياقة المناوب" subtitle="تُستخرج البيانات آلياً من الوجه الأمامي" icon="scan" tone="violet"
        actions={ocrDone && <Button size="sm" variant="ghost" icon="refresh" onClick={resetOcr}>إعادة الرفع</Button>}>
        <div className="grid grid-2">
          <Field label="الوجه الأمامي (Recto)">
            <Dropzone label="ارفع وجه الرخصة" icon="scan" preview={permisPrev} isPdf={permisPdf} loading={ocrLoading}
              loadingText="جارٍ استخراج البيانات..." onFile={handlePermisRecto}/>
          </Field>
          <Field label="الوجه الخلفي (Verso)">
            <Dropzone label="ارفع ظهر الرخصة" preview={permisVersoPrev} isPdf={permisVersoPdf} onFile={handlePermisVerso}/>
          </Field>
        </div>
        {ocrDone && <Alert tone="success" style={{ marginTop: 14 }}>تم استخراج البيانات — راجع الحقول أدناه.</Alert>}
      </Card>

      <Card title="البيانات الشخصية للمناوب" icon="user">
        <div className="grid grid-2">
          {L("nom_ar", "اللقب (عربي)", { required: true })}
          {L("prenom_ar", "الاسم (عربي)", { required: true })}
          {L("nom_fr", "Nom", { ltr: true })}
          {L("prenom_fr", "Prénom", { ltr: true })}
          {L("date_naissance", "تاريخ الميلاد", { type: "date", lockIf: isSaved && !!form.date_naissance })}
          {L("lieu_naissance", "مكان الميلاد")}
          {L("nin", "رقم التعريف الوطني (NIN)", { required: true, ltr: true, maxLength: 18, transform: v => v.replace(/\D/g, "").slice(0, 18) })}
        </div>
      </Card>

      <Card title="بيانات رخصة السياقة" icon="idCard" tone="info">
        <div className="grid grid-2">
          {L("num_permis", "رقم الرخصة", { required: true, ltr: true })}
          <Field label="الفئات" required>
            <TextInput value={cats} readOnly={isSaved} locked={isSaved} placeholder="مثال: B، C، D"
              onChange={e => !isSaved && setForm(p => ({ ...p, categories_permis: e.target.value.split(/[،,\s]+/).map(x => x.trim().toUpperCase()).filter(Boolean) }))}/>
          </Field>
          {L("date_delivrance_permis", "تاريخ الإصدار", { type: "date" })}
          {L("date_expiration_permis", "تاريخ الانتهاء", { type: "date", required: true })}
          {L("lieu_delivrance_permis", "مكان الإصدار")}
          <Field label="ولاية الإصدار">
            {isSaved ? <TextInput value={form.wilaya_permis} readOnly locked/> : (
              <Select value={form.wilaya_permis} onChange={e => setForm(p => ({ ...p, wilaya_permis: e.target.value }))}>
                <option value="">— اختر —</option>
                {WILAYAS.map(w => <option key={w}>{w}</option>)}
              </Select>
            )}
          </Field>
        </div>
      </Card>

      <Card title="بيانات الاتصال" subtitle="تُدخل يدوياً" icon="phone" tone="gold">
        <div className="grid grid-2">
          <Field label="رقم الهاتف" required>
            <TextInput value={form.telephone} maxLength={10} dir="ltr" placeholder="05XXXXXXXX" inputMode="tel" onChange={e => updManual("telephone", e.target.value)}/>
          </Field>
          <Field label="العنوان" required>
            <TextInput value={form.adresse} placeholder="الشارع، الحي، البلدية" onChange={e => updManual("adresse", e.target.value)}/>
          </Field>
        </div>
      </Card>

      <div>
        <ErrorMsg msg={error}/>
        <SuccessMsg msg={success}/>
        <SaveBtn onClick={save} loading={saving} label={hasDeputy ? "حفظ المناوب الجديد (يستبدل الحالي)" : "حفظ بيانات المناوب"}/>
      </div>
    </div>
  );
}
