// ════════════════════════════════════════════════════════════
// إعداد الشهادة الإدارية (بمثابة شهادة عمل)
// يبحث البرنامج عن المعني في كل الفضاءات (مستغل / مناوب / سائق أجير)،
// ويقترح الفترات والصفة، ثم يراجعها الموظف ويعدّلها يدويًا قبل الطباعة.
// ════════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import { Modal, Button, Field, TextInput, Select, Checkbox, Alert, Spinner, Badge, toast } from "../ui/kit.jsx";
import Icon from "../ui/Icon.jsx";

const SIFAT = ["مستغل", "مناوب", "سائق أجير"];
const SIFA_TONE = { "مستغل": "brand", "مناوب": "violet", "سائق أجير": "info" };
const dmy = d => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
const todayISO = () => new Date().toISOString().slice(0, 10);
const blankPeriod = () => ({ sifa: "مستغل", start: "", end: "", open: false, end_kind: "", detail: "", source: "إضافة يدوية" });

export default function WorkCertDialog({ token, driverId, nin: initNin, title, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [person, setPerson]   = useState(null);
  const [periods, setPeriods] = useState([]);
  const [foundIn, setFoundIn] = useState([]);
  const [certNo, setCertNo]   = useState("");
  const [issue, setIssue]     = useState(todayISO());
  const [place, setPlace]     = useState("البيض");
  const [nin, setNin]         = useState(initNin || "");
  const [printing, setPrinting] = useState(false);
  const [history, setHistory]   = useState([]);
  const [suggested, setSuggested] = useState([]);
  const [restored, setRestored] = useState(null);

  async function load(params) {
    setLoading(true); setError("");
    const q = new URLSearchParams(params).toString();
    const r = await fetch(`/api/admin/work-cert/prepare?${q}`, { headers: { "X-Token": token } })
      .then(x => x.json()).catch(() => ({ error: "خطأ في الاتصال بالخادم" }));
    setLoading(false);
    if (r.error) { setError(r.error); return; }
    setNin(r.person.nin || "");
    setFoundIn(r.found_in || []);
    const sug = (r.periods || []).map(p => ({ ...p, end: p.end || "", open: !p.end, detail: "" }));
    setSuggested(sug);
    const hist = r.history || [];
    setHistory(hist);
    if (hist.length) {            // آخر شهادة محفوظة: نسترجع ما أدخله الموظف
      applySaved(hist[0], r.person);
    } else {
      setPerson(r.person); setPeriods(sug); setRestored(null);
    }
  }
  function applySaved(h, fallbackPerson) {
    setPerson({ ...(fallbackPerson || person || {}), ...(h.person || {}) });
    setPeriods((h.periods || []).map(p => ({ ...p, end: p.end || "", open: !p.end, detail: p.detail || "", source: p.source || "من الشهادة المحفوظة" })));
    if (h.place) setPlace(h.place);
    setRestored(h);
  }
  async function refreshNext(date) {
    const r = await fetch(`/api/admin/work-cert/next-number?date=${date}`, { headers: { "X-Token": token } }).then(x => x.json()).catch(() => ({}));
    if (r.cert_number) setCertNo(`${r.cert_number}/${r.year}`);
  }
  useEffect(() => { refreshNext(issue); /* eslint-disable-next-line */ }, [issue.slice(0, 4)]);
  useEffect(() => { load(driverId ? { driver_id: driverId } : { nin: initNin || "" }); /* eslint-disable-next-line */ }, []);

  const setP = (k, v) => setPerson(p => ({ ...p, [k]: v }));
  const setRow = (i, patch) => setPeriods(ps => ps.map((p, j) => j === i ? { ...p, ...patch } : p));
  const delRow = i => setPeriods(ps => ps.filter((_, j) => j !== i));

  // تنبيهات التحقق
  const issues = [];
  const sorted = [...periods].filter(p => p.start).sort((a, b) => a.start.localeCompare(b.start));
  periods.forEach((p, i) => {
    if (!p.start) issues.push(`الفترة ${i + 1}: تاريخ البداية مطلوب`);
    if (!p.open && !p.end) issues.push(`الفترة ${i + 1}: حدّد تاريخ النهاية أو «إلى يومنا هذا»`);
    if (p.start && p.end && !p.open && p.end < p.start) issues.push(`الفترة ${i + 1}: تاريخ النهاية قبل البداية`);
  });
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1], b = sorted[i];
    const aEnd = a.open ? "9999-12-31" : (a.end || a.start);
    if (b.start < aEnd) issues.push(`تداخل بين فترة «${a.sifa}» (${a.start}) وفترة «${b.sifa}» (${b.start}) — تأكّد من التواريخ`);
  }
  const blocking = issues.filter(x => !x.startsWith("تداخل"));

  async function print() {
    if (!periods.length) { toast.error("أضف فترة نشاط واحدة على الأقل"); return; }
    if (blocking.length) { toast.error(blocking[0]); return; }
    const w = window.open("", "_blank");
    if (!w) { toast.error("اسمح بالنوافذ المنبثقة لطباعة الشهادة"); return; }
    w.document.write("<p dir=rtl style='font-family:sans-serif;padding:30px'>جارٍ تحرير الشهادة…</p>");
    setPrinting(true);
    const body = {
      person, issue_date: issue, place,
      periods: periods.map(p => ({ sifa: p.sifa, start: p.start, end: p.open ? "" : p.end, end_kind: p.open ? "" : p.end_kind, detail: p.detail })),
    };
    let num = "";
    const html = await fetch("/api/admin/work-cert/render", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Token": token }, body: JSON.stringify(body),
    }).then(x => { num = x.ok ? (x.headers.get("X-Cert-Number") || "") : ""; return x.text(); })
      .catch(() => "<p dir=rtl>خطأ في الاتصال بالخادم</p>");
    setPrinting(false);
    w.document.open(); w.document.write(html); w.document.close();
    if (num) {
      toast.success(`حُرّرت الشهادة رقم ${num} وحُفظت بياناتها`);
      const h = await fetch(`/api/admin/work-cert/history?nin=${encodeURIComponent(person.nin || "")}`, { headers: { "X-Token": token } })
        .then(x => x.json()).catch(() => ({ items: [] }));
      setHistory(h.items || []); setRestored((h.items || [])[0] || null);
      refreshNext(issue);
    }
  }
  const reprint = h => window.open(`/api/admin/work-cert/${h.id}/print?token=${encodeURIComponent(token)}`, "_blank");

  const footer = (
    <>
      <Button icon="printer" onClick={print} disabled={loading || !person || printing}>{printing ? "جارٍ التحرير…" : "طباعة الشهادة"}</Button>
      <Button variant="secondary" onClick={onClose}>إلغاء</Button>
    </>
  );

  return (
    <Modal title={title || "إعداد الشهادة الإدارية"} subtitle="بمثابة شهادة عمل — راجع البيانات والفترات ثم اطبع"
      icon="stamp" tone="gold" size="lg" onClose={onClose} footer={footer}>
      <div className="stack" style={{ gap: 14 }}>
        {/* بحث بالرقم الوطني في كامل البرنامج */}
        <div className="row" style={{ gap: 8, alignItems: "flex-end" }}>
          <Field label="رقم التعريف الوطني" style={{ flex: 1 }} hint="يُبحث عن المعني في كامل البرنامج: سائق مستغل، مناوب لدى سائق آخر، سائق لدى شركة">
            <TextInput dir="ltr" value={nin} onChange={e => setNin(e.target.value.trim())} placeholder="18 رقمًا"/>
          </Field>
          <Button variant="secondary" icon="search" onClick={() => nin && load({ nin })} style={{ marginBottom: 22 }}>بحث</Button>
        </div>

        {loading ? <div className="loader"><Spinner/>جارٍ البحث في سجلات البرنامج…</div>
        : error ? <Alert tone="danger" title="تعذّر الإعداد">{error}</Alert>
        : person && (<>
          {foundIn.length > 0 && (
            <div className="row-wrap" style={{ gap: 6 }}>
              <span className="muted" style={{ fontSize: 13 }}>وُجد في البرنامج بصفة:</span>
              {foundIn.map(x => <Badge key={x} tone="success" dot size="sm">{x}</Badge>)}
            </div>
          )}

          {restored ? (
            <Alert tone="info" icon="history" title={`استُرجعت بيانات آخر شهادة رقم ${restored.cert_number}/${(restored.issue_date || "").slice(0, 4)} بتاريخ ${dmy(restored.issue_date)}`}
              action={suggested.length > 0 && <Button size="sm" variant="secondary" icon="refresh" onClick={() => { setPeriods(suggested); setRestored(null); toast.info("طُبّقت فترات النشاط المقترحة من سجلات البرنامج"); }}>اقتراح البرنامج</Button>}>
              يمكنك تعديل كل البيانات. عند الطباعة تُحرَّر شهادة جديدة برقم جديد، وتبقى الشهادات السابقة محفوظة.
            </Alert>
          ) : history.length === 0 && (
            <Alert tone="neutral" icon="info" title="أول شهادة إدارية لهذا المعني">الفترات مقترحة من سجلات البرنامج — راجعها قبل الطباعة.</Alert>
          )}

          <div className="section-title">بيانات المعني</div>
          <div className="grid grid-3" style={{ gap: 10 }}>
            <Field label="اللقب"><TextInput value={person.nom} onChange={e => setP("nom", e.target.value)}/></Field>
            <Field label="الاسم"><TextInput value={person.prenom} onChange={e => setP("prenom", e.target.value)}/></Field>
            <Field label="الجنس">
              <Select value={person.sexe || ""} onChange={e => setP("sexe", e.target.value)}>
                <option value="">ذكر</option><option value="أنثى">أنثى</option>
              </Select>
            </Field>
            <Field label="تاريخ الميلاد"><TextInput type="date" value={person.date_naissance} onChange={e => setP("date_naissance", e.target.value)}/></Field>
            <Field label="مكان الميلاد"><TextInput value={person.lieu_naissance} onChange={e => setP("lieu_naissance", e.target.value)}/></Field>
            <Field label="رقم رخصة السياقة"><TextInput dir="ltr" value={person.num_permis} onChange={e => setP("num_permis", e.target.value)}/></Field>
            <Field label="تاريخ صدور الرخصة"><TextInput type="date" value={person.permis_date} onChange={e => setP("permis_date", e.target.value)}/></Field>
            <Field label="الصادرة عن (بلدية)"><TextInput value={person.permis_commune} onChange={e => setP("permis_commune", e.target.value)}/></Field>
            <Field label="رقم الهاتف"><TextInput dir="ltr" value={person.telephone} onChange={e => setP("telephone", e.target.value)}/></Field>
            <Field label="العنوان" className="span-all"><TextInput value={person.adresse} onChange={e => setP("adresse", e.target.value)}/></Field>
          </div>

          <div className="section-title">فترات مزاولة النشاط</div>
          {periods.length === 0 && <Alert tone="warning" title="لا توجد فترات نشاط مسجّلة">أضف الفترات يدويًا.</Alert>}
          <div className="stack-sm">
            {periods.map((p, i) => (
              <div key={i} className="wc-period" style={{ "--wc": `var(--${SIFA_TONE[p.sifa] === "brand" ? "brand-500" : SIFA_TONE[p.sifa]})` }}>
                <div className="between" style={{ marginBottom: 8 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <span className="wc-num">{i + 1}</span>
                    <span className="muted" style={{ fontSize: 12.5 }}>{p.source}</span>
                  </div>
                  <Button variant="ghost" size="xs" icon="trash" onClick={() => delRow(i)} aria-label="حذف الفترة">حذف</Button>
                </div>
                <div className="grid grid-4" style={{ gap: 10 }}>
                  <Field label="الصفة">
                    <Select value={p.sifa} onChange={e => setRow(i, { sifa: e.target.value })}>
                      {SIFAT.map(s => <option key={s}>{s}</option>)}
                    </Select>
                  </Field>
                  <Field label="ابتداءً من" required><TextInput type="date" value={p.start} onChange={e => setRow(i, { start: e.target.value })}/></Field>
                  <Field label="إلى غاية">
                    <TextInput type="date" value={p.open ? "" : p.end} disabled={p.open} onChange={e => setRow(i, { end: e.target.value })}/>
                  </Field>
                  <Field label="بيان إضافي (اختياري)"><TextInput value={p.detail} placeholder="مثال: لدى السيد …" onChange={e => setRow(i, { detail: e.target.value })}/></Field>
                </div>
                <div className="row-wrap" style={{ gap: 18, marginTop: 8 }}>
                  <Checkbox checked={p.open} onChange={v => setRow(i, { open: v, end: v ? "" : (p.end || todayISO()) })}>إلى يومنا هذا</Checkbox>
                  {!p.open && <Checkbox checked={p.end_kind === "final"} onChange={v => setRow(i, { end_kind: v ? "final" : "" })}>تاريخ توقّفه النهائي</Checkbox>}
                </div>
              </div>
            ))}
          </div>
          <div><Button variant="secondary" size="sm" icon="plus" onClick={() => setPeriods(ps => [...ps, blankPeriod()])}>إضافة فترة</Button></div>

          {issues.length > 0 && (
            <Alert tone={blocking.length ? "danger" : "warning"} title="تحقّق قبل الطباعة">
              {issues.map(x => <div key={x}>• {x}</div>)}
            </Alert>
          )}

          <div className="section-title">بيانات التحرير</div>
          <div className="grid grid-3" style={{ gap: 10 }}>
            <Field label="رقم الشهادة" hint="يُمنح تلقائيًا عند الطباعة"><TextInput dir="ltr" value={certNo} readOnly/></Field>
            <Field label="حرر بـ"><TextInput value={place} onChange={e => setPlace(e.target.value)}/></Field>
            <Field label="بتاريخ"><TextInput type="date" value={issue} onChange={e => setIssue(e.target.value)}/></Field>
          </div>

          {history.length > 0 && (<>
            <div className="section-title">الشهادات المحرّرة سابقًا ({history.length})</div>
            <div className="list">
              {history.map(h => (
                <div key={h.id} className="list-item">
                  <div className="icon-tile sm tone-gold"><Icon name="stamp" size={15}/></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="cell-title ltr" style={{ textAlign: "right" }}>{h.cert_number}/{(h.issue_date || "").slice(0, 4)}</div>
                    <div className="cell-sub">بتاريخ <span className="ltr">{dmy(h.issue_date)}</span> — {(h.periods || []).length} فترة</div>
                  </div>
                  <Button size="xs" variant="ghost" icon="edit" onClick={() => { applySaved(h); toast.info(`حُمّلت بيانات الشهادة ${h.cert_number}`); }}>استعمال بياناتها</Button>
                  <Button size="xs" variant="secondary" icon="printer" onClick={() => reprint(h)}>إعادة طباعة</Button>
                </div>
              ))}
            </div>
          </>)}
        </>)}
      </div>
    </Modal>
  );
}
