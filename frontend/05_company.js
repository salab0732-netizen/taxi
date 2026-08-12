// ==================== COMPANY FORM CONSTANTS ====================
const INITIAL_COMPANY_FORM = {
  nomSociete: "", registreCommerce: "", numeroAgreement: "",
  nomResponsable: "", prenomResponsable: "", telephone: "", telephone2: "",
  email: "", adresse: "", wilaya: "",
  nbVehicules: "", typeVehicules: "", notes: "",
};

const INITIAL_VEHICLE_FORM = {
  numImmatriculation:"", marque:"", typeVehicule:"", modele:"",
  numSerie:"", genre:"", energie:"", puissance:"",
  nbPlaces:"", anneeCirculation:"", numPrecedent:"",
  proprietaireNom:"", proprietairePrenom:"",
  proprietaireDateNaissance:"", proprietaireLieu:"", proprietaireAdresse:"",
};

// ==================== LANDING PAGE ====================
function LandingPage({ onSelect }) {
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"60vh",gap:24,padding:"40px 20px"}}>
      <div style={{textAlign:"center",marginBottom:8}}>
        <div style={{fontSize:48,marginBottom:12}}>🚕</div>
        <h2 style={{color:"#1a6b3c",fontWeight:800,fontSize:22,marginBottom:6}}>مرحباً بكم</h2>
        <p style={{color:"#6b7280",fontSize:14}}>اختر نوع التسجيل المناسب</p>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:16,width:"100%",maxWidth:400}}>
        <button onClick={()=>onSelect("driver")} style={{
          padding:"22px 20px",borderRadius:16,border:"2px solid #1a6b3c",
          background:"#1a6b3c",color:"#fff",cursor:"pointer",
          display:"flex",alignItems:"center",gap:16,textAlign:"right"
        }}>
          <span style={{fontSize:36}}>🪪</span>
          <div>
            <div style={{fontWeight:700,fontSize:16,marginBottom:4}}>سائق سيارة الأجرة</div>
            <div style={{fontSize:12,opacity:.85}}>تسجيل وتحديث وثائق السائق (رخصة السياقة، بطاقة التعريف...)</div>
          </div>
        </button>
        <button onClick={()=>onSelect("company")} style={{
          padding:"22px 20px",borderRadius:16,border:"2px solid #2563eb",
          background:"#2563eb",color:"#fff",cursor:"pointer",
          display:"flex",alignItems:"center",gap:16,textAlign:"right"
        }}>
          <span style={{fontSize:36}}>🏢</span>
          <div>
            <div style={{fontWeight:700,fontSize:16,marginBottom:4}}>شركة سيارات الأجرة</div>
            <div style={{fontSize:12,opacity:.85}}>تسجيل شركة النقل وتحديث وثائقها (سجل تجاري، اعتماد...)</div>
          </div>
        </button>
        <button onClick={()=>onSelect("booklet")} style={{
          padding:"22px 20px",borderRadius:16,border:"2px solid #b45309",
          background:"#b45309",color:"#fff",cursor:"pointer",
          display:"flex",alignItems:"center",gap:16,textAlign:"right"
        }}>
          <span style={{fontSize:36}}>📘</span>
          <div>
            <div style={{fontWeight:700,fontSize:16,marginBottom:4}}>التسجيل للترشح لنيل دفتر المقاعد</div>
            <div style={{fontSize:12,opacity:.85}}>لسائقي سيارات الأجرة — إجراء التكوين وطباعة شهادة التسجيل فوراً</div>
          </div>
        </button>
        <button onClick={()=>onSelect("heritage")} style={{
          padding:"22px 20px",borderRadius:16,border:"2px solid #7c3aed",
          background:"#7c3aed",color:"#fff",cursor:"pointer",
          display:"flex",alignItems:"center",gap:16,textAlign:"right"
        }}>
          <span style={{fontSize:36}}>📜</span>
          <div>
            <div style={{fontWeight:700,fontSize:16,marginBottom:4}}>تسجيل رخصة استغلال سيارة أجرة</div>
            <div style={{fontSize:12,opacity:.85}}>الممنوحة لذوي الحقوق — رقم القرار، بلدية الالحاق، رقم الباب</div>
          </div>
        </button>
      </div>
    </div>
  );
}

