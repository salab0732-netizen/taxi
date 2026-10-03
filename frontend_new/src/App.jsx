import { useState, useEffect } from "react";
import { api } from "./api.js";
import IdentityTab from "./tabs/IdentityTab.jsx";
import VehicleTab  from "./tabs/VehicleTab.jsx";
import DoorTab     from "./tabs/DoorTab.jsx";
import DeputyTab   from "./tabs/DeputyTab.jsx";
import RequestsTab from "./tabs/RequestsTab.jsx";
import AdminPanel  from "./tabs/AdminPanel.jsx";
import CompanyApp  from "./company/CompanyApp.jsx";
import Icon, { GoogleLogo } from "./ui/Icon.jsx";
import { Button, Alert, Field, TextInput, Modal, Dropzone, Spinner as KitSpinner, Toaster, ConfirmHost, Badge, statusLabel, STATUS_TONE, ThemeToggle } from "./ui/kit.jsx";
import { BrandMark } from "./ui/Shell.jsx";

// ════════════════════════════════════════
// كشف وضع الإدارة عبر URL hash (#admin)
// ════════════════════════════════════════
function isAdminMode() {
  return window.location.hash === "#admin";
}

const TABS = [
  { id: "identity", icon: "idCard",   label: "الهوية" },
  { id: "vehicle",  icon: "car",      label: "المركبة" },
  { id: "door",     icon: "door",     label: "الباب" },
  { id: "deputy",   icon: "userPlus", label: "المناوب" },
  { id: "requests", icon: "fileText", label: "الطلبات والوثائق", short: "الطلبات" },
];

// ════════════════════════════════════════
// مكوّنات مشتركة (واجهة متوافقة مع الشاشات)
// ════════════════════════════════════════
export function Input({ label, required, children, hint }) {
  return (
    <Field label={label} required={required} hint={hint} style={{ marginBottom: 14 }}>{children}</Field>
  );
}

// نمط الحقول الموحّد (للحقول التي تستعمل style={INP})
export const INP = {
  width: "100%", height: 44, padding: "0 12px", border: "2px solid var(--field-border)",
  borderRadius: 10, fontSize: 15, fontWeight: 600, outline: "none", boxSizing: "border-box",
  fontFamily: "inherit", background: "var(--surface)", color: "var(--ink)", boxShadow: "var(--sh-xs)",
};

export function SaveBtn({ onClick, loading, label = "حفظ", icon = "save", disabled }) {
  return (
    <Button onClick={onClick} loading={loading} disabled={disabled} size="lg" block icon={icon} style={{ marginTop: 16 }}>
      {loading ? "جارٍ الحفظ..." : String(label).replace(/^[^\p{L}\p{N}]+/u, "")}
    </Button>
  );
}

const cleanMsg = m => String(m).replace(/[✅❌⚠🔒⏳]\uFE0F?/gu, "").replace(/\s{2,}/g, " ").trim();

export function SuccessMsg({ msg }) {
  if (!msg) return null;
  return <Alert tone="success" style={{ marginTop: 12 }}>{cleanMsg(msg)}</Alert>;
}

export function ErrorMsg({ msg }) {
  if (!msg) return null;
  return <Alert tone="danger" style={{ marginTop: 12 }}>{cleanMsg(msg)}</Alert>;
}

export function Spinner() {
  return <KitSpinner/>;
}

export function ImageUpload({ label, onImage, loading, preview, isPdf = false, hint }) {
  return (
    <Field label={label} style={{ marginBottom: 16 }}>
      <Dropzone label="اضغط أو اسحب الملف هنا" hint={hint} onFile={onImage} loading={loading}
        loadingText="جارٍ استخراج البيانات..." preview={preview} isPdf={isPdf} icon="scan"/>
    </Field>
  );
}

