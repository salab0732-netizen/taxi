// ════════════════════════════════════════════════════════════
// لوحة الإدارة — فضاء السائقين + فضاء الشركات
// ════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";
import MonitorTab from "./MonitorTab.jsx";
import WorkCertDialog from "./WorkCertDialog.jsx";
import { CompanyAdminSection, CompanyExcelBtn, COMPANY_NAV } from "./CompanyAdmin.jsx";
import { api, REQUEST_TYPES } from "../api.js";
import { AppShell } from "../ui/Shell.jsx";
import Icon from "../ui/Icon.jsx";
import {
  Button, Card, PageHeader, Badge, StatusBadge, StatCard, Alert, Field, Select, TextArea, SearchInput,
  Spinner, EmptyState, DescList, Pagination, Chips, Avatar, toast, confirmDialog, downloadFile, reqMeta,
  fmtDate, fmtVal, statusLabel, openPrint,
} from "../ui/kit.jsx";

// أنواع الطلبات التي تستوجب طباعة رخصة الاستغلال بعد القبول
const LICENSE_REQUEST_TYPES = ["تجديد_وثائق_استغلال", "تغيير_سيارة", "تغيير_باب", "تغيير_نشاط", "استئناف"];
// أنواع الطلبات التي تستوجب طباعة رخصة السائق الإضافي
const DEPUTY_PERMIT_TYPES = ["تصريح_مناوب"];

const DRIVER_NAV = [
  { id: "stats",    icon: "dashboard", label: "لوحة القيادة" },
  { id: "requests", icon: "inbox",     label: "الطلبات" },
  { id: "drivers",  icon: "users",     label: "السائقون" },
  { id: "archive",  icon: "archive",   label: "الأرشيف" },
  { id: "monitor",  icon: "activity",  label: "مراقبة النظام" },
];
const TITLES = {
  drivers: { stats: "لوحة القيادة", requests: "الطلبات", drivers: "السائقون", archive: "الأرشيف", monitor: "مراقبة النظام" },
};

export default function AdminPanel({ token, account, onLogout }) {
  const [space,   setSpace]   = useState("drivers");
  const [section, setSection] = useState("stats");
  const [csection, setCsection] = useState("stats");
  const [counts, setCounts]   = useState({});
  const [countTick, setCountTick] = useState(0);

  // عدّادات الشريط الجانبي
  useEffect(() => {
    api.adminStats(token).then(r => { const s = r.stats || r; setCounts(c => ({ ...c, drvNew: s.new_requests })); }).catch(() => {});
    fetch("/api/admin/company/stats", { headers: { "X-Token": token } }).then(r => r.json())
      .then(r => setCounts(c => ({ ...c, coNew: (r.stats?.new_requests || 0) + (r.stats?.vehicle_requests_new || 0) }))).catch(() => {});
  }, [token, section, csection, space, countTick]);
  // تحديث العدّادات بعد كل معالجة، ودوريًا كل 30 ثانية
  useEffect(() => {
    const bump = () => setCountTick(t => t + 1);
    window.addEventListener("admin-counts", bump);
    const iv = setInterval(bump, 30000);
    return () => { window.removeEventListener("admin-counts", bump); clearInterval(iv); };
  }, []);

  const isDrv = space === "drivers";
  const nav = isDrv
    ? [{ items: DRIVER_NAV.map(n => n.id === "requests" ? { ...n, count: counts.drvNew } : n) }]
    : [{ items: COMPANY_NAV.map(n => n.id === "requests" ? { ...n, count: counts.coNew } : n) }];
  const active = isDrv ? section : csection;
  const title = isDrv ? TITLES.drivers[section] : (COMPANY_NAV.find(n => n.id === csection)?.label || "");

  return (
    <AppShell
      brandName="لوحة الإدارة" brandSub="مديرية النقل لولاية البيض"
      top={
        <div className="space-switch">
          <button className={isDrv ? "active" : ""} onClick={() => setSpace("drivers")}><Icon name="taxi" size={15}/>السائقون</button>
          <button className={!isDrv ? "active" : ""} onClick={() => setSpace("companies")}><Icon name="building" size={15}/>الشركات</button>
        </div>
      }
      nav={nav} active={active}
      onNavigate={id => isDrv ? setSection(id) : setCsection(id)}
      user={account?.username || "admin"} userSub="مدير النظام" onLogout={onLogout}
      crumbs={<>{isDrv ? "فضاء السائقين" : "فضاء الشركات"}<Icon name="chevronLeft" size={12}/>{title}</>}
      title={title}
      topActions={isDrv ? <ExcelExportBtn token={token}/> : <CompanyExcelBtn token={token}/>}>
      <div className="page">
        {isDrv ? (
          <>
            {section === "stats"    && <Dashboard token={token} go={setSection}/>}
            {section === "requests" && <RequestsSection token={token}/>}
            {section === "drivers"  && <DriversSection token={token}/>}
            {section === "archive"  && <ArchiveSection token={token}/>}
            {section === "monitor"  && <MonitorTab token={token}/>}
          </>
        ) : <CompanyAdminSection token={token} section={csection} go={setCsection}/>}
      </div>
    </AppShell>
  );
}

