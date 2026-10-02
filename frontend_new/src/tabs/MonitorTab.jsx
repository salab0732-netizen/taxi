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
    </div>
  );
}
