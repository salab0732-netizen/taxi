// ════════════════════════════════════════════════════════════
// شريط «نسخة تجريبية»: يظهر فقط في بيئة الاختبار (/api/env → test)
// حتى لا يخلط أحد بين النسخة التجريبية والبرنامج الحقيقي
// ════════════════════════════════════════════════════════════
export function installEnvRibbon() {
  fetch("/api/env").then(r => (r.ok ? r.json() : null)).then(d => {
    if (!d || !d.test) return;
    document.documentElement.classList.add("env-test");
    document.title = "[تجريبي] " + document.title;
    const st = document.createElement("style");
    st.textContent = `
      .env-frame { position: fixed; inset: 0; border: 3px solid #f97316; pointer-events: none; z-index: 2147483000; }
      .env-tab { position: fixed; left: 0; top: 50%; width: 0; height: 0; z-index: 2147483001; pointer-events: none; }
      .env-tab span { position: absolute; left: 0; top: 0; transform-origin: 0 0; transform: rotate(-90deg) translateX(-50%);
        white-space: nowrap; background: #f97316; color: #fff; font: 700 12px/1 Cairo, sans-serif;
        padding: 6px 14px 7px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(249,115,22,.5); }`;
    document.head.appendChild(st);
    const frame = document.createElement("div");
    frame.className = "env-frame";
    const tab = document.createElement("div");
    tab.className = "env-tab";
    tab.innerHTML = "<span>نسخة تجريبية — بيانات وهمية</span>";
    document.body.append(frame, tab);
  }).catch(() => {});
}
