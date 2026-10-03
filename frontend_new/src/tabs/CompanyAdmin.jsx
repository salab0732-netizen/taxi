// ════════════════════════════════════════
// لوحة المدير — فضاء شركات سيارات الأجرة
// لوحة القيادة · الطلبات · الشركات · الأرشيف · تصدير Excel
// ════════════════════════════════════════
import { useState, useEffect } from "react";
import { api } from "../api.js";
import Icon from "../ui/Icon.jsx";
import {
  Button, LinkButton, Card, PageHeader, Badge, StatCard, Alert, SearchInput, Spinner, EmptyState, DescList,
  Chips, Segmented, Avatar, toast, confirmDialog, promptDialog, downloadFile, fmtDate, openPrint,
} from "../ui/kit.jsx";

const HDR = t => ({ "X-Token": t });

export const COMPANY_NAV = [
  { id: "stats",     icon: "dashboard", label: "لوحة القيادة" },
  { id: "requests",  icon: "inbox",     label: "الطلبات" },
  { id: "companies", icon: "building",  label: "الشركات" },
  { id: "archive",   icon: "archive",   label: "الأرشيف" },
];

export function CompanyAdminSection({ token, section, go }) {
  return (
    <>
      {section === "stats"     && <CompanyStats token={token} go={go}/>}
      {section === "requests"  && <RequestsSection token={token}/>}
      {section === "companies" && <CompaniesList token={token}/>}
      {section === "archive"   && <CompanyArchive token={token}/>}
    </>
  );
}

export default function CompanyAdmin({ token }) {
  const [section, setSection] = useState("stats");
  return <CompanyAdminSection token={token} section={section} go={setSection}/>;
}

