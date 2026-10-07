import { useState, useEffect, useCallback } from "react";
import { monitor } from "../api.js";
import Icon from "../ui/Icon.jsx";
import { Button, Card, PageHeader, Badge, StatCard, EmptyState, Checkbox } from "../ui/kit.jsx";

const LEVEL = {
  EXCEPTION:  { tone: "danger",  icon: "alertCircle" },
  HTTP_ERROR: { tone: "warning", icon: "alert" },
  FRONTEND:   { tone: "violet",  icon: "dashboard" },
  "404":      { tone: "neutral", icon: "search" },
  "405":      { tone: "warning", icon: "ban" },
};

export default function MonitorTab({ token }) {
  const [status,   setStatus]   = useState(null);
  const [errors,   setErrors]   = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [autoRef,  setAutoRef]  = useState(true);
  const [lastRef,  setLastRef]  = useState(null);
  const [expanded, setExpanded] = useState({});
  const [level,    setLevel]    = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [s, e] = await Promise.all([monitor.getStatus(token), monitor.getErrors(token, 80)]);
      setStatus(s); setErrors(e.errors || []);
      setLastRef(new Date().toLocaleTimeString("ar-DZ"));
    } catch (err) { console.error(err); }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    refresh();
    if (!autoRef) return;
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
  }, [refresh, autoRef]);

  const counts = errors.reduce((acc, e) => { const l = e.level || "unknown"; acc[l] = (acc[l] || 0) + 1; return acc; }, {});
  const shown = level ? errors.filter(e => e.level === level) : errors;
  const running = status?.status === "running";

  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageHeader title="مراقبة النظام" subtitle={lastRef ? `آخر تحديث: ${lastRef}` : "حالة الخادم وسجل الأخطاء"}
        actions={<>
          <Checkbox checked={autoRef} onChange={setAutoRef}>تحديث تلقائي كل 30 ثانية</Checkbox>
          <Button variant="secondary" icon="refresh" loading={loading} onClick={refresh}>تحديث</Button>
        </>}/>
      {status && (
        <div className="stats-grid">
          <StatCard icon={running ? "checkCircle" : "xCircle"} tone={running ? "success" : "danger"} label="حالة الخادم" value={running ? "يعمل" : "متوقف"}/>
          <StatCard icon="users" tone="brand" label="السائقون" value={status.stats?.drivers}/>
          <StatCard icon="fileSignature" tone="info" label="عقود الكراء السارية" value={status.stats?.contracts}/>
          <StatCard icon="alert" tone={errors.length ? "warning" : "success"} label="إدخالات السجل" value={errors.length}/>
          <StatCard icon="alertCircle" tone={counts.EXCEPTION ? "danger" : "success"} label="استثناءات الخادم" value={counts.EXCEPTION || 0}/>
          <StatCard icon="dashboard" tone={counts.FRONTEND ? "violet" : "success"} label="أخطاء الواجهة" value={counts.FRONTEND || 0}/>
        </div>
      )}
      <Card title="سجل الأخطاء" subtitle={`${shown.length} إدخال`} icon="activity" padded={false}
        actions={<div className="chips">
          {["", ...Object.keys(counts)].map(l => (
            <button key={l || "all"} className={`chip ${level === l ? "active" : ""}`} onClick={() => setLevel(l)}>{l || "الكل"}{l && <span className="count">{counts[l]}</span>}</button>
          ))}
        </div>}>
        {shown.length === 0 ? <EmptyState icon="checkCircle" tone="success" title="لا توجد أخطاء مسجّلة"/> : (
          <div style={{ maxHeight: 560, overflowY: "auto" }}>
            {shown.map((e, i) => {
              const L = LEVEL[e.level] || { tone: "neutral", icon: "info" };
              return (
                <div key={i} style={{ padding: "12px 20px", borderBottom: "1px solid var(--line-2)" }}>
                  <div className="row" style={{ alignItems: "flex-start", gap: 12 }}>
                    <div className={`icon-tile sm tone-${L.tone}`}><Icon name={L.icon} size={15}/></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="row-wrap" style={{ gap: 8 }}>
                        <Badge tone={L.tone} size="sm">{e.level}</Badge>
                        <span className="mono ltr" style={{ fontSize: 13, fontWeight: 600, overflowWrap: "anywhere" }}>{e.method ? `${e.method} ` : ""}{e.path || e.url || e.msg || "—"}</span>
                        {e.status && <Badge size="sm">{e.status}</Badge>}
                        {e.ms && <span className="cell-sub">{e.ms}ms</span>}
                      </div>
                      {(e.error || e.message) && <div style={{ fontSize: 13, color: "var(--text-2)", marginTop: 4 }}>{String(e.error || e.message).slice(0, 220)}</div>}
                      {expanded[i] && (e.trace || e.stack) && (
                        <pre className="ltr" style={{ margin: "8px 0 0", background: "#0f172a", color: "#e2e8f0", borderRadius: 10, padding: 12, fontSize: 11.5,
                          overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 240, overflowY: "auto", textAlign: "left" }}>{e.trace || e.stack}</pre>
                      )}
                    </div>
                    <div className="stack-sm" style={{ alignItems: "flex-end", gap: 4 }}>
                      <span className="cell-sub nowrap ltr">{e.ts}</span>
                      {(e.trace || e.stack) && <Button size="xs" variant="ghost" iconEnd={expanded[i] ? "chevronUp" : "chevronDown"} onClick={() => setExpanded(p => ({ ...p, [i]: !p[i] }))}>التفاصيل</Button>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
      <AuditCard token={token}/>
    </div>
  );
}

// ── سجلّ تدقيق العمليات الإدارية ──
const ACT = [
  [/work-cert/, "شهادة إدارية", "stamp"], [/approve|accept|قبول/, "قبول", "checkCircle"],
  [/reject|refuse|رفض/, "رفض", "xCircle"], [/delete|remove/, "حذف", "trash"],
  [/print/, "طباعة", "printer"], [/status/, "تغيير حالة", "refresh"],
];
const actOf = (m, p) => {
  for (const [rx, label, icon] of ACT) if (rx.test(p)) return { label, icon };
  return { label: m === "DELETE" ? "حذف" : m === "PUT" ? "تعديل" : "عملية", icon: "edit" };
};

function AuditCard({ token }) {
  const [items, setItems] = useState(null);
  const [q, setQ] = useState("");
  const load = useCallback(() => {
    fetch(`/api/admin/audit?q=${encodeURIComponent(q)}`, { headers: { "X-Token": token } })
      .then(r => r.json()).then(d => setItems(d.items || [])).catch(() => setItems([]));
  }, [token, q]);
  useEffect(() => { load(); }, [load]);
  return (
    <Card title="سجلّ العمليات الإدارية" subtitle="كل تعديل يقوم به حساب الإدارة: من، متى، ومن أي عنوان" icon="shield" padded={false}
      actions={<div className="row" style={{ gap: 8 }}>
        <input className="input" style={{ width: 200 }} placeholder="بحث…" value={q} onChange={e => setQ(e.target.value)}/>
        <Button size="sm" variant="secondary" icon="refresh" onClick={load}>تحديث</Button>
      </div>}>
      {!items ? null : items.length === 0 ? <EmptyState icon="shield" title="لا توجد عمليات مسجّلة بعد"/> : (
        <div style={{ maxHeight: 480, overflowY: "auto" }}>
          {items.map(a => {
            const A = actOf(a.method, a.path);
            const ok = a.status < 400;
            return (
              <div key={a.id} style={{ padding: "10px 20px", borderBottom: "1px solid var(--line-2)" }}>
                <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
                  <div className={`icon-tile sm tone-${ok ? "brand" : "danger"}`}><Icon name={A.icon} size={15}/></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row-wrap" style={{ gap: 8 }}>
                      <Badge tone={ok ? "brand" : "danger"} size="sm">{A.label}</Badge>
                      <b>{a.username}</b>
                      <span className="mono ltr cell-sub" style={{ overflowWrap: "anywhere" }}>{a.method} {a.path}</span>
                      {!ok && <Badge tone="danger" size="sm">{a.status}</Badge>}
                    </div>
                    {a.detail && a.detail !== "{}" && <div className="cell-sub" style={{ marginTop: 3, overflowWrap: "anywhere" }}>{a.detail.slice(0, 200)}</div>}
                  </div>
                  <div className="stack-sm" style={{ alignItems: "flex-end", gap: 2 }}>
                    <span className="cell-sub nowrap" dir="rtl">{String(a.ts || "").replace(/^(\d{4})-(\d\d)-(\d\d) (\d\d:\d\d).*/, "$3/$2/$1 — $4")}</span>
                    <span className="cell-sub nowrap ltr mono">{a.ip}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
