// ════════════════════════════════════════
// فضاء شركة سيارات الأجرة
// الأقسام: نظرة عامة — هوية الشركة — المركبات — السائقون وعقود التوظيف
// ════════════════════════════════════════
import { useState, useEffect } from "react";
import { api, fileToBase64, WILAYAS } from "../api.js";
import { SaveBtn, SuccessMsg, ErrorMsg } from "../App.jsx";
import { AppShell } from "../ui/Shell.jsx";
import Icon from "../ui/Icon.jsx";
import {
  Button, LinkButton, Card, PageHeader, Badge, StatCard, Alert, Field, TextInput, Select, Dropzone,
  Spinner, EmptyState, Avatar, confirmDialog, toast, fmtDate, openPrint,
} from "../ui/kit.jsx";

const NAV = [
  { id: "overview", icon: "dashboard", label: "نظرة عامة" },
  { id: "identity", icon: "building",  label: "هوية الشركة" },
  { id: "vehicles", icon: "car",       label: "المركبات" },
  { id: "drivers",  icon: "users",     label: "السائقون والعقود" },
];

// ── أدوات مساعدة ──
// يملأ الحقول من نتيجة OCR دون مسح ما أدخله المستخدم. map = { حقل_النموذج: مفتاح_OCR }
function mergeOcr(prev, o, map) {
  const next = { ...prev };
  for (const [k, src] of Object.entries(map)) {
    let v = o[src];
    if (Array.isArray(v)) v = v.join(",");
    if (v !== null && v !== undefined && String(v).trim() !== "") next[k] = String(v).trim();
  }
  return next;
}
const same = keys => Object.fromEntries(keys.map(k => [k, k]));

async function readFile(file) {
  const { data, mimeType, isPdf } = await fileToBase64(file);
  return { b64: data, mime: mimeType, isPdf, preview: isPdf ? null : URL.createObjectURL(file) };
}

function Grid({ children, cols = 3 }) {
  return <div className={`grid grid-${cols}`}>{children}</div>;
}

function Section({ title, icon = "fileText", tone = "brand", subtitle, children, actions }) {
  return <Card title={title} icon={icon} tone={tone} subtitle={subtitle} actions={actions}>{children}</Card>;
}

// حقل نصي مربوط بالنموذج
function F({ label, k, form, set, type = "text", required, ltr, placeholder }) {
  return (
    <Field label={label} required={required}>
      <TextInput type={type} dir={ltr ? "ltr" : undefined} value={form[k] || ""} placeholder={placeholder}
        onChange={e => set(p => ({ ...p, [k]: e.target.value }))}/>
    </Field>
  );
}

function WilayaSelect({ label, k, form, set }) {
  return (
    <Field label={label}>
      <Select value={form[k] || ""} onChange={e => set(p => ({ ...p, [k]: e.target.value }))}>
        <option value="">— اختر —</option>
        {WILAYAS.map(w => <option key={w} value={w}>{w}</option>)}
        {form[k] && !WILAYAS.includes(form[k]) && <option value={form[k]}>{form[k]}</option>}
      </Select>
    </Field>
  );
}

// رفع وثيقة + قراءة آلية
function DocUpload({ label, doc, setDoc, ocr, onOcr, token, savedPath }) {
  const [loading, setLoading] = useState(false);
  async function onImage(file) {
    const d = await readFile(file);
    setDoc(d);
    if (!ocr) return;
    setLoading(true);
    try {
      const r = await ocr(token, d.b64, d.mime);
      if (r?.ocr && !r.ocr.error) onOcr(r.ocr);
    } finally { setLoading(false); }
  }
  return (
    <Field label={label}>
      <Dropzone label="اضغط أو اسحب الملف هنا" icon={ocr ? "scan" : "upload"} onFile={onImage} loading={loading}
        preview={doc?.preview} isPdf={doc?.isPdf} hint={ocr ? "تُستخرج البيانات آلياً — راجعها بعد ذلك" : undefined}/>
      {!doc && savedPath && (
        <a href={`/api/images/${savedPath}?token=${token}`} target="_blank" rel="noreferrer" className="row" style={{ gap: 6, fontSize: 12.5, fontWeight: 600 }}>
          <Icon name="image" size={14}/> النسخة المحفوظة — اضغط للعرض
        </a>
      )}
    </Field>
  );
}

const isExpired = d => d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d < new Date().toISOString().slice(0, 10);