// ════════════════════════════════════════
// نافذة تسجيل الدخول / إنشاء الحساب
// kind: "driver" | "company" | "admin"
// ════════════════════════════════════════
function AuthMsg({ msg }) {
  if (!msg) return null;
  if (msg.startsWith("✅")) return <Alert tone="success" style={{ marginBottom: 14 }}>{msg.replace(/^✅\s*/, "")}</Alert>;
  return <Alert tone="danger" style={{ marginBottom: 14 }}>{msg}</Alert>;
}

const KIND_META = {
  driver:  { title: "فضاء سائقي سيارات الأجرة", icon: "taxi",     tone: "gold" },
  company: { title: "فضاء شركات سيارات الأجرة", icon: "building", tone: "brand" },
  admin:   { title: "دخول الإدارة",              icon: "shield",   tone: "brand" },
};

function AuthModal({ onSuccess, onClose, kind = "driver", initialError = "" }) {
  const companyOnly = kind === "company";
  const adminOnly   = kind === "admin";
  const [mode, setMode]               = useState("login");
  const [forgotStep,  setForgotStep]  = useState("phone");
  const [forgotPhone, setForgotPhone] = useState("");
  const [forgotOtp,   setForgotOtp]   = useState("");
  const [forgotPass,  setForgotPass]  = useState("");
  const accountType = kind;
  const [username, setUsername]   = useState("");
  const [password, setPassword]   = useState("");
  const [showPass, setShowPass]   = useState(false);
  const [companyNom, setCompanyNom] = useState("");
  const [companyRC,  setCompanyRC]  = useState("");
  const [companyTel, setCompanyTel] = useState("");
  const [companyRep, setCompanyRep] = useState("");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(initialError);

  function switchMode(m) {
    setMode(m); setError("");
    setForgotStep("phone"); setForgotPhone(""); setForgotOtp(""); setForgotPass("");
  }

  function finishLogin(r) {
    if (adminOnly && r.role !== "admin") {
      api.logout(r.token); setError("هذا الحساب ليس حساب مدير"); return;
    }
    if (companyOnly && r.role !== "company") {
      api.logout(r.token); setError("هذا الحساب ليس حساب شركة — استعمل فضاء سائقي سيارات الأجرة"); return;
    }
    if (!adminOnly && r.role === "admin") {
      // حساب الإدارة لا يُقبل أبدًا من فضاء عام
      setError("بيانات الدخول غير صحيحة"); return;
    }
    if (!companyOnly && !adminOnly && r.role === "company") {
      api.logout(r.token); setError("هذا حساب شركة — استعمل فضاء شركات سيارات الأجرة"); return;
    }
    onSuccess(r);
  }

  async function submit() {
    setError("");
    if (!username.trim() || !password.trim()) { setError("أدخل اسم المستخدم وكلمة المرور"); return; }
    setLoading(true);
    let r;
    if (mode === "login") {
      r = await api.login(username, password, kind);
    } else {
      const extra = accountType === "company"
        ? { nom_ar: companyNom, registre_commerce: companyRC, telephone: companyTel, representant_nom: companyRep }
        : {};
      r = await api.register(username, password, accountType, extra);
    }
    setLoading(false);
    if (r.error) { setError(r.error); return; }
    if (mode === "register") {
      setMode("login"); setError("✅ تم إنشاء الحساب — يمكنك تسجيل الدخول الآن"); return;
    }
    finishLogin(r);
  }

  async function sendOtp() {
    if (!forgotPhone.trim()) { setError("أدخل رقم الهاتف"); return; }
    setLoading(true); setError("");
    const r = await fetch("/api/auth/forgot-password", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: forgotPhone.trim() }),
    }).then(x => x.json()).catch(() => ({ error: "خطأ في الاتصال" }));
    setLoading(false);
    if (r.error) { setError(r.error); return; }
    setForgotStep("otp");
  }

  async function confirmOtp() {
    if (!forgotOtp.trim() || !forgotPass.trim()) { setError("أدخل الرمز وكلمة المرور الجديدة"); return; }
    setLoading(true); setError("");
    const r = await fetch("/api/auth/reset-password", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: forgotPhone.trim(), otp: forgotOtp.trim(), new_password: forgotPass }),
    }).then(x => x.json()).catch(() => ({ error: "خطأ في الاتصال" }));
    if (r.error) { setLoading(false); setError(r.error); return; }
    const phone = forgotPhone.trim(), newPass = forgotPass;
    const lr = await api.login(phone, newPass, kind);
    setLoading(false);
    if (!lr.error) { finishLogin(lr); return; }
    switchMode("login"); setUsername(phone); setPassword(newPass);
    setError("✅ تم تغيير كلمة المرور — اضغط دخول");
  }

  const meta = KIND_META[kind];
  const title = mode === "forgot" ? "استعادة كلمة المرور" : mode === "register" ? "إنشاء حساب جديد" : "تسجيل الدخول";
  const onEnter = fn => e => e.key === "Enter" && fn();

  return (
    <Modal onClose={onClose} title={title} subtitle={meta.title} icon={mode === "forgot" ? "key" : meta.icon} tone={meta.tone}>
      {mode === "forgot" ? (
        forgotStep === "phone" ? (
          <div className="stack">
            <p className="muted" style={{ fontSize: 13.5 }}>أدخل رقم الهاتف المسجّل كاسم مستخدم، وسيصلك رمز تحقق عبر رسالة SMS.</p>
            <Field label="رقم الهاتف" required>
              <div className="input-wrap"><Icon name="smartphone" size={17}/>
                <TextInput value={forgotPhone} dir="ltr" placeholder="05XXXXXXXX" autoFocus
                  onChange={e => setForgotPhone(e.target.value)} onKeyDown={onEnter(sendOtp)}/></div>
            </Field>
            <AuthMsg msg={error}/>
            <Button size="lg" block icon="send" loading={loading} onClick={sendOtp}>إرسال رمز التحقق</Button>
          </div>
        ) : (
          <div className="stack">
            <Alert tone="success">تم إرسال الرمز إلى <b className="ltr">{forgotPhone}</b></Alert>
            <Field label="رمز التحقق (6 أرقام)" required>
              <TextInput className="input-otp" value={forgotOtp} maxLength={6} dir="ltr" autoComplete="one-time-code" name="otp"
                onChange={e => setForgotOtp(e.target.value.replace(/\D/g, ""))} placeholder="••••••" autoFocus/>
            </Field>
            <Field label="كلمة المرور الجديدة" required hint="6 أحرف على الأقل">
              <TextInput type="password" autoComplete="new-password" value={forgotPass}
                onChange={e => setForgotPass(e.target.value)} onKeyDown={onEnter(confirmOtp)}/>
            </Field>
            <AuthMsg msg={error}/>
            <Button size="lg" block icon="check" loading={loading} onClick={confirmOtp}>تأكيد وتغيير كلمة المرور</Button>
            <Button variant="ghost" size="sm" icon="arrowRight" onClick={() => { setForgotStep("phone"); setError(""); }}>تغيير رقم الهاتف</Button>
          </div>
        )
      ) : (
        <div className="stack">
          {mode === "login" && !adminOnly && (
            <>
              <Button variant="secondary" size="lg" block className="google-btn"
                onClick={() => window.location.href = `/api/auth/google?role=${kind}`}>
                <GoogleLogo/> المتابعة بحساب Google
              </Button>
              <div className="divider">أو باسم المستخدم</div>
            </>
          )}

          {mode === "register" && accountType === "company" && (
            <div className="grid grid-2" style={{ gap: 12 }}>
              <Field label="اسم الشركة (عربي)" required className="span-2">
                <TextInput value={companyNom} onChange={e => setCompanyNom(e.target.value)} placeholder="مثال: شركة النجمة لسيارات الأجرة"/>
              </Field>
              <Field label="رقم السجل التجاري">
                <TextInput value={companyRC} onChange={e => setCompanyRC(e.target.value)} placeholder="RC-2026-XXXXX" dir="ltr"/>
              </Field>
              <Field label="رقم الهاتف">
                <TextInput value={companyTel} onChange={e => setCompanyTel(e.target.value)} placeholder="05XXXXXXXX" dir="ltr"/>
              </Field>
              <Field label="الممثل القانوني" className="span-2">
                <TextInput value={companyRep} onChange={e => setCompanyRep(e.target.value)} placeholder="الاسم الكامل"/>
              </Field>
            </div>
          )}

          <Field label="اسم المستخدم" required hint={mode === "register" && !companyOnly ? "يُنصح باستعمال رقم الهاتف لتتمكن من استرجاع كلمة المرور" : undefined}>
            <div className="input-wrap"><Icon name="user" size={17}/>
              <TextInput value={username} autoComplete="username" name="username" autoFocus
                onChange={e => setUsername(e.target.value)} placeholder={adminOnly ? "admin" : "رقم الهاتف أو اسم المستخدم"}/></div>
          </Field>
          <Field label="كلمة المرور" required>
            <div className="input-wrap"><Icon name="lock" size={17}/>
              <TextInput type={showPass ? "text" : "password"} value={password} autoComplete={mode === "login" ? "current-password" : "new-password"}
                onChange={e => setPassword(e.target.value)} onKeyDown={onEnter(submit)} placeholder="6 أحرف على الأقل" style={{ paddingLeft: 40 }}/>
              <button type="button" className="btn btn-ghost btn-xs btn-icon" onClick={() => setShowPass(s => !s)}
                style={{ position: "absolute", left: 6, top: "50%", transform: "translateY(-50%)" }} aria-label="إظهار كلمة المرور">
                <Icon name="eye" size={15}/></button>
            </div>
          </Field>
          {mode === "login" && !adminOnly && (
            <div style={{ marginTop: -6 }}>
              <button type="button" className="btn-link" style={{ fontSize: 13 }}
                onClick={() => { setMode("forgot"); setError(""); setForgotStep("phone"); }}>نسيت كلمة المرور؟</button>
            </div>
          )}
          <AuthMsg msg={error}/>
          <Button size="lg" block loading={loading} icon={mode === "login" ? "login" : "userPlus"} onClick={submit}>
            {mode === "login" ? "دخول" : "إنشاء الحساب"}
          </Button>
        </div>
      )}

      {!adminOnly && (
        <div style={{ textAlign: "center", marginTop: 18, fontSize: 13.5, color: "var(--muted)" }}>
          {mode === "login" ? <>ليس لديك حساب؟ <button className="btn-link" onClick={() => switchMode("register")}>أنشئ حساباً جديداً</button></>
            : <><button className="btn-link" onClick={() => switchMode("login")}>العودة إلى تسجيل الدخول</button></>}
        </div>
      )}
    </Modal>
  );
}

