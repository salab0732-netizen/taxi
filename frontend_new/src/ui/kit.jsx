// ════════════════════════════════════════════════════════════
// مكوّنات واجهة موحّدة — تُستعمل في كل الشاشات
// ════════════════════════════════════════════════════════════
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon.jsx";

export { Icon };

const cx = (...a) => a.filter(Boolean).join(" ");

// ── أزرار ──
export function Button({ variant = "primary", size, icon, iconEnd, block, loading, children, className, type = "button", ...rest }) {
  const isz = size === "lg" ? 18 : size === "sm" || size === "xs" ? 15 : 17;
  return (
    <button type={type} {...rest} disabled={rest.disabled || loading}
      className={cx("btn", `btn-${variant}`, size && `btn-${size}`, block && "btn-block", !children && "btn-icon", className)}>
      {loading ? <span className={cx("spinner", ["primary","success","danger","violet"].includes(variant) && "light")} style={{ width: 16, height: 16, borderWidth: 2 }}/>
        : icon && <Icon name={icon} size={isz}/>}
      {children}
      {iconEnd && !loading && <Icon name={iconEnd} size={isz}/>}
    </button>
  );
}

export function LinkButton({ href, variant = "secondary", size, icon, children, className, ...rest }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" {...rest}
      className={cx("btn", `btn-${variant}`, size && `btn-${size}`, className)}>
      {icon && <Icon name={icon} size={size === "sm" || size === "xs" ? 15 : 17}/>}{children}
    </a>
  );
}

export const openPrint = (url) => window.open(url, "_blank");

// ── بطاقات ──
export function Card({ title, subtitle, icon, tone = "brand", actions, children, footer, className, bodyClass, padded = true, style, id }) {
  return (
    <section className={cx("card", `card-tone-${tone}`, className)} style={style} id={id}>
      {(title || actions) && (
        <header className="card-header">
          {icon && <div className={cx("icon-tile sm", `tone-${tone}`)}><Icon name={icon} size={17}/></div>}
          <div style={{ minWidth: 0, flex: 1 }}>
            {title && <div className="card-title">{title}</div>}
            {subtitle && <div className="card-subtitle">{subtitle}</div>}
          </div>
          {actions && <div className="row-wrap" style={{ gap: 8 }}>{actions}</div>}
        </header>
      )}
      <div className={cx(padded && "card-body", bodyClass)}>{children}</div>
      {footer && <footer className="card-footer">{footer}</footer>}
    </section>
  );
}

export function PageHeader({ title, subtitle, eyebrow, actions }) {
  return (
    <div className="page-header anim-rise">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="row-wrap">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ children, icon }) {
  return <div className="section-title">{icon && <Icon name={icon} size={15}/>}{children}</div>;
}

// ── شارات ──
export function Badge({ tone = "neutral", dot, icon, size, children, className, title }) {
  return (
    <span className={cx("badge", `tone-${tone}`, size, className)} title={title}>
      {dot && <span className="dot"/>}{icon && <Icon name={icon} size={13}/>}{children}
    </span>
  );
}

export const STATUS_TONE = {
  "جديد": "info", "قيد_المعالجة": "warning", "مقبول": "success", "مرفوض": "danger", "ملغى": "neutral",
  "نشط": "success", "توقف_مؤقت": "warning", "توقف_نهائي": "danger",
};
export const statusLabel = (s) => (s || "—").replace(/_/g, " ");
export function StatusBadge({ statut, size }) {
  return <Badge tone={STATUS_TONE[statut] || "neutral"} dot size={size}>{statusLabel(statut)}</Badge>;
}

