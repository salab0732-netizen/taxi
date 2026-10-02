import { useState } from "react";
import { api, fileToBase64, SIFA_OPTIONS, getCommunesByWilaya } from "../api.js";
import { Field, TextInput, Select, TextArea, Dropzone, Button, Checkbox, Segmented, Alert, Badge } from "../ui/kit.jsx";
import Icon from "../ui/Icon.jsx";

// ══════════════════════════════════════════════════════
// نموذج طلب استئناف النشاط
// عند التوقف فُسخ عقد الكراء وحُرِّر الباب، لذلك يُرفق الطلب بـ:
//   المركبة (نفسها أو جديدة) + الباب (نفسه أو جديد) + عقد كراء جديد
// لا يتغيّر شيء قبل موافقة الإدارة؛ عند الموافقة تُحرَّر رخصة استغلال جديدة.
// ══════════════════════════════════════════════════════

function toISO(s) {
  if (!s) return "";
  const m = String(s).match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}` : s;
}

function F({ label, value, onChange, type="text", dir, placeholder, required }) {
  return (
    <Field label={label} required={required}>
      <TextInput type={type} dir={dir} value={value||""} placeholder={placeholder} onChange={e => onChange(e.target.value)}/>
    </Field>
  );
}

function Upload({ label, onFile, busy, done }) {
  return <Dropzone label={label} icon="scan" onFile={onFile} loading={busy} done={done} doneText={`${label} — راجع الحقول`}/>;
}

function Step({ n, title, icon, children }) {
  return (
    <div className="card flat" style={{ padding: 16 }}>
      <div className="row" style={{ gap: 10, marginBottom: 12 }}>
        <div style={{ width: 28, height: 28, borderRadius: 9, background: "var(--brand-600)", color: "#fff", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 13 }}>{n}</div>
        <Icon name={icon} size={17} style={{ color: "var(--brand-600)" }}/>
        <div className="cell-title">{title}</div>
      </div>
      {children}
    </div>
  );
}

export default function ResumeRequestForm({ token, profile, disabled, loading, onSubmit }) {
  const vehicle = profile?.vehicle || null;
  const lastDoor = profile?.resume_door || null;
  const doorFree = lastDoor && !lastDoor.taken;

  const [vehChanged, setVehChanged] = useState(!vehicle);
  const [veh, setVeh] = useState({});
  const [cgB64, setCgB64] = useState(null);
  const [cgBusy, setCgBusy] = useState(false);
  const [cgDone, setCgDone] = useState(false);

  const [doorChanged, setDoorChanged] = useState(!doorFree);
  const [door, setDoor] = useState({ decision_type:"" });
  const [decB64, setDecB64] = useState(null);
  const [cniB64, setCniB64] = useState(null);
  const [decBusy, setDecBusy] = useState(false); const [decDone, setDecDone] = useState(false);
  const [cniBusy, setCniBusy] = useState(false); const [cniDone, setCniDone] = useState(false);

  const [mode, setMode] = useState(lastDoor?.exploitation_mode || "مستأجر");
  const [rent, setRent] = useState("");
  const [notes, setNotes] = useState("");

  const uV = (k, v) => setVeh(p => ({ ...p, [k]: v }));
  const uD = (k, v) => setDoor(p => ({ ...p, [k]: v }));

  async function onCarteGrise(file) {
    setCgBusy(true);
    const { data, mimeType } = await fileToBase64(file); setCgB64(data);
    try {
      const r = await api.ocrCarteGrise(token, data, mimeType);
      if (r.ocr && !r.ocr.error) {
        const o = r.ocr;
        setVeh(p => { const n = { ...p }; for (const k in o) if (o[k] && o[k] !== "0") n[k] = o[k]; return n; });
      }
    } catch {}
    setCgBusy(false); setCgDone(true);
  }

  async function onDecision(file) {
    setDecBusy(true);
    const { data, mimeType } = await fileToBase64(file); setDecB64(data);
    try {
      const r = await api.ocrDecision(token, data, mimeType);
      if (r.ocr && !r.ocr.error) {
        const o = r.ocr;
        setDoor(p => ({ ...p,
          decision_type: o.decision_type || p.decision_type,
          decision_number: o.decision_number || p.decision_number,
          decision_date: toISO(o.decision_date) || p.decision_date,
          decision_wilaya: o.decision_wilaya || p.decision_wilaya,
          exploitation_commune: o.exploitation_commune || p.exploitation_commune,
          ben_nom_ar: p.ben_nom_ar || o.beneficiary_nom,
          ben_prenom_ar: p.ben_prenom_ar || o.beneficiary_prenom,
          ben_sifa: p.ben_sifa || o.beneficiary_sifa,
        }));
      }
    } catch {}
    setDecBusy(false); setDecDone(true);
  }

  async function onCni(file) {
    setCniBusy(true);
    const { data, mimeType } = await fileToBase64(file); setCniB64(data);
    try {
      const r = await api.ocrCni(token, data, mimeType);
      if (r.ocr && !r.ocr.error) {
        const o = r.ocr;
        setDoor(p => ({ ...p,
          ben_nom_ar: o.nom_ar || p.ben_nom_ar, ben_prenom_ar: o.prenom_ar || p.ben_prenom_ar,
          ben_nom_fr: o.nom_fr || p.ben_nom_fr, ben_prenom_fr: o.prenom_fr || p.ben_prenom_fr,
          ben_date_naissance: toISO(o.date_naissance) || p.ben_date_naissance,
          ben_lieu_naissance: o.lieu_naissance_ar || p.ben_lieu_naissance,
          ben_nin: o.nin || p.ben_nin, ben_sexe: o.sexe || p.ben_sexe,
          ben_num_cni: o.num_document_cni || p.ben_num_cni,
          ben_date_cni: toISO(o.date_delivrance_cni) || p.ben_date_cni,
          ben_groupe_sanguin: o.groupe_sanguin || p.ben_groupe_sanguin,
        }));
      }
    } catch {}
    setCniBusy(false); setCniDone(true);
  }

  function submit() {
    onSubmit({
      request_type: "استئناف",
      notes,
      resume: {
        vehicle_changed: vehChanged,
        vehicle: vehChanged ? { ...veh, image_carte_grise_base64: cgB64 } : null,
        door_changed: doorChanged,
        door: doorChanged ? { ...door, image_decision_base64: decB64, ben_image_cni_recto_base64: cniB64 } : null,
        exploitation_mode: mode,
        monthly_rent: mode === "مستأجر" ? rent : null,
      },
    });
  }

  const communes = getCommunesByWilaya("البيض");

  return (
    <div className="stack-sm" style={{ gap: 14 }}>
      <Step n="1" title="المركبة" icon="car">
        {vehicle ? (
          <div className="between" style={{ flexWrap: "wrap", marginBottom: vehChanged ? 12 : 0 }}>
            <div style={{ fontSize: 13.5 }}>المركبة الحالية: <b className="ltr">{vehicle.num_immatriculation}</b> <span className="muted">— {vehicle.marque||""} {vehicle.type_vehicule||""}</span></div>
            <Checkbox checked={vehChanged} onChange={setVehChanged}>غيّرت المركبة</Checkbox>
          </div>
        ) : <Alert tone="warning" style={{ marginBottom: 12 }}>لا توجد مركبة في ملفك — أدخل المركبة.</Alert>}
        {vehChanged && (
          <div className="stack-sm">
            <Upload label="البطاقة الرمادية للمركبة الجديدة" onFile={onCarteGrise} busy={cgBusy} done={cgDone}/>
            <div className="grid grid-3" style={{ gap: 12 }}>
              <F label="رقم التسجيل" required dir="ltr" value={veh.num_immatriculation} onChange={v => uV("num_immatriculation", v)}/>
              <F label="الصنف" value={veh.marque} onChange={v => uV("marque", v)}/>
              <F label="الطراز" value={veh.type_vehicule} onChange={v => uV("type_vehicule", v)}/>
              <F label="الرقم التسلسلي في الطراز" dir="ltr" value={veh.num_serie} onChange={v => uV("num_serie", v)}/>
              <F label="سنة أول سير" value={veh.annee_circulation} onChange={v => uV("annee_circulation", v)}/>
              <F label="الطاقة" value={veh.energie} onChange={v => uV("energie", v)}/>
            </div>
          </div>
        )}
      </Step>

      <Step n="2" title="رقم الباب" icon="door">
        {lastDoor ? (
          <div className="between" style={{ flexWrap: "wrap", marginBottom: doorChanged ? 12 : 0 }}>
            <div style={{ fontSize: 13.5 }}>
              الباب السابق: <b>{lastDoor.door_number}</b> <span className="muted">— المستفيد: {lastDoor.ben_prenom_ar||""} {lastDoor.ben_nom_ar||""}</span>
              {lastDoor.taken && <Badge tone="danger" size="sm" style={{ marginRight: 6 }}>أصبح مستغلاً</Badge>}
            </div>
            {doorFree && <Checkbox checked={doorChanged} onChange={setDoorChanged}>غيّرت رقم الباب</Checkbox>}
          </div>
        ) : <Alert tone="warning" style={{ marginBottom: 12 }}>لا يوجد باب سابق — أدخل بيانات الباب.</Alert>}
        {lastDoor?.taken && <Alert tone="danger" style={{ marginBottom: 12 }}>الباب السابق أصبح مستغلاً من طرف سائق آخر — أدخل باباً جديداً.</Alert>}
        {doorChanged && (
          <div className="stack-sm">
            <div className="grid grid-2" style={{ gap: 12 }}>
              <F label="رقم الباب الجديد" required value={door.door_number} onChange={v => uD("door_number", v)}/>
              <Field label="بلدية الإلحاق">
                <Select value={door.exploitation_commune||""} onChange={e => uD("exploitation_commune", e.target.value)}>
                  <option value="">— اختر —</option>
                  {communes.map(c => <option key={c} value={c}>{c}</option>)}
                </Select>
              </Field>
            </div>
            <Upload label="القرار الولائي" onFile={onDecision} busy={decBusy} done={decDone}/>
            <div className="grid grid-3" style={{ gap: 12 }}>
              <Field label="نوع القرار">
                <Select value={door.decision_type||""} onChange={e => uD("decision_type", e.target.value)}>
                  <option value="">— اختر —</option>
                  <option value="استفادة">استفادة</option>
                  <option value="تحويل_استفادة">تحويل استفادة</option>
                  <option value="تحويل_ولاية">تحويل من ولاية لولاية</option>
                </Select>
              </Field>
              <F label="رقم القرار" required value={door.decision_number} onChange={v => uD("decision_number", v)}/>
              <F label="تاريخ القرار" required type="date" value={door.decision_date} onChange={v => uD("decision_date", v)}/>
            </div>
            <div className="section-title" style={{ marginTop: 4 }}>المستفيد (صاحب الرخصة)</div>
            <Upload label="بطاقة تعريف المستفيد (الوجه الأمامي)" onFile={onCni} busy={cniBusy} done={cniDone}/>
            <div className="grid grid-3" style={{ gap: 12 }}>
              <F label="اللقب" required value={door.ben_nom_ar} onChange={v => uD("ben_nom_ar", v)}/>
              <F label="الاسم" required value={door.ben_prenom_ar} onChange={v => uD("ben_prenom_ar", v)}/>
              <F label="رقم التعريف الوطني" required dir="ltr" value={door.ben_nin} onChange={v => uD("ben_nin", v)}/>
              <F label="تاريخ الميلاد" type="date" value={door.ben_date_naissance} onChange={v => uD("ben_date_naissance", v)}/>
              <Field label="الصفة" required>
                <Select value={door.ben_sifa||""} onChange={e => uD("ben_sifa", e.target.value)}>
                  <option value="">— اختر —</option>
                  {SIFA_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </Field>
              <F label="الهاتف" dir="ltr" value={door.ben_telephone} onChange={v => uD("ben_telephone", v)}/>
            </div>
          </div>
        )}
      </Step>

      <Step n="3" title="عقد الكراء الجديد" icon="fileSignature">
        <Segmented value={mode} onChange={setMode} options={[
          { value: "مستأجر", label: "مكتري (عقد كراء)", icon: "fileSignature" },
          { value: "مستفيد", label: "مستفيد (أستغل رخصتي بنفسي)", icon: "user" }]}/>
        <div style={{ marginTop: 12 }}>
          {mode === "مستأجر" ? (
            <div className="grid grid-2" style={{ gap: 12, alignItems: "end" }}>
              <F label="مبلغ الإيجار الشهري (دج)" required type="number" value={rent} onChange={setRent}/>
              <div className="field-hint" style={{ paddingBottom: 10 }}>يُحرَّر عقد كراء جديد لمدة سنة من تاريخ موافقة الإدارة — حتى مع نفس المستفيد، لأن العقد السابق فُسخ عند التوقف.</div>
            </div>
          ) : <div className="field-hint">المستفيد يستغل رخصته بنفسه — لا عقد كراء.</div>}
        </div>
      </Step>

      <Field label="ملاحظات (اختياري)">
        <TextArea rows={2} value={notes} onChange={e => setNotes(e.target.value)}/>
      </Field>

      <Button block size="lg" variant="success" icon="send" loading={loading} disabled={disabled} onClick={submit}>
        {loading ? "جارٍ الإرسال..." : "تسجيل طلب الاستئناف وطباعته"}
      </Button>
    </div>
  );
}