// ════════════════════════════════════════
// الصفحة العامة (قبل الدخول)
// ════════════════════════════════════════
function Landing({ onDriver, onCompany }) {
  return (
    <div className="landing" dir="rtl">
      <aside className="landing-aside">
        <div className="row" style={{ gap: 12 }}>
          <BrandMark size={44}/>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>منصة تسيير سيارات الأجرة</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.6)" }}>DTW EL BAYADH · STT</div>
          </div>
        </div>
        <div style={{ margin: "auto 0", paddingBlock: 36 }}>
          <div className="gov-line">الجمهورية الجزائرية الديمقراطية الشعبية<br/>وزارة الداخلية والجماعات المحلية والنقل — مديرية النقل لولاية البيض</div>
          <h1 className="landing-hero-title" style={{ marginTop: 18 }}>ملفك المهني كاملاً،<br/><em>في مكان واحد.</em></h1>
          <p style={{ color: "rgba(255,255,255,.7)", fontSize: 15, marginTop: 14, maxWidth: 460, lineHeight: 1.8 }}>
            رقمنة ملفات سائقي وشركات سيارات الأجرة: الوثائق، الرخص، العقود والطلبات — مع قراءة آلية للوثائق ومتابعة فورية لقرارات الإدارة.
          </p>
          <div className="landing-feats">
            {[
              ["scan", "قراءة آلية للوثائق", "ارفع صورة البطاقة أو الرخصة وتُملأ الحقول تلقائياً."],
              ["fileSignature", "عقود ووثائق جاهزة للطباعة", "عقود الكراء والمناوب والطلبات الرسمية بنقرة واحدة."],
              ["bell", "متابعة الطلبات", "اطّلع على حالة طلباتك وقرار الإدارة لحظة صدوره."],
            ].map(([ic, t, d]) => (
              <div className="feat" key={t}>
                <div className="icon-tile"><Icon name={ic} size={19}/></div>
                <div><div className="feat-title">{t}</div><div className="feat-text">{d}</div></div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,.45)" }}>© {new Date().getFullYear()} مديرية النقل لولاية البيض</div>
      </aside>

      <main className="landing-main">
        <div className="landing-main-inner anim-rise">
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}><ThemeToggle/></div>
          <div className="eyebrow">مرحباً بكم</div>
          <h2 style={{ fontSize: 26 }}>اختر فضاءك للمتابعة</h2>
          <p className="muted" style={{ marginTop: 6, marginBottom: 26 }}>سجّل الدخول أو أنشئ حساباً جديداً في الفضاء المناسب لك.</p>
          <div className="stack" style={{ gap: 12 }}>
            <button className="role-card" onClick={onDriver}>
              <div className="icon-tile tone-gold"><Icon name="taxi" size={26}/></div>
              <div><div className="role-title">سائقو سيارات الأجرة</div><div className="role-text">الهوية، المركبة، الباب، المناوب والطلبات</div></div>
              <Icon name="chevronLeft" size={20} className="chev"/>
            </button>
            <button className="role-card" onClick={onCompany}>
              <div className="icon-tile tone-brand"><Icon name="building" size={26}/></div>
              <div><div className="role-title">شركات سيارات الأجرة</div><div className="role-text">الأسطول، السائقون الأجراء، عقود التوظيف والرخص</div></div>
              <Icon name="chevronLeft" size={20} className="chev"/>
            </button>
          </div>
          <div className="divider" style={{ margin: "26px 0 16px" }}>الإدارة</div>
          <a href="#admin" className="btn btn-ghost btn-block" style={{ color: "var(--muted)" }}><Icon name="shield" size={17}/> دخول لوحة الإدارة</a>
        </div>
      </main>
    </div>
  );
}