// ════════════════════════════════════════
// نظرة عامة
// ════════════════════════════════════════
function Overview({ token, company, vehicles, drivers, hires, vreqs, go }) {
  const active = hires.filter(h => h.is_current && (h.statut === "جديد" || h.statut === "مقبول"));
  const permits = active.filter(h => h.statut === "مقبول");
  const pending = active.filter(h => h.statut === "جديد").length + vreqs.filter(r => r.statut === "جديد").length;
  const missing = [["nom_ar", "اسم الشركة"], ["registre_commerce", "السجل التجاري"], ["num_agrement", "رقم الاعتماد"], ["date_agrement", "تاريخ الاعتماد"]]
    .filter(([k]) => !company?.[k]).map(([, l]) => l);
  const noDriver = vehicles.filter(v => !v.driver_id).length;
  const expired = drivers.filter(d => isExpired(d.date_expiration)).length;
  return (
    <div className="stack" style={{ gap: 22 }}>
      <PageHeader eyebrow="فضاء الشركة" title={company?.nom_ar || "مرحباً بكم"} subtitle="ملخص الأسطول والسائقين الأجراء وعقود التوظيف."
        actions={<Button variant="secondary" icon="printer" onClick={() => openPrint(api.companyCardUrl(token))}>بطاقة معلومات الشركة</Button>}/>
      {missing.length > 0 && (
        <Alert tone="warning" title="أكمل هوية الشركة" action={<Button size="sm" variant="secondary" onClick={() => go("identity")}>إكمال</Button>}>
          البيانات الناقصة: {missing.join("، ")} — مطلوبة قبل إنشاء عقود التوظيف.
        </Alert>
      )}
      <div className="stats-grid">
        <StatCard icon="car" tone="info" label="المركبات" value={vehicles.length} onClick={() => go("vehicles")} hint={noDriver ? `${noDriver} بدون سائق` : undefined}/>
        <StatCard icon="users" tone="brand" label="السائقون الأجراء" value={drivers.length} onClick={() => go("drivers")} hint={expired ? `${expired} رخصة منتهية` : undefined}/>
        <StatCard icon="fileSignature" tone="violet" label="عقود توظيف سارية" value={active.length} onClick={() => go("drivers")}/>
        <StatCard icon="scroll" tone="gold" label="رخص سائق أجير سارية" value={permits.length} onClick={() => go("drivers")}/>
        <StatCard icon="hourglass" tone="warning" label="طلبات قيد الدراسة" value={pending}/>
      </div>
      <Card title="آخر عقود التوظيف" icon="fileSignature" padded={false}
        actions={<Button size="sm" variant="ghost" iconEnd="chevronLeft" onClick={() => go("drivers")}>الكل</Button>}>
        {hires.length === 0 ? <EmptyState icon="fileSignature" title="لا توجد عقود بعد" text="أضف سائقاً واربطه بمركبة ثم أنشئ عقد التوظيف."/> : (
          <div className="list" style={{ padding: "4px 20px" }}>
            {hires.slice(0, 6).map(h => (
              <div className="list-item" key={h.id}>
                <Avatar name={`${h.drv_prenom_ar || ""} ${h.drv_nom_ar || ""}`}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="cell-title">{h.drv_prenom_ar || ""} {h.drv_nom_ar || ""}</div>
                  <div className="cell-sub"><span className="mono">{h.contract_number}</span> · <span className="ltr">{h.num_immatriculation}</span></div>
                </div>
                <HireBadge h={h}/>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function HireBadge({ h }) {
  if (h.statut === "مقبول" && h.is_current) return <Badge tone="success" dot>رخصة سارية</Badge>;
  if (h.statut === "جديد" && h.is_current) return <Badge tone="warning" dot>قيد الدراسة</Badge>;
  if (h.statut === "مرفوض") return <Badge tone="danger" dot>مرفوض</Badge>;
  if (h.end_reason) return <Badge dot>{h.end_reason === "انتهاء_المدة" ? "انتهت المدة" : "مفسوخ"}</Badge>;
  return <Badge dot>{h.statut}</Badge>;
}

// ════════════════════════════════════════
// هوية الشركة
// ════════════════════════════════════════
function IdentityTab({ token, company, onSaved }) {
  const [form, setForm]   = useState(company || {});
  const [recto, setRecto] = useState(null);
  const [verso, setVerso] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(""); const [err, setErr] = useState("");

  const cniMap = {
    gerant_nom_ar: "nom_ar", gerant_prenom_ar: "prenom_ar",
    gerant_nom_fr: "nom_fr", gerant_prenom_fr: "prenom_fr",
    gerant_date_naissance: "date_naissance", gerant_lieu_naissance: "lieu_naissance_ar",
    gerant_nin: "nin", gerant_adresse: "adresse",
  };

  async function save() {
    setErr(""); setMsg("");
    if (!form.nom_ar?.trim()) { setErr("اسم الشركة مطلوب"); return; }
    setSaving(true);
    const payload = { ...form };
    if (recto) { payload.gerant_cni_recto_base64 = recto.b64; payload.gerant_cni_recto_mime = recto.mime; }
    if (verso) { payload.gerant_cni_verso_base64 = verso.b64; payload.gerant_cni_verso_mime = verso.mime; }
    const r = await api.saveCompanyProfile(token, payload).catch(() => ({ error: "خطأ في الاتصال" }));
    setSaving(false);
    if (r.error) { setErr(r.error); return; }
    setRecto(null); setVerso(null);
    setForm(r.company);
    onSaved(r.company);
    setMsg("تم حفظ هوية الشركة");
    toast.success("تم حفظ هوية الشركة");
  }

  const p = { form, set: setForm };
  return (
    <div className="stack">
      <PageHeader title="هوية الشركة" subtitle="البيانات القانونية للشركة والمسيّر — تظهر في العقود والرخص المطبوعة."/>
      <Section title="بيانات الشركة" icon="building">
        <Grid cols={2}>
          <F label="اسم الشركة (عربي)" k="nom_ar" required {...p}/>
          <F label="Raison sociale" k="nom_fr" ltr {...p}/>
          <F label="الهاتف" k="telephone" ltr {...p}/>
          <F label="البريد الإلكتروني" k="email" ltr type="email" {...p}/>
        </Grid>
      </Section>
      <Section title="المقر الاجتماعي" icon="mapPin" tone="info">
        <Grid>
          <F label="العنوان" k="adresse" {...p}/>
          <F label="البلدية" k="commune" {...p}/>
          <WilayaSelect label="الولاية" k="wilaya" {...p}/>
        </Grid>
      </Section>
      <Section title="السجل التجاري والتعريف الجبائي والاعتماد" icon="stamp" tone="gold">
        <Grid>
          <F label="رقم السجل التجاري" k="registre_commerce" ltr {...p}/>
          <F label="تاريخ السجل التجاري" k="rc_date" type="date" {...p}/>
          <F label="رقم التعريف الجبائي (NIF)" k="num_fiscal" ltr {...p}/>
          <F label="رقم الاعتماد" k="num_agrement" ltr {...p}/>
          <F label="تاريخ الاعتماد" k="date_agrement" type="date" {...p}/>
        </Grid>
      </Section>
      <Section title="المسيّر" subtitle="ارفع وجهي بطاقة التعريف وتُملأ الخانات آلياً، ثم راجعها" icon="user" tone="violet">
        <div className="stack">
          <Grid cols={2}>
            <DocUpload label="بطاقة التعريف — الوجه الأمامي" doc={recto} setDoc={setRecto} token={token}
              ocr={api.ocrCni} onOcr={o => setForm(f => mergeOcr(f, o, cniMap))} savedPath={company?.gerant_cni_recto_path}/>
            <DocUpload label="بطاقة التعريف — الوجه الخلفي" doc={verso} setDoc={setVerso} token={token}
              ocr={api.ocrCni} onOcr={o => setForm(f => mergeOcr(f, o, cniMap))} savedPath={company?.gerant_cni_verso_path}/>
          </Grid>
          <F label="الاسم الكامل للمسيّر / الممثل القانوني" k="representant_nom" {...p}/>
          <Grid cols={4}>
            <F label="اللقب" k="gerant_nom_ar" {...p}/>
            <F label="الاسم" k="gerant_prenom_ar" {...p}/>
            <F label="Nom" k="gerant_nom_fr" ltr {...p}/>
            <F label="Prénom" k="gerant_prenom_fr" ltr {...p}/>
            <F label="تاريخ الميلاد" k="gerant_date_naissance" ltr {...p}/>
            <F label="مكان الميلاد" k="gerant_lieu_naissance" {...p}/>
            <F label="رقم التعريف الوطني (NIN)" k="gerant_nin" ltr {...p}/>
            <F label="العنوان" k="gerant_adresse" {...p}/>
          </Grid>
        </div>
      </Section>
      <div>
        <ErrorMsg msg={err}/><SuccessMsg msg={msg}/>
        <SaveBtn onClick={save} loading={saving} label="حفظ هوية الشركة"/>
      </div>
    </div>
  );
}

// ════════════════════════════════════════
// المركبات
// ════════════════════════════════════════
const VEH_KEYS = ["num_immatriculation", "num_precedent", "marque", "type_vehicule", "num_serie",
  "genre", "carrosserie", "energie", "puissance", "nb_places", "poids_total", "charge_utile",
  "annee_circulation", "date_delivrance", "lieu_delivrance", "wilaya_delivrance",
  "quittance_num", "quittance_montant", "quittance_date", "proprietaire_nom_ar",
  "proprietaire_prenom_ar", "proprietaire_nom", "proprietaire_prenom",
  "proprietaire_adresse", "proprietaire_wilaya"];

// changeOf = المركبة الحالية عند «تغيير المركبة» (طلب رسمي) — النموذج يبدأ فارغاً
function VehicleForm({ token, vehicle, changeOf, onDone, onCancel }) {
  const [form, setForm] = useState(changeOf ? {} : (vehicle || {}));
  const [doc, setDoc]   = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    setErr("");
    if (!form.num_immatriculation?.trim()) { setErr("رقم التسجيل مطلوب"); return; }
    if (changeOf) {
      if (!doc) { setErr("يجب رفع صورة البطاقة الرمادية للمركبة الجديدة أولاً"); return; }
      const miss = [["num_immatriculation", "رقم التسجيل"], ["marque", "الصنف"],
        ["num_serie", "الرقم التسلسلي في الطراز"], ["nb_places", "عدد المقاعد"]]
        .filter(([k]) => !String(form[k] || "").trim()).map(([, l]) => l);
      if (miss.length) { setErr("صحّح الحقول التالية قبل الحفظ: " + miss.join("، ")); return; }
    }
    setSaving(true);
    const payload = Object.fromEntries(VEH_KEYS.map(k => [k, form[k] ?? ""]));
    if (doc) { payload.image_carte_grise_base64 = doc.b64; payload.image_carte_grise_mime = doc.mime; }
    const r = await (changeOf
      ? api.companyChangeVehicle(token, changeOf.id, payload)
      : api.companySave(token, "vehicles", payload, vehicle?.id)
    ).catch(() => ({ error: "خطأ في الاتصال" }));
    setSaving(false);
    if (r.error) { setErr(r.error); return; }
    if (changeOf && r.id) openPrint(api.companyPrintUrl(token, "vehicle-change", r.id));
    onDone(r);
  }

  const p = { form, set: setForm };
  return (
    <div className="stack">
      <PageHeader title={changeOf ? "تغيير المركبة" : vehicle?.id ? "تعديل مركبة" : "إضافة مركبة"}
        subtitle="ارفع البطاقة الرمادية — تُستخرج البيانات آلياً ويمكنك تصحيحها."
        actions={<Button variant="secondary" icon="arrowRight" onClick={onCancel}>رجوع</Button>}/>
      {changeOf && (
        <Alert tone="warning" icon="repeat" title={`استبدال المركبة ${changeOf.num_immatriculation}`}>
          {changeOf.marque || ""} {changeOf.type_vehicule || ""} — تُؤرشَف عند الحفظ ويُنشأ طلب تغيير المركبة ويُطبع للإدارة.
        </Alert>
      )}
      <Card title="البطاقة الرمادية" icon="scan" tone="info">
        <DocUpload label={changeOf ? "صورة البطاقة الرمادية للمركبة الجديدة (إلزامية)" : "صورة البطاقة الرمادية"}
          doc={doc} setDoc={setDoc} token={token}
          ocr={api.ocrCarteGrise} onOcr={o => setForm(f => mergeOcr(f, o, same(VEH_KEYS)))}
          savedPath={changeOf ? null : vehicle?.image_carte_grise_path}/>
      </Card>
      <Section title="بيانات التسجيل" icon="car" tone="info">
        <Grid>
          <F label="رقم التسجيل" k="num_immatriculation" required ltr {...p}/>
          <F label="الرقم السابق" k="num_precedent" ltr {...p}/>
          <F label="الصنف — MARQUE" k="marque" ltr {...p}/>
          <F label="الطراز — TYPE" k="type_vehicule" ltr {...p}/>
          <F label="الرقم التسلسلي في الطراز" k="num_serie" ltr {...p}/>
          <F label="النوع — GENRE" k="genre" ltr {...p}/>
          <F label="الهيكل — CARROSSERIE" k="carrosserie" ltr {...p}/>
          <F label="الطاقة — ENERGIE" k="energie" ltr {...p}/>
          <F label="القوة — PUISSANCE" k="puissance" ltr {...p}/>
          <F label="عدد المقاعد" k="nb_places" ltr {...p}/>
          <F label="جملة الحمولة" k="poids_total" ltr {...p}/>
          <F label="الحمولة المقيدة" k="charge_utile" ltr {...p}/>
          <F label="سنة أول استعمال" k="annee_circulation" ltr {...p}/>
        </Grid>
      </Section>
      <Section title="التسليم والوصل" icon="wallet" tone="gold">
        <Grid>
          <F label="تاريخ التسليم" k="date_delivrance" ltr {...p}/>
          <F label="مكان التسليم" k="lieu_delivrance" {...p}/>
          <WilayaSelect label="ولاية التسليم" k="wilaya_delivrance" {...p}/>
          <F label="رقم الوصل" k="quittance_num" ltr {...p}/>
          <F label="المبلغ (دج)" k="quittance_montant" ltr {...p}/>
          <F label="تاريخ الوصل" k="quittance_date" ltr {...p}/>
        </Grid>
      </Section>
      <Section title="المالك حسب البطاقة الرمادية" icon="user">
        <Grid>
          <F label="اللقب (عربي)" k="proprietaire_nom_ar" {...p}/>
          <F label="الاسم (عربي)" k="proprietaire_prenom_ar" {...p}/>
          <F label="Nom" k="proprietaire_nom" ltr {...p}/>
          <F label="Prénom" k="proprietaire_prenom" ltr {...p}/>
          <F label="العنوان" k="proprietaire_adresse" {...p}/>
          <WilayaSelect label="الولاية" k="proprietaire_wilaya" {...p}/>
        </Grid>
      </Section>
      <div>
        <ErrorMsg msg={err}/>
        <SaveBtn onClick={save} loading={saving} label={changeOf ? "حفظ المركبة الجديدة وإنشاء طلب التغيير" : "حفظ المركبة"}/>
      </div>
    </div>
  );
}

function VehiclesTab({ token, vehicles, hires, vreqs, reload }) {
  const [editing, setEditing]   = useState(null);
  const [changing, setChanging] = useState(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function remove(v) {
    const ok = await confirmDialog({ title: "حذف المركبة", danger: true, confirmLabel: "حذف",
      message: `حذف المركبة ${v.num_immatriculation} من أسطول الشركة؟` });
    if (!ok) return;
    const r = await api.companyDelete(token, "vehicles", v.id);
    if (r?.error) setErr(r.error); else toast.success("تم حذف المركبة");
    reload();
  }
  async function askChange(v) {
    const ok = await confirmDialog({ title: "تغيير المركبة", icon: "repeat", tone: "warning", confirmLabel: "متابعة",
      message: "ستُؤرشَف المركبة الحالية تلقائياً ويُرسَل طلب تغيير المركبة للإدارة." });
    if (ok) { setMsg(""); setErr(""); setChanging(v); }
  }

  if (editing) return <VehicleForm token={token} vehicle={editing.id ? editing : null}
    onCancel={() => setEditing(null)} onDone={() => { setEditing(null); reload(); toast.success("تم حفظ المركبة"); }}/>;
  if (changing) return <VehicleForm token={token} changeOf={changing}
    onCancel={() => setChanging(null)}
    onDone={r => { setChanging(null); setMsg(`تم حفظ المركبة الجديدة — طلب التغيير مُنشأ: ${r.request_number}`); reload(); }}/>;

  const reqsOf = id => vreqs.filter(r => r.vehicle_id === id);
  const hasContract = v => v.driver_id && hires.some(h => h.driver_id === v.driver_id && h.is_current
    && (h.statut === "جديد" || h.statut === "مقبول"));

  return (
    <div className="stack">
      <PageHeader title="المركبات" subtitle={`${vehicles.length} مركبة في أسطول الشركة`}
        actions={<Button icon="plus" onClick={() => setEditing({})}>إضافة مركبة</Button>}/>
      <div><ErrorMsg msg={err}/><SuccessMsg msg={msg}/></div>
      {vehicles.length === 0 && (
        <Card><EmptyState icon="car" title="لا توجد مركبات بعد" text="أضف مركبة وارفع بطاقتها الرمادية لتُستخرج البيانات آلياً."
          action={<Button icon="plus" onClick={() => setEditing({})}>إضافة مركبة</Button>}/></Card>
      )}
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))" }}>
        {vehicles.map(v => {
          const reqs = reqsOf(v.id);
          const pending = reqs.find(r => r.statut === "جديد");
          const last = reqs[0];
          const locked = hasContract(v) || !!pending;
          return (
            <div key={v.id} className="card hoverable" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
                <div className="icon-tile lg tone-info"><Icon name="car" size={24}/></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="mono ltr" style={{ fontWeight: 700, fontSize: 17, color: "var(--ink)", textAlign: "right" }}>{v.num_immatriculation}</div>
                  <div className="cell-sub">{[v.marque, v.type_vehicule, v.energie, v.nb_places && `${v.nb_places} مقاعد`].filter(Boolean).join(" · ")}</div>
                </div>
                {locked && <Icon name="lock" size={16} style={{ color: "var(--subtle)" }} title="مرتبطة بعقد ساري"/>}
              </div>
              <div>{v.driver_id
                ? <Badge tone="success" icon="user">{v.drv_prenom_ar || ""} {v.drv_nom_ar || ""}</Badge>
                : <Badge tone="warning" icon="alert">بدون سائق</Badge>}</div>
              {pending && (
                <Alert tone="warning" icon="hourglass" action={<LinkButton size="xs" variant="secondary" icon="printer" href={api.companyPrintUrl(token, "vehicle-change", pending.id)}>الطلب</LinkButton>}>
                  طلب التغيير <span className="mono">{pending.request_number}</span> قيد الدراسة (السابقة: <span className="ltr">{pending.old_data?.num_immatriculation}</span>)
                </Alert>
              )}
              {!pending && last && (
                <Alert tone={last.statut === "مقبول" ? "success" : "danger"}
                  action={<LinkButton size="xs" variant="secondary" icon="printer" href={api.companyPrintUrl(token, "vehicle-change", last.id)}>الطلب</LinkButton>}>
                  {last.statut === "مقبول" ? <>قُبل طلب التغيير <span className="mono">{last.request_number}</span></>
                    : <>رُفض طلب التغيير — أُعيدت المركبة السابقة: {last.admin_notes}</>}
                </Alert>
              )}
              <div className="row-wrap" style={{ marginTop: "auto", gap: 6 }}>
                {!pending && <Button size="sm" variant="soft" icon="repeat" onClick={() => askChange(v)}>تغيير المركبة</Button>}
                {!locked && <Button size="sm" variant="ghost" icon="edit" onClick={() => setEditing(v)}>تعديل</Button>}
                {!locked && <Button size="sm" variant="ghost" icon="trash" style={{ color: "var(--danger)" }} onClick={() => remove(v)}>حذف</Button>}
              </div>
              {locked && !pending && <div className="cell-sub">المركبة مرتبطة بعقد توظيف ساري — التعديل عبر «تغيير المركبة» فقط.</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ════════════════════════════════════════
// السائقون وربطهم بالمركبات + عقود التوظيف
// ════════════════════════════════════════
const DRV_KEYS = ["nom_ar", "prenom_ar", "nom_fr", "prenom_fr", "date_naissance", "lieu_naissance",
  "nin", "telephone", "num_permis", "date_delivrance", "date_expiration", "lieu_delivrance",
  "wilaya_delivrance", "categories"];

function DriverForm({ token, driver, onDone, onCancel }) {
  const [form, setForm]   = useState(driver || {});
  const [recto, setRecto] = useState(null);
  const [verso, setVerso] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const ocrMap = same(DRV_KEYS.filter(k => k !== "telephone"));

  async function save() {
    setErr("");
    if (!form.nom_ar?.trim() && !form.nom_fr?.trim()) { setErr("لقب السائق مطلوب"); return; }
    setSaving(true);
    const payload = Object.fromEntries(DRV_KEYS.map(k => [k, form[k] ?? ""]));
    if (recto) { payload.image_permis_recto_base64 = recto.b64; payload.image_permis_recto_mime = recto.mime; }
    if (verso) { payload.image_permis_verso_base64 = verso.b64; payload.image_permis_verso_mime = verso.mime; }
    const r = await api.companySave(token, "drivers", payload, driver?.id).catch(() => ({ error: "خطأ في الاتصال" }));
    setSaving(false);
    if (r.error) { setErr(r.error); return; }
    onDone();
  }

  const p = { form, set: setForm };
  return (
    <div className="stack">
      <PageHeader title={driver?.id ? "تعديل سائق" : "إضافة سائق أجير"} subtitle="ارفع رخصة السياقة — تُملأ البيانات آلياً."
        actions={<Button variant="secondary" icon="arrowRight" onClick={onCancel}>رجوع</Button>}/>
      <Card title="رخصة السياقة" icon="scan" tone="info">
        <Grid cols={2}>
          <DocUpload label="الوجه الأمامي" doc={recto} setDoc={setRecto} token={token}
            ocr={api.ocrPermis} onOcr={o => setForm(f => mergeOcr(f, o, ocrMap))} savedPath={driver?.image_permis_recto_path}/>
          <DocUpload label="الوجه الخلفي" doc={verso} setDoc={setVerso} token={token}
            ocr={api.ocrPermis} onOcr={o => setForm(f => mergeOcr(f, o, ocrMap))} savedPath={driver?.image_permis_verso_path}/>
        </Grid>
      </Card>
      <Section title="هوية السائق" icon="user">
        <Grid cols={4}>
          <F label="اللقب" k="nom_ar" required {...p}/>
          <F label="الاسم" k="prenom_ar" {...p}/>
          <F label="Nom" k="nom_fr" ltr {...p}/>
          <F label="Prénom" k="prenom_fr" ltr {...p}/>
          <F label="تاريخ الميلاد" k="date_naissance" ltr {...p}/>
          <F label="مكان الميلاد" k="lieu_naissance" {...p}/>
          <F label="رقم التعريف الوطني (NIN)" k="nin" ltr {...p}/>
          <F label="الهاتف" k="telephone" ltr {...p}/>
        </Grid>
      </Section>
      <Section title="بيانات رخصة السياقة" icon="idCard" tone="info">
        <Grid>
          <F label="رقم الرخصة" k="num_permis" ltr {...p}/>
          <F label="الأصناف" k="categories" ltr placeholder="B,D" {...p}/>
          <F label="تاريخ الإصدار" k="date_delivrance" type="date" {...p}/>
          <F label="تاريخ الانتهاء" k="date_expiration" type="date" {...p}/>
          <F label="مكان الإصدار" k="lieu_delivrance" {...p}/>
          <WilayaSelect label="ولاية الإصدار" k="wilaya_delivrance" {...p}/>
        </Grid>
        {isExpired(form.date_expiration) && <Alert tone="danger" style={{ marginTop: 12 }}>رخصة السياقة منتهية الصلاحية.</Alert>}
      </Section>
      <div>
        <ErrorMsg msg={err}/>
        <SaveBtn onClick={save} loading={saving} label="حفظ السائق"/>
      </div>
    </div>
  );
}

// عقد التوظيف ورخصة سائق أجير (لكل سائق)
function HireBlock({ token, driver, vehicle, requests, reload }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState("");
  const mine   = requests.filter(r => r.driver_id === driver.id);
  const active = mine.find(r => r.is_current && (r.statut === "جديد" || r.statut === "مقبول"));
  const last   = mine[0];
  const printUrl = (kind, id) => api.companyPrintUrl(token, kind, id);
  useEffect(() => { setErr(""); }, [vehicle?.id, active?.id]);

  async function create() {
    setErr(""); setBusy(true);
    const r = await api.companyCreateHireRequest(token, { driver_id: driver.id }).catch(() => ({ error: "خطأ في الاتصال" }));
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    toast.success(`تم إنشاء العقد ${r.contract_number || ""} وإرسال الطلب للإدارة`);
    reload();
  }

  async function terminate() {
    const ok = await confirmDialog({ title: "فسخ عقد التوظيف", danger: true, confirmLabel: "فسخ العقد",
      message: "سيُفسخ العقد فوراً وتُلغى رخصة سائق أجير (إن صدرت)، ثم يُفتح محضر الفسخ للطباعة." });
    if (!ok) return;
    setErr(""); setBusy(true);
    const r = await api.companyTerminateHire(token, active.id).catch(() => ({ error: "خطأ في الاتصال" }));
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    openPrint(printUrl("hire-termination", active.id));
    reload();
  }

  return (
    <div style={{ borderTop: "1px solid var(--line-2)", paddingTop: 14, marginTop: 4 }}>
      {!active ? (
        <div className="stack-sm">
          {last?.statut === "مرفوض" && <Alert tone="danger" title={`رُفض الطلب السابق (${last.contract_number})`}>{last.admin_notes}</Alert>}
          {last && last.end_reason && (
            <Alert tone="neutral" action={<LinkButton size="xs" variant="secondary" icon="printer" href={printUrl("hire-termination", last.id)}>المحضر</LinkButton>}>
              آخر عقد (<span className="mono">{last.contract_number}</span>) {last.end_reason === "انتهاء_المدة" ? "انتهت مدته" : "مفسوخ"}.
            </Alert>
          )}
          {!vehicle && <Alert tone="warning">اربط السائق بمركبة أولاً من قسم الربط أعلاه.</Alert>}
          <div className="between" style={{ flexWrap: "wrap" }}>
            <span className="cell-sub">عقد لمدة سنة — يُرسَل معه طلب التوظيف للإدارة لتحرير رخصة سائق أجير.</span>
            <Button size="sm" icon="fileSignature" loading={busy} onClick={create}>إنشاء عقد التوظيف</Button>
          </div>
        </div>
      ) : (
        <div className="stack-sm">
          {active.statut === "جديد"
            ? <Alert tone="warning" icon="hourglass">طلب التوظيف قيد الدراسة لدى الإدارة — العقد <span className="mono">{active.contract_number}</span></Alert>
            : <Alert tone="success" icon="scroll" title={`رخصة سائق أجير ${active.permit_number}`}>صالحة إلى {fmtDate(active.expiry_date)} — العقد <span className="mono">{active.contract_number}</span> ({fmtDate(active.contract_start)} ← {fmtDate(active.contract_end)})</Alert>}
          <div className="row-wrap" style={{ gap: 6 }}>
            <LinkButton size="sm" variant="secondary" icon="printer" href={printUrl("hire-job-request", active.id)}>طلب التوظيف</LinkButton>
            <LinkButton size="sm" variant="secondary" icon="fileSignature" href={printUrl("hire-contract", active.id)}>العقد</LinkButton>
            <div className="spacer"/>
            <Button size="sm" variant="danger-soft" icon="ban" loading={busy} onClick={terminate}>فسخ العقد</Button>
          </div>
        </div>
      )}
      <ErrorMsg msg={err}/>
    </div>
  );
}

function DriversTab({ token, drivers, vehicles, requests, reload }) {
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState("");

  async function remove(d) {
    const ok = await confirmDialog({ title: "حذف السائق", danger: true, confirmLabel: "حذف",
      message: `حذف السائق ${d.nom_ar || d.nom_fr || ""} ${d.prenom_ar || ""}؟ سيُفكّ ربطه بمركبته.` });
    if (!ok) return;
    const r = await api.companyDelete(token, "drivers", d.id).catch(() => ({ error: "خطأ في الاتصال" }));
    if (r?.error) setErr(r.error); else toast.success("تم حذف السائق");
    reload();
  }

  async function link(vehicleId, driverId) {
    setBusy(vehicleId); setErr("");
    const r = await api.companyLinkDriver(token, vehicleId, driverId ? Number(driverId) : null).catch(() => ({ error: "خطأ في الاتصال" }));
    setBusy(null);
    if (r.error) setErr(r.error); else toast.success("تم تحديث الربط");
    reload();
  }

  if (editing) return <DriverForm token={token} driver={editing.id ? editing : null}
    onCancel={() => setEditing(null)} onDone={() => { setEditing(null); reload(); toast.success("تم حفظ السائق"); }}/>;

  const vehicleOf = id => vehicles.find(v => v.driver_id === id);
  const hasActive = id => !!id && requests.some(h => h.driver_id === id && h.is_current && (h.statut === "جديد" || h.statut === "مقبول"));
  const name = d => `${d.nom_ar || d.nom_fr || ""} ${d.prenom_ar || d.prenom_fr || ""}`.trim();

  return (
    <div className="stack">
      <PageHeader title="السائقون والعقود" subtitle={`${drivers.length} سائق أجير — اربط كل سائق بمركبة ثم أنشئ عقد التوظيف`}
        actions={<Button icon="userPlus" onClick={() => setEditing({})}>إضافة سائق</Button>}/>

      <Card title="ربط المركبات بالسائقين" icon="link" subtitle="سائق واحد لكل مركبة — لا يمكن تغيير سائق له عقد ساري">
        {vehicles.length === 0 ? <div className="muted">أضف مركبات أولاً من قسم «المركبات».</div> : (
          <div className="stack-sm">
            {vehicles.map(v => (
              <div key={v.id} className="row" style={{ gap: 12, flexWrap: "wrap" }}>
                <div className="row" style={{ gap: 8, minWidth: 170 }}>
                  <Icon name="car" size={17} style={{ color: "var(--info)" }}/>
                  <span className="mono ltr" style={{ fontWeight: 700 }}>{v.num_immatriculation}</span>
                </div>
                <Select style={{ flex: 1, minWidth: 220, width: "auto" }} disabled={busy === v.id || hasActive(v.driver_id)}
                  title={hasActive(v.driver_id) ? "لسائق هذه المركبة عقد توظيف ساري — افسخ العقد أولاً" : ""}
                  value={v.driver_id || ""} onChange={e => link(v.id, e.target.value)}>
                  <option value="">— بدون سائق —</option>
                  {drivers.map(d => {
                    const other = vehicleOf(d.id);
                    return (
                      <option key={d.id} value={d.id}>
                        {name(d)}{d.num_permis ? ` — رخصة ${d.num_permis}` : ""}{other && other.id !== v.id ? ` (مرتبط بـ ${other.num_immatriculation})` : ""}
                      </option>
                    );
                  })}
                </Select>
                {hasActive(v.driver_id) && <Badge size="sm" icon="lock">عقد ساري</Badge>}
              </div>
            ))}
          </div>
        )}
        <ErrorMsg msg={err}/>
      </Card>

      {drivers.length === 0 && (
        <Card><EmptyState icon="users" title="لا يوجد سائقون بعد" text="أضف سائقاً وارفع رخصة سياقته."
          action={<Button icon="userPlus" onClick={() => setEditing({})}>إضافة سائق</Button>}/></Card>
      )}
      {drivers.map(d => {
        const v = vehicleOf(d.id);
        const exp = isExpired(d.date_expiration);
        return (
          <div key={d.id} className="card" style={{ padding: 18 }}>
            <div className="row" style={{ gap: 14, flexWrap: "wrap" }}>
              <Avatar name={name(d)} size={46}/>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: "var(--ink)" }}>{name(d) || "—"}</div>
                <div className="row-wrap" style={{ gap: 6, marginTop: 4 }}>
                  {d.num_permis && <Badge size="sm" icon="idCard">رخصة {d.num_permis}</Badge>}
                  {d.categories && <Badge size="sm">صنف {d.categories}</Badge>}
                  {d.date_expiration && <Badge size="sm" tone={exp ? "danger" : "neutral"}>{exp ? "منتهية" : "تنتهي"} {fmtDate(d.date_expiration)}</Badge>}
                  {v ? <Badge size="sm" tone="info" icon="car"><span className="ltr">{v.num_immatriculation}</span></Badge> : <Badge size="sm" tone="warning">غير مرتبط بمركبة</Badge>}
                </div>
              </div>
              <div className="row" style={{ gap: 4 }}>
                <Button size="sm" variant="ghost" icon="edit" onClick={() => setEditing(d)}>تعديل</Button>
                {!hasActive(d.id) && <Button size="sm" variant="ghost" icon="trash" style={{ color: "var(--danger)" }} onClick={() => remove(d)}>حذف</Button>}
              </div>
            </div>
            <HireBlock token={token} driver={d} vehicle={v} requests={requests} reload={reload}/>
          </div>
        );
      })}
    </div>
  );
}

// ════════════════════════════════════════
// الواجهة الرئيسية للشركة
// ════════════════════════════════════════
export default function CompanyApp({ account, token, onLogout }) {
  const [company,  setCompany]  = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [drivers,  setDrivers]  = useState([]);
  const [hires,    setHires]    = useState([]);
  const [vreqs,    setVreqs]    = useState([]);
  const [tab,      setTab]      = useState("overview");
  const [loading,  setLoading]  = useState(true);

  function reload() {
    return Promise.all([
      api.companyList(token, "vehicles"),
      api.companyList(token, "drivers"),
      api.companyHireRequests(token),
      api.companyVehicleRequests(token),
    ]).then(([v, d, h, vr]) => {
      setVreqs(vr.requests || []);
      setVehicles(v.vehicles || []);
      setDrivers(d.drivers || []);
      setHires(h.requests || []);
    });
  }

  useEffect(() => {
    Promise.all([api.getCompanyProfile(token), reload()]).then(([r]) => {
      const c = r.company || {};
      setCompany(c);
      if (!c.nom_ar) setTab("identity");
      setLoading(false);
    });
  }, [token]);

  const pendingHires = hires.filter(h => h.is_current && h.statut === "جديد").length;
  const nav = [{ items: NAV.map(n => ({ ...n, count: n.id === "drivers" ? pendingHires || null : null })) }];

  return (
    <AppShell brandName={company?.nom_ar || "شركة سيارات الأجرة"} brandSub="فضاء الشركات"
      nav={nav} active={tab} onNavigate={setTab}
      user={account?.username} userSub="حساب شركة" onLogout={onLogout}
      crumbs={<>فضاء الشركة<Icon name="chevronLeft" size={12}/>{NAV.find(n => n.id === tab)?.label}</>}
      title={NAV.find(n => n.id === tab)?.label}
      topActions={<Button variant="secondary" icon="printer" onClick={() => openPrint(api.companyCardUrl(token))}><span className="hide-mobile">بطاقة معلومات الشركة</span></Button>}>
      <div className="page" style={{ maxWidth: 1120 }}>
        {loading ? <Spinner/> : (
          <>
            {tab === "overview" && <Overview token={token} company={company} vehicles={vehicles} drivers={drivers} hires={hires} vreqs={vreqs} go={setTab}/>}
            {tab === "identity" && (
              <>
                {!company?.nom_ar && <Alert tone="success" icon="sparkles" title="مرحباً بشركتكم!" style={{ marginBottom: 16 }}>ابدأوا بإكمال هوية الشركة — مطلوبة قبل إنشاء عقود التوظيف.</Alert>}
                <IdentityTab token={token} company={company} onSaved={setCompany}/>
              </>
            )}
            {tab === "vehicles" && <VehiclesTab token={token} vehicles={vehicles} hires={hires} vreqs={vreqs} reload={reload}/>}
            {tab === "drivers"  && <DriversTab token={token} drivers={drivers} vehicles={vehicles} requests={hires} reload={reload}/>}
          </>
        )}
      </div>
    </AppShell>
  );
}
