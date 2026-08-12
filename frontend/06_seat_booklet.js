// ==================== SEAT BOOKLET FORM (دفتر المقاعد) ====================
function SeatBookletForm({ onBack }) {
  const [step, setStep]     = useState(0); // 0=رفع الرخصة, 1=بيانات إضافية, 2=تأكيد+طباعة
  const [form, setForm]     = useState({...INITIAL_FORM, telephone2:""});
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState([]);
  const [regResult, setRegResult] = useState(null);

  const AMBER = "#b45309";
  const inp = {width:"100%",padding:"10px 12px",border:"1.5px solid #d1d5db",
    borderRadius:8,fontSize:14,outline:"none",boxSizing:"border-box",fontFamily:"inherit",background:"#fff"};

  function validate() {
    const e = [];
    if (!form.nomAr.trim())     e.push("اللقب (عربي) مطلوب");
    if (!form.prenomAr.trim())  e.push("الاسم (عربي) مطلوب");
    if (!form.nin.trim())       e.push("رقم التعريف الوطني مطلوب");
    if (!form.telephone.trim()) e.push("رقم الهاتف مطلوب");
    if (!form.adresse.trim())   e.push("العنوان مطلوب");
    if (!form.numPermis.trim()) e.push("رقم رخصة السياقة مطلوب");
    return e;
  }

  async function handleSubmit() {
    const e = validate();
    if (e.length) { setErrors(e); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/register-seat-booklet`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify(form)
      });
      const d = await res.json();
      if (d.success) { setRegResult(d); setStep(2); }
      else setErrors([d.error || "خطأ في الحفظ"]);
    } catch(err) { setErrors(["خطأ في الاتصال بالخادم"]); }
    setSaving(false);
  }

  function openCertificate() {
    if (regResult && regResult.id) {
      window.open(`${API_BASE}/print-seat-certificate/${regResult.id}`, "_blank");
    }
  }

  if (step === 2 && regResult) return (
    <div style={{textAlign:"center",padding:"20px 0"}}>
      <div style={{fontSize:60,marginBottom:16}}>✅</div>
      <h3 style={{color:AMBER,fontWeight:800,fontSize:20,marginBottom:8}}>تم التسجيل بنجاح!</h3>
      <p style={{color:"#6b7280",fontSize:14,marginBottom:4}}>
        رقم التسجيل: <b style={{color:AMBER}}>{regResult.registration_number}</b>
      </p>
      <p style={{color:"#9ca3af",fontSize:13,marginBottom:24}}>
        {form.nomAr} {form.prenomAr}
      </p>
      <button onClick={openCertificate} style={{padding:"14px 28px",borderRadius:10,border:"none",
        background:AMBER,color:"#fff",cursor:"pointer",fontWeight:700,fontSize:15,marginBottom:12,
        display:"flex",alignItems:"center",gap:8,margin:"0 auto 12px"}}>
        🖨️ طباعة شهادة التسجيل (مع QR)
      </button>
      <br/>
      <button onClick={onBack} style={{padding:"10px 24px",borderRadius:10,border:"1.5px solid #d1d5db",
        background:"#fff",color:"#374151",cursor:"pointer",fontWeight:600,fontSize:14}}>
        العودة للرئيسية
      </button>
    </div>
  );

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
        <button onClick={onBack} style={{padding:"6px 12px",borderRadius:8,border:"1.5px solid #d1d5db",background:"#fff",cursor:"pointer",fontSize:13}}>← رجوع</button>
        <h3 style={{color:AMBER,fontWeight:800,fontSize:17,margin:0}}>📘 التسجيل لنيل دفتر المقاعد</h3>
      </div>

      {step===0&&<>
        <h4 style={{color:"#374151",fontWeight:700,fontSize:14,marginBottom:12}}>🪪 رفع رخصة السياقة</h4>
        <UploadStep onDone={(data,prev)=>{
          if (data) setForm(f=>({...f,...Object.fromEntries(Object.entries(data).filter(([,v])=>v!==""))}));
          setPreview(prev);
          setStep(1);
        }}/>
        <button onClick={()=>setStep(1)} style={{width:"100%",marginTop:10,padding:10,borderRadius:8,
          border:"1.5px solid #d1d5db",background:"#fff",cursor:"pointer",color:"#6b7280",fontSize:12}}>
          تخطي — إدخال يدوي ←
        </button>
      </>}

      {step===1&&<>
        {preview&&<img src={preview} style={{width:"100%",maxHeight:130,objectFit:"cover",
          borderRadius:10,marginBottom:14}} alt="رخصة"/>}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
          {[
            ["اللقب (عربي) *","nomAr"],["الاسم (عربي) *","prenomAr"],
            ["Nom","nom"],["Prénom","prenom"],
            ["تاريخ الميلاد","dateNaissance","date"],["مكان الميلاد","lieuNaissance"],
            ["رقم التعريف الوطني (NIN) *","nin"],
            ["رقم رخصة السياقة *","numPermis"],
            ["تاريخ انتهاء الرخصة","dateExpiration","date"],
            ["رقم الهاتف *","telephone","tel"],
            ["هاتف إضافي","telephone2","tel"],
          ].map(([label,key,type="text"])=>(
            <div key={key} style={{display:"flex",flexDirection:"column",gap:4}}>
              <label style={{fontSize:11,fontWeight:600,color:"#374151"}}>{label}</label>
              <input type={type} value={form[key]||""} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} style={inp}/>
            </div>
          ))}
          <div style={{display:"flex",flexDirection:"column",gap:4,gridColumn:"span 2"}}>
            <label style={{fontSize:11,fontWeight:600,color:"#374151"}}>العنوان *</label>
            <input value={form.adresse||""} onChange={e=>setForm(f=>({...f,adresse:e.target.value}))} style={inp}/>
          </div>
        </div>

        {errors.length>0&&(
          <div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:10,padding:"10px 14px",marginBottom:14}}>
            {errors.map(e=><div key={e} style={{color:"#dc2626",fontSize:13,marginBottom:3}}>⚠️ {e}</div>)}
          </div>
        )}

        <div style={{display:"flex",gap:10}}>
          <button onClick={()=>setStep(0)} style={{flex:1,padding:13,borderRadius:10,border:"1.5px solid #d1d5db",background:"#fff",cursor:"pointer",fontWeight:600,color:"#374151"}}>← رجوع</button>
          <button onClick={handleSubmit} disabled={saving} style={{flex:2,padding:13,borderRadius:10,border:"none",
            background:saving?"#fcd34d":AMBER,color:"#fff",cursor:saving?"default":"pointer",fontWeight:700,fontSize:15}}>
            {saving?"جارٍ الحفظ...":"✅ تأكيد التسجيل وطباعة الشهادة"}
          </button>
        </div>
      </>}
    </div>
  );
}