// ════════════════════════════════════════
// واجهة الإدارة (عند hash #admin)
// ════════════════════════════════════════
function AdminApp() {
  const [token, setToken] = useState(() => localStorage.getItem("token") || "");
  const [showAuth, setShowAuth] = useState(false);
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(() => !!localStorage.getItem("token"));

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api.me(token)
      .then(me => { if (me.error) { logout(); return; } setAccount(me); })
      .finally(() => setLoading(false));
  }, [token]);

  function onLogin(data) {
    localStorage.setItem("token", data.token);
    if (data.role === "company") localStorage.setItem("role", "company"); else localStorage.removeItem("role");
    setToken(data.token); setShowAuth(false);
  }
  function logout() {
    if (token) api.logout(token);
    localStorage.removeItem("token"); localStorage.removeItem("role");
    setToken(""); setAccount(null);
  }

  if (loading) return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}><KitSpinner/></div>;

  if (token && account && account.role === "admin") {
    return <AdminPanel token={token} account={account} onLogout={logout}/>;
  }

  return (
    <div className="landing" dir="rtl" style={{ gridTemplateColumns: "1fr" }}>
      <main className="landing-main" style={{ background: "var(--brand-950)", backgroundImage: "radial-gradient(60% 60% at 80% 0%, rgba(20,147,124,.45), transparent 70%)" }}>
        <div className="landing-main-inner anim-rise" style={{ maxWidth: 420 }}>
          <div className="card" style={{ padding: 32, textAlign: "center" }}>
            <div style={{ display: "grid", placeItems: "center", marginBottom: 18 }}><BrandMark size={56}/></div>
            {token && account && account.role !== "admin" ? (
              <>
                <h2 style={{ fontSize: 20 }}>غير مصرّح</h2>
                <p className="muted" style={{ margin: "8px 0 22px" }}>هذه الصفحة مخصّصة لحسابات الإدارة فقط.</p>
                <Button variant="secondary" block icon="logout" onClick={logout}>تسجيل الخروج</Button>
              </>
            ) : (
              <>
                <div className="eyebrow">مديرية النقل لولاية البيض</div>
                <h2 style={{ fontSize: 22 }}>لوحة الإدارة</h2>
                <p className="muted" style={{ margin: "8px 0 24px" }}>معالجة الطلبات، ملفات السائقين والشركات، الأرشيف والتقارير.</p>
                <Button size="lg" block icon="login" onClick={() => setShowAuth(true)}>تسجيل الدخول</Button>
              </>
            )}
            <a href="#" onClick={() => { window.location.hash = ""; }} className="btn btn-ghost btn-sm" style={{ marginTop: 14, color: "var(--muted)" }}>
              <Icon name="arrowRight" size={15}/> العودة إلى الصفحة الرئيسية</a>
          </div>
        </div>
      </main>
      {showAuth && <AuthModal kind="admin" onSuccess={onLogin} onClose={() => setShowAuth(false)}/>}
    </div>
  );
}

// ════════════════════════════════════════
// المكوّن الجذر
// ════════════════════════════════════════
export default function App() {
  const [admin, setAdmin] = useState(isAdminMode());
  useEffect(() => {
    const h = () => setAdmin(isAdminMode());
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, []);
  return admin ? <AdminApp/> : <MainApp/>;
}

// حالة اكتمال كل قسم من ملف السائق
function tabState(id, p) {
  if (!p?.driver) return id === "requests" ? null : "todo";
  switch (id) {
    case "identity": return p.driver?.nin && p.license ? "done" : "todo";
    case "vehicle":  return p.vehicle ? "done" : "todo";
    case "door":     return p.door ? "done" : "todo";
    case "deputy":   return p.deputy_contract ? "done" : null;
    default:         return null;
  }
}

function MainApp() {
  const [token,     setToken]     = useState(() => localStorage.getItem("token") || "");
  const [account,   setAccount]   = useState(null);
  const [profile,   setProfile]   = useState(null);
  const [activeTab, setActiveTab] = useState("identity");
  const [showAuth,  setShowAuth]  = useState(false);
  const [showCompanyAuth, setShowCompanyAuth] = useState(false);
  const [authError, setAuthError] = useState("");
  const [unread,    setUnread]    = useState(0);
  const [loading,   setLoading]   = useState(false);

  // معالجة إعادة توجيه Google OAuth
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gToken = params.get("token");
    const gRole  = params.get("role");
    const gError = params.get("google_error");
    if (gToken) {
      localStorage.setItem("token", gToken);
      if (gRole === "company") localStorage.setItem("role", "company"); else localStorage.removeItem("role");
      setToken(gToken);
      window.history.replaceState({}, "", "/");
    }
    if (gError) {
      const want = params.get("want");
      const msgs = {
        wrong_type: want === "company"
          ? "حساب Google هذا مسجّل كسائق — استعمل فضاء سائقي سيارات الأجرة"
          : "حساب Google هذا مسجّل كشركة — استعمل فضاء شركات سيارات الأجرة",
        cancelled: "",
      };
      setAuthError(gError in msgs ? msgs[gError] : "تعذّر الدخول بحساب Google — حاول مجدداً");
      if (want === "company") setShowCompanyAuth(true); else setShowAuth(true);
      window.history.replaceState({}, "", "/");
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    let cancelled = false;
    Promise.all([api.me(token), api.getProfile(token), api.getNotifications(token)])
      .then(([me, prof, notifs]) => {
        if (cancelled) return;
        if (me.error) { logout(); return; }
        if (me.role === "admin") {
          // توكن إدارة في الفضاء العام: لا تحويل تلقائي للوحة الإدارة
          // (لا نمسح التخزين حتى لا تُغلق جلسة لوحة الإدارة المفتوحة في تبويب آخر)
          setToken(""); setAccount(null); return;
        }
        setAccount(me); setProfile(prof); setUnread(notifs.unread || 0);
      }).catch(() => {}).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => { window.scrollTo({ top: 0, behavior: "smooth" }); }, [activeTab]);

  function onLogin(data) {
    localStorage.setItem("token", data.token);
    if (data.role === "company") localStorage.setItem("role", "company"); else localStorage.removeItem("role");
    setToken(data.token); setShowAuth(false); setShowCompanyAuth(false);
  }
  function logout() {
    if (token) api.logout(token);
    localStorage.removeItem("token"); localStorage.removeItem("role");
    setToken(""); setAccount(null); setProfile(null); setUnread(0); setActiveTab("identity");
  }
  function refreshProfile() {
    if (!token) return;
    api.getNotifications(token).then(n => setUnread(n.unread || 0));
    return api.getProfile(token).then(setProfile);
  }

  if (account && account.role === "company") {
    return <CompanyApp account={account} token={token} onLogout={logout}/>;
  }

  const modals = (<>
    {showAuth && <AuthModal kind="driver" initialError={authError} onSuccess={onLogin}
      onClose={() => { setShowAuth(false); setAuthError(""); }}/>}
    {showCompanyAuth && <AuthModal kind="company" initialError={authError} onSuccess={onLogin}
      onClose={() => { setShowCompanyAuth(false); setAuthError(""); }}/>}
  </>);

  if (!token) {
    return <>{<Landing onDriver={() => setShowAuth(true)} onCompany={() => setShowCompanyAuth(true)}/>}{modals}</>;
  }

  const d = profile?.driver || {};
  const fullName = `${d.prenom_ar || ""} ${d.nom_ar || ""}`.trim();
  const statut = d.statut || "نشط";
  const statutCls = statut === "نشط" ? "ok" : statut === "توقف_مؤقت" ? "warn" : "bad";
  const doneCount = ["identity", "vehicle", "door"].filter(t => tabState(t, profile) === "done").length;

  return (
    <div dir="rtl" style={{ minHeight: "100vh" }}>
      <header className="appbar">
        <div className="appbar-inner">
          <BrandMark size={36}/>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.2 }}>منصة تسيير سيارات الأجرة</div>
            <div style={{ fontSize: 11.5, color: "rgba(255,255,255,.6)" }} className="hide-mobile">فضاء السائق — مديرية النقل لولاية البيض</div>
          </div>
          <div className="spacer"/>
          <div className="icon-btn-badge">
            <Button variant="ghost" icon="bell" onClick={() => setActiveTab("requests")} aria-label="الإشعارات"/>
            {unread > 0 && <span className="count-pill">{unread > 9 ? "9+" : unread}</span>}
          </div>
          <span className="hide-mobile ltr" style={{ fontSize: 13, color: "rgba(255,255,255,.75)" }}>{account?.username}</span>
          <ThemeToggle light/>
          <Button variant="ghost" icon="logout" onClick={logout}><span className="hide-mobile">خروج</span></Button>
        </div>
      </header>

      <section className="hero">
        <div className="hero-inner">
          <div className="profile-card anim-rise" style={{ paddingTop: 18 }}>
            <div className="profile-avatar">{fullName ? fullName.charAt(0) : <Icon name="user" size={24}/>}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.6)" }}>مرحباً بك</div>
              <div style={{ fontSize: 21, fontWeight: 700 }}>{fullName || "أكمل ملفك المهني"}</div>
              <div className="hero-meta">
                <span className={`hero-pill ${statutCls}`}><Icon name={statut === "نشط" ? "checkCircle" : "pause"} size={14}/>{statusLabel(statut)}</span>
                {profile?.door?.door_number && <span className="hero-pill"><Icon name="door" size={14}/>الباب {profile.door.door_number}</span>}
                {profile?.vehicle?.num_immatriculation && <span className="hero-pill ltr"><Icon name="car" size={14}/>{profile.vehicle.num_immatriculation}</span>}
              </div>
            </div>
            <div className="hide-mobile" style={{ minWidth: 200 }}>
              <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.7)", marginBottom: 6 }}>اكتمال الملف: {doneCount} / 3</div>
              <div className="progress" style={{ background: "rgba(255,255,255,.12)" }}><span style={{ width: `${(doneCount / 3) * 100}%`, background: "var(--gold-500)" }}/></div>
            </div>
          </div>
        </div>
      </section>

      <div className="driver-body">
        <nav className="steps-nav" aria-label="أقسام الملف">
          {TABS.map(t => {
            const st = tabState(t.id, profile);
            return (
              <button key={t.id} className={`step-btn ${activeTab === t.id ? "active" : ""}`} onClick={() => setActiveTab(t.id)}>
                <Icon name={t.icon} size={19}/>{t.label}
                {t.id === "requests" && unread > 0 && <span className="count-pill">{unread}</span>}
                {st && <span className={`state-dot ${st}`} title={st === "done" ? "مكتمل" : "غير مكتمل"}/>}
              </button>
            );
          })}
        </nav>

        {loading || !profile ? (
          <div className="card"><KitSpinner/></div>
        ) : (
          <div key={activeTab} className="anim-rise stack">
            {["vehicle", "door", "deputy"].includes(activeTab) && profile?.locked_reason && (
              <Alert tone="warning" icon="lock" title="الملف مقفل مؤقتاً">{profile.locked_reason}</Alert>
            )}
            {activeTab === "door" && !profile?.locked_reason && !profile?.door && profile?.last_door && (
              <RelinkDoorBanner token={token} lastDoor={profile.last_door} onDone={refreshProfile}/>
            )}
            {activeTab === "identity" && <IdentityTab token={token} profile={profile} onSaved={refreshProfile}/>}
            {activeTab === "vehicle"  && <VehicleTab  token={token} profile={profile} onSaved={refreshProfile}/>}
            {activeTab === "door"     && <DoorTab     token={token} profile={profile} onSaved={refreshProfile}/>}
            {activeTab === "deputy"   && <DeputyTab   token={token} profile={profile} onSaved={refreshProfile}/>}
            {activeTab === "requests" && <RequestsTab token={token} profile={profile} onSaved={refreshProfile}/>}
          </div>
        )}
      </div>

      <nav className="bottom-nav" aria-label="أقسام الملف">
        {TABS.map(t => (
          <button key={t.id} className={activeTab === t.id ? "active" : ""} onClick={() => setActiveTab(t.id)}>
            <Icon name={t.icon} size={21}/>{t.short || t.label}
            {t.id === "requests" && unread > 0 && <span className="count-pill">{unread}</span>}
          </button>
        ))}
      </nav>
      <Toaster/><ConfirmHost/>
      {modals}
    </div>
  );
}

// ── بعد الاستئناف: اقتراح إعادة ربط الباب السابق (إن بقي شاغراً) ──
function RelinkDoorBanner({ token, lastDoor, onDone }) {
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState("");
  async function relink() {
    setBusy(true); setErr("");
    const r = await fetch("/api/driver/door/relink", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Token": token }, body: "{}",
    }).then(x => x.json()).catch(() => ({ error: "خطأ في الاتصال بالخادم" }));
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    onDone && onDone();
  }
  return (
    <Alert tone="success" icon="link" title={`بابك السابق رقم ${lastDoor.door_number} ما زال شاغراً`}
      action={<Button variant="success" size="sm" icon="link" loading={busy} onClick={relink}>إعادة ربط الباب</Button>}>
      {`${lastDoor.ben_prenom || ""} ${lastDoor.ben_nom || ""}`.trim()} — يمكنك إعادة ربطه ثم إنشاء عقد كراء جديد، أو إدخال باب جديد أدناه.
      {err && <div style={{ color: "var(--danger)", marginTop: 6 }}>{err}</div>}
    </Alert>
  );
}

export { Badge, STATUS_TONE };