// ── تنبيهات ──
const ALERT_ICON = { success: "checkCircle", warning: "alert", danger: "alertCircle", info: "info", neutral: "info", brand: "info", violet: "info" };
export function Alert({ tone = "info", title, icon, children, action, className, style }) {
  return (
    <div className={cx("alert", `tone-${tone}`, className)} role={tone === "danger" ? "alert" : undefined} style={style}>
      <Icon name={icon || ALERT_ICON[tone]} size={18}/>
      <div className="alert-body">
        {title && <div className="alert-title">{title}</div>}
        {children && <div>{children}</div>}
      </div>
      {action}
    </div>
  );
}

// ── حقول ──
export function Field({ label, required, hint, error, children, className, style }) {
  return (
    <div className={cx("field", className)} style={style}>
      {label && <label className="field-label">{label}{required && <span className="req">*</span>}</label>}
      {children}
      {error ? <div className="field-error">{error}</div> : hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}
export function TextInput({ className, locked, invalid, size, ...rest }) {
  return <input {...rest} className={cx("input", locked && "locked", invalid && "is-invalid", size === "lg" && "input-lg", className)}/>;
}
export function Select({ className, children, ...rest }) {
  return <select {...rest} className={cx("select", className)}>{children}</select>;
}
export function TextArea({ className, ...rest }) {
  return <textarea {...rest} className={cx("textarea", className)}/>;
}
export function SearchInput({ value, onChange, placeholder = "بحث...", style }) {
  return (
    <div className="input-wrap" style={style}>
      <Icon name="search" size={17}/>
      <input className="input" value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)}/>
    </div>
  );
}
export function Checkbox({ checked, onChange, children, disabled }) {
  return (
    <label className="check" style={disabled ? { opacity: .6, cursor: "not-allowed" } : undefined}>
      <input type="checkbox" checked={!!checked} disabled={disabled} onChange={e => onChange(e.target.checked)}/>{children}
    </label>
  );
}

// ── تحميل ──
export function Spinner({ label = "جارٍ التحميل...", size }) {
  return <div className="loader"><span className={cx("spinner", size !== "sm" && "lg")}/>{label && <span>{label}</span>}</div>;
}
export function Skeleton({ h = 16, w = "100%", style }) {
  return <div className="skeleton" style={{ height: h, width: w, ...style }}/>;
}

// ── حالة فارغة ──
export function EmptyState({ icon = "inbox", title, text, action, tone = "neutral" }) {
  return (
    <div className="empty">
      <div className={cx("icon-tile", `tone-${tone}`)}><Icon name={icon} size={24}/></div>
      {title && <div className="empty-title">{title}</div>}
      {text && <div style={{ maxWidth: 380 }}>{text}</div>}
      {action}
    </div>
  );
}

// ── بطاقة إحصائية ──
export function StatCard({ label, value, icon, tone = "brand", onClick, hint }) {
  return (
    <div className={cx("stat", `tone-${tone}`, onClick && "clickable")} onClick={onClick}>
      <div className={cx("icon-tile", `tone-${tone}`)}><Icon name={icon} size={20}/></div>
      <div style={{ minWidth: 0 }}>
        <div className="stat-value">{value ?? "—"}</div>
        <div className="stat-label">{label}</div>
        {hint && <div className="field-hint">{hint}</div>}
      </div>
    </div>
  );
}

