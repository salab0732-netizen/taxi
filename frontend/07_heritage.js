// ==================== HERITAGE LICENSE FORM ====================
const INITIAL_HERITAGE_FORM = {
  nomAr:"", prenomAr:"", nom:"", prenom:"",
  dateNaissance:"", lieuNaissance:"", wilayaNaissance:"",
  adresse:"", commune:"", wilaya:"", nin:"",
  numDecision:"", dateDecision:"", communeRattachement:"", numPorte:"",
};

function HeritageLicenseForm({ onBack }) {
  const [step, setStep]     = useState(0); // 0=OCR بطاقة التعريف, 1=بيانات كاملة, 2=تأكيد
  const [form, setForm]     = useState(INITIAL_HERITAGE_FORM);
  const [preview, setPreview] = useState(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrErr, setOcrErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState([]);
  const [saved, setSaved]   = useState(false);
  const fileRef = useRef();

  const PURPLE = "#7c3aed";
  const inp = {width:"100%",padding:"10px 12px",border:"1.5px solid #d1d5db",
    borderRadius:8,fontSize:14,outline:"none",boxSizing:"border-box",fontFamily:"inherit",background:"#fff"};

  async function handleIdCard(file) {
    if (!file) return;
    setOcrErr(""); setOcrLoading(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const b64  = e.target.result.split(",")[1];
      const mime = file.type || "image/jpeg";
      setPreview(e.target.result);
      try {
        const res = await fetch(`${API_BASE}/ocr-id-card`, {
          method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({image_base64: b64, mime_type: mime})
        });
        const d = await res.json();
        if (d.success) {
          setForm(f=>({...f,...Object.fromEntries(Object.entries(d.data).filter(([,v])=>v!==""))}));
          setStep(1);
        } else {
          setOcrErr(d.error || "فشل OCR — راجع البيانات يدوياً");
          setStep(1);
        }
      } catch(err) { setOcrErr("خطأ في الاتصال"); setStep(1); }
      setOcrLoading(false);
    };
    reader.readAsDataURL(file);
  }

  function validate() {
    const e = [];
    if (!form.nomAr.trim())                e.push("اللقب (عربي) مطلوب");
    if (!form.prenomAr.trim())             e.push("الاسم (عربي) مطلوب");
    if (!form.nin.trim())                  e.push("رقم التعريف الوطني مطلوب");
    if (!form.numDecision.trim())          e.push("رقم القرار مطلوب");
    if (!form.dateDecision.trim())         e.push("تاريخ القرار مطلوب");
    if (!form.communeRattachement.trim())  e.push("بلدية الالحاق مطلوبة");
    if (!form.numPorte.trim())             e.push("رقم الباب مطلوب");
    return e;
  }

  async function handleSubmit() {
    const e = validate();
    if (e.length) { setErrors(e); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/register-heritage-license`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify(form)
      });
      const d = await res.json();
      if (d.success) setSaved(true);
      else setErrors([d.error || "خطأ في الحفظ"]);
    } catch(err) { setErrors(["خطأ في الاتصال"]); }
    setSaving(false);
  }

  if (saved) return (
    <div style={{textAlign:"center",padding:"30px 0"}}>
      <div style={{fontSize:60,marginBottom:16}}>✅</div>
      <h3 style={{color:PURPLE,fontWeight:800,fontSize:20,marginBottom:8}}>تم التسجيل بنجاح!</h3>
      <p style={{color:"#6b7280",fontSize:14,marginBottom:4}}>{form.nomAr} {form.prenomAr}</p>
      <p style={{color:"#9ca3af",fontSize:13,marginBottom:24}}>رقم القرار: <b>{form.numDecision}</b></p>
      <button onClick={onBack} style={{padding:"12px 32px",borderRadius:10,border:"none",
        background:PURPLE,color:"#fff",cursor:"pointer",fontWeight:700}}>
        العودة للرئيسية
      </button>
    </div>
  );

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
        <button onClick={onBack} style={{padding:"6px 12px",borderRadius:8,
          border:"1.5px solid #d1d5db",background:"#fff",cursor:"pointer",fontSize:13}}>← رجوع</button>
        <h3 style={{color:PURPLE,fontWeight:800,fontSize:17,margin:0}}>
          📜 تسجيل رخصة استغلال سيارة أجرة — ذوو الحقوق
        </h3>
      </div>

      {/* خطوة 0: رفع بطاقة التعريف الوطنية */}
      {step===0&&(
        <div>
          <p style={{color:"#6b7280",fontSize:13,marginBottom:14,textAlign:"center"}}>
            ارفع صورة بطاقة التعريف الوطنية لاستخراج البيانات تلقائياً
          </p>
          <div onClick={()=>!ocrLoading&&fileRef.current.click()}
            onDragOver={e=>e.preventDefault()}
            onDrop={e=>{e.preventDefault();handleIdCard(e.dataTransfer.files[0]);}}
            style={{border:`2px dashed ${PURPLE}`,borderRadius:14,padding:"30px 16px",
              textAlign:"center",cursor:ocrLoading?"default":"pointer",
              background:"#faf5ff",marginBottom:12}}>
            {ocrLoading ? (
              <div style={{color:PURPLE,fontSize:13}}>
                <div style={{width:30,height:30,border:`3px solid ${PURPLE}`,borderTopColor:"transparent",
                  borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 10px"}}/>
                جاري استخراج البيانات...
              </div>
            ) : preview ? (
              <img src={preview} style={{maxHeight:150,maxWidth:"100%",borderRadius:8}} alt="بطاقة تعريف"/>
            ) : (
              <div style={{color:"#9ca3af",fontSize:14}}>
                <div style={{fontSize:40,marginBottom:8}}>🪪</div>
                اضغط أو اسحب صورة بطاقة التعريف الوطنية
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}}
            onChange={e=>handleIdCard(e.target.files[0])}/>
          {ocrErr&&<div style={{color:"#dc2626",fontSize:12,marginBottom:8}}>⚠️ {ocrErr}</div>}
          <button onClick={()=>setStep(1)} style={{width:"100%",marginTop:8,padding:10,
            borderRadius:8,border:`1.5px solid ${PURPLE}`,background:"#fff",
            cursor:"pointer",color:PURPLE,fontWeight:600,fontSize:13}}>
            تخطي — إدخال يدوي ←
          </button>
        </div>
      )}

      {/* خطوة 1: البيانات الكاملة */}
      {step===1&&(
        <div>
          {preview&&<img src={preview} style={{width:"100%",maxHeight:120,objectFit:"cover",
            borderRadius:10,marginBottom:14}} alt="بطاقة تعريف"/>}

          {/* بيانات بطاقة التعريف */}
          <div style={{background:"#faf5ff",borderRadius:10,padding:"14px",marginBottom:16,
            border:`1px solid ${PURPLE}33`}}>
            <h4 style={{color:PURPLE,fontWeight:700,fontSize:13,margin:"0 0 12px"}}>
              🪪 بيانات بطاقة التعريف الوطنية
            </h4>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              {[
                ["اللقب (عربي) *","nomAr"],["الاسم (عربي) *","prenomAr"],
                ["Nom","nom"],["Prénom","prenom"],
                ["تاريخ الميلاد","dateNaissance","date"],["مكان الميلاد","lieuNaissance"],
                ["ولاية الميلاد","wilayaNaissance"],
                ["رقم التعريف الوطني (NIN) *","nin"],
              ].map(([label,key,type="text"])=>(
                <div key={key} style={{display:"flex",flexDirection:"column",gap:4}}>
                  <label style={{fontSize:11,fontWeight:600,color:"#374151"}}>{label}</label>
                  <input type={type} value={form[key]||""} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} style={inp}/>
                </div>
              ))}
              <div style={{display:"flex",flexDirection:"column",gap:4,gridColumn:"span 2"}}>
                <label style={{fontSize:11,fontWeight:600,color:"#374151"}}>العنوان</label>
                <input value={form.adresse||""} onChange={e=>setForm(f=>({...f,adresse:e.target.value}))} style={inp}/>
              </div>
              {[["البلدية","commune"],["الولاية","wilaya"]].map(([label,key])=>(
                <div key={key} style={{display:"flex",flexDirection:"column",gap:4}}>
                  <label style={{fontSize:11,fontWeight:600,color:"#374151"}}>{label}</label>
                  <input value={form[key]||""} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} style={inp}/>
                </div>
              ))}
            </div>
          </div>

          {/* بيانات رخصة الاستغلال */}
          <div style={{background:"#ede9fe",borderRadius:10,padding:"14px",marginBottom:16,
            border:`1px solid ${PURPLE}55`}}>
            <h4 style={{color:PURPLE,fontWeight:700,fontSize:13,margin:"0 0 12px"}}>
              📜 بيانات رخصة الاستغلال
            </h4>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              {[
                ["رقم القرار *","numDecision"],
                ["تاريخ القرار *","dateDecision","date"],
                ["بلدية الالحاق *","communeRattachement"],
                ["رقم الباب *","numPorte"],
              ].map(([label,key,type="text"])=>(
                <div key={key} style={{display:"flex",flexDirection:"column",gap:4}}>
                  <label style={{fontSize:11,fontWeight:600,color:"#374151"}}>{label}</label>
                  <input type={type} value={form[key]||""} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} style={inp}/>
                </div>
              ))}
            </div>
          </div>

          {errors.length>0&&(
            <div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:10,
              padding:"10px 14px",marginBottom:14}}>
              {errors.map(e=><div key={e} style={{color:"#dc2626",fontSize:13,marginBottom:3}}>⚠️ {e}</div>)}
            </div>
          )}

          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>setStep(0)} style={{flex:1,padding:13,borderRadius:10,
              border:"1.5px solid #d1d5db",background:"#fff",cursor:"pointer",
              fontWeight:600,color:"#374151"}}>← رجوع</button>
            <button onClick={handleSubmit} disabled={saving} style={{flex:2,padding:13,
              borderRadius:10,border:"none",background:saving?"#c4b5fd":PURPLE,
              color:"#fff",cursor:saving?"default":"pointer",fontWeight:700,fontSize:15}}>
              {saving?"جارٍ الحفظ...":"✅ تأكيد التسجيل"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}