export function CompanyExcelBtn({ token }) {
  const [loading, setLoading] = useState(false);
  async function run() {
    setLoading(true);
    try {
      await downloadFile("/api/admin/company/export", token, `البطاقة_الجماعية_للشركات_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success("تم تنزيل البطاقة الجماعية للشركات");
    } catch (e) { toast.error("تعذّر التصدير: " + e.message); }
    finally { setLoading(false); }
  }
  return <Button variant="secondary" icon="sheet" loading={loading} onClick={run}><span className="hide-mobile">تصدير بيانات الشركات</span><span className="show-mobile">Excel</span></Button>;
}

const HIRE_TONE = { "جديد": "info", "مقبول": "success", "مرفوض": "danger", "ملغى": "neutral" };
const hireLabel = h => {
  if (h.statut === "مقبول" && h.is_current) return "ساري";
  if (h.end_reason) return h.end_reason === "انتهاء_المدة" ? "انتهت المدة" : "مفسوخ";
  return h.statut;
};
const hireTone = h => (h.statut === "مقبول" && !h.is_current) ? "neutral" : HIRE_TONE[h.statut] || "neutral";
const today = () => new Date().toISOString().slice(0, 10);

// ── لوحة القيادة ──
function CompanyStats({ token, go }) {
  const [st, setSt] = useState(null);
  useEffect(() => {
    fetch("/api/admin/company/stats", { headers: HDR(token) }).then(r => r.json()).then(r => setSt(r.stats || {}));
  }, [token]);
  if (!st) return <Spinner/>;
  const pending = (st.new_requests || 0) + (st.vehicle_requests_new || 0);
  return (
    <div className="stack" style={{ gap: 22 }}>
      <PageHeader eyebrow="فضاء الشركات" title="نظرة عامة على الشركات" subtitle="الأسطول، السائقون الأجراء، عقود التوظيف ورخص سائق أجير."
        actions={<Button icon="inbox" onClick={() => go("requests")}>معالجة الطلبات{pending ? ` (${pending})` : ""}</Button>}/>
      {pending > 0 && (
        <Alert tone="info" title={`${pending} طلب بانتظار قرارك`}
          action={<Button size="sm" variant="secondary" onClick={() => go("requests")}>فتح الطلبات</Button>}>
          {st.new_requests || 0} طلب توظيف و{st.vehicle_requests_new || 0} طلب تغيير مركبة.
        </Alert>
      )}
      <div>
        <div className="section-title">الشركات والأسطول</div>
        <div className="stats-grid">
          <StatCard icon="building" tone="brand" label="إجمالي الشركات" value={st.total_companies} onClick={() => go("companies")}/>
          <StatCard icon="shieldCheck" tone="success" label="شركات مكتملة الملف" value={st.complete_companies} onClick={() => go("companies")}/>
          <StatCard icon="car" tone="info" label="مركبات الشركات" value={st.total_vehicles} onClick={() => go("companies")}/>
          <StatCard icon="alert" tone="warning" label="مركبات بدون سائق" value={st.vehicles_no_driver} onClick={() => go("companies")}/>
          <StatCard icon="users" tone="info" label="السائقون الأجراء" value={st.total_drivers} onClick={() => go("companies")}/>
          <StatCard icon="idCard" tone="danger" label="رخص سياقة منتهية" value={st.expired_permis} onClick={() => go("companies")}/>
        </div>
      </div>
      <div>
        <div className="section-title">طلبات التوظيف والرخص</div>
        <div className="stats-grid">
          <StatCard icon="inbox" tone="info" label="طلبات توظيف جديدة" value={st.new_requests} onClick={() => go("requests")}/>
          <StatCard icon="repeat" tone="warning" label="طلبات تغيير مركبة" value={st.vehicle_requests_new} onClick={() => go("requests")}/>
          <StatCard icon="fileSignature" tone="brand" label="عقود توظيف سارية" value={st.active_contracts} onClick={() => go("requests")}/>
          <StatCard icon="scroll" tone="violet" label="رخص سائق أجير سارية" value={st.active_permits} onClick={() => go("requests")}/>
          <StatCard icon="checkCircle" tone="success" label="طلبات مقبولة" value={st.approved_requests}/>
          <StatCard icon="xCircle" tone="danger" label="طلبات مرفوضة" value={st.rejected_requests}/>
          <StatCard icon="ban" tone="neutral" label="طلبات ملغاة" value={st.cancelled_requests} onClick={() => go("archive")}/>
          <StatCard icon="trash" tone="danger" label="عقود مفسوخة / منتهية" value={st.terminated} onClick={() => go("archive")}/>
        </div>
      </div>
    </div>
  );
}

// ── قائمة الشركات + التفاصيل ──
function CompaniesList({ token }) {
  const [list, setList] = useState(null);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState({});

  useEffect(() => {
    const t = setTimeout(() => {
      fetch(`/api/admin/companies?search=${encodeURIComponent(search)}`, { headers: HDR(token) })
        .then(r => r.json()).then(r => setList(r.companies || []));
    }, 250);
    return () => clearTimeout(t);
  }, [search, token]);

  function toggle(id) {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    if (!detail[id]) {
      fetch(`/api/admin/companies/${id}`, { headers: HDR(token) }).then(r => r.json()).then(r => setDetail(d => ({ ...d, [id]: r })));
    }
  }

  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageHeader title="الشركات" subtitle="ملفات شركات سيارات الأجرة — اضغط على شركة لعرض ملفها الكامل ووثائقها."/>
      <Card padded={false}><div style={{ padding: 16 }}>
        <SearchInput value={search} onChange={setSearch} placeholder="اسم الشركة، السجل التجاري، رقم الاعتماد، الهاتف..."/>
      </div></Card>
      {!list ? <Spinner/> : list.length === 0 ? <Card><EmptyState icon="building" title="لا توجد شركات"/></Card> : (
        <div className="stack-sm">
          {list.map(c => (
            <div key={c.id} className={`req-card ${openId === c.id ? "open" : ""}`}>
              <div className="req-head" onClick={() => toggle(c.id)}>
                <div className="icon-tile tone-brand"><Icon name="building" size={20}/></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="cell-title">{c.nom_ar || <span className="muted">ملف غير مكتمل — {c.username}</span>}</div>
                  <div className="cell-sub">السجل التجاري <span className="ltr">{c.registre_commerce || "—"}</span> · الاعتماد <span className="ltr">{c.num_agrement || "—"}</span>{c.wilaya ? ` · ${c.wilaya}` : ""}</div>
                </div>
                <div className="row-wrap hide-mobile" style={{ gap: 6 }}>
                  <Badge tone="info" icon="car">{c.nb_vehicles}</Badge>
                  <Badge tone="brand" icon="users">{c.nb_drivers}</Badge>
                  <Badge tone="violet" icon="scroll">{c.nb_permits}</Badge>
                  {c.nb_pending > 0 && <Badge tone="warning" icon="inbox">{c.nb_pending} جديد</Badge>}
                </div>
                <Icon name={openId === c.id ? "chevronUp" : "chevronDown"} size={18} style={{ color: "var(--subtle)" }}/>
              </div>
              {openId === c.id && (
                <div className="req-body" style={{ background: "var(--surface-2)", paddingTop: 16 }}>
                  {!detail[c.id] ? <Spinner/> : <CompanyDetail token={token} d={detail[c.id]}/>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MiniTable({ cols, rows }) {
  if (!rows.length) return <div className="muted" style={{ fontSize: 13, padding: "6px 0" }}>لا توجد سجلات</div>;
  return (
    <div className="table-wrap" style={{ boxShadow: "none" }}>
      <table className="table">
        <thead><tr>{cols.map(c => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j}>{v ?? "—"}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function CompanyDetail({ token, d }) {
  const c = d.company;
  const doc = (kind, id) => api.adminCompanyPrintUrl(token, kind, id);
  const name = x => `${x.prenom_ar || x.drv_prenom_ar || ""} ${x.nom_ar || x.drv_nom_ar || ""}`.trim() || "—";
  return (
    <div className="stack">
      <div className="row-wrap">
        <Button icon="printer" onClick={() => openPrint(api.adminCompanyDocUrl(token, "card", c.id))}>بطاقة معلومات الشركة</Button>
        <Button variant="secondary" icon="history" onClick={() => openPrint(api.adminCompanyDocUrl(token, "history", c.id))}>الشهادة التاريخية للشركة</Button>
      </div>
      <div className="grid grid-2">
        <Card title="هوية الشركة" icon="building" className="flat">
          <DescList items={[
            { label: "اسم الشركة", value: c.nom_ar }, { label: "Raison sociale", value: c.nom_fr, ltr: true },
            { label: "اسم المستخدم", value: c.username, ltr: true }, { label: "الهاتف", value: c.telephone, ltr: true },
            { label: "البريد", value: c.email || c.google_email, ltr: true },
            { label: "المقر الاجتماعي", value: [c.adresse, c.commune, c.wilaya].filter(Boolean).join(" — ") },
            { label: "السجل التجاري", value: `${c.registre_commerce || "—"}${c.rc_date ? " — " + fmtDate(c.rc_date) : ""}` },
            { label: "الرقم الجبائي", value: c.num_fiscal, ltr: true },
            { label: "الاعتماد", value: `${c.num_agrement || "—"}${c.date_agrement ? " — " + fmtDate(c.date_agrement) : ""}` },
          ]}/>
        </Card>
        <Card title="المسيّر" icon="user" className="flat">
          <DescList items={[
            { label: "الاسم واللقب", value: `${c.gerant_prenom_ar || ""} ${c.gerant_nom_ar || ""}`.trim() },
            { label: "Nom / Prénom", value: `${c.gerant_nom_fr || ""} ${c.gerant_prenom_fr || ""}`.trim(), ltr: true },
            { label: "تاريخ الميلاد", value: fmtDate(c.gerant_date_naissance) }, { label: "مكان الميلاد", value: c.gerant_lieu_naissance },
            { label: "رقم التعريف", value: c.gerant_nin, ltr: true }, { label: "العنوان", value: c.gerant_adresse },
          ]}/>
        </Card>
      </div>
      <Card title={`المركبات (${d.vehicles.length})`} icon="car" tone="info" className="flat">
        <MiniTable cols={["رقم التسجيل", "الصنف / الطراز", "الرقم التسلسلي", "الطاقة", "المقاعد", "السائق"]}
          rows={d.vehicles.map(v => [<span className="ltr mono">{v.num_immatriculation}</span>, `${v.marque || ""} ${v.type_vehicule || ""}`,
            v.num_serie, v.energie, v.nb_places,
            v.driver_id ? `${v.drv_prenom_ar || ""} ${v.drv_nom_ar || ""}` : <Badge tone="warning" size="sm">بدون سائق</Badge>])}/>
      </Card>
      <Card title={`السائقون الأجراء (${d.drivers.length})`} icon="users" className="flat">
        <MiniTable cols={["الاسم واللقب", "رقم التعريف", "الهاتف", "رقم الرخصة", "الأصناف", "صالحة إلى"]}
          rows={d.drivers.map(x => [name(x), <span className="ltr mono">{x.nin}</span>, x.telephone, x.num_permis, x.categories,
            x.date_expiration && x.date_expiration < today() ? <Badge tone="danger" size="sm">{fmtDate(x.date_expiration)} منتهية</Badge> : fmtDate(x.date_expiration)])}/>
      </Card>
      <Card title={`عقود التوظيف ورخص سائق أجير (${d.hires.length})`} icon="fileSignature" tone="violet" className="flat">
        <MiniTable cols={["رقم العقد", "السائق", "المركبة", "المدة", "الحالة", "رقم الرخصة", "الوثائق"]}
          rows={d.hires.map(h => [h.contract_number, name(h), <span className="ltr">{h.num_immatriculation}</span>,
            `${fmtDate(h.contract_start)} ← ${fmtDate(h.contract_end)}`,
            <Badge tone={hireTone(h)} size="sm" dot>{hireLabel(h)}</Badge>, h.permit_number,
            <div className="row" style={{ gap: 4 }}>
              <LinkButton size="xs" variant="ghost" href={doc("hire-job-request", h.id)}>الطلب</LinkButton>
              <LinkButton size="xs" variant="ghost" href={doc("hire-contract", h.id)}>العقد</LinkButton>
              {h.statut === "مقبول" && <LinkButton size="xs" variant="ghost" href={doc("hire-permit", h.id)}>الرخصة</LinkButton>}
              {h.end_reason && <LinkButton size="xs" variant="ghost" href={doc("hire-termination", h.id)}>الفسخ</LinkButton>}
            </div>])}/>
      </Card>
    </div>
  );
}

// ── الأرشيف ──
function CompanyArchive({ token }) {
  const [list, setList] = useState(null);
  const [search, setSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => {
      fetch(`/api/admin/company/archive?search=${encodeURIComponent(search)}`, { headers: HDR(token) })
        .then(r => r.json()).then(r => setList(r.requests || []));
    }, 250);
    return () => clearTimeout(t);
  }, [search, token]);
  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageHeader title="أرشيف الشركات" subtitle="عقود التوظيف المفسوخة والمنتهية والمرفوضة والملغاة."/>
      <Card padded={false}><div style={{ padding: 16 }}>
        <SearchInput value={search} onChange={setSearch} placeholder="الشركة، السائق، رقم العقد، المركبة..."/>
      </div></Card>
      {!list ? <Spinner/> : list.length === 0 ? <Card><EmptyState icon="archive" title="الأرشيف فارغ" text="لا توجد عقود في الأرشيف."/></Card> : (
        <div className="table-wrap">
          <table className="table" style={{ minWidth: 820 }}>
            <thead><tr><th>الشركة / السائق</th><th>العقد</th><th>المركبة</th><th>المدة</th><th>الوضعية</th><th>الوثائق</th></tr></thead>
            <tbody>
              {list.map(h => (
                <tr key={h.id}>
                  <td><div className="cell-title">{h.co_nom_ar || "—"}</div><div className="cell-sub">{h.drv_prenom_ar || ""} {h.drv_nom_ar || ""}</div></td>
                  <td className="mono">{h.contract_number || "—"}</td>
                  <td className="ltr" style={{ textAlign: "right" }}>{h.num_immatriculation || "—"}</td>
                  <td className="cell-sub nowrap">{fmtDate(h.contract_start)} ← {fmtDate(h.contract_end)}</td>
                  <td>
                    <Badge tone={hireTone(h)} size="sm" dot>{hireLabel(h)}</Badge>
                    {h.end_reason && <div className="cell-sub">{fmtDate((h.terminated_at || "").slice(0, 10))}</div>}
                    {h.permit_number && <div className="cell-sub">الرخصة {h.permit_number} ملغاة</div>}
                    {h.admin_notes && <div className="cell-sub" style={{ color: "var(--danger)" }}>{h.admin_notes}</div>}
                  </td>
                  <td><div className="row" style={{ gap: 4 }}>
                    <LinkButton size="xs" variant="ghost" icon="fileText" href={api.adminCompanyPrintUrl(token, "hire-contract", h.id)}>العقد</LinkButton>
                    {h.end_reason && <LinkButton size="xs" variant="ghost" icon="fileText" href={api.adminCompanyPrintUrl(token, "hire-termination", h.id)}>الفسخ</LinkButton>}
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── الطلبات: توظيف + تغيير مركبة ──
function RequestsSection({ token }) {
  const [sub, setSub] = useState("hire");
  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageHeader title="طلبات الشركات" subtitle="طلبات التوظيف (رخصة سائق أجير) وطلبات تغيير المركبة."
        actions={<Segmented value={sub} onChange={setSub} options={[
          { value: "hire", label: "طلبات التوظيف", icon: "fileSignature" },
          { value: "vehicle", label: "تغيير المركبة", icon: "repeat" }]}/>}/>
      {sub === "hire" ? <HireRequestsAdmin token={token}/> : <VehicleRequestsAdmin token={token}/>}
    </div>
  );
}

const STATUT_OPTS = [{ value: "جديد", label: "جديدة" }, { value: "مقبول", label: "مقبولة" }, { value: "مرفوض", label: "مرفوضة" }, { value: "ملغى", label: "ملغاة" }, { value: "", label: "الكل" }];

function HireRequestsAdmin({ token }) {
  const [list, setList] = useState(null);
  const [statut, setStatut] = useState("جديد");
  const [busy, setBusy] = useState(null);
  const load = () => api.adminHireRequests(token, statut).then(r => setList(r.requests || []));
  useEffect(() => { setList(null); load(); }, [statut]);

  async function process(h, st) {
    let notes = "";
    const who = `${h.drv_prenom_ar || ""} ${h.drv_nom_ar || ""}`.trim();
    if (st === "مرفوض") {
      notes = await promptDialog({ title: "رفض طلب التوظيف", danger: true, label: "سبب الرفض", required: true, confirmLabel: "رفض الطلب",
        message: `سيُرفض طلب توظيف ${who} لدى ${h.co_nom_ar || "الشركة"} ويُبلَّغ السبب للشركة.` });
      if (!notes || !notes.trim()) return;
    } else {
      const ok = await confirmDialog({ title: "قبول وتحرير الرخصة", icon: "scroll", tone: "success", confirmLabel: "قبول وتحرير الرخصة",
        message: `سيُقبل الطلب وتُحرَّر رخصة سائق أجير باسم ${who}. تُفتح الرخصة للطباعة مباشرة.` });
      if (!ok) return;
    }
    setBusy(h.id);
    const r = await api.adminProcessHire(token, h.id, st, notes);
    setBusy(null);
    if (r?.error) { toast.error(r.error); return; }
    toast.success(st === "مقبول" ? `تم تحرير الرخصة ${r.permit_number || ""}` : "تم رفض الطلب");
    window.dispatchEvent(new Event("admin-counts"));
    if (st === "مقبول") openPrint(api.adminCompanyPrintUrl(token, "hire-permit", h.id));
    load();
  }

  const doc = (kind, id) => api.adminCompanyPrintUrl(token, kind, id);
  return (
    <div className="stack" style={{ gap: 14 }}>
      <Chips options={STATUT_OPTS} value={statut} onChange={setStatut}/>
      {!list ? <Spinner/> : list.length === 0 ? <Card><EmptyState icon="inbox" title="لا توجد طلبات"/></Card> : list.map(h => (
        <Card key={h.id} padded={false}>
          <div className="req-head" style={{ cursor: "default" }}>
            <Avatar name={`${h.drv_prenom_ar || ""} ${h.drv_nom_ar || ""}`}/>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="cell-title">{h.drv_prenom_ar || ""} {h.drv_nom_ar || ""}</div>
              <div className="cell-sub"><Icon name="building" size={12}/> {h.co_nom_ar || "—"} · عقد <span className="mono">{h.contract_number}</span></div>
            </div>
            <Badge tone={hireTone(h)} dot>{hireLabel(h)}</Badge>
          </div>
          <div style={{ padding: "0 16px 16px" }}>
            <div className="kv-strip">
              <div><div className="k">السجل التجاري</div><div className="v ltr">{h.co_rc || "—"}</div></div>
              <div><div className="k">الاعتماد</div><div className="v">{h.co_num_agrement || "—"}</div><div className="cell-sub">{fmtDate(h.co_date_agrement)}</div></div>
              <div><div className="k">رخصة السياقة</div><div className="v ltr">{h.drv_num_permis || "—"}</div>
                <div className="cell-sub" style={h.drv_permis_expiration && h.drv_permis_expiration < today() ? { color: "var(--danger)" } : undefined}>تنتهي {fmtDate(h.drv_permis_expiration)}</div></div>
              <div><div className="k">المركبة</div><div className="v ltr">{h.num_immatriculation || "—"}</div></div>
              <div><div className="k">مدة العقد</div><div className="v" style={{ fontSize: 13 }}>{fmtDate(h.contract_start)} ← {fmtDate(h.contract_end)}</div></div>
              {h.permit_number && <div><div className="k">رقم الرخصة</div><div className="v">{h.permit_number}</div></div>}
            </div>
            {h.admin_notes && <Alert tone="danger" style={{ marginTop: 10 }}>{h.admin_notes}</Alert>}
            <div className="row-wrap" style={{ marginTop: 14 }}>
              {h.statut === "جديد" && <>
                <Button variant="success" icon="check" loading={busy === h.id} onClick={() => process(h, "مقبول")}>قبول وتحرير الرخصة</Button>
                <Button variant="danger-soft" icon="x" disabled={busy === h.id} onClick={() => process(h, "مرفوض")}>رفض</Button>
              </>}
              {h.statut === "مقبول" && !!h.is_current && <Button icon="printer" onClick={() => openPrint(doc("hire-permit", h.id))}>رخصة سائق أجير</Button>}
              {h.statut === "مقبول" && !h.is_current && <Badge tone="danger" icon="ban">{h.end_reason === "انتهاء_المدة" ? "انتهت مدة العقد" : "عقد مفسوخ"} — الرخصة ملغاة</Badge>}
              <div className="spacer"/>
              <LinkButton size="sm" variant="ghost" icon="printer" href={doc("hire-job-request", h.id)}>طلب التوظيف</LinkButton>
              <LinkButton size="sm" variant="ghost" icon="fileSignature" href={doc("hire-contract", h.id)}>العقد</LinkButton>
              {h.end_reason && <LinkButton size="sm" variant="ghost" icon="fileText" href={doc("hire-termination", h.id)}>محضر الفسخ</LinkButton>}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function VehicleRequestsAdmin({ token }) {
  const [list, setList] = useState(null);
  const [statut, setStatut] = useState("جديد");
  const [busy, setBusy] = useState(null);
  const load = () => api.adminVehicleRequests(token, statut).then(r => setList(r.requests || []));
  useEffect(() => { setList(null); load(); }, [statut]);

  async function process(r, st) {
    let notes = "";
    if (st === "مرفوض") {
      notes = await promptDialog({ title: "رفض تغيير المركبة", danger: true, label: "سبب الرفض", required: true, confirmLabel: "رفض وإرجاع المركبة",
        message: "عند الرفض تُسترجع المركبة السابقة تلقائياً في ملف الشركة وفي العقد الساري." });
      if (!notes || !notes.trim()) return;
    } else {
      const ok = await confirmDialog({ title: "قبول تغيير المركبة", icon: "repeat", tone: "success", confirmLabel: "قبول",
        message: `قبول تغيير المركبة ${r.old_data?.num_immatriculation || ""} ← ${r.new_data?.num_immatriculation || ""}. إن وُجد عقد ساري تُحرَّر رخصة سائق أجير جديدة.` });
      if (!ok) return;
    }
    setBusy(r.id);
    const res = await api.adminProcessVehicleRequest(token, r.id, st, notes);
    setBusy(null);
    if (res?.error) { toast.error(res.error); return; }
    toast.success(st === "مقبول" ? (res.permit ? `تم القبول — حُرّرت الرخصة ${res.permit.permit_number}، اطبعها من البطاقة` : "تم قبول تغيير المركبة") : "تم الرفض واسترجاع المركبة السابقة");
    window.dispatchEvent(new Event("admin-counts"));
    if (st === "مقبول" && res.permit) openPrint(api.adminCompanyPrintUrl(token, "hire-permit", res.permit.id));
    load();
  }

  const veh = x => (
    <><div className="v ltr">{x?.num_immatriculation || "—"}</div><div className="cell-sub">{x?.marque || ""} {x?.type_vehicule || ""} · {x?.annee_circulation || "—"}</div></>
  );
  return (
    <div className="stack" style={{ gap: 14 }}>
      <Chips options={STATUT_OPTS.filter(o => o.value !== "ملغى")} value={statut} onChange={setStatut}/>
      {!list ? <Spinner/> : list.length === 0 ? <Card><EmptyState icon="repeat" title="لا توجد طلبات"/></Card> : list.map(r => (
        <Card key={r.id} padded={false}>
          <div className="req-head" style={{ cursor: "default" }}>
            <div className="icon-tile tone-info"><Icon name="repeat" size={19}/></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="cell-title">تغيير مركبة — {r.co_nom_ar || "—"}</div>
              <div className="cell-sub"><span className="mono">{r.request_number}</span> · {(r.created_at || "").slice(0, 16)}</div>
            </div>
            <Badge tone={HIRE_TONE[r.statut] || "neutral"} dot>{r.statut}</Badge>
          </div>
          <div style={{ padding: "0 16px 16px" }}>
            <div className="kv-strip">
              <div><div className="k">المركبة الحالية</div>{veh(r.old_data)}</div>
              <div><div className="k">المركبة الجديدة</div>{veh(r.new_data)}</div>
              <div><div className="k">السائق الأجير</div><div className="v">{`${r.drv_prenom_ar || ""} ${r.drv_nom_ar || ""}`.trim() || "—"}</div></div>
            </div>
            {r.admin_notes && <Alert tone="neutral" style={{ marginTop: 10 }}>{r.admin_notes}</Alert>}
            <div className="row-wrap" style={{ marginTop: 14 }}>
              {r.statut === "مقبول" && r.permit_hire_id && (r.permit_current
                ? <Button icon="printer" onClick={() => openPrint(api.adminCompanyPrintUrl(token, "hire-permit", r.permit_hire_id))}>طباعة رخصة سائق أجير {r.permit_number}</Button>
                : <Badge tone="neutral" icon="ban">الرخصة {r.permit_number} لم تعد سارية</Badge>)}
              {r.statut === "جديد" && <>
                <Button variant="success" icon="check" loading={busy === r.id} onClick={() => process(r, "مقبول")}>قبول</Button>
                <Button variant="danger-soft" icon="x" disabled={busy === r.id} onClick={() => process(r, "مرفوض")}>رفض</Button>
              </>}
              <div className="spacer"/>
              <LinkButton size="sm" variant="ghost" icon="printer" href={api.adminCompanyPrintUrl(token, "vehicle-change", r.id)}>طلب التغيير</LinkButton>

            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
