// ════════════════════════════════════════════════════════════
// رموز الطباعة القصيرة العمر
// رمز الجلسة لا يوضع أبداً في الروابط: كل رابط وثيقة (…?token=…) يُفتح في نافذة جديدة
// يُستبدل فيه الرمز تلقائياً برمز طباعة (pt_) صالح 5 دقائق فقط.
// ════════════════════════════════════════════════════════════
let pt = null, ptSession = null, ptAt = 0, inflight = null;
const FRESH_MS = 3.5 * 60 * 1000;

const session = () => { try { return localStorage.getItem("token") || ""; } catch { return ""; } };
const valid = () => pt && ptSession === session() && Date.now() - ptAt < FRESH_MS;

export function refreshPrintToken() {
  const s = session();
  if (!s) { pt = null; ptSession = null; return Promise.resolve(null); }
  if (inflight) return inflight;
  inflight = fetch("/api/auth/print-token", { method: "POST", headers: { "X-Token": s } })
    .then(r => (r.ok ? r.json() : null))
    .then(d => { if (d && d.token) { pt = d.token; ptSession = s; ptAt = Date.now(); } return pt; })
    .catch(() => null)
    .finally(() => { inflight = null; });
  return inflight;
}

const RX = /([?&])token=[^&#]*/;
const needs = u => typeof u === "string" && RX.test(u) && !/[?&]token=pt_/.test(u);
const swap = u => u.replace(RX, `$1token=${encodeURIComponent(pt)}`);

/** يرجع الرابط برمز طباعة (يتطلب أن يكون الرمز جاهزاً) */
export function withPrintToken(u) { return needs(u) && valid() ? swap(u) : u; }

/** فتح وثيقة: فوري إن كان الرمز جاهزاً، وإلا نافذة مؤقتة ثم التحويل */
export function openWithPrintToken(origOpen, url, ...rest) {
  if (!needs(url)) return origOpen(url, ...rest);
  if (valid()) return origOpen(swap(url), ...rest);
  const w = origOpen("about:blank", ...rest);
  refreshPrintToken().then(t => {
    const target = t ? swap(url) : url.replace(RX, "$1");
    if (w) w.location.href = target; else origOpen(target, ...rest);
  });
  return w;
}

export function installPrintTokens() {
  const orig = window.open.bind(window);
  window.open = (url, ...rest) => openWithPrintToken(orig, typeof url === "string" ? url : String(url ?? ""), ...rest);

  // الروابط <a href="…?token=…"> (أزرار الوثائق)
  const onClick = e => {
    const a = e.target && e.target.closest && e.target.closest("a[href*='token=']");
    if (!a) return;
    const href = a.getAttribute("href");
    if (!needs(href)) return;
    if (valid()) { a.setAttribute("href", swap(href)); setTimeout(() => a.setAttribute("href", href), 0); return; }
    e.preventDefault();
    window.open(href, a.target || "_blank");
  };
  document.addEventListener("click", onClick, true);
  document.addEventListener("auxclick", onClick, true);

  refreshPrintToken();
  setInterval(refreshPrintToken, 90 * 1000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !valid()) refreshPrintToken(); });
  window.addEventListener("storage", e => { if (e.key === "token") refreshPrintToken(); });
  // بعد تسجيل الدخول في نفس النافذة
  let last = session();
  setInterval(() => { const s = session(); if (s !== last) { last = s; refreshPrintToken(); } }, 1000);
}