// ── قائمة مفتاح/قيمة ──
export function DescList({ items, cols }) {
  const rows = items.filter(it => it && it.value !== undefined && it.value !== null && it.value !== "");
  if (!rows.length) return <div className="muted" style={{ fontSize: 14 }}>لا توجد بيانات</div>;
  return (
    <div className="dl" style={cols ? { gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` } : undefined}>
      {rows.map(({ label, value, warn, ltr }) => (
        <div key={label} className={cx("dl-item", warn && "warn")}>
          <div className="dt">{label}</div>
          <div className={cx("dd", ltr && "ltr")} style={ltr ? { textAlign: "right" } : undefined}>{value}{warn && " ⚠"}</div>
        </div>
      ))}
    </div>
  );
}

// ── تبويبات ──
export function Tabs({ tabs, active, onChange, style }) {
  return (
    <div className="tabs" role="tablist" style={style}>
      {tabs.map(t => (
        <button key={t.id} role="tab" aria-selected={active === t.id} className={cx("tab", active === t.id && "active")} onClick={() => onChange(t.id)}>
          {t.icon && <Icon name={t.icon} size={16}/>}{t.label}
          {t.count ? <span className="count-pill" style={{ background: active === t.id ? "var(--brand-600)" : "var(--subtle)" }}>{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
export function Segmented({ options, value, onChange }) {
  return (
    <div className="segmented">
      {options.map(o => (
        <button key={o.value} className={value === o.value ? "active" : ""} onClick={() => onChange(o.value)} type="button">
          {o.icon && <Icon name={o.icon} size={15}/>}{o.label}
        </button>
      ))}
    </div>
  );
}
export function Chips({ options, value, onChange }) {
  return (
    <div className="chips">
      {options.map(o => (
        <button key={o.value} type="button" className={cx("chip", value === o.value && "active")} onClick={() => onChange(o.value)}>
          {o.label}{o.count != null && <span className="count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ── نافذة ──
export function Modal({ open = true, onClose, title, subtitle, icon, tone = "brand", children, footer, size }) {
  useEffect(() => {
    if (!open) return;
    const h = e => e.key === "Escape" && onClose && onClose();
    window.addEventListener("keydown", h);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", h); document.body.style.overflow = prev; };
  }, [open]);
  if (!open) return null;
  // تُعرض في جذر الصفحة حتى لا تتأثر بحاويات متحركة أو أشرطة ثابتة
  return createPortal(
    <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose && onClose()}>
      <div className={cx("modal", size)} role="dialog" aria-modal="true" dir="rtl">
        <div className="modal-head">
          {icon && <div className={cx("icon-tile", `tone-${tone}`)}><Icon name={icon} size={20}/></div>}
          <div style={{ flex: 1, minWidth: 0 }}>
            {title && <h3 style={{ fontSize: 17 }}>{title}</h3>}
            {subtitle && <p className="muted" style={{ fontSize: 13, marginTop: 3 }}>{subtitle}</p>}
          </div>
          {onClose && <Button variant="ghost" size="sm" icon="x" className="modal-close" onClick={onClose} aria-label="إغلاق"/>}
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

// ── تأكيد (بديل window.confirm) ──
let confirmHandler = null;
export function confirmDialog(opts) {
  return new Promise(resolve => {
    if (!confirmHandler) { resolve(window.confirm(opts.message || opts.title)); return; }
    confirmHandler({ ...opts, resolve });
  });
}
// نافذة إدخال نص (بديل window.prompt) — تُرجع النص أو null
export function promptDialog(opts) {
  return new Promise(resolve => {
    if (!confirmHandler) { resolve(window.prompt(opts.message || opts.title)); return; }
    confirmHandler({ ...opts, input: true, resolve });
  });
}
export function ConfirmHost() {
  const [st, setSt] = useState(null);
  const [val, setVal] = useState("");
  useEffect(() => { confirmHandler = s => { setVal(s.defaultValue || ""); setSt(s); }; return () => { confirmHandler = null; }; }, []);
  if (!st) return null;
  const done = v => { st.resolve(v); setSt(null); };
  const ok = () => {
    if (!st.input) return done(true);
    if (st.required && !val.trim()) return;
    done(val);
  };
  return (
    <Modal onClose={() => done(st.input ? null : false)} title={st.title || "تأكيد"} icon={st.icon || (st.danger ? "alert" : "info")} tone={st.tone || (st.danger ? "danger" : "brand")}
      footer={<>
        <Button variant={st.danger ? "danger" : "primary"} icon={st.confirmIcon} onClick={ok} disabled={st.input && st.required && !val.trim()}>{st.confirmLabel || "تأكيد"}</Button>
        <Button variant="secondary" onClick={() => done(st.input ? null : false)}>إلغاء</Button>
      </>}>
      {st.message && <p style={{ color: "var(--text-2)", marginBottom: st.input ? 14 : 0 }}>{st.message}</p>}
      {st.input && (
        <Field label={st.label} required={st.required}>
          <textarea className="textarea" autoFocus value={val} placeholder={st.placeholder} onChange={e => setVal(e.target.value)}/>
        </Field>
      )}
    </Modal>
  );
}

// ── إشعارات منبثقة ──
let toastPush = null;
export const toast = {
  show(msg, kind = "info") { toastPush ? toastPush({ msg, kind, id: Math.random() }) : window.alert(msg); },
  success(m) { this.show(m, "success"); }, error(m) { this.show(m, "error"); }, info(m) { this.show(m, "info"); },
};
export function Toaster() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    toastPush = t => { setItems(p => [...p, t]); setTimeout(() => setItems(p => p.filter(x => x.id !== t.id)), 4500); };
    return () => { toastPush = null; };
  }, []);
  return (
    <div className="toaster" aria-live="polite">
      {items.map(t => (
        <div key={t.id} className={cx("toast", t.kind)}>
          <Icon name={t.kind === "success" ? "checkCircle" : t.kind === "error" ? "alertCircle" : "info"} size={18}/>
          <div>{t.msg}</div>
        </div>
      ))}
    </div>
  );
}

// ── رفع ملف ──
export function Dropzone({ label, hint = "صورة أو PDF — JPG · PNG · PDF", onFile, loading, loadingText = "جارٍ القراءة الآلية...", preview, isPdf, done, doneText, icon = "upload", accept = "image/*,application/pdf", disabled }) {
  const [drag, setDrag] = useState(false);
  const ref = useRef();
  const has = preview || isPdf || done;
  return (
    <label className={cx("dropzone", drag && "drag", has && "has-file")} style={disabled ? { opacity: .6, cursor: "not-allowed" } : undefined}
      onDragOver={e => { e.preventDefault(); if (!disabled) setDrag(true); }} onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f && !disabled) onFile(f); }}>
      {preview && !isPdf ? <img className="dz-preview" src={preview} alt=""/>
        : isPdf ? <div className="icon-tile lg tone-danger"><Icon name="file" size={24}/></div>
        : <div className={cx("icon-tile lg", done ? "tone-success" : "tone-brand")}><Icon name={done ? "checkCircle" : icon} size={24}/></div>}
      <div className="dz-title">{has ? (doneText || (isPdf ? "تم رفع ملف PDF" : "تم رفع الملف")) : label}</div>
      <div className="dz-hint">{has ? "اضغط أو اسحب ملفاً لاستبداله" : hint}</div>
      {loading && <div className="dz-busy"><span className="spinner lg"/><span>{loadingText}</span></div>}
      <input ref={ref} type="file" accept={accept} style={{ display: "none" }} disabled={disabled}
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }}/>
    </label>
  );
}

// ── ترقيم الصفحات ──
export function Pagination({ page, total, onChange }) {
  if (!total || total <= 1) return null;
  const pages = [];
  for (let p = Math.max(1, page - 2); p <= Math.min(total, page + 2); p++) pages.push(p);
  return (
    <div className="row-wrap" style={{ justifyContent: "center", marginTop: 18, gap: 6 }}>
      <Button variant="secondary" size="sm" icon="chevronRight" disabled={page <= 1} onClick={() => onChange(page - 1)}>السابق</Button>
      {pages.map(p => <Button key={p} size="sm" variant={p === page ? "primary" : "ghost"} onClick={() => onChange(p)} style={{ minWidth: 32 }}>{String(p)}</Button>)}
      <Button variant="secondary" size="sm" iconEnd="chevronLeft" disabled={page >= total} onClick={() => onChange(page + 1)}>التالي</Button>
    </div>
  );
}

// ── صورة رمزية بالأحرف الأولى ──
export function Avatar({ name, dark, size }) {
  const init = (name || "?").trim().charAt(0);
  return <div className={cx("avatar", dark && "dark")} style={size ? { width: size, height: size, fontSize: size * .38 } : undefined}>{init || "?"}</div>;
}

// ── بطاقة إجراء (طباعة/طلب) ──
export function ActionTile({ icon, tone = "brand", title, text, onClick, disabled, disabledText, right }) {
  return (
    <button type="button" className="action-tile" onClick={onClick} disabled={disabled} title={disabled ? disabledText : undefined}>
      <div className={cx("icon-tile", `tone-${disabled ? "neutral" : tone}`)}><Icon name={icon} size={19}/></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="at-title">{title}</div>
        <div className="at-text">{disabled && disabledText ? disabledText : text}</div>
      </div>
      {right || <Icon name={disabled ? "lock" : "chevronLeft"} size={16} style={{ color: "var(--subtle)", marginTop: 3 }}/>}
    </button>
  );
}

// تنسيق التاريخ YYYY-MM-DD → DD/MM/YYYY
export function fmtDate(d) {
  if (!d) return "";
  const s = String(d).slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}
export function fmtVal(v) {
  if (v == null) return "";
  if (Array.isArray(v)) return v.join("، ");
  let s = String(v).trim();
  if (s.startsWith("[")) { try { const a = JSON.parse(s); if (Array.isArray(a)) return a.join("، "); } catch { /* نص */ } }
  if (/[؀-ۿ]/.test(s)) s = s.replace(/_/g, " ");
  return s;
}

// أيقونة ولون كل نوع طلب
export const REQ_META = {
  "تغيير_مركبة": { icon: "car", tone: "info" },
  "تغيير_سيارة": { icon: "car", tone: "info" },
  "تغيير_باب": { icon: "door", tone: "gold" },
  "تغيير_نشاط": { icon: "route", tone: "violet" },
  "تصريح_مناوب": { icon: "userPlus", tone: "violet" },
  "توقف_مؤقت": { icon: "pause", tone: "warning" },
  "توقف_نهائي": { icon: "stop", tone: "danger" },
  "استئناف": { icon: "play", tone: "success" },
  "تجديد_رخصة_سائق": { icon: "idCard", tone: "brand" },
  "تجديد_رخصة_مناوب": { icon: "idCard", tone: "brand" },
  "تجديد_وثائق_استغلال": { icon: "refresh", tone: "brand" },
  "شهادة_إدارية": { icon: "stamp", tone: "gold" },
  "شهادة_إدارية_مناوب": { icon: "stamp", tone: "gold" },
};
export const reqMeta = t => REQ_META[t] || { icon: "fileText", tone: "neutral" };

// تنزيل ملف من نقطة API محمية
export async function downloadFile(url, token, filename) {
  const res = await fetch(url, { headers: { "X-Token": token } });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const href = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = href; a.download = filename; a.click();
  URL.revokeObjectURL(href);
}

/* ── تبديل النمط: مضيء / فاتح ── */
export function getTheme() {
  try { return localStorage.getItem("ui-theme") || "neon"; } catch { return "neon"; }
}
export function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  try { localStorage.setItem("ui-theme", t); } catch {}
}
export function ThemeToggle({ className, light }) {
  const [t, setT] = useState(getTheme());
  const next = t === "neon" ? "light" : "neon";
  return (
    <Button variant="ghost" size="sm" icon={t === "neon" ? "sun" : "moon"} className={cx("theme-toggle", className)}
      title={t === "neon" ? "النمط الفاتح" : "النمط المضيء"} aria-label="تبديل النمط"
      style={light ? { color: "rgba(255,255,255,.85)" } : undefined}
      onClick={() => { applyTheme(next); setT(next); }}/>
  );
}
