import { useState } from "react";
import { api, fileToBase64, WILAYAS } from "../api.js";
import { SaveBtn, SuccessMsg, ErrorMsg } from "../App.jsx";
import { Card, Field, TextInput, Select, Dropzone, Alert, Button, Badge } from "../ui/kit.jsx";

export default function IdentityTab({ token, profile, onSaved }) {
  const driver  = profile?.driver  || {};
  const license = profile?.license || {};

  const [form, setForm] = useState({
    nom_ar:            driver.nom_ar            || "",
    prenom_ar:         driver.prenom_ar         || "",
    nom_fr:            driver.nom_fr            || "",
    prenom_fr:         driver.prenom_fr         || "",
    date_naissance:    driver.date_naissance    || "",
    lieu_naissance_ar: driver.lieu_naissance_ar || "",
    nin:               driver.nin               || "",
    num_permis:        license.num_permis       || "",
    categories: (() => {
      try { return JSON.parse(license.categories || "[]"); }
      catch { return []; }
    })(),
    date_delivrance:   license.date_delivrance   || "",
    date_expiration:   license.date_expiration   || "",
    lieu_delivrance:   license.lieu_delivrance   || "",
    wilaya_delivrance: license.wilaya_delivrance || "",
    telephone: driver.telephone || "",
    adresse:   driver.adresse   || "",
  });

  const [permisRectoB64,  setPermisRectoB64]  = useState(null);
  const [permisVersob64,  setPermisVersob64]  = useState(null);
  const [permisPrev,      setPermisPrev]      = useState(null);
  const [permisVersoPrev, setPermisVersoPrev] = useState(null);
  const [permisPdf,       setPermisPdf]       = useState(false);
  const [permisVersoPdf,  setPermisVersoPdf]  = useState(false);
  const [ocrLoading,      setOcrLoading]      = useState(false);
  const [ocrDone,         setOcrDone]         = useState(!!license.num_permis);
  const [saving,          setSaving]          = useState(false);
  const [success,         setSuccess]         = useState("");
  const [error,           setError]           = useState("");

  const updManual = (k, v) => setForm(p => ({ ...p, [k]: v }));

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
          nom_ar:            o.nom_ar            || p.nom_ar,
          prenom_ar:         o.prenom_ar          || p.prenom_ar,
          nom_fr:            o.nom_fr             || p.nom_fr,
          prenom_fr:         o.prenom_fr          || p.prenom_fr,
          date_naissance:    o.date_naissance     || p.date_naissance,
          lieu_naissance_ar: o.lieu_naissance     || p.lieu_naissance_ar,
          nin:               o.nin                || p.nin,
          num_permis:        o.num_permis         || p.num_permis,
          categories:        Array.isArray(o.categories) && o.categories.length
                               ? o.categories : p.categories,
          date_delivrance:   o.date_delivrance    || p.date_delivrance,
          date_expiration:   o.date_expiration    || p.date_expiration,
          lieu_delivrance:   o.lieu_delivrance    || p.lieu_delivrance,
          wilaya_delivrance: o.wilaya_delivrance  || p.wilaya_delivrance,
        }));
        // لا نقفل الحقول إلا إذا استُخرجت البيانات الأساسية — وإلا يبقى الإدخال اليدوي متاحاً
        const missing = [!o.num_permis && "رقم الرخصة", !o.nin && "NIN",
                         !o.date_expiration && "تاريخ الانتهاء"].filter(Boolean);
        if (missing.length) {
          setError("⚠️ لم تُستخرج: " + missing.join("، ") + " — أكملها يدوياً أو ارفع صورة أوضح");
          setOcrDone(false);
        } else {
          setOcrDone(true);
        }
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
    setForm(p => ({
      ...p,
      nom_ar:"", prenom_ar:"", nom_fr:"", prenom_fr:"",
      date_naissance:"", lieu_naissance_ar:"", nin:"",
      num_permis:"", categories:[],
      date_delivrance:"", date_expiration:"",
      lieu_delivrance:"", wilaya_delivrance:"",
    }));
  }

  async function save() {
    setError(""); setSuccess(""); setSaving(true);
    if (!form.num_permis) {
      setError("ارفع رخصة السياقة أولاً — رقمها مطلوب");
      setSaving(false); return;
    }
    if (!form.nom_ar || !form.prenom_ar) {
      setError("اللقب والاسم مطلوبان");
      setSaving(false); return;
    }
    if (!form.telephone) {
      setError("رقم الهاتف مطلوب");
      setSaving(false); return;
    }

    const r1 = await api.saveIdentity(token, {
      nom_ar:            form.nom_ar,
      prenom_ar:         form.prenom_ar,
      nom_fr:            form.nom_fr,
      prenom_fr:         form.prenom_fr,
      date_naissance:    form.date_naissance,
      lieu_naissance_ar: form.lieu_naissance_ar,
      nin:               form.nin,
      telephone:         form.telephone,
      adresse:           form.adresse,
    });

    if (!r1.success) {
      setError(r1.error || "خطأ في حفظ البيانات");
      setSaving(false); return;
    }

    const r2 = await api.saveLicense(token, {
      num_permis:                form.num_permis,
      categories:                Array.isArray(form.categories) ? form.categories : [],
      date_delivrance:           form.date_delivrance,
      date_expiration:           form.date_expiration,
      lieu_delivrance:           form.lieu_delivrance,
      wilaya_delivrance:         form.wilaya_delivrance,
      image_permis_recto_base64: permisRectoB64,
      image_permis_verso_base64: permisVersob64,
    });

    setSaving(false);
    if (r2.success) {
      setSuccess("تم حفظ البيانات بنجاح ✅");
      onSaved();
    } else {
      setError(r2.error || "خطأ في حفظ رخصة السياقة");
    }
  }

  const cats = Array.isArray(form.categories)
    ? form.categories.join("، ")
    : form.categories || "";

  // حقل يُقفل بعد القراءة الآلية
  const L = (key, label, { type = "text", required, dir, ltr, transform, maxLength } = {}) => (
    <Field label={label} required={required}>
      <TextInput type={type} value={form[key]} readOnly={ocrDone} locked={ocrDone} dir={ltr ? "ltr" : dir}
        maxLength={maxLength} placeholder={ocrDone ? "" : "يُملأ آلياً أو يدوياً"}
        onChange={e => !ocrDone && setForm(p => ({ ...p, [key]: transform ? transform(e.target.value) : e.target.value }))}/>
    </Field>
  );

  return (
    <div className="stack">
      <Card title="رخصة السياقة" subtitle="ارفع صورة الرخصة — تُستخرج البيانات آلياً ثم تُقفل للمراجعة" icon="scan"
        actions={ocrDone && <Button size="sm" variant="ghost" icon="refresh" onClick={resetOcr}>إعادة الرفع</Button>}>
        <div className="grid grid-2">
          <Field label="الوجه الأمامي (Recto)" hint="تُقرأ منه البيانات آلياً">
            <Dropzone label="ارفع وجه الرخصة" icon="scan" preview={permisPrev} isPdf={permisPdf}
              loading={ocrLoading} loadingText="جارٍ استخراج البيانات..." onFile={handlePermisRecto}/>
          </Field>
          <Field label="الوجه الخلفي (Verso)" hint="يُحفظ مع الملف">
            <Dropzone label="ارفع ظهر الرخصة" icon="upload" preview={permisVersoPrev} isPdf={permisVersoPdf} onFile={handlePermisVerso}/>
          </Field>
        </div>
        {ocrDone && (
          <Alert tone="success" icon="lock" title="تم استخراج البيانات وقفلها" style={{ marginTop: 14 }}>
            راجع البيانات أدناه. لتعديلها أعد رفع صورة أوضح للرخصة.
          </Alert>
        )}
      </Card>

      <Card title="البيانات الشخصية" subtitle="مستخرجة من رخصة السياقة" icon="user"
        actions={ocrDone ? <Badge tone="success" icon="lock" size="sm">مقفلة</Badge> : null}>
        <div className="grid grid-2">
          {L("nom_ar", "اللقب (عربي)", { required: true })}
          {L("prenom_ar", "الاسم (عربي)", { required: true })}
          {L("nom_fr", "Nom", { ltr: true })}
          {L("prenom_fr", "Prénom", { ltr: true })}
          {L("date_naissance", "تاريخ الميلاد", { type: "date" })}
          {L("lieu_naissance_ar", "مكان الميلاد")}
          {L("nin", "رقم التعريف الوطني (NIN)", { ltr: true, maxLength: 18, transform: v => v.replace(/\D/g, "").slice(0, 18) })}
        </div>
      </Card>

      <Card title="بيانات رخصة السياقة" subtitle="مستخرجة آلياً" icon="idCard" tone="info">
        <div className="grid grid-2">
          {L("num_permis", "رقم الرخصة", { required: true, ltr: true })}
          <Field label="الفئات"><TextInput value={cats} readOnly locked placeholder="تُملأ آلياً"/></Field>
          {L("date_delivrance", "تاريخ الإصدار", { type: "date" })}
          {L("date_expiration", "تاريخ الانتهاء", { type: "date" })}
          {L("lieu_delivrance", "مكان الإصدار")}
          <Field label="ولاية الإصدار">
            {ocrDone ? <TextInput value={form.wilaya_delivrance} readOnly locked/> : (
              <Select value={form.wilaya_delivrance} onChange={e => setForm(p => ({ ...p, wilaya_delivrance: e.target.value }))}>
                <option value="">— اختر —</option>
                {WILAYAS.map(w => <option key={w}>{w}</option>)}
              </Select>
            )}
          </Field>
        </div>
      </Card>

      <Card title="بيانات الاتصال" subtitle="لا تُستخرج من الرخصة — تُدخل يدوياً" icon="phone" tone="gold">
        <div className="grid grid-2">
          <Field label="رقم الهاتف" required>
            <TextInput value={form.telephone} maxLength={10} dir="ltr" placeholder="05XXXXXXXX" inputMode="tel"
              onChange={e => updManual("telephone", e.target.value)}/>
          </Field>
          <Field label="العنوان">
            <TextInput value={form.adresse} placeholder="الشارع، الحي، البلدية" onChange={e => updManual("adresse", e.target.value)}/>
          </Field>
        </div>
      </Card>

      <div>
        <ErrorMsg msg={error}/>
        <SuccessMsg msg={success}/>
        <SaveBtn onClick={save} loading={saving} label="حفظ البيانات"/>
      </div>
    </div>
  );
}