// ── تصدير Excel ──
function ExcelExportBtn({ token }) {
  const [loading, setLoading] = useState(false);
  async function run() {
    setLoading(true);
    try {
      await downloadFile("/api/admin/export/excel", token, `البطاقة_الجماعية_للسائقين_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success("تم تنزيل البطاقة الجماعية");
    } catch (e) { toast.error("تعذّر التصدير: " + e.message); }
    finally { setLoading(false); }
  }
  return <Button variant="secondary" icon="sheet" loading={loading} onClick={run}><span className="hide-mobile">تصدير البطاقة الجماعية</span><span className="show-mobile">Excel</span></Button>;
}

// ════════════════════════════════════════
// لوحة القيادة
// ════════════════════════════════════════
function Dashboard({ token, go }) {
  const [s, setS] = useState(null);
  const [latest, setLatest] = useState(null);
  useEffect(() => {
    api.adminStats(token).then(r => setS(r.stats || r));
    api.adminRequests(token, { statut: "جديد", page: 1 }).then(r => setLatest((r.requests || []).slice(0, 6)));
  }, [token]);
  if (!s) return <Spinner/>;

  const reqTotal = (s.new_requests || 0) + (s.pending_requests || 0) + (s.approved_requests || 0) + (s.rejected_requests || 0) || 1;
  const bars = [
    ["جديدة", s.new_requests, "var(--info)"], ["قيد المعالجة", s.pending_requests, "var(--warning)"],
    ["مقبولة", s.approved_requests, "var(--success)"], ["مرفوضة", s.rejected_requests, "var(--danger)"],
  ];
  const drvTotal = s.total_drivers || 1;

  return (
    <div className="stack" style={{ gap: 22 }}>
      <PageHeader eyebrow={new Date().toLocaleDateString("ar-DZ", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        title="نظرة عامة على النشاط" subtitle="ملخص ملفات السائقين والطلبات والعقود السارية."
        actions={<Button icon="inbox" onClick={() => go("requests")}>معالجة الطلبات{s.new_requests ? ` (${s.new_requests})` : ""}</Button>}/>

      <div className="stats-grid">
        <StatCard icon="users" tone="brand" label="إجمالي السائقين" value={s.total_drivers} onClick={() => go("drivers")}/>
        <StatCard icon="inbox" tone="info" label="طلبات جديدة" value={s.new_requests} onClick={() => go("requests")}/>
        <StatCard icon="hourglass" tone="warning" label="قيد المعالجة" value={s.pending_requests} onClick={() => go("requests")}/>
        <StatCard icon="calendar" tone="violet" label="طلبات اليوم" value={s.today_requests} onClick={() => go("requests")}/>
      </div>

      <div className="grid grid-main" style={{ gap: 18 }}>
        <Card title="أحدث الطلبات الجديدة" subtitle="بانتظار قرار الإدارة" icon="inbox" tone="info"
          actions={<Button variant="ghost" size="sm" iconEnd="chevronLeft" onClick={() => go("requests")}>عرض الكل</Button>} padded={false}>
          {!latest ? <Spinner/> : latest.length === 0 ? <EmptyState icon="checkCircle" tone="success" title="لا توجد طلبات معلّقة" text="كل الطلبات الجديدة عولجت."/> : (
            <div className="list" style={{ padding: "4px 20px" }}>
              {latest.map(r => {
                const m = reqMeta(r.request_type);
                return (
                  <div key={r.id} className="list-item">
                    <div className={`icon-tile sm tone-${m.tone}`}><Icon name={m.icon} size={16}/></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="cell-title">{`${r.prenom_ar || ""} ${r.nom_ar || ""}`.trim() || r.username}</div>
                      <div className="cell-sub">{REQUEST_TYPES[r.request_type] || r.request_type} · <span className="ltr">{r.request_number}</span></div>
                    </div>
                    <span className="cell-sub nowrap">{fmtDate(r.created_at)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <div className="stack" style={{ gap: 18 }}>
          <Card title="حالة الطلبات" icon="chart" tone="brand">
            <div className="stack-sm">
              {bars.map(([l, v, c]) => (
                <div key={l}>
                  <div className="between" style={{ fontSize: 13, marginBottom: 5 }}><span className="muted">{l}</span><b className="num">{v ?? 0}</b></div>
                  <div className="progress"><span style={{ width: `${((v || 0) / reqTotal) * 100}%`, background: c }}/></div>
                </div>
              ))}
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>إجمالي الطلبات المسجّلة: <b className="num">{s.total_requests}</b></div>
            </div>
          </Card>
          <Card title="وضعية السائقين" icon="users" tone="success">
            <div className="stack-sm">
              {[["نشطون", s.active_drivers, "var(--success)"], ["توقف مؤقت", s.stopped_temp, "var(--warning)"], ["توقف نهائي", s.stopped_final, "var(--danger)"]].map(([l, v, c]) => (
                <div key={l}>
                  <div className="between" style={{ fontSize: 13, marginBottom: 5 }}><span className="muted">{l}</span><b className="num">{v ?? 0}</b></div>
                  <div className="progress"><span style={{ width: `${((v || 0) / drvTotal) * 100}%`, background: c }}/></div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <div className="stats-grid">
        <StatCard icon="fileSignature" tone="info" label="عقود كراء سارية" value={s.active_rentals}/>
        <StatCard icon="userPlus" tone="violet" label="عقود مناوبين سارية" value={s.active_deputies}/>
        <StatCard icon="scroll" tone="gold" label="رخص سائق إضافي سارية" value={s.active_dep_permits}/>
        <StatCard icon="checkCircle" tone="success" label="طلبات مقبولة" value={s.approved_requests}/>
      </div>
    </div>
  );
}

// ════════════════════════════════════════
// الطلبات
// ════════════════════════════════════════
const STATUT_FILTERS = [
  { value: "", label: "الكل" }, { value: "جديد", label: "جديدة" }, { value: "قيد_المعالجة", label: "قيد المعالجة" },
  { value: "مقبول", label: "مقبولة" }, { value: "مرفوض", label: "مرفوضة" }, { value: "ملغى", label: "ملغاة" },
];

function RequestsSection({ token }) {
  const [requests, setRequests] = useState([]);
  const [search, setSearch] = useState("");
  const [filterStatut, setFilterStatut] = useState("جديد");
  const [filterType, setFilterType] = useState("");
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const load = () => api.adminRequests(token, { statut: filterStatut, request_type: filterType, search, page })
    .then(r => { setRequests(r.requests || r.data || []); setTotalPages(r.pages || 1); setTotal(r.total || 0); });

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => load().finally(() => setLoading(false)), 200);
    return () => clearTimeout(t);
  }, [filterStatut, filterType, search, page]);

  async function updateRequest(id, statut, admin_notes = "") {
    const res = await api.adminUpdateRequest(token, id, { statut, admin_notes });
    if (res?.error) toast.error(res.error);
    else window.dispatchEvent(new Event("admin-counts"));
    if (!res?.error) toast.success(statut === "مقبول" ? "تم قبول الطلب وتطبيق أثره" : statut === "مرفوض" ? "تم رفض الطلب" : "تم تحديث حالة الطلب");
    await load();
    return res;
  }

  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageHeader title="الطلبات" subtitle="راجع الطلبات المقدَّمة من السائقين واتخذ القرار — القبول يطبّق الأثر فوراً على الملف."/>
      <Card padded={false}>
        <div style={{ padding: 16, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <SearchInput value={search} onChange={v => { setSearch(v); setPage(1); }} placeholder="الاسم، رقم التعريف، رقم الطلب..." style={{ flex: "2 1 260px" }}/>
          <Select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1); }} style={{ flex: "1 1 200px", width: "auto" }}>
            <option value="">كل أنواع الطلبات</option>
            {Object.entries(REQUEST_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </div>
        <div style={{ padding: "0 16px 14px" }}>
          <Chips options={STATUT_FILTERS} value={filterStatut} onChange={v => { setFilterStatut(v); setPage(1); }}/>
        </div>
      </Card>

      <div className="between">
        <span className="muted" style={{ fontSize: 13 }}>{loading ? "جارٍ التحميل..." : `${total} طلب`}</span>
      </div>

      {loading && !requests.length ? <Spinner/> : requests.length === 0 ? (
        <Card><EmptyState icon="inbox" title="لا توجد طلبات" text="لا توجد طلبات مطابقة لمعايير البحث الحالية."/></Card>
      ) : (
        <div className="stack-sm">
          {requests.map(r => <RequestCard key={r.id} req={r} onUpdate={updateRequest} token={token}/>)}
          <Pagination page={page} total={totalPages} onChange={setPage}/>
        </div>
      )}
    </div>
  );
}

// توجيه طباعة الطلب للمسار الصحيح حسب النوع
function getPrintUrl(req, token) {
  const base = "/api/print";
  switch (req.request_type) {
    case "تغيير_نشاط":   return `${base}/request-activity/${req.id}?token=${token}`;
    case "توقف_نهائي":   return `${base}/request-stop-final/${req.id}?token=${token}`;
    case "توقف_مؤقت":    return `${base}/request-stop-temp/${req.id}?token=${token}`;
    case "استئناف":      return `${base}/request-resume/${req.id}?token=${token}`;
    case "تجديد_وثائق_استغلال": return `${base}/request-renewal/${req.id}?token=${token}`;
    default:             return `${base}/request/${req.id}?token=${token}`;
  }
}

function RequestCard({ req, onUpdate, token }) {
  const [expanded, setExpanded] = useState(false);
  const [adminNote, setAdminNote] = useState(req.admin_notes || "");
  const [loading, setLoading] = useState("");
  const m = reqMeta(req.request_type);
  const name = `${req.prenom_ar || ""} ${req.nom_ar || ""}`.trim();
  const open = req.statut !== "مقبول" && req.statut !== "مرفوض" && req.statut !== "ملغى";

  async function update(statut) {
    if (statut === "مقبول") {
      const ok = await confirmDialog({ title: "قبول الطلب", icon: "checkCircle", tone: "success", confirmLabel: "قبول وتطبيق",
        message: `سيُطبَّق أثر طلب «${REQUEST_TYPES[req.request_type] || req.request_type}» على ملف ${name || req.username} فوراً. القرار نهائي ولا يمكن تغييره لاحقاً.` });
      if (!ok) return;
    }
    if (statut === "مرفوض") {
      const ok = await confirmDialog({ title: "رفض الطلب", danger: true, confirmLabel: "رفض الطلب",
        message: req.request_type === "تغيير_سيارة"
          ? "رفض طلب تغيير المركبة سيُرجع المركبة السابقة للسائق وتُؤرشف الجديدة. القرار نهائي."
          : "سيُرفض الطلب نهائياً ولن يُطبَّق أي أثر على ملف السائق. يُستحسن كتابة سبب الرفض في الملاحظات." });
      if (!ok) return;
    }
    setLoading(statut);
    await onUpdate(req.id, statut, adminNote);
    setLoading("");
  }

  const canPrintLicense = req.statut === "مقبول" && LICENSE_REQUEST_TYPES.includes(req.request_type);
  const canPrintDeputyPermit = req.statut === "مقبول" && DEPUTY_PERMIT_TYPES.includes(req.request_type);
  const isCertReq = req.request_type === "شهادة_إدارية" || req.request_type === "شهادة_إدارية_مناوب";
  let rdata = {}; try { rdata = JSON.parse(req.request_data || "{}"); } catch { /* */ }
  const [certOpen, setCertOpen] = useState(false);

  return (
    <div className={`req-card ${expanded ? "open" : ""}`}>
      <div className="req-head" onClick={() => setExpanded(e => !e)}>
        <div className={`icon-tile tone-${m.tone}`}><Icon name={m.icon} size={19}/></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <span className="cell-title">{REQUEST_TYPES[req.request_type] || req.request_type || "طلب"}</span>
            <StatusBadge statut={req.statut} size="sm"/>
            {req.repeat_count > 0 && open && (
              <Badge tone="warning" size="sm" icon="bell" title={`آخر تذكير: ${(req.bumped_at || "").slice(0, 16)}`}>
                تذكير{req.repeat_count > 1 ? ` ×${req.repeat_count}` : ""}
              </Badge>
            )}
          </div>
          <div className="cell-sub" style={{ marginTop: 2 }}>
            {name || req.username} · <span className="ltr mono">{req.request_number || req.id}</span>
            {req.door_number && <> · الباب {req.door_number}</>}
          </div>
        </div>
        <div className="hide-mobile cell-sub nowrap">{fmtDate(req.created_at)}</div>
        {canPrintLicense && (
          <Button size="sm" variant="soft" icon="printer" onClick={e => { e.stopPropagation(); openPrint(`/api/admin/print/license/${req.id}?token=${token}`); }}>
            <span className="hide-mobile">رخصة الاستغلال</span></Button>
        )}
        {canPrintDeputyPermit && (
          <Button size="sm" variant="violet-soft" icon="printer" onClick={e => { e.stopPropagation(); openPrint(`/api/admin/print/deputy-permit/${req.driver_id}?token=${token}`); }}>
            <span className="hide-mobile">رخصة السائق الإضافي</span></Button>
        )}
        {isCertReq && req.statut !== "مرفوض" && req.statut !== "ملغى" && (
          <Button size="sm" variant="warning-soft" icon="stamp" onClick={e => { e.stopPropagation(); setCertOpen(true); }}>
            <span className="hide-mobile">تحرير الشهادة</span></Button>
        )}
        {certOpen && (
          <span onClick={e => e.stopPropagation()}>
            <WorkCertDialog token={token}
              driverId={req.request_type === "شهادة_إدارية" ? req.driver_id : undefined}
              nin={req.request_type === "شهادة_إدارية_مناوب" ? rdata.deputy_nin : undefined}
              title={req.request_type === "شهادة_إدارية_مناوب" ? `الشهادة الإدارية — ${rdata.deputy_name || "السائق الإضافي"}` : "الشهادة الإدارية — السائق"}
              onClose={() => setCertOpen(false)}/>
          </span>
        )}
        <Icon name={expanded ? "chevronUp" : "chevronDown"} size={18} style={{ color: "var(--subtle)" }}/>
      </div>

      {expanded && (
        <div className="req-body">
          <div className="grid grid-2" style={{ gap: 18, marginTop: 12 }}>
            <div>
              <div className="section-title">صاحب الطلب</div>
              <DescList items={[
                { label: "الاسم", value: name || req.username },
                { label: "رقم التعريف الوطني", value: req.nin, ltr: true },
                { label: "الهاتف", value: req.telephone, ltr: true },
                { label: "رقم الباب", value: req.door_number },
                { label: "تاريخ التقديم", value: (req.created_at || "").slice(0, 16) },
                { label: "تاريخ المعالجة", value: (req.processed_at || "").slice(0, 16) },
              ]}/>
            </div>
            <div className="stack-sm">
              <div className="section-title">الوثائق</div>
              <div className="row-wrap">
                <Button variant="secondary" size="sm" icon="printer" onClick={() => openPrint(getPrintUrl(req, token))}>طباعة الطلب</Button>
                <Button variant="secondary" size="sm" icon="history" onClick={() => openPrint(`/api/admin/print/history/${req.driver_id || req.id}?token=${token}`)}>الشهادة التاريخية</Button>
              </div>
              {req.notes && <Alert tone="neutral" icon="info" title="ملاحظات السائق">{req.notes}</Alert>}
              {isCertReq && (
                <Alert tone="warning" icon="stamp" title={req.request_type === "شهادة_إدارية_مناوب" ? `المعني: ${rdata.deputy_name || "السائق الإضافي"}` : "المعني: صاحب الطلب"}>
                  الغرض: {rdata.purpose || "غير محدّد"} — اضغط «تحرير الشهادة» لإعدادها وطباعتها، ثم اقبل الطلب.
                </Alert>
              )}
            </div>
          </div>

          {req.request_type === "استئناف" && <ResumeSummary req={req}/>}

          <Field label="ملاحظات الإدارة / الرد على السائق" style={{ marginTop: 16 }}>
            <TextArea value={adminNote} onChange={e => setAdminNote(e.target.value)} placeholder="أضف ملاحظة أو سبب القرار..." disabled={!open} rows={2}/>
          </Field>

          {open ? (
            <div className="row-wrap" style={{ marginTop: 14, justifyContent: "flex-start" }}>
              <Button variant="success" icon="check" loading={loading === "مقبول"} disabled={!!loading} onClick={() => update("مقبول")}>قبول الطلب</Button>
              <Button variant="danger-soft" icon="x" loading={loading === "مرفوض"} disabled={!!loading} onClick={() => update("مرفوض")}>رفض</Button>
              {req.statut !== "قيد_المعالجة" && (
                <Button variant="ghost" icon="hourglass" loading={loading === "قيد_المعالجة"} disabled={!!loading} onClick={() => update("قيد_المعالجة")}>وضع قيد المعالجة</Button>
              )}
            </div>
          ) : (
            <Alert tone={req.statut === "مقبول" ? "success" : req.statut === "مرفوض" ? "danger" : "neutral"} style={{ marginTop: 14 }}
              title={`القرار: ${statusLabel(req.statut)}`}>
              عولج بتاريخ {fmtDate(req.processed_at) || "—"} — القرار نهائي.
            </Alert>
          )}
        </div>
      )}
    </div>
  );
}

// ملخص الملف المرفق بطلب الاستئناف
function ResumeSummary({ req }) {
  let res = null;
  try { res = JSON.parse(req.request_data || "{}").resume; } catch { /* */ }
  if (!res) return null;
  const v = res.vehicle || {}, d = res.door || {}, b = res.beneficiary || {};
  return (
    <div style={{ marginTop: 16 }}>
      <Alert tone="success" icon="play" title="الملف المرفق بطلب الاستئناف">يُطبَّق عند القبول، ثم تُحرَّر رخصة استغلال جديدة.</Alert>
      <div className="kv-strip" style={{ marginTop: 10 }}>
        <div><div className="k">المركبة {res.vehicle_changed ? <Badge tone="gold" size="sm">جديدة</Badge> : <Badge size="sm">نفسها</Badge>}</div>
          <div className="v ltr">{v.num_immatriculation || "—"}</div><div className="cell-sub">{v.marque || ""} {v.type_vehicule || ""}</div></div>
        <div><div className="k">الباب {res.door_changed ? <Badge tone="gold" size="sm">جديد</Badge> : <Badge size="sm">نفسه</Badge>}</div>
          <div className="v">{d.door_number || "—"}</div>{res.door_changed && d.decision_number && <div className="cell-sub">القرار {d.decision_number} — {fmtDate(d.decision_date)}</div>}</div>
        <div><div className="k">المستفيد</div><div className="v">{b.ben_prenom_ar || ""} {b.ben_nom_ar || ""}</div><div className="cell-sub ltr">{b.ben_nin}</div></div>
        <div><div className="k">عقد الكراء</div>
          <div className="v">{res.exploitation_mode === "مستفيد" ? "مستفيد — بلا عقد" : `${res.monthly_rent} دج / شهر`}</div>
          <div className="cell-sub">{res.exploitation_mode === "مستفيد" ? "يستغل رخصته بنفسه" : "عقد جديد لمدة سنة"}</div></div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════
// السائقون
// ════════════════════════════════════════
function DriversSection({ token }) {
  const [drivers, setDrivers] = useState([]);
  const [search, setSearch] = useState("");
  const [statut, setStatut] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      api.adminDrivers(token, { search, statut, page })
        .then(r => { setDrivers(r.drivers || r.data || []); setTotalPages(r.pages || 1); })
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(t);
  }, [search, statut, page]);

  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageHeader title="السائقون" subtitle="ملفات سائقي سيارات الأجرة — اضغط على أي سطر لعرض الملف الكامل والوثائق."/>
      <Card padded={false}>
        <div style={{ padding: 16, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <SearchInput value={search} onChange={v => { setSearch(v); setPage(1); }} placeholder="الاسم، رقم التعريف، الهاتف، رقم الباب..." style={{ flex: "2 1 280px" }}/>
          <Chips options={[{ value: "", label: "الكل" }, { value: "نشط", label: "نشط" }, { value: "توقف_مؤقت", label: "توقف مؤقت" }, { value: "توقف_نهائي", label: "توقف نهائي" }]}
            value={statut} onChange={v => { setStatut(v); setPage(1); }}/>
        </div>
      </Card>
      {loading && !drivers.length ? <Spinner/> : drivers.length === 0 ? (
        <Card><EmptyState icon="users" title="لا يوجد سائقون" text="لا توجد ملفات مطابقة للبحث."/></Card>
      ) : (
        <>
          <DriversTable drivers={drivers} token={token}/>
          <Pagination page={page} total={totalPages} onChange={setPage}/>
        </>
      )}
    </div>
  );
}

function DriversTable({ drivers, token }) {
  const [openId, setOpenId] = useState(null);
  const [full, setFull] = useState({});
  async function toggleRow(id) {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    if (!full[id]) {
      const r = await api.adminDriverFull(token, id);
      setFull(p => ({ ...p, [id]: r }));
    }
  }
  const today = new Date().toISOString().slice(0, 10);
  const ninCount = {};
  drivers.forEach(d => { if (d.nin) ninCount[d.nin] = (ninCount[d.nin] || 0) + 1; });

  return (
    <div className="table-wrap">
      <table className="table" style={{ minWidth: 920 }}>
        <thead><tr>
          <th>السائق</th><th>رقم التعريف الوطني</th><th>الباب</th><th>المركبة</th><th>النشاط</th><th>الحالة</th><th style={{ width: 40 }}/>
        </tr></thead>
        <tbody>
          {drivers.map(d => {
            const isOpen = openId === d.id;
            const isDup = d.nin && ninCount[d.nin] > 1;
            const permisExpired = d.permis_expiration && d.permis_expiration < today;
            const depPermisExpired = d.dep_permis_exp && d.dep_permis_exp < today;
            const name = `${d.prenom_ar || ""} ${d.nom_ar || ""}`.trim();
            return [
              <tr key={`r${d.id}`} className={`clickable ${isOpen ? "is-open" : ""} ${isDup ? "is-dup" : ""}`} onClick={() => toggleRow(d.id)}>
                <td>
                  <div className="row" style={{ gap: 10 }}>
                    <Avatar name={name || d.username}/>
                    <div style={{ minWidth: 0 }}>
                      <div className="cell-title">{name || <span className="muted">{d.username || "—"}</span>}</div>
                      <div className="cell-sub ltr" style={{ textAlign: "right" }}>{d.telephone || ""}</div>
                    </div>
                    {isDup && <Badge tone="danger" size="sm" icon="alert">NIN مكرر</Badge>}
                    {(permisExpired || depPermisExpired) && <Badge tone="danger" size="sm" title="رخصة منتهية">رخصة منتهية</Badge>}
                  </div>
                </td>
                <td className="mono ltr" style={{ textAlign: "right" }}>{d.nin || "—"}</td>
                <td><b style={{ color: "var(--brand-700)", fontSize: 15 }}>{d.door_number || "—"}</b></td>
                <td><div className="cell-title ltr" style={{ textAlign: "right", fontWeight: 500 }}>{d.num_immatriculation || "—"}</div><div className="cell-sub">{d.marque || ""}</div></td>
                <td className="cell-sub">{fmtVal(d.activity_type) || "غير محدد"}</td>
                <td><StatusBadge statut={d.statut} size="sm"/></td>
                <td><Icon name={isOpen ? "chevronUp" : "chevronDown"} size={17} style={{ color: "var(--subtle)" }}/></td>
              </tr>,
              isOpen && (
                <tr key={`d${d.id}`}><td colSpan={7} className="detail-cell">
                  {!full[d.id] ? <Spinner/> : <DriverDetail d={d} detail={full[d.id]} today={today} token={token} permisExpired={permisExpired} depPermisExpired={depPermisExpired}/>}
                </td></tr>
              ),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

function DriverDetail({ d, detail, today, token, permisExpired, depPermisExpired }) {
  const [cert, setCert] = useState(null);
  const depPermit = detail.deputy_permit;
  const blocks = [
    { title: "بيانات السائق", icon: "user", tone: "brand", items: [
      { label: "الاسم الكامل", value: `${d.prenom_ar || ""} ${d.nom_ar || ""}`.trim() || d.username },
      { label: "رقم التعريف", value: d.nin, ltr: true }, { label: "الهاتف", value: d.telephone, ltr: true },
      { label: "العنوان", value: d.adresse || detail.driver?.adresse }, { label: "تاريخ الميلاد", value: fmtDate(d.date_naissance) },
      { label: "تاريخ التسجيل", value: fmtDate(d.created_at) } ] },
    { title: "رخصة السياقة", icon: "idCard", tone: permisExpired ? "danger" : "info", items: [
      { label: "رقم الرخصة", value: d.num_permis || detail.license?.num_permis, ltr: true },
      { label: "تاريخ الانتهاء", value: fmtDate(d.permis_expiration || detail.license?.date_expiration), warn: permisExpired },
      { label: "مكان الإصدار", value: detail.license?.lieu_delivrance }, { label: "الفئات", value: fmtVal(detail.license?.categories) } ] },
    { title: "المركبة", icon: "car", tone: "info", items: [
      { label: "الصنف", value: d.marque || detail.vehicle?.marque }, { label: "رقم التسجيل", value: d.num_immatriculation || detail.vehicle?.num_immatriculation, ltr: true },
      { label: "سنة أول سير", value: d.annee_circulation || detail.vehicle?.annee_circulation }, { label: "الرقم التسلسلي", value: detail.vehicle?.num_serie, ltr: true },
      { label: "الطاقة", value: detail.vehicle?.energie }, { label: "عدد المقاعد", value: detail.vehicle?.nb_places } ] },
    (d.door_number || detail.door) && { title: "رخصة الباب", icon: "door", tone: "gold", items: [
      { label: "رقم الباب", value: d.door_number || detail.door?.door_number }, { label: "الولاية", value: d.door_wilaya || detail.door?.wilaya },
      { label: "المستفيد", value: d.ben_nom_ar ? `${d.ben_prenom_ar || ""} ${d.ben_nom_ar}`.trim() : `${detail.door?.ben_prenom || ""} ${detail.door?.ben_nom || ""}`.trim() },
      { label: "الصفة", value: fmtVal(d.sifa || detail.door?.sifa) }, { label: "صفة الاستغلال", value: detail.door?.exploitation_mode } ] },
    detail.rental && { title: "عقد الكراء", icon: "fileSignature", tone: "info", items: [
      { label: "رقم العقد", value: detail.rental.contract_number, ltr: true }, { label: "من", value: fmtDate(detail.rental.contract_date) },
      { label: "إلى", value: fmtDate(detail.rental.end_date) || "مفتوح" },
      { label: "الإيجار الشهري", value: detail.rental.monthly_rent ? `${detail.rental.monthly_rent} دج` : "غير محدد" } ] },
    (d.dep_nom_ar || detail.deputy) && { title: "السائق المناوب", icon: "userPlus", tone: depPermisExpired ? "danger" : "violet", items: [
      { label: "الاسم", value: d.dep_nom_ar ? `${d.dep_prenom_ar || ""} ${d.dep_nom_ar}`.trim() : `${detail.deputy?.prenom_ar || ""} ${detail.deputy?.nom_ar || ""}`.trim() },
      { label: "رقم الرخصة", value: detail.deputy?.num_permis, ltr: true },
      { label: "انتهاء الرخصة", value: fmtDate(d.dep_permis_exp || detail.deputy?.date_expiration_permis), warn: depPermisExpired },
      { label: "عقد المناوب", value: detail.deputy_contract?.contract_number, ltr: true },
      { label: "نهاية العقد", value: fmtDate(detail.deputy_contract?.end_date) } ] },
    (d.activity_type || detail.activity) && { title: "النشاط", icon: "route", tone: "success", items: [
      { label: "نوع النشاط", value: fmtVal(d.activity_type || detail.activity?.activity_type) }, { label: "المنطقة", value: d.activity_zone || detail.activity?.zone } ] },
  ].filter(Boolean);

  return (
    <div style={{ padding: 20 }} className="stack">
      {cert && <WorkCertDialog token={token} driverId={cert.driverId} nin={cert.nin} title={cert.title} onClose={() => setCert(null)}/>}
      {(permisExpired || depPermisExpired) && (
        <Alert tone="danger" title="وثائق منتهية الصلاحية">
          {permisExpired && <div>رخصة سياقة السائق منتهية ({fmtDate(d.permis_expiration)})</div>}
          {depPermisExpired && <div>رخصة سياقة المناوب منتهية ({fmtDate(d.dep_permis_exp)})</div>}
        </Alert>
      )}
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
        {blocks.map(b => (
          <Card key={b.title} title={b.title} icon={b.icon} tone={b.tone} className="flat"><DescList items={b.items}/></Card>
        ))}
        <Card title="الوثائق الإدارية" icon="printer" tone="neutral" className="flat">
          <div className="doc-group-title">الرخص</div>
          <div className="stack-sm">
            {(d.door_number || detail.door)
              ? <Button variant="secondary" block icon="scroll" onClick={() => openPrint(`/api/admin/print/current-license/${d.id}?token=${token}`)}>رخصة الاستغلال</Button>
              : <div className="doc-empty">لا توجد رخصة استغلال (لا رقم باب)</div>}
            {depPermit
              ? <Button variant="secondary" block icon="scroll" onClick={() => openPrint(`/api/admin/print/deputy-permit/${d.id}?token=${token}`)}>رخصة السائق الإضافي</Button>
              : <div className="doc-empty">لا توجد رخصة سائق إضافي</div>}
          </div>
          <div className="doc-group-title" style={{ marginTop: 14 }}>الشهادات</div>
          <div className="stack-sm">
            <Button variant="secondary" block icon="history" onClick={() => openPrint(`/api/admin/print/history/${d.id}?token=${token}`)}>الشهادة التاريخية</Button>
            <Button variant="secondary" block icon="stamp" onClick={() => setCert({ driverId: d.id, title: "الشهادة الإدارية — السائق" })}>شهادة إدارية — السائق</Button>
            {detail.deputy_contract && (detail.deputy?.nin)
              && <Button variant="secondary" block icon="stamp" onClick={() => setCert({ nin: detail.deputy.nin, title: "الشهادة الإدارية — السائق الإضافي" })}>شهادة إدارية — السائق الإضافي</Button>}
          </div>
          {detail.requests?.length > 0 && (
            <>
              <div className="section-title" style={{ marginTop: 16 }}>آخر الطلبات</div>
              <div className="list">
                {[...detail.requests.filter(r => ["جديد", "قيد_المعالجة"].includes(r.statut)),
                   ...detail.requests.filter(r => !["جديد", "قيد_المعالجة"].includes(r.statut)).slice(0, 5)].map(r => (
                  <div key={r.id} className="list-item" style={{ padding: "8px 0" }}>
                    <span style={{ flex: 1, fontSize: 13 }}>{REQUEST_TYPES[r.request_type] || r.request_type}</span>
                    <StatusBadge statut={r.statut} size="sm"/>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

// ════════════════════════════════════════
// الأرشيف
// ════════════════════════════════════════
function ArchiveSection({ token }) {
  const [drivers, setDrivers] = useState(null);
  const [search, setSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => {
      fetch(`/api/admin/archive?search=${encodeURIComponent(search)}`, { headers: { "X-Token": token } })
        .then(r => r.json()).then(r => setDrivers(r.drivers || r.data || [])).catch(() => setDrivers([]));
    }, 200);
    return () => clearTimeout(t);
  }, [search, token]);

  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageHeader title="الأرشيف" subtitle="السائقون المتوقفون نهائياً — لا يُحذف أي ملف، يبقى السجل الكامل محفوظاً."/>
      <Card padded={false}><div style={{ padding: 16 }}>
        <SearchInput value={search} onChange={setSearch} placeholder="بحث بالاسم أو رقم التعريف..."/>
      </div></Card>
      {!drivers ? <Spinner/> : drivers.length === 0 ? (
        <Card><EmptyState icon="archive" title="الأرشيف فارغ" text="لا يوجد سائقون في حالة توقف نهائي."/></Card>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>السائق</th><th>رقم التعريف الوطني</th><th>آخر باب</th><th>تاريخ التوقف</th><th>الحالة</th><th/></tr></thead>
            <tbody>
              {drivers.map(d => {
                const name = `${d.prenom_ar || ""} ${d.nom_ar || ""}`.trim();
                return (
                  <tr key={d.id}>
                    <td><div className="row" style={{ gap: 10 }}><Avatar name={name || d.username}/><span className="cell-title">{name || d.username || "—"}</span></div></td>
                    <td className="mono ltr" style={{ textAlign: "right" }}>{d.nin || "—"}</td>
                    <td>{d.door_number || "—"}</td>
                    <td>{fmtDate(d.updated_at)}</td>
                    <td><StatusBadge statut="توقف_نهائي" size="sm"/></td>
                    <td><Button size="sm" variant="ghost" icon="history" onClick={() => openPrint(`/api/admin/print/history/${d.id}?token=${token}`)}>الشهادة التاريخية</Button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