// ==================== COMPANY FORM ====================
function CompanyForm({ onBack }) {
  const [step, setStep]       = useState(0);
  const [form, setForm]       = useState(INITIAL_COMPANY_FORM);
  const [drivers, setDrivers] = useState([]);
  const [saving, setSaving]   = useState(false);
  const [errors, setErrors]   = useState([]);
  const [driverForm, setDriverForm]       = useState(INITIAL_FORM);
  const [driverStep, setDriverStep]       = useState(0);
  const [driverPreview, setDriverPreview] = useState(null);
  const [showDriverForm, setShowDriverForm] = useState(false);

  // مركبات مستقلة (بدون سائق مرتبط بالضرورة)
  const [vehicles, setVehicles]           = useState([]);
  const [vehicleForm, setVehicleForm]     = useState(INITIAL_VEHICLE_FORM);
  const [showVehicleForm, setShowVehicleForm] = useState(false);

  const inp = {width:"100%",padding:"10px 12px",border:"1.5px solid #d1d5db",
    borderRadius:8,fontSize:14,outline:"none",boxSizing:"border-box",fontFamily:"inherit",background:"#fff"};
  const BLUE = "#2563eb";

  function validateCompany() {
    const e = [];
    if (!form.nomSociete.trim())       e.push("اسم الشركة مطلوب");
    if (!form.registreCommerce.trim()) e.push("رقم السجل التجاري مطلوب");
    if (!form.telephone.trim())        e.push("رقم الهاتف مطلوب");
    if (!form.wilaya)                  e.push("الولاية مطلوبة");
    if (!form.nomResponsable.trim())   e.push("اسم المسؤول مطلوب");
    return e;
  }

  function addDriver() {
    if (!driverForm.nomAr.trim() && !driverForm.nom.trim()) return;
    setDrivers(d => [...d, { ...driverForm, preview: driverPreview }]);
    setDriverForm(INITIAL_FORM); setDriverPreview(null);
    setDriverStep(0); setShowDriverForm(false);
  }

  function removeDriver(idx) { setDrivers(d => d.filter((_,i) => i !== idx)); }

  function addVehicle() {
    if (!vehicleForm.numImmatriculation.trim()) return;
    setVehicles(v => [...v, { ...vehicleForm }]);
    setVehicleForm(INITIAL_VEHICLE_FORM);
    setShowVehicleForm(false);
  }
  function removeVehicle(idx) { setVehicles(v => v.filter((_,i) => i !== idx)); }

  async function handleSubmit() {
    const e = validateCompany();
    if (e.length) { setErrors(e); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/register-company`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ ...form, drivers, vehicles })
      });
      const d = await res.json();
      if (d.success) setStep(2);
      else setErrors([d.error || "خطأ في الحفظ"]);
    } catch(e) { setErrors(["خطأ في الاتصال"]); }
    setSaving(false);
  }

  if (step === 2) return (
    <div style={{textAlign:"center",padding:"30px 0"}}>
      <div style={{fontSize:60,marginBottom:16}}>✅</div>
      <h3 style={{color:BLUE,fontWeight:800,fontSize:20,marginBottom:8}}>تم تسجيل الشركة بنجاح!</h3>
      <p style={{color:"#6b7280",fontSize:14,marginBottom:6}}>
        <b>{form.nomSociete}</b> — {drivers.length} سائق و{vehicles.length} مركبة مسجّلة
      </p>
      <button onClick={onBack} style={{padding:"12px 32px",borderRadius:10,border:"none",background:BLUE,color:"#fff",cursor:"pointer",fontWeight:700}}>
        العودة للرئيسية
      </button>
    </div>
  );

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
        <button onClick={onBack} style={{padding:"6px 12px",borderRadius:8,border:"1.5px solid #d1d5db",background:"#fff",cursor:"pointer",fontSize:13}}>← رجوع</button>
        <h3 style={{color:BLUE,fontWeight:800,fontSize:18,margin:0}}>🏢 تسجيل شركة سيارات الأجرة</h3>
      </div>

      {/* معلومات الشركة */}
      <div style={{background:"#eff6ff",borderRadius:12,padding:16,marginBottom:20}}>
        <h4 style={{color:BLUE,fontWeight:700,fontSize:14,margin:"0 0 12px"}}>📋 معلومات الشركة</h4>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          {[
            ["اسم الشركة *","nomSociete","text"],
            ["رقم السجل التجاري *","registreCommerce","text"],
            ["رقم الاعتماد","numeroAgreement","text"],
            ["اسم المسؤول *","nomResponsable","text"],
            ["لقب المسؤول","prenomResponsable","text"],
            ["الهاتف *","telephone","tel"],
            ["هاتف 2","telephone2","tel"],
            ["البريد الإلكتروني","email","email"],
          ].map(([label,key,type])=>(
            <div key={key} style={{display:"flex",flexDirection:"column",gap:4}}>
              <label style={{fontSize:11,fontWeight:600,color:"#374151"}}>{label}</label>
              <input type={type} value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} style={inp}/>
            </div>
          ))}
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            <label style={{fontSize:11,fontWeight:600,color:"#374151"}}>الولاية *</label>
            <select value={form.wilaya} onChange={e=>setForm(f=>({...f,wilaya:e.target.value}))} style={inp}>
              <option value="">اختر الولاية</option>
              {WILAYAS.map(w=><option key={w} value={w}>{w}</option>)}
            </select>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            <label style={{fontSize:11,fontWeight:600,color:"#374151"}}>عدد المركبات</label>
            <input type="number" value={form.nbVehicules} onChange={e=>setForm(f=>({...f,nbVehicules:e.target.value}))} style={inp}/>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:4,gridColumn:"span 2"}}>
            <label style={{fontSize:11,fontWeight:600,color:"#374151"}}>العنوان</label>
            <input value={form.adresse} onChange={e=>setForm(f=>({...f,adresse:e.target.value}))} style={inp}/>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:4,gridColumn:"span 2"}}>
            <label style={{fontSize:11,fontWeight:600,color:"#374151"}}>ملاحظات</label>
            <textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={2} style={{...inp,resize:"vertical"}}/>
          </div>
        </div>
      </div>

      {/* قائمة السائقين */}
      <div style={{background:"#f0fdf4",borderRadius:12,padding:16,marginBottom:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <h4 style={{color:"#1a6b3c",fontWeight:700,fontSize:14,margin:0}}>👤 السائقون ({drivers.length})</h4>
          <button onClick={()=>{setShowDriverForm(true);setDriverStep(0);setDriverForm(INITIAL_FORM);}}
            style={{padding:"6px 14px",borderRadius:8,border:"none",background:"#1a6b3c",color:"#fff",cursor:"pointer",fontWeight:600,fontSize:13}}>
            + إضافة سائق
          </button>
        </div>

        {drivers.length===0 ? (
          <p style={{color:"#9ca3af",fontSize:13,textAlign:"center",margin:"8px 0"}}>لم يُضف أي سائق بعد</p>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {drivers.map((d,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                background:"#fff",borderRadius:8,padding:"10px 12px",border:"1px solid #d1fae5"}}>
                <div>
                  <div style={{fontWeight:600,fontSize:14,color:"#1a6b3c"}}>
                    {d.nomAr||d.nom||"سائق "+(i+1)}{(d.prenomAr||d.prenom)?" "+(d.prenomAr||d.prenom):""}
                  </div>
                  <div style={{fontSize:12,color:"#6b7280"}}>
                    {d.numPermis&&`رخصة: ${d.numPermis}`}
                    {d.numImmatriculation&&` • 🚗 ${d.numImmatriculation}`}
                  </div>
                </div>
                <button onClick={()=>removeDriver(i)}
                  style={{padding:"4px 10px",borderRadius:6,border:"1px solid #fca5a5",background:"#fef2f2",color:"#dc2626",cursor:"pointer",fontSize:12}}>
                  حذف
                </button>
              </div>
            ))}
          </div>
        )}

        {/* نموذج إضافة سائق */}
        {showDriverForm&&(
          <div style={{marginTop:16,background:"#fff",borderRadius:12,padding:16,border:"2px solid #86efac"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <h5 style={{margin:0,color:"#1a6b3c",fontWeight:700,fontSize:14}}>
                {driverStep===0?"🪪 رفع رخصة السياقة":driverStep===1?"🚗 رفع البطاقة الرمادية":"✏️ مراجعة البيانات"}
              </h5>
              <button onClick={()=>setShowDriverForm(false)}
                style={{padding:"3px 10px",borderRadius:6,border:"1px solid #d1d5db",background:"#fff",cursor:"pointer",fontSize:12,color:"#6b7280"}}>
                ✕
              </button>
            </div>

            {driverStep===0&&<>
              <UploadStep onDone={(data,prev)=>{
                if(data) setDriverForm(f=>({...f,...Object.fromEntries(Object.entries(data).filter(([,v])=>v!==""))}));
                setDriverPreview(prev); setDriverStep(1);
              }}/>
              <button onClick={()=>setDriverStep(1)} style={{width:"100%",marginTop:8,padding:9,borderRadius:8,
                border:"1.5px solid #d1d5db",background:"#fff",cursor:"pointer",color:"#6b7280",fontSize:12}}>
                تخطي ←
              </button>
            </>}

            {driverStep===1&&<>
              <UploadCarteGrise color="#1a6b3c" onDone={(data)=>{
                if(data) setDriverForm(f=>({...f,...Object.fromEntries(Object.entries(data).filter(([,v])=>v!==""))}));
                setDriverStep(2);
              }}/>
              <button onClick={()=>setDriverStep(2)} style={{width:"100%",marginTop:8,padding:9,borderRadius:8,
                border:"1.5px solid #d1d5db",background:"#fff",cursor:"pointer",color:"#6b7280",fontSize:12}}>
                تخطي ←
              </button>
            </>}

            {driverStep===2&&<>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                {[
                  ["اللقب (عربي)","nomAr"],["الاسم (عربي)","prenomAr"],
                  ["Nom","nom"],["Prénom","prenom"],
                  ["رقم التعريف الوطني","nin"],["رقم الرخصة","numPermis"],
                  ["تاريخ انتهاء الرخصة","dateExpiration"],["الهاتف","telephone"],
                  ["رقم التسجيل","numImmatriculation"],["الماركة","marque"],
                  ["نوع المركبة","typeVehicule"],["سنة أول استعمال","anneeCirculation"],
                ].map(([label,key])=>(
                  <div key={key} style={{display:"flex",flexDirection:"column",gap:3}}>
                    <label style={{fontSize:10,fontWeight:600,color:"#6b7280"}}>{label}</label>
                    <input value={driverForm[key]||""} onChange={e=>setDriverForm(f=>({...f,[key]:e.target.value}))}
                      style={{...inp,fontSize:12,padding:"7px 10px"}}/>
                  </div>
                ))}
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>setDriverStep(1)}
                  style={{flex:1,padding:10,borderRadius:8,border:"1.5px solid #d1d5db",background:"#fff",cursor:"pointer",fontSize:13}}>
                  ← رجوع
                </button>
                <button onClick={addDriver}
                  style={{flex:2,padding:10,borderRadius:8,border:"none",background:"#1a6b3c",color:"#fff",cursor:"pointer",fontWeight:700,fontSize:13}}>
                  ✅ إضافة السائق
                </button>
              </div>
            </>}
          </div>
        )}
      </div>

      {/* قائمة المركبات المستقلة */}
      <div style={{background:"#eff6ff",borderRadius:12,padding:16,marginBottom:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <h4 style={{color:BLUE,fontWeight:700,fontSize:14,margin:0}}>🚕 مركبات الشركة ({vehicles.length})</h4>
          <button onClick={()=>{setShowVehicleForm(true);setVehicleForm(INITIAL_VEHICLE_FORM);}}
            style={{padding:"6px 14px",borderRadius:8,border:"none",background:BLUE,color:"#fff",cursor:"pointer",fontWeight:600,fontSize:13}}>
            + إضافة مركبة
          </button>
        </div>

        {vehicles.length===0 ? (
          <p style={{color:"#9ca3af",fontSize:13,textAlign:"center",margin:"8px 0"}}>لم تُضف أي مركبة بعد</p>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {vehicles.map((v,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                background:"#fff",borderRadius:8,padding:"10px 12px",border:"1px solid #bfdbfe"}}>
                <div>
                  <div style={{fontWeight:600,fontSize:14,color:BLUE}}>
                    🚗 {v.numImmatriculation}
                  </div>
                  <div style={{fontSize:12,color:"#6b7280"}}>
                    {v.marque&&`${v.marque}`}{v.modele&&` ${v.modele}`}
                    {v.anneeCirculation&&` • ${v.anneeCirculation}`}
                    {(v.proprietaireNom||v.proprietairePrenom)&&
                      ` • 👤 ${v.proprietaireNom||""} ${v.proprietairePrenom||""}`}
                  </div>
                </div>
                <button onClick={()=>removeVehicle(i)}
                  style={{padding:"4px 10px",borderRadius:6,border:"1px solid #fca5a5",background:"#fef2f2",color:"#dc2626",cursor:"pointer",fontSize:12}}>
                  حذف
                </button>
              </div>
            ))}
          </div>
        )}

        {/* نموذج إضافة مركبة */}
        {showVehicleForm&&(
          <div style={{marginTop:16,background:"#fff",borderRadius:12,padding:16,border:"2px solid #93c5fd"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <h5 style={{margin:0,color:BLUE,fontWeight:700,fontSize:14}}>🚗 إضافة مركبة جديدة</h5>
              <button onClick={()=>setShowVehicleForm(false)}
                style={{padding:"3px 10px",borderRadius:6,border:"1px solid #d1d5db",background:"#fff",cursor:"pointer",fontSize:12,color:"#6b7280"}}>
                ✕
              </button>
            </div>

            <UploadCarteGrise color={BLUE} onDone={(data)=>{
              if(data) setVehicleForm(f=>({...f,...Object.fromEntries(Object.entries(data).filter(([,v])=>v!==""))}));
            }}/>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,margin:"12px 0"}}>
              {[
                ["رقم التسجيل *","numImmatriculation"],["الرقم السابق","numPrecedent"],
                ["الماركة","marque"],["الطراز","modele"],
                ["نوع المركبة","typeVehicule"],["رقم الهيكل","numSerie"],
                ["سنة أول استعمال","anneeCirculation"],["عدد المقاعد","nbPlaces"],
                ["اسم المالك","proprietaireNom"],["لقب المالك","proprietairePrenom"],
              ].map(([label,key])=>(
                <div key={key} style={{display:"flex",flexDirection:"column",gap:3}}>
                  <label style={{fontSize:10,fontWeight:600,color:"#6b7280"}}>{label}</label>
                  <input value={vehicleForm[key]||""} onChange={e=>setVehicleForm(f=>({...f,[key]:e.target.value}))}
                    style={{...inp,fontSize:12,padding:"7px 10px"}}/>
                </div>
              ))}
            </div>
            <button onClick={addVehicle}
              style={{width:"100%",padding:10,borderRadius:8,border:"none",background:BLUE,color:"#fff",cursor:"pointer",fontWeight:700,fontSize:13}}>
              ✅ إضافة المركبة
            </button>
          </div>
        )}
      </div>

      {errors.length>0&&(
        <div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:10,padding:"10px 14px",marginBottom:12}}>
          {errors.map(e=><div key={e} style={{color:"#dc2626",fontSize:13,marginBottom:3}}>⚠️ {e}</div>)}
        </div>
      )}
      <button onClick={handleSubmit} disabled={saving}
        style={{width:"100%",padding:14,borderRadius:10,border:"none",
          background:saving?"#93c5fd":BLUE,color:"#fff",cursor:saving?"default":"pointer",fontWeight:700,fontSize:15}}>
        {saving?"جارٍ الحفظ...":"✅ تأكيد تسجيل الشركة"}
      </button>
    </div>
  );
}