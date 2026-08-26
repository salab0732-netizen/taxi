// ==================== ADMIN PASSWORD MODAL ====================
function AdminPasswordModal({ onSuccess, onClose }) {
  const [pw, setPw]           = useState("");
  const [err, setErr]         = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCheck() {
    if (!pw.trim()) { setErr("أدخل كلمة المرور"); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/login`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({password: pw})
      });
      const d = await res.json();
      if (d.success) { onSuccess(); }
      else { setErr("كلمة المرور غير صحيحة"); }
    } catch(e) { setErr("خطأ في الاتصال بالخادم"); }
    setLoading(false);
  }

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.55)",zIndex:3000,
      display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:"#fff",borderRadius:18,padding:"32px 28px",maxWidth:360,width:"100%",
        boxShadow:"0 8px 40px rgba(0,0,0,.18)"}} dir="rtl">
        <div style={{textAlign:"center",marginBottom:20}}>
          <div style={{fontSize:40,marginBottom:8}}>🔐</div>
          <h3 style={{margin:0,color:"#1a6b3c",fontSize:17,fontWeight:800}}>لوحة الإدارة</h3>
          <p style={{color:"#6b7280",fontSize:13,margin:"6px 0 0"}}>أدخل كلمة المرور للمتابعة</p>
        </div>
        <input
          type="password" value={pw}
          onChange={e=>{setPw(e.target.value);setErr("");}}
          onKeyDown={e=>e.key==="Enter"&&handleCheck()}
          placeholder="كلمة المرور" autoFocus
          style={{width:"100%",padding:"12px 14px",
            border:`1.5px solid ${err?"#dc2626":"#d1d5db"}`,
            borderRadius:10,fontSize:15,outline:"none",fontFamily:"inherit",
            textAlign:"center",letterSpacing:4,marginBottom:8}}
        />
        {err&&<div style={{color:"#dc2626",fontSize:13,marginBottom:10,textAlign:"center"}}>⚠️ {err}</div>}
        <div style={{display:"flex",gap:10,marginTop:8}}>
          <button onClick={onClose} style={{flex:1,padding:12,borderRadius:10,
            border:"1.5px solid #d1d5db",background:"#fff",cursor:"pointer",
            fontWeight:600,color:"#374151",fontSize:14}}>إلغاء</button>
          <button onClick={handleCheck} disabled={loading} style={{flex:2,padding:12,borderRadius:10,
            border:"none",background:loading?"#86efac":"#1a6b3c",color:"#fff",
            cursor:loading?"default":"pointer",fontWeight:700,fontSize:14}}>
            {loading?"جارٍ التحقق...":"دخول ←"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================== MAIN APP ====================
function App() {
  const [page, setPage]           = useState("landing");
  const [step, setStep]           = useState(0);
  const [form, setForm]           = useState(INITIAL_FORM);
  const [preview, setPreview]     = useState(null);
  const [errors, setErrors]       = useState([]);
  const [saving, setSaving]       = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showAdminPw, setShowAdminPw] = useState(false);

  function reset() { setStep(0); setForm(INITIAL_FORM); setPreview(null); setErrors([]); }

  function handleExtracted(data, prev) {
    if (data) setForm(f => ({ ...f, ...Object.fromEntries(Object.entries(data).filter(([,v])=>v!==undefined&&v!=="")) }));
    setPreview(prev);
    setStep(1);
  }

  function validate() {
    const e = [];
    if (!form.nomAr.trim())        e.push("اللقب (عربي) مطلوب");
    if (!form.prenomAr.trim())     e.push("الاسم (عربي) مطلوب");
    if (!form.nin.trim())          e.push("رقم التعريف الوطني مطلوب");
    if (!form.numPermis.trim())    e.push("رقم رخصة السياقة مطلوب");
    if (!form.dateExpiration)      e.push("تاريخ انتهاء الرخصة مطلوب");
    if (form.categories.length===0) e.push("يجب اختيار فئة واحدة على الأقل");
    return e;
  }

  async function handleSubmit() {
    const e = validate();
    if (e.length) { setErrors(e); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/register`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify(form)
      });
      const d = await res.json();
      if (d.success) setStep(2);
      else setErrors([d.error || "خطأ في الحفظ"]);
    } catch(err) {
      setErrors(["خطأ في الاتصال بالخادم"]);
    }
    setSaving(false);
  }

  const headerColor = page==="company" ? "#2563eb"
                    : page==="booklet"  ? "#b45309"
                    : page==="heritage" ? "#7c3aed"
                    : "#1a6b3c";
  const headerTitle = page==="company"  ? "تسجيل شركة سيارات الأجرة"
                    : page==="booklet"  ? "التسجيل لنيل دفتر المقاعد"
                    : page==="heritage" ? "رخصة استغلال — ذوو الحقوق"
                    : "تسجيل سائقي سيارات الأجرة";
  const headerSub = "مركز التكوين — نقل الأشخاص";

  return (
    <div style={{minHeight:"100vh",background:"#f0fdf4",fontFamily:"Segoe UI,Tahoma,Arial,sans-serif"}} dir="rtl">
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} *{box-sizing:border-box}`}</style>

      {/* Header */}
      <div style={{background:headerColor,boxShadow:"0 2px 8px rgba(0,0,0,.15)"}}>
        <div style={{maxWidth:660,margin:"0 auto",padding:"0 20px",display:"flex",alignItems:"center",justifyContent:"space-between",height:58}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:22}}>{page==="company"?"🏢":page==="booklet"?"📘":page==="heritage"?"📜":"🚕"}</span>
            <div>
              <div style={{color:"#fff",fontWeight:700,fontSize:14}}>{headerTitle}</div>
              <div style={{color:"rgba(255,255,255,.75)",fontSize:11}}>{headerSub}</div>
            </div>
          </div>
          <div style={{display:"flex",gap:8}}>
            {page!=="landing"&&(
              <button onClick={()=>{setPage("landing");reset();}} style={{padding:"6px 12px",borderRadius:8,border:"1px solid rgba(255,255,255,.3)",background:"rgba(255,255,255,.1)",color:"#fff",cursor:"pointer",fontSize:12}}>
                🏠 الرئيسية
              </button>
            )}
            <button onClick={()=>setShowAdminPw(true)} style={{padding:"6px 13px",borderRadius:8,border:"1px solid rgba(255,255,255,.3)",background:"rgba(255,255,255,.1)",color:"#fff",cursor:"pointer",fontSize:12}}>
              🗂️ الإدارة
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{maxWidth:660,margin:"0 auto",padding:"28px 14px"}}>
        <div style={{background:"#fff",borderRadius:20,boxShadow:"0 4px 24px rgba(0,0,0,.07)",padding:"28px 24px"}}>

          {/* Landing */}
          {page==="landing"&&<LandingPage onSelect={p=>{setPage(p);reset();}}/>}

          {/* Company */}
          {page==="company"&&<CompanyForm onBack={()=>{setPage("landing");reset();}}/>}

          {/* Seat Booklet */}
          {page==="booklet"&&<SeatBookletForm onBack={()=>{setPage("landing");reset();}}/>}

          {/* Heritage License */}
          {page==="heritage"&&<HeritageLicenseForm onBack={()=>{setPage("landing");reset();}}/>}

          {/* Driver */}
          {page==="driver"&&<>
            {step<3&&<StepBar step={step}/>}

            {/* خطوة 0: رفع رخصة السياقة + البطاقة الرمادية معاً */}
            {step===0&&<UploadDocuments onDone={(permisData, griseData, preview)=>{
              const merged = {};
              if (permisData) Object.entries(permisData).forEach(([k,v])=>{ if(v!=="") merged[k]=v; });
              if (griseData)  Object.entries(griseData).forEach(([k,v])=>{ if(v!=="") merged[k]=v; });
              setForm(f=>({...f,...merged}));
              setPreview(preview);
              setStep(1);
            }}/>}

            {/* خطوة 1: مراجعة البيانات */}
            {step===1&&<>
              <ReviewStep form={form} setForm={setForm} preview={preview}/>
              <ReviewVehicle form={form} setForm={setForm}/>
              {errors.length>0&&(
                <div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:10,padding:"10px 14px",marginTop:14}}>
                  {errors.map(e=><div key={e} style={{color:"#dc2626",fontSize:13,marginBottom:3}}>⚠️ {e}</div>)}
                </div>
              )}
              <div style={{display:"flex",gap:10,marginTop:22}}>
                <button onClick={()=>setStep(1)} style={{flex:1,padding:13,borderRadius:10,border:"1.5px solid #d1d5db",background:"#fff",cursor:"pointer",fontWeight:600,color:"#374151"}}>← رجوع</button>
                <button onClick={handleSubmit} disabled={saving} style={{flex:2,padding:13,borderRadius:10,border:"none",background:saving?"#86efac":"#1a6b3c",color:"#fff",cursor:saving?"default":"pointer",fontWeight:700,fontSize:15}}>
                  {saving?"جارٍ الإرسال...":"✅ تأكيد التسجيل"}
                </button>
              </div>
            </>}

            {/* خطوة 3: تأكيد */}
            {step===2&&<>
              <ConfirmStep form={form} preview={preview}/>
              <button onClick={reset} style={{width:"100%",marginTop:18,padding:13,borderRadius:10,border:"none",background:"#1a6b3c",color:"#fff",cursor:"pointer",fontWeight:700,fontSize:15}}>
                + تسجيل مترشح آخر
              </button>
            </>}
          </>}

        </div>
        <p style={{textAlign:"center",color:"#9ca3af",fontSize:12,marginTop:18}}>
          بياناتك محفوظة بشكل آمن على خادم المركز
        </p>
      </div>

      {showAdminPw&&(
        <AdminPasswordModal
          onSuccess={()=>{ setShowAdminPw(false); setShowAdmin(true); }}
          onClose={()=>setShowAdminPw(false)}
        />
      )}
      {showAdmin&&<AdminPanel onClose={()=>setShowAdmin(false)}/>}
    </div>
  );
}