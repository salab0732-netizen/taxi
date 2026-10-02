import { useState, useEffect } from "react";
import { api, ACTIVITY_LABELS, ACTIVITY_TYPES } from "../api.js";
import ResumeRequestForm from "./ResumeRequestForm.jsx";
import { Card, Alert, Button, Badge, StatusBadge, ActionTile, Select, TextArea, Field, EmptyState, reqMeta, fmtDate, promptDialog } from "../ui/kit.jsx";
import Icon from "../ui/Icon.jsx";

const COLOR    = "#125950";
const C_BLUE   = "#0891b2";
const C_PURPLE = "#7c3aed";
const C_ORANGE = "#d97706";
const C_YELLOW = "#92400e";
const C_RED    = "#dc2626";
const C_GREEN  = "#16a34a";
const C_TEAL   = "#0d9488";

export default function RequestsTab({ token, profile, onSaved }) {
  const [loading,    setLoading]    = useState({});
  const [success,    setSuccess]    = useState({});
  const [error,      setError]      = useState({});
  const [actOld,     setActOld]     = useState("");
  const [actNew,     setActNew]     = useState("");
  const [notesTemp,  setNotesTemp]  = useState("");
  const [notesFinal, setNotesFinal] = useState("");
  const [notesRes,   setNotesRes]   = useState("");
  const [requests,   setRequests]   = useState([]);
  const [showAll,    setShowAll]    = useState(false);

  useEffect(() => {
    setActOld(profile?.activity?.activity_type || "");
  }, [profile]);

  useEffect(() => {
    if (!token) return;
    api.getRequests(token).then(r => setRequests(r.requests || []));
  }, [token]);

  function setL(k, v) { setLoading(p => ({ ...p, [k]: v })); }
  function setS(k, v) { setSuccess(p => ({ ...p, [k]: v })); setTimeout(() => setSuccess(p => ({ ...p, [k]: "" })), 5000); }
  function setE(k, v) { setError(p => ({ ...p, [k]: v })); }

  // طلب شهادة إدارية: يُكتب الغرض في الطلب (اختياري — يُترك فارغاً ليُكتب باليد)
  async function printCert(url) {
    const purpose = await promptDialog({ title: "طلب شهادة إدارية", icon: "fileText", confirmLabel: "طباعة الطلب", confirmIcon: "printer",
      label: "الغرض من الشهادة (اختياري)", placeholder: "مثال: استكمال ملف إداري لدى ...",
      message: "يُطبع طلب خطّي باسمك موجّه إلى السيد مدير النقل. اكتب الغرض أو اتركه فارغاً لكتابته باليد." });
    if (purpose === null) return;
    window.open(url + (purpose.trim() ? "&purpose=" + encodeURIComponent(purpose.trim()) : ""), "_blank");
  }

  async function submitAndPrint(key, reqData, printFn) {
    setL(key, true); setE(key, ""); setS(key, "");
    const r = await api.submitRequest(token, reqData);
    setL(key, false);
    if (r.error) { setE(key, r.error); return; }
    setS(key, `✅ تم تسجيل الطلب رقم ${r.request_number} — في انتظار موافقة الإدارة`);
    api.getRequests(token).then(res => setRequests(res.requests || []));
    if (onSaved) onSaved();
    window.open(printFn(r.request_id, token), "_blank");
  }

  const rentalId     = profile?.rental?.id;
  const isBeneficiary = profile?.door?.exploitation_mode === "مستفيد";
  const deputyCtId   = profile?.deputy_contract?.id;
  const hasDeputy    = !!profile?.deputy?.id;
  const driverStatut = profile?.driver?.statut || "نشط";
  const isStopped    = driverStatut === "توقف_مؤقت" || driverStatut === "توقف_نهائي";
  // طلب توقف/استئناف ينتظر قرار الإدارة — الأثر لا يُطبَّق إلا بعد الموافقة
  const pendingStatus = profile?.pending_status || null;
  const isLocked      = !!profile?.locked_reason;
  const pendingMsg    = pendingStatus
    ? `طلبك «${pendingStatus.request_type.replace("_"," ")}» (${pendingStatus.request_number}) في انتظار موافقة الإدارة`
    : "";

  return (
    <div dir="rtl" className="stack">

      {/* ══════════ قسم طباعة الوثائق ══════════ */}
      <Section title="طباعة الوثائق" icon="printer" subtitle="وثائقك الجاهزة للطباعة" grid>

        {/* 1. بطاقة معلومات سائق سيارة الأجرة */}
        <PrintCard
          icon="🚕" title="بطاقة معلومات سائق سيارة الأجرة" color={COLOR}
          desc="تطبع كل بيانات الملف: الهوية، الرخصة، المركبة، الباب، المستفيد، عقد الكراء، المناوب"
          onClick={() => printDriverCard(profile)}
        />

        {/* 2. طلب شهادة إدارية سائق */}
        <PrintCard
          icon="📋" title='طلب شهادة إدارية "سائق سيارة الأجرة"' color={C_PURPLE}
          desc="طلب خطّي موجّه لمدير النقل للحصول على شهادة تثبت مزاولتك للنشاط"
          onClick={() => printCert(api.printAdminCertDriver(token))}
        />

        {/* 3. طلب شهادة إدارية مناوب */}
        <PrintCard
          icon="📋" title='طلب شهادة إدارية "سائق المناوب"' color={C_TEAL}
          desc="طلب خطّي يقدّمه المناوب للحصول على شهادة تثبت عمله لديك"
          disabled={!hasDeputy}
          disabledMsg="أكمل بيانات السائق المناوب أولاً"
          onClick={() => printCert(api.printAdminCertDeputy(token))}
        />

        <Divider label="عقود الكراء والمناوب" />

        {/* 4-5. عقد الكراء ومحضر فسخه — لا يظهران للمستفيد صاحب الرخصة */}
        {!isBeneficiary && (<>
        {/* 4. عقد كراء الرخصة */}
        <PrintCard
          icon="📄" title="عقد كراء الرخصة" color={C_BLUE}
          desc="عقد الكراء بين المستفيد والسائق (سنة واحدة)"
          disabled={!rentalId}
          disabledMsg="أكمل بيانات رقم الباب أولاً لإنشاء عقد الكراء"
          onClick={() => window.open(api.printRentalContract(rentalId, token), "_blank")}
        />

        {/* 5. محضر فسخ عقد الكراء */}
        <PrintCard
          icon="🗒️" title="محضر فسخ عقد الكراء" color={C_RED}
          desc="وثيقة فسخ عقد كراء الرخصة بين الطرفين"
          disabled={!rentalId}
          disabledMsg="لا يوجد عقد كراء نشط"
          onClick={() => window.open(api.printRentalContractTermination(rentalId, token), "_blank")}
        />

        </>)}

        {/* 6. عقد عمل المناوب */}
        <PrintCard
          icon="🤝" title="عقد عمل السائق المناوب" color={C_PURPLE}
          desc="عقد العمل بين السائق الرئيسي والسائق المناوب (سنة واحدة)"
          disabled={!deputyCtId}
          disabledMsg="أكمل بيانات المناوب أولاً لإنشاء العقد"
          onClick={() => window.open(api.printDeputyContract(deputyCtId, token), "_blank")}
        />

        {/* 7. طلب توظيف سائق مناوب */}
        <PrintCard
          icon="📑" title="طلب توظيف سائق مناوب" color={C_ORANGE}
          desc="وثيقة طلب التوظيف الرسمية — تتضمن بيانات السائقين والمركبة"
          disabled={!deputyCtId}
          disabledMsg="أكمل بيانات المناوب أولاً"
          onClick={() => window.open(api.printDeputyJobRequest(deputyCtId, token), "_blank")}
        />

        {/* 8. محضر فسخ عقد المناوب */}
        <PrintCard
          icon="🗒️" title="محضر فسخ عقد المناوب" color={C_RED}
          desc="وثيقة فسخ عقد عمل السائق المناوب"
          disabled={!deputyCtId}
          disabledMsg="لا يوجد عقد مناوب نشط"
          onClick={() => window.open(api.printDeputyContractTermination(deputyCtId, token), "_blank")}
        />

      </Section>

      {/* ══════════ الطلبات الرسمية ══════════ */}
      <Section title="الطلبات الرسمية" icon="send" subtitle="تُسجَّل الطلبات وتُطبع ثم تُودَع لدى الإدارة للموافقة">
        {pendingStatus && (
          <Alert tone="warning" icon="hourglass" style={{marginBottom:12}} title="طلب بانتظار قرار الإدارة">
            {pendingMsg} — لا يتغيّر وضعك إلا بعد الموافقة، ولا يُسمح إلا بالطباعة حتى ذلك الحين.
          </Alert>
        )}

        {/* تجديد وثائق الاستغلال */}
        <RequestCard icon="🔄" title="تجديد وثائق الاستغلال" color={C_GREEN}
          desc="تجديد رخصة السياقة وعقد الكراء والوثائق الإدارية المرتبطة بالاستغلال"
          loading={loading["renewal"]} success={success["renewal"]} error={error["renewal"]}
          disabled={isLocked} disabledMsg={pendingStatus?pendingMsg:"أنت في حالة توقف — قدّم طلب استئناف وانتظر موافقة الإدارة"}>
          <ActionBtn label="📄 تسجيل الطلب وطباعته" color={C_GREEN}
            loading={loading["renewal"]}
            onClick={() => submitAndPrint("renewal", {request_type:"تجديد_وثائق_استغلال"},
              (id,tok) => api.printRenewal(id,tok))}/>
        </RequestCard>

        {/* تغيير طبيعة النشاط */}
        <RequestCard icon="🔀" title="تغيير طبيعة النشاط" color={C_BLUE}
          desc="تغيير نمط نشاط النقل: فردي حضري، جماعي حضري، ما بين البلديات، ما بين الولايات"
          loading={loading["activity"]} success={success["activity"]} error={error["activity"]}
          disabled={isLocked} disabledMsg={pendingStatus?pendingMsg:"أنت في حالة توقف — قدّم طلب استئناف وانتظر موافقة الإدارة"}>
          <div className="grid grid-2" style={{marginBottom:12}}>
            <div className="field">
              <label className="field-label">النشاط الحالي</label>
              <select className="select"
                value={actOld} onChange={e=>setActOld(e.target.value)}>
                <option value="">— اختر —</option>
                {ACTIVITY_TYPES.map(t=><option key={t} value={t}>{ACTIVITY_LABELS[t]}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field-label">النشاط الجديد المطلوب</label>
              <select className="select" style={{borderColor:"var(--brand-400)"}}
                value={actNew} onChange={e=>setActNew(e.target.value)}>
                <option value="">— اختر —</option>
                {ACTIVITY_TYPES.filter(t=>t!==actOld).map(t=><option key={t} value={t}>{ACTIVITY_LABELS[t]}</option>)}
              </select>
            </div>
          </div>
          <ActionBtn label="🔀 تسجيل الطلب وطباعته" color={C_BLUE}
            loading={loading["activity"]} disabled={!actOld||!actNew}
            onClick={() => {
              if(!actOld){setE("activity","حدد النشاط الحالي");return;}
              if(!actNew){setE("activity","حدد النشاط الجديد");return;}
              if(actOld===actNew){setE("activity","النشاط الجديد يجب أن يختلف عن الحالي");return;}
              submitAndPrint("activity",{request_type:"تغيير_نشاط",activity_type_old:actOld,activity_type_new:actNew},
                (id,tok)=>api.printActivity(id,tok));
            }}/>
        </RequestCard>

        {/* التوقف النهائي */}
        <RequestCard icon="⛔" title="التوقف النهائي عن النشاط" color={C_RED}
          desc="إيقاف نهائي وكامل لممارسة نشاط نقل الأشخاص — لا يمكن التراجع إلا بطلب استئناف"
          loading={loading["stopFinal"]} success={success["stopFinal"]} error={error["stopFinal"]}
          warning="بعد موافقة الإدارة: تصبح حالتك «توقف نهائي» ويُفسخ عقد الكراء وعقد المناوب ويُحرَّر الباب" warningColor={C_RED}
          disabled={driverStatut==="توقف_نهائي"||!!pendingStatus} disabledMsg={pendingStatus?pendingMsg:"وضعك الحالي هو توقف نهائي بالفعل"}>
          <div className="field" style={{marginBottom:12}}>
            <label className="field-label">سبب التوقف (اختياري)</label>
            <textarea className="textarea" rows={2}
              placeholder="يمكنك إضافة سبب التوقف..." value={notesFinal}
              onChange={e=>setNotesFinal(e.target.value)}/>
          </div>
          <ActionBtn label="⛔ تسجيل التوقف النهائي وطباعة الطلب" color={C_RED}
            loading={loading["stopFinal"]} disabled={driverStatut==="توقف_نهائي"||!!pendingStatus}
            onClick={()=>submitAndPrint("stopFinal",{request_type:"توقف_نهائي",notes:notesFinal},
              (id,tok)=>api.printStopFinal(id,tok))}/>
        </RequestCard>

        {/* التوقف المؤقت */}
        <RequestCard icon="⏸️" title="التوقف المؤقت عن النشاط" color={C_YELLOW}
          desc="توقف مؤقت عن ممارسة النشاط مع إمكانية الاستئناف لاحقاً"
          loading={loading["stopTemp"]} success={success["stopTemp"]} error={error["stopTemp"]}
          warning="بعد موافقة الإدارة: تصبح حالتك «توقف مؤقت» ويُفسخ عقد الكراء وعقد المناوب ويُحرَّر الباب" warningColor={C_YELLOW}
          disabled={driverStatut==="توقف_مؤقت"||driverStatut==="توقف_نهائي"||!!pendingStatus}
          disabledMsg={pendingStatus?pendingMsg:driverStatut==="توقف_مؤقت"?"وضعك الحالي هو توقف مؤقت بالفعل":
            driverStatut==="توقف_نهائي"?"وضعك الحالي هو توقف نهائي — لا يمكن الإيقاف المؤقت":""}>
          <div className="field" style={{marginBottom:12}}>
            <label className="field-label">سبب التوقف (اختياري)</label>
            <textarea className="textarea" rows={2}
              placeholder="يمكنك إضافة سبب التوقف..." value={notesTemp}
              onChange={e=>setNotesTemp(e.target.value)}/>
          </div>
          <ActionBtn label="⏸️ تسجيل التوقف المؤقت وطباعة الطلب" color={C_YELLOW}
            loading={loading["stopTemp"]}
            disabled={driverStatut==="توقف_مؤقت"||driverStatut==="توقف_نهائي"||!!pendingStatus}
            onClick={()=>submitAndPrint("stopTemp",{request_type:"توقف_مؤقت",notes:notesTemp},
              (id,tok)=>api.printStopTemp(id,tok))}/>
        </RequestCard>

        {/* استئناف النشاط */}
        <RequestCard icon="▶️" title="استئناف النشاط" color={C_GREEN} defaultOpen={isStopped && !pendingStatus}
          desc="إعادة ممارسة النشاط بعد فترة توقف مؤقت أو نهائي"
          loading={loading["resume"]} success={success["resume"]} error={error["resume"]}
          warning="أرفق بالطلب المركبة والباب وعقد الكراء الجديد — بعد موافقة الإدارة تعود «نشط» وتُحرَّر لك رخصة استغلال جديدة" warningColor={C_GREEN}
          disabled={!isStopped||!!pendingStatus} disabledMsg={pendingStatus?pendingMsg:"وضعك الحالي «نشط» — لا تحتاج إلى طلب استئناف"}>
          {isStopped && !pendingStatus && (
            <ResumeRequestForm token={token} profile={profile} loading={loading["resume"]}
              onSubmit={payload => submitAndPrint("resume", payload, (id,tok)=>api.printResume(id,tok))}/>
          )}
        </RequestCard>

      </Section>

      {/* ══════════ سجل الطلبات ══════════ */}
      {requests.length > 0 && (
        <Section title="سجل الطلبات المقدَّمة" icon="history" subtitle="حالة كل طلب وردّ الإدارة" flush>
          {(showAll ? requests : requests.slice(0, 8)).map(req => <RequestHistoryRow key={req.id} req={req} token={token}/>)}
          {requests.length > 8 && (
            <div style={{ padding: 12, textAlign: "center" }}>
              <Button variant="ghost" size="sm" iconEnd={showAll ? "chevronUp" : "chevronDown"} onClick={() => setShowAll(v => !v)}>
                {showAll ? "عرض أقل" : `عرض كل الطلبات (${requests.length})`}
              </Button>
            </div>
          )}
        </Section>
      )}

    </div>
  );
}


// ── توجيه الطباعة للـ route الصحيح حسب نوع الطلب ──
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

// ════ مكوّن صف تاريخ الطلب ════
function RequestHistoryRow({ req, token }) {
  const m = reqMeta(req.request_type);
  const LABELS = {
    "تجديد_وثائق_استغلال":"تجديد وثائق الاستغلال","تغيير_نشاط":"تغيير طبيعة النشاط",
    "توقف_نهائي":"توقف نهائي","توقف_مؤقت":"توقف مؤقت","استئناف":"استئناف النشاط",
    "تغيير_سيارة":"تغيير السيارة","تغيير_باب":"تغيير رقم الباب","تغيير_مركبة":"تغيير المركبة (نقل ملكية)",
    "تصريح_مناوب":"تصريح مناوب","تجديد_رخصة_سائق":"تجديد رخصة السياقة","تجديد_رخصة_مناوب":"تجديد رخصة المناوب",
  };
  return (
    <div className="list-item" style={{ padding: "14px 20px", alignItems: "flex-start" }}>
      <div className={`icon-tile sm tone-${m.tone}`}><Icon name={m.icon} size={16}/></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="cell-title">{LABELS[req.request_type] || req.request_type}</div>
        <div className="cell-sub"><span className="mono">{req.request_number}</span> · {fmtDate(req.created_at)}</div>
        {req.admin_notes && (
          <div style={{ marginTop: 6, fontSize: 13, background: "var(--info-bg)", border: "1px solid var(--info-line)", borderRadius: 10, padding: "6px 10px", color: "var(--text-2)" }}>
            <b style={{ color: "var(--info)" }}>ردّ الإدارة: </b>{req.admin_notes}
          </div>
        )}
      </div>
      <StatusBadge statut={req.statut} size="sm"/>
      <Button size="sm" variant="ghost" icon="printer" onClick={() => window.open(getPrintUrl(req, token), "_blank")} aria-label="طباعة"/>
    </div>
  );
}

const EMOJI_ICON = { "🚕":"taxi","📋":"clipboard","📄":"fileSignature","🗒️":"fileText","🤝":"briefcase","📑":"userPlus",
  "🔄":"refresh","🔀":"route","⛔":"stop","⏸️":"pause","▶️":"play" };
const TONE_OF = c => ({ [COLOR]:"brand", [C_BLUE]:"info", [C_PURPLE]:"violet", [C_ORANGE]:"gold", [C_YELLOW]:"warning",
  [C_RED]:"danger", [C_GREEN]:"success", [C_TEAL]:"brand" }[c] || "brand");

// ════ بطاقة طلب رسمي ════
function RequestCard({ icon,title,color,desc,children,loading,success,error,warning,disabled,disabledMsg,defaultOpen }) {
  const tone = TONE_OF(color);
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className={`req-card ${open && !disabled ? "open" : ""}`} style={disabled ? { background: "var(--surface-2)" } : undefined}>
      <div className="req-head" onClick={() => !disabled && setOpen(o => !o)} style={disabled ? { cursor: "not-allowed" } : undefined}>
        <div className={`icon-tile tone-${disabled ? "neutral" : tone}`}><Icon name={EMOJI_ICON[icon] || "fileText"} size={19}/></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="cell-title" style={disabled ? { color: "var(--muted)" } : undefined}>{title}</div>
          <div className="cell-sub">{disabled && disabledMsg ? disabledMsg : desc}</div>
        </div>
        {disabled ? <Icon name="lock" size={16} style={{ color: "var(--subtle)" }}/>
          : <Button size="sm" variant={open ? "ghost" : "soft"} iconEnd={open ? "chevronUp" : "chevronDown"}>{open ? "إخفاء" : "تقديم الطلب"}</Button>}
      </div>
      {!disabled && (open || success || error) && (
        <div className="req-body" style={{ paddingTop: 14 }}>
          {warning && <Alert tone={tone === "danger" ? "danger" : tone === "warning" ? "warning" : "info"} style={{ marginBottom: 12 }}>{warning}</Alert>}
          {open && children}
          {success && <Alert tone="success" style={{ marginTop: 10 }}>{String(success).replace(/^✅\s*/, "")}</Alert>}
          {error && <Alert tone="danger" style={{ marginTop: 10 }}>{error}</Alert>}
        </div>
      )}
    </div>
  );
}

// ════ بطاقة طباعة ════
function PrintCard({ icon,title,desc,color,onClick,disabled,disabledMsg }) {
  return (
    <ActionTile icon={EMOJI_ICON[icon] || "printer"} tone={TONE_OF(color)} title={title} text={desc}
      onClick={onClick} disabled={disabled} disabledText={disabledMsg}
      right={!disabled ? <Icon name="printer" size={17} style={{ color: "var(--brand-600)", marginTop: 3 }}/> : undefined}/>
  );
}

// ════ فاصل ════
function Divider({ label }) {
  return <div className="section-title span-all" style={{ margin: "8px 0 0" }}>{label}</div>;
}

// ════ زر الإجراء ════
function ActionBtn({ label,color,onClick,loading,disabled }) {
  const tone = TONE_OF(color);
  const variant = tone === "danger" ? "danger" : tone === "warning" ? "gold" : "primary";
  return (
    <Button block size="lg" variant={variant} icon="printer" loading={loading} disabled={disabled} onClick={onClick}>
      {loading ? "جارٍ التسجيل..." : String(label).replace(/^(?:[\s️]|\p{Extended_Pictographic})+/u, "")}
    </Button>
  );
}

// ════ Section ════
function Section({ title, icon, subtitle, grid, flush, children }) {
  return (
    <Card title={title} icon={icon} subtitle={subtitle} padded={!flush}>
      {grid ? <div className="grid grid-2" style={{ gap: 10 }}>{children}</div>
        : flush ? <div className="list">{children}</div> : <div className="stack-sm">{children}</div>}
    </Card>
  );
}

// ════ طباعة بطاقة السائق ════
function printDriverCard(profile) {
  const id  = profile?.identity || profile?.driver || {};
  const lic = profile?.license  || {};
  const veh = profile?.vehicle  || {};
  const doo = profile?.door     || {};
  const rc  = profile?.rental   || {};
  const dep = profile?.deputy   || {};
  const dc  = profile?.deputy_contract || {};
  const today = new Date().toLocaleDateString("ar-DZ",{year:"numeric",month:"long",day:"numeric"});

  let cats = lic.categories||"";
  try{if(typeof cats==="string"&&cats.startsWith("["))cats=JSON.parse(cats).join(" / ");}catch{}
  let depCats = dep.categories_permis||"";
  try{if(typeof depCats==="string"&&depCats.startsWith("["))depCats=JSON.parse(depCats).join(" / ");}catch{}

  const row=(l,v)=>`<tr><td class="lbl">${l}</td><td>${v||"—"}</td></tr>`;
  const sep=(i,t)=>`<tr><td class="sep" colspan="2">${i} ${t}</td></tr>`;

  const html=`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8">
<title>بطاقة معلومات سائق سيارة الأجرة</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Arial,sans-serif;background:#f0f4f3;padding:20px;direction:rtl;font-size:13px}
.page{max-width:740px;margin:0 auto;background:#fff;border:2px solid #125950;border-radius:12px;overflow:hidden}
.header{background:#125950;color:#fff;padding:18px 22px;display:flex;align-items:center;gap:14px}
.header .ico{font-size:44px}.header h1{font-size:17px;font-weight:800;margin-bottom:2px}.header p{font-size:11px;opacity:.75}
.badge{background:#e4f5ec;color:#125950;font-weight:700;text-align:center;padding:8px;font-size:13px;border-bottom:1px solid #c6e8d5}
table{width:100%;border-collapse:collapse}
td{padding:8px 13px;border-bottom:1px solid #e5e7eb;font-size:12px}
td.lbl{font-weight:700;color:#1a3a33;width:36%;background:#f8fffe}
td.sep{background:#d1fae5;color:#125950;font-weight:800;font-size:12px;padding:9px 13px;border-top:2px solid #6ee7b7;border-bottom:2px solid #6ee7b7}
.sign{display:flex;justify-content:space-between;padding:24px 28px 16px;gap:20px}
.sign-box{flex:1;text-align:center}.sign-box .line{border-top:1px solid #374151;margin-top:44px;padding-top:5px;font-size:11px;color:#6b7280}
.footer{text-align:center;font-size:10px;color:#9ca3af;padding:10px;border-top:1px solid #e5e7eb;background:#f8fffe}
.btn{display:block;width:160px;margin:14px auto;padding:10px;background:#125950;color:#fff;border:none;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer}
@media print{body{background:#fff;padding:0}.btn{display:none}.page{border:1.5px solid #aaa}}
</style></head><body>
<div class="page">
  <div class="header"><div class="ico">🚕</div>
    <div><h1>بطاقة معلومات سائق سيارة الأجرة</h1><p>نظام إدارة سيارات الأجرة — DTW ELBAYADH -STT /DEV2026</p></div>
  </div>
  <div class="badge">📅 تاريخ الطباعة: ${today}</div>
  <table>
    ${sep("👤","بيانات الهوية")}
    ${row("اللقب (عربي)",id.nom_ar)}${row("الاسم (عربي)",id.prenom_ar)}
    ${row("Nom",id.nom_fr)}${row("Prénom",id.prenom_fr)}
    ${row("تاريخ الميلاد",id.date_naissance)}${row("مكان الميلاد",id.lieu_naissance_ar)}
    ${row("NIN",id.nin)}
    ${row("العنوان",id.adresse)}${row("الهاتف",id.telephone)}
    ${sep("🪪","رخصة السياقة")}
    ${row("رقم الرخصة",lic.num_permis)}${row("الفئات",cats)}
    ${row("تاريخ الإصدار",lic.date_delivrance)}${row("تاريخ الانتهاء",lic.date_expiration)}
    ${row("جهة الإصدار",lic.wilaya_delivrance)}
    ${sep("🚗","بيانات المركبة")}
    ${row("رقم التسجيل",veh.num_immatriculation)}${row("الصنف",veh.marque)}
    ${row("الطراز",veh.type_vehicule)}${row("رقم التسلسلي في الطراز",veh.num_serie)}
    ${row("نوع الوقود",veh.energie)}${row("عدد المقاعد",veh.nb_places)}
    ${row("سنة أول استعمال",veh.annee_circulation)}
    ${sep("🚪","الباب والمستفيد")}
    ${row("رقم الباب",doo.door_number)}${row("الولاية",doo.wilaya)}
    ${row("نوع القرار",doo.decision_type)}${row("رقم القرار",doo.decision_number)}
    ${row("تاريخ القرار",doo.decision_date)}
    ${row("لقب المستفيد",doo.ben_nom_ar)}${row("اسم المستفيد",doo.ben_prenom_ar)}
    ${row("NIN المستفيد",doo.ben_nin)}${row("صفة المستفيد",doo.sifa||doo.ben_sifa)}
    ${sep("📄","عقد الكراء")}
    ${doo.exploitation_mode==="مستفيد" ? (
      row("صفة الاستغلال","مستفيد")+row("رقم العقد","مستفيد")+row("تاريخ الانتهاء","مستفيد")
    ) : (
      row("رقم العقد",rc.contract_number)+
      row("تاريخ التحرير",(rc.contract_date||"").slice(0,10))+
      row("تاريخ الانتهاء",(rc.end_date||"مفتوح").slice?.(0,10)||"مفتوح")+
      row("الأيجار الشهري",rc.monthly_rent ? rc.monthly_rent + " دج" : "—")
    )}
    ${sep("👤","السائق المناوب")}
    ${row("اللقب",dep.nom_ar)}${row("الاسم",dep.prenom_ar)}
    ${row("NIN",dep.nin)}${row("الهاتف",dep.telephone)}
    ${row("رقم الرخصة",dep.num_permis)}${row("فئات الرخصة",depCats)}
    ${row("انتهاء الرخصة",dep.date_expiration_permis)}
    ${sep("📋","عقد المناوب")}
    ${row("رقم العقد",dc.contract_number)}
    ${row("تاريخ التحرير",(dc.contract_date||"").slice?.(0,10))}
    ${row("تاريخ الانتهاء",(dc.end_date||"").slice?.(0,10))}
  </table>
  <div class="sign">
    <div class="sign-box"><div class="line">توقيع السائق</div></div>
    <div class="sign-box"><div class="line">ختم وتوقيع الإدارة</div></div>
  </div>
  <div class="footer">نظام إدارة سيارات الأجرة — ${today}</div>
</div>
<button class="btn" onclick="window.print()">🖨️ طباعة</button>
</body></html>`;

  const win = window.open("","_blank","width=840,height=680");
  if (win) { win.document.write(html); win.document.close(); }
}

