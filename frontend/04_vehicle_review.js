// ==================== VEHICLE REVIEW ====================
// ==================== VEHICLE REVIEW ====================
function ReviewVehicle({ form, setForm }) {
  const inp2 = {width:"100%",padding:"10px 12px",border:"1.5px solid #d1d5db",
    borderRadius:8,fontSize:14,outline:"none",boxSizing:"border-box",fontFamily:"inherit",background:"#fff"};
  const fields = [
    ["رقم التسجيل","numImmatriculation"],["الماركة","marque"],
    ["النوع","typeVehicule"],["الطراز","modele"],
    ["رقم الهيكل","numSerie"],["النوع (Genre)","genre"],
    ["الطاقة","energie"],["القوة","puissance"],
    ["عدد المقاعد","nbPlaces"],["سنة أول استعمال","anneeCirculation"],
    ["الرقم السابق","numPrecedent"],
    ["اسم المالك","proprietaireNom"],["لقب المالك","proprietairePrenom"],
    ["تاريخ ميلاد المالك","proprietaireDateNaissance"],
    ["مكان الميلاد","proprietaireLieu"],["عنوان المالك","proprietaireAdresse"],
  ];
  return (
    <div>
      <h4 style={{color:"#374151",fontWeight:700,fontSize:15,marginBottom:14,borderBottom:"1px solid #e5e7eb",paddingBottom:8}}>
        🚗 بيانات المركبة
      </h4>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        {fields.map(([label,key])=>(
          <div key={key} style={{display:"flex",flexDirection:"column",gap:4}}>
            <label style={{fontSize:11,fontWeight:600,color:"#6b7280"}}>{label}</label>
            <input value={form[key]||""} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} style={inp2}/>
          </div>
        ))}
      </div>
    </div>
  );
}

function StepBar({ step }) {
  const steps = ["رفع الوثائق","مراجعة البيانات","تأكيد التسجيل"];
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:0,marginBottom:28}}>
      {steps.map((s,i)=>(
        <div key={i} style={{display:"flex",alignItems:"center"}}>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5}}>
            <div style={{
              width:34,height:34,borderRadius:"50%",
              background:i<step?"#1a6b3c":i===step?"#2d9e5f":"#e5e7eb",
              color:i<=step?"#fff":"#9ca3af",
              display:"flex",alignItems:"center",justifyContent:"center",
              fontWeight:700,fontSize:14,transition:"all .3s"
            }}>{i<step?"✓":i+1}</div>
            <span style={{fontSize:11,color:i===step?"#1a6b3c":"#9ca3af",fontWeight:i===step?700:400,whiteSpace:"nowrap"}}>{s}</span>
          </div>
          {i<2&&<div style={{width:56,height:2,background:i<step?"#1a6b3c":"#e5e7eb",margin:"0 4px",marginBottom:20,transition:"all .3s"}}/>}
        </div>
      ))}
    </div>
  );
}

function Field({ label, required, hint, children }) {
  return (
    <div style={{marginBottom:14}}>
      <label style={{display:"block",fontSize:13,fontWeight:600,color:"#374151",marginBottom:5}}>
        {label}{required&&<span style={{color:"#dc2626"}}> *</span>}
      </label>
      {children}
      {hint&&<p style={{fontSize:11,color:"#9ca3af",margin:"3px 0 0"}}>{hint}</p>}
    </div>
  );
}

// ---- Step 1 ----
function UploadStep({ onDone }) {
  const [drag,setDrag]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [preview,setPreview]=useState(null);
  const ref=useRef();

  const process=useCallback(async(file)=>{
    if(!file?.type.startsWith("image/")){setError("يرجى رفع صورة صالحة (JPG، PNG)");return;}
    setError("");setLoading(true);
    const reader=new FileReader();
    reader.onload=async(e)=>{
      const dataUrl=e.target.result;
      setPreview(dataUrl);
      const b64=dataUrl.split(",")[1];
      try{
        const extracted=await extractLicenseData(b64,file.type);
        onDone(extracted||{},b64,dataUrl);
      }catch{
        setError("تعذّر استخراج البيانات — يمكنك إدخالها يدوياً.");
        onDone({},b64,dataUrl);
      }
      setLoading(false);
    };
    reader.readAsDataURL(file);
  },[onDone]);

  return (
    <div>
      <div
        onClick={()=>!loading&&ref.current?.click()}
        onDragOver={e=>{e.preventDefault();setDrag(true);}}
        onDragLeave={()=>setDrag(false)}
        onDrop={e=>{e.preventDefault();setDrag(false);process(e.dataTransfer.files[0]);}}
        style={{
          border:`2px dashed ${drag?"#2d9e5f":"#d1d5db"}`,borderRadius:16,
          padding:"40px 20px",textAlign:"center",cursor:loading?"default":"pointer",
          background:drag?"#f0fdf4":"#fafafa",transition:"all .2s"
        }}>
        {preview
          ? <img src={preview} alt="" style={{maxHeight:200,maxWidth:"100%",borderRadius:8,objectFit:"contain"}}/>
          : <>
              <div style={{fontSize:52,marginBottom:10}}>🪪</div>
              <p style={{color:"#374151",fontWeight:600,fontSize:15,margin:"0 0 6px"}}>ارفع صورة رخصة السياقة</p>
              <p style={{color:"#9ca3af",fontSize:13,margin:0}}>الرخصة الورقية أو البطاقة البيومترية — JPG، PNG</p>
            </>
        }
        <input ref={ref} type="file" accept="image/*" style={{display:"none"}}
          onChange={e=>process(e.target.files[0])}/>
      </div>

      {loading&&(
        <div style={{textAlign:"center",marginTop:24}}>
          <div style={{display:"inline-block",width:40,height:40,border:"3px solid #e5e7eb",borderTopColor:"#2d9e5f",borderRadius:"50%",animation:"spin .8s linear infinite"}}/>
          <p style={{color:"#2d9e5f",marginTop:10,fontWeight:600}}>جارٍ استخراج البيانات...</p>
        </div>
      )}
      {error&&<div style={{marginTop:14,padding:"10px 14px",background:"#fef2f2",border:"1px solid #fecaca",borderRadius:10,color:"#dc2626",fontSize:13}}>{error}</div>}
      <div style={{marginTop:18,padding:"12px 14px",background:"#eff6ff",borderRadius:10,fontSize:13,color:"#1d4ed8"}}>
        💡 تأكد من وضوح الصورة وإضاءة جيدة — يمكنك تصحيح أي بيانات في الخطوة التالية.
      </div>
    </div>
  );
}

// ---- Step 2 ----
function ReviewStep({ form, setForm, preview }) {
  const upd=(k,v)=>setForm(f=>({...f,[k]:v}));
  const toggleCat=cat=>{
    const cats=form.categories.includes(cat)
      ?form.categories.filter(c=>c!==cat)
      :[...form.categories,cat];
    upd("categories",cats);
  };

  return (
    <div>
      {preview&&(
        <div style={{textAlign:"center",marginBottom:20}}>
          <img src={preview} alt="" style={{maxHeight:110,borderRadius:8,border:"1px solid #e5e7eb"}}/>
          <p style={{color:"#6b7280",fontSize:12,marginTop:6}}>تحقق من البيانات المستخرجة وصحح ما يلزم</p>
        </div>
      )}

      <div style={{background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:10,padding:"10px 14px",marginBottom:20,fontSize:13,color:"#15803d"}}>
        ✅ تم استخراج البيانات تلقائياً — راجعها قبل التأكيد
      </div>

      {/* الهوية */}
      <h3 style={{fontSize:13,fontWeight:700,color:"#1a6b3c",borderBottom:"2px solid #d1fae5",paddingBottom:7,marginBottom:14}}>🪪 بيانات الهوية</h3>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 14px"}}>
        <Field label="اللقب (عربي)" required>
          <input style={inp} value={form.nomAr} onChange={e=>upd("nomAr",e.target.value)} placeholder="بن علي" dir="rtl"/>
        </Field>
        <Field label="الاسم (عربي)" required>
          <input style={inp} value={form.prenomAr} onChange={e=>upd("prenomAr",e.target.value)} placeholder="محمد" dir="rtl"/>
        </Field>
        <Field label="Nom (فرنسي)">
          <input style={inp} value={form.nom} onChange={e=>upd("nom",e.target.value)} placeholder="BEN ALI"/>
        </Field>
        <Field label="Prénom (فرنسي)">
          <input style={inp} value={form.prenom} onChange={e=>upd("prenom",e.target.value)} placeholder="Mohamed"/>
        </Field>
        <Field label="تاريخ الميلاد" required>
          <input type="date" style={inp} value={form.dateNaissance} onChange={e=>upd("dateNaissance",e.target.value)}/>
        </Field>
        <Field label="مكان الميلاد">
          <input style={inp} value={form.lieuNaissance} onChange={e=>upd("lieuNaissance",e.target.value)} placeholder="قد لا يكون مطبوعاً على الرخصة — أدخله يدوياً إن رغبت" dir="rtl"/>
        </Field>
      </div>

      <Field label="ولاية الميلاد">
        <select style={inp} value={form.wilayaNaissance} onChange={e=>upd("wilayaNaissance",e.target.value)} dir="rtl">
          <option value="">-- اختر --</option>
          {WILAYAS.map(w=><option key={w}>{w}</option>)}
        </select>
      </Field>

      <Field label="رقم التعريف الوطني (NIN)" required hint="18 رقماً">
        <input style={inp} value={form.nin}
          onChange={e=>upd("nin",e.target.value.replace(/\D/g,"").slice(0,18))}
          placeholder="100XXXXXXXXXXXXXXX" maxLength={18}/>
      </Field>

      {/* التواصل */}
      <h3 style={{fontSize:13,fontWeight:700,color:"#1a6b3c",borderBottom:"2px solid #d1fae5",paddingBottom:7,marginBottom:14,marginTop:22}}>📞 معلومات التواصل</h3>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 14px"}}>
        <Field label="رقم الهاتف" required>
          <input style={inp} value={form.telephone} onChange={e=>upd("telephone",e.target.value)} placeholder="05XXXXXXXX" maxLength={10}/>
        </Field>
        <Field label="هاتف ثانٍ">
          <input style={inp} value={form.telephone2} onChange={e=>upd("telephone2",e.target.value)} placeholder="06XXXXXXXX" maxLength={10}/>
        </Field>
      </div>
      <Field label="العنوان">
        <input style={inp} value={form.adresse} onChange={e=>upd("adresse",e.target.value)} placeholder="الشارع، الحي، البلدية، الولاية" dir="rtl"/>
      </Field>

      {/* الرخصة */}
      <h3 style={{fontSize:13,fontWeight:700,color:"#1a6b3c",borderBottom:"2px solid #d1fae5",paddingBottom:7,marginBottom:14,marginTop:22}}>🚗 رخصة السياقة</h3>
      <Field label="رقم الرخصة" required>
        <input style={inp} value={form.numPermis} onChange={e=>upd("numPermis",e.target.value)} placeholder="xxxxxxxx"/>
      </Field>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 14px"}}>
        <Field label="تاريخ الإصدار">
          <input type="date" style={inp} value={form.dateDelivrance} onChange={e=>upd("dateDelivrance",e.target.value)}/>
        </Field>
        <Field label="تاريخ الانتهاء">
          <input type="date" style={inp} value={form.dateExpiration} onChange={e=>upd("dateExpiration",e.target.value)}/>
        </Field>
      </div>
      <Field label="مكان الإصدار">
        <input style={inp} value={form.lieuDelivrance} onChange={e=>upd("lieuDelivrance",e.target.value)} placeholder="مديرية النقل" dir="rtl"/>
      </Field>
      <Field label="فئات الرخصة" required>
        <div style={{display:"flex",flexWrap:"wrap",gap:7,marginTop:4}}>
          {LICENSE_CATEGORIES.map(cat=>(
            <button key={cat} onClick={()=>toggleCat(cat)} style={{
              padding:"6px 13px",borderRadius:20,fontSize:13,fontWeight:600,cursor:"pointer",
              border:`2px solid ${form.categories.includes(cat)?"#1a6b3c":"#d1d5db"}`,
              background:form.categories.includes(cat)?"#1a6b3c":"#fff",
              color:form.categories.includes(cat)?"#fff":"#374151",transition:"all .15s"
            }}>{cat}</button>
          ))}
        </div>
      </Field>
      <Field label="ملاحظات">
        <textarea style={{...inp,minHeight:72,resize:"vertical"}}
          value={form.notes} onChange={e=>upd("notes",e.target.value)}
          placeholder="معلومات إضافية..." dir="rtl"/>
      </Field>
    </div>
  );
}

// ---- Step 3 ----
function ConfirmStep({ form, preview }) {
  const row=(l,v)=>v?<div key={l} style={{display:"flex",padding:"7px 0",borderBottom:"1px solid #f3f4f6",gap:10}}>
    <span style={{color:"#6b7280",fontSize:13,minWidth:130}}>{l}</span>
    <span style={{color:"#111827",fontSize:13,fontWeight:500,flex:1}}>{v}</span>
  </div>:null;
  return (
    <div>
      <div style={{textAlign:"center",marginBottom:22}}>
        <div style={{width:62,height:62,borderRadius:"50%",background:"#d1fae5",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:28}}>✅</div>
        <h3 style={{color:"#1a6b3c",marginTop:10,marginBottom:4}}>تم التسجيل بنجاح</h3>
        <p style={{color:"#6b7280",fontSize:14,margin:0}}>سيتم التواصل معك قريباً</p>
      </div>
      <div style={{background:"#f9fafb",borderRadius:12,padding:14}}>
        {preview&&<img src={preview} alt="" style={{width:"100%",maxHeight:90,objectFit:"contain",borderRadius:8,marginBottom:14}}/>}
        {row("الاسم الكامل",`${form.nomAr} ${form.prenomAr}`)}
        {row("NIN",form.nin)}
        {row("تاريخ الميلاد",form.dateNaissance)}
        {row("مكان الميلاد",form.lieuNaissance)}
        {row("رقم الهاتف",form.telephone)}
        {row("رقم الرخصة",form.numPermis)}
        {row("الفئات",form.categories.join(" — "))}
      </div>
    </div>
  );
}

// ==================== ADMIN PANEL ====================
function AdminPanel({ onClose }) {
  const [tab, setTab]         = useState("drivers");
  // ── بيانات السائقين ──
  const [drivers, setDrivers]         = useState([]);
  const [driversTotal, setDriversTotal] = useState(0);
  const [driversSearch, setDriversSearch] = useState("");
  const [driversLoading, setDriversLoading] = useState(false);
  // ── بيانات الشركات ──
  const [companies, setCompanies]         = useState([]);
  const [companiesTotal, setCompaniesTotal] = useState(0);
  const [companiesSearch, setCompaniesSearch] = useState("");
  const [companiesLoading, setCompaniesLoading] = useState(false);
  // ── بيانات دفتر المقاعد ──
  const [booklets, setBooklets]         = useState([]);
  const [bookletsTotal, setBookletsTotal] = useState(0);
  const [bookletsSearch, setBookletsSearch] = useState("");
  const [bookletsLoading, setBookletsLoading] = useState(false);
  // ── رخص ذوي الحقوق ──
  const [heritage, setHeritage]           = useState([]);
  const [heritageTotal, setHeritageTotal] = useState(0);
  const [heritageSearch, setHeritageSearch] = useState("");
  const [heritageLoading, setHeritageLoading] = useState(false);
  // ── تفاصيل مختارة ──
  const [selected, setSelected] = useState(null);

  const inp2 = {padding:"9px 12px",border:"1.5px solid #d1d5db",borderRadius:8,
    fontSize:13,outline:"none",fontFamily:"inherit",background:"#fff",width:"100%"};

  async function fetchDrivers(q="") {
    setDriversLoading(true);
    try {
      const r = await fetch(`${API_BASE}/admin/candidates?q=${encodeURIComponent(q)}&limit=500`);
      const d = await r.json();
      setDrivers(d.candidates||[]); setDriversTotal(d.total||0);
    } catch(e) { console.error(e); }
    setDriversLoading(false);
  }
  async function fetchCompanies(q="") {
    setCompaniesLoading(true);
    try {
      const r = await fetch(`${API_BASE}/admin/companies?q=${encodeURIComponent(q)}`);
      const d = await r.json();
      setCompanies(d.companies||[]); setCompaniesTotal(d.total||0);
    } catch(e) { console.error(e); }
    setCompaniesLoading(false);
  }
  async function fetchBooklets(q="") {
    setBookletsLoading(true);
    try {
      const r = await fetch(`${API_BASE}/admin/seat-booklet?q=${encodeURIComponent(q)}`);
      const d = await r.json();
      setBooklets(d.registrations||[]); setBookletsTotal(d.total||0);
    } catch(e) { console.error(e); }
    setBookletsLoading(false);
  }
  async function fetchHeritage(q="") {
    setHeritageLoading(true);
    try {
      const r = await fetch(`${API_BASE}/admin/heritage-licenses?q=${encodeURIComponent(q)}`);
      const d = await r.json();
      setHeritage(d.licenses||[]); setHeritageTotal(d.total||0);
    } catch(e) { console.error(e); }
    setHeritageLoading(false);
  }

  useEffect(()=>{ fetchDrivers(); fetchCompanies(); fetchBooklets(); fetchHeritage(); },[]);
  useEffect(()=>{ fetchDrivers(driversSearch); },[driversSearch]);
  useEffect(()=>{ fetchCompanies(companiesSearch); },[companiesSearch]);
  useEffect(()=>{ fetchBooklets(bookletsSearch); },[bookletsSearch]);
  useEffect(()=>{ fetchHeritage(heritageSearch); },[heritageSearch]);

  const statutColor = s => ({"جديد":"#3b82f6","مقبول":"#22c55e","مرفوض":"#ef4444","قيد الدراسة":"#f59e0b"}[s]||"#9ca3af");

  async function updateStatut(id, newStatut) {
    await fetch(`${API_BASE}/admin/candidates/${id}`, {
      method:"PATCH", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({statut: newStatut})
    });
    fetchDrivers(driversSearch);
    setSelected(s => s ? {...s, statut: newStatut} : null);
  }

  function thStyle(c="#1a6b3c") {
    return {padding:"9px 10px",textAlign:"right",color:"#374151",fontWeight:700,
      borderBottom:`2px solid ${c}44`,whiteSpace:"nowrap",fontSize:12,background:"#f9fafb"};
  }
  function tdStyle() {
    return {padding:"8px 10px",fontSize:12,borderBottom:"1px solid #f3f4f6"};
  }

  // ── تبويب السائقين ──
  function DriversTab() {
    return (
      <div>
        <div style={{display:"flex",gap:10,marginBottom:14,alignItems:"center"}}>
          <input style={{...inp2,flex:1}} placeholder="بحث بالاسم، NIN، هاتف، رخصة..."
            value={driversSearch} onChange={e=>setDriversSearch(e.target.value)}/>
          <a href={`${API_BASE}/admin/export/csv/candidates`}
            style={{padding:"9px 16px",background:"#1a6b3c",color:"#fff",borderRadius:8,
              textDecoration:"none",fontWeight:600,fontSize:12,whiteSpace:"nowrap"}}>
            ⬇ Excel
          </a>
        </div>
        {driversLoading && <div style={{textAlign:"center",padding:20,color:"#9ca3af"}}>جارٍ التحميل...</div>}
        <div style={{overflowX:"auto",borderRadius:10,border:"1px solid #e5e7eb"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead>
              <tr>
                {["#","اللقب والاسم (عربي)","Nom Prénom","تاريخ الميلاد","مكان الميلاد",
                  "NIN","الهاتف","رقم الرخصة","تاريخ الإصدار","تاريخ الانتهاء",
                  "مكان الإصدار","الفئات","الولاية","العنوان","الحالة","تاريخ التسجيل",""].map(h=>(
                  <th key={h} style={thStyle("#1a6b3c")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!drivers.length ? (
                <tr><td colSpan={17} style={{textAlign:"center",padding:30,color:"#9ca3af"}}>لا توجد نتائج</td></tr>
              ) : drivers.map((r,i) => (
                <tr key={r.id} onClick={()=>setSelected({...r,_type:"driver"})}
                  style={{background:i%2?"#fafafa":"#fff",cursor:"pointer"}}
                  onMouseEnter={e=>e.currentTarget.style.background="#f0fdf4"}
                  onMouseLeave={e=>e.currentTarget.style.background=i%2?"#fafafa":"#fff"}>
                  <td style={tdStyle()}>{r.id}</td>
                  <td style={{...tdStyle(),fontWeight:600}}>{r.nom_ar} {r.prenom_ar}</td>
                  <td style={tdStyle()}>{r.nom_fr} {r.prenom_fr}</td>
                  <td style={tdStyle()}>{r.date_naissance}</td>
                  <td style={tdStyle()}>{r.lieu_naissance}</td>
                  <td style={{...tdStyle(),fontFamily:"monospace"}}>{r.nin}</td>
                  <td style={tdStyle()}>{r.telephone}</td>
                  <td style={{...tdStyle(),fontFamily:"monospace"}}>{r.num_permis}</td>
                  <td style={tdStyle()}>{r.date_delivrance}</td>
                  <td style={tdStyle()}>{r.date_expiration}</td>
                  <td style={tdStyle()}>{r.lieu_delivrance}</td>
                  <td style={tdStyle()}>{(r.categories||[]).join(" ")}</td>
                  <td style={tdStyle()}>{r.wilaya}</td>
                  <td style={tdStyle()}>{r.adresse}</td>
                  <td style={tdStyle()}>
                    <span style={{padding:"2px 8px",borderRadius:12,fontSize:11,fontWeight:700,
                      background:`${statutColor(r.statut)}18`,color:statutColor(r.statut)}}>
                      {r.statut}
                    </span>
                  </td>
                  <td style={tdStyle()}>{(r.created_at||"").slice(0,10)}</td>
                  <td style={{...tdStyle(),color:"#2d9e5f"}}>عرض ←</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{color:"#9ca3af",fontSize:11,marginTop:8,textAlign:"center"}}>{driversTotal} سائق</p>
      </div>
    );
  }

  // ── تبويب الشركات ──
  function CompaniesTab() {
    return (
      <div>
        <div style={{display:"flex",gap:10,marginBottom:14,alignItems:"center"}}>
          <input style={{...inp2,flex:1}} placeholder="بحث باسم الشركة، سجل تجاري، مسؤول..."
            value={companiesSearch} onChange={e=>setCompaniesSearch(e.target.value)}/>
          <a href={`${API_BASE}/admin/export/csv/companies`}
            style={{padding:"9px 16px",background:"#2563eb",color:"#fff",borderRadius:8,
              textDecoration:"none",fontWeight:600,fontSize:12,whiteSpace:"nowrap"}}>
            ⬇ Excel
          </a>
        </div>
        {companiesLoading && <div style={{textAlign:"center",padding:20,color:"#9ca3af"}}>جارٍ التحميل...</div>}
        <div style={{overflowX:"auto",borderRadius:10,border:"1px solid #e5e7eb"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead>
              <tr>
                {["#","اسم الشركة","السجل التجاري","رقم الاعتماد","المسؤول",
                  "الهاتف","البريد الإلكتروني","الولاية","العنوان",
                  "عدد المركبات","نوع المركبات","تاريخ التسجيل",""].map(h=>(
                  <th key={h} style={thStyle("#2563eb")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!companies.length ? (
                <tr><td colSpan={13} style={{textAlign:"center",padding:30,color:"#9ca3af"}}>لا توجد نتائج</td></tr>
              ) : companies.map((r,i) => (
                <tr key={r.id} onClick={()=>setSelected({...r,_type:"company"})}
                  style={{background:i%2?"#fafafa":"#fff",cursor:"pointer"}}
                  onMouseEnter={e=>e.currentTarget.style.background="#eff6ff"}
                  onMouseLeave={e=>e.currentTarget.style.background=i%2?"#fafafa":"#fff"}>
                  <td style={tdStyle()}>{r.id}</td>
                  <td style={{...tdStyle(),fontWeight:600}}>{r.nom_societe}</td>
                  <td style={{...tdStyle(),fontFamily:"monospace"}}>{r.registre_commerce}</td>
                  <td style={tdStyle()}>{r.numero_agreement}</td>
                  <td style={tdStyle()}>{r.nom_responsable} {r.prenom_responsable}</td>
                  <td style={tdStyle()}>{r.telephone}</td>
                  <td style={tdStyle()}>{r.email}</td>
                  <td style={tdStyle()}>{r.wilaya}</td>
                  <td style={tdStyle()}>{r.adresse}</td>
                  <td style={tdStyle()}>{r.nb_vehicules}</td>
                  <td style={tdStyle()}>{r.type_vehicules}</td>
                  <td style={tdStyle()}>{(r.created_at||"").slice(0,10)}</td>
                  <td style={{...tdStyle(),color:"#2563eb"}}>عرض ←</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{color:"#9ca3af",fontSize:11,marginTop:8,textAlign:"center"}}>{companiesTotal} شركة</p>
      </div>
    );
  }

  // ── تبويب دفتر المقاعد ──
  function BookletsTab() {
    return (
      <div>
        <div style={{display:"flex",gap:10,marginBottom:14,alignItems:"center"}}>
          <input style={{...inp2,flex:1}} placeholder="بحث بالاسم، NIN، رقم التسجيل، هاتف..."
            value={bookletsSearch} onChange={e=>setBookletsSearch(e.target.value)}/>
          <a href={`${API_BASE}/admin/export/csv/seat-booklet`}
            style={{padding:"9px 16px",background:"#b45309",color:"#fff",borderRadius:8,
              textDecoration:"none",fontWeight:600,fontSize:12,whiteSpace:"nowrap"}}>
            ⬇ Excel
          </a>
        </div>
        {bookletsLoading && <div style={{textAlign:"center",padding:20,color:"#9ca3af"}}>جارٍ التحميل...</div>}
        <div style={{overflowX:"auto",borderRadius:10,border:"1px solid #e5e7eb"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead>
              <tr>
                {["#","رقم التسجيل","اللقب والاسم (عربي)","Nom Prénom",
                  "تاريخ الميلاد","مكان الميلاد","NIN","رقم الرخصة",
                  "تاريخ انتهاء الرخصة","الهاتف","العنوان","الحالة","تاريخ التسجيل",""].map(h=>(
                  <th key={h} style={thStyle("#b45309")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!booklets.length ? (
                <tr><td colSpan={14} style={{textAlign:"center",padding:30,color:"#9ca3af"}}>لا توجد نتائج</td></tr>
              ) : booklets.map((r,i) => (
                <tr key={r.id} onClick={()=>setSelected({...r,_type:"booklet"})}
                  style={{background:i%2?"#fafafa":"#fff",cursor:"pointer"}}
                  onMouseEnter={e=>e.currentTarget.style.background="#fef3c7"}
                  onMouseLeave={e=>e.currentTarget.style.background=i%2?"#fafafa":"#fff"}>
                  <td style={tdStyle()}>{r.id}</td>
                  <td style={{...tdStyle(),fontWeight:700,color:"#b45309",fontFamily:"monospace"}}>{r.registration_number}</td>
                  <td style={{...tdStyle(),fontWeight:600}}>{r.nom_ar} {r.prenom_ar}</td>
                  <td style={tdStyle()}>{r.nom_fr} {r.prenom_fr}</td>
                  <td style={tdStyle()}>{r.date_naissance}</td>
                  <td style={tdStyle()}>{r.lieu_naissance}</td>
                  <td style={{...tdStyle(),fontFamily:"monospace"}}>{r.nin}</td>
                  <td style={{...tdStyle(),fontFamily:"monospace"}}>{r.num_permis}</td>
                  <td style={tdStyle()}>{r.date_expiration}</td>
                  <td style={tdStyle()}>{r.telephone}</td>
                  <td style={tdStyle()}>{r.adresse}</td>
                  <td style={tdStyle()}>
                    <span style={{padding:"2px 8px",borderRadius:12,fontSize:11,fontWeight:700,
                      background:`${statutColor(r.statut)}18`,color:statutColor(r.statut)}}>
                      {r.statut}
                    </span>
                  </td>
                  <td style={tdStyle()}>{(r.created_at||"").slice(0,10)}</td>
                  <td style={{...tdStyle(),color:"#b45309"}}>
                    <a href={`${API_BASE}/print-seat-certificate/${r.id}`} target="_blank"
                      onClick={e=>e.stopPropagation()}
                      style={{color:"#b45309",textDecoration:"none",fontWeight:600}}>
                      🖨️ طباعة
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{color:"#9ca3af",fontSize:11,marginTop:8,textAlign:"center"}}>{bookletsTotal} مسجّل</p>
      </div>
    );
  }

  // ── نافذة التفاصيل ──
  function DetailModal() {
    if (!selected) return null;
    const isDriver   = selected._type === "driver";
    const isCompany  = selected._type === "company";
    const isBooklet  = selected._type === "booklet";
    const isHeritage = selected._type === "heritage";
    const color = isDriver?"#1a6b3c":isCompany?"#2563eb":isHeritage?"#7c3aed":"#b45309";
    const title = isDriver   ? `${selected.nom_ar||""} ${selected.prenom_ar||""}` :
                  isCompany  ? selected.nom_societe :
                  isHeritage ? `${selected.nom_ar||""} ${selected.prenom_ar||""} — ق.${selected.num_decision||""}` :
                  `${selected.nom_ar||""} ${selected.prenom_ar||""} — ${selected.registration_number||""}`;

    const fields = isDriver ? [
      ["اللقب (عربي)",selected.nom_ar],["الاسم (عربي)",selected.prenom_ar],
      ["Nom",selected.nom_fr],["Prénom",selected.prenom_fr],
      ["تاريخ الميلاد",selected.date_naissance],["مكان الميلاد",selected.lieu_naissance],
      ["الولاية",selected.wilaya_naissance],["NIN",selected.nin],
      ["الهاتف",selected.telephone],["هاتف 2",selected.telephone2],
      ["العنوان",selected.adresse],["البلدية",selected.commune],
      ["رقم الرخصة",selected.num_permis],["تاريخ الإصدار",selected.date_delivrance],
      ["تاريخ الانتهاء",selected.date_expiration],["مكان الإصدار",selected.lieu_delivrance],
      ["الفئات",(selected.categories||[]).join(" / ")],
      ["الحالة",selected.statut],["تاريخ التسجيل",selected.created_at],
    ] : isCompany ? [
      ["اسم الشركة",selected.nom_societe],["السجل التجاري",selected.registre_commerce],
      ["رقم الاعتماد",selected.numero_agreement],
      ["المسؤول",`${selected.nom_responsable||""} ${selected.prenom_responsable||""}`],
      ["الهاتف",selected.telephone],["هاتف 2",selected.telephone2],
      ["البريد الإلكتروني",selected.email],["الولاية",selected.wilaya],["العنوان",selected.adresse],
      ["عدد المركبات",selected.nb_vehicules],["نوع المركبات",selected.type_vehicules],
      ["تاريخ التسجيل",selected.created_at],
    ] : isHeritage ? [
      ["اللقب (عربي)",selected.nom_ar],["الاسم (عربي)",selected.prenom_ar],
      ["Nom",selected.nom_fr],["Prénom",selected.prenom_fr],
      ["تاريخ الميلاد",selected.date_naissance],["مكان الميلاد",selected.lieu_naissance],
      ["NIN",selected.nin],["البلدية",selected.commune],["الولاية",selected.wilaya],
      ["العنوان",selected.adresse],
      ["رقم القرار",selected.num_decision],["تاريخ القرار",selected.date_decision],
      ["بلدية الالحاق",selected.commune_rattachement],["رقم الباب",selected.num_porte],
      ["الحالة",selected.statut],["تاريخ التسجيل",selected.created_at],
    ] : [
      ["رقم التسجيل",selected.registration_number],
      ["اللقب (عربي)",selected.nom_ar],["الاسم (عربي)",selected.prenom_ar],
      ["Nom",selected.nom_fr],["Prénom",selected.prenom_fr],
      ["تاريخ الميلاد",selected.date_naissance],["مكان الميلاد",selected.lieu_naissance],
      ["NIN",selected.nin],["رقم الرخصة",selected.num_permis],
      ["تاريخ انتهاء الرخصة",selected.date_expiration],
      ["الهاتف",selected.telephone],["هاتف 2",selected.telephone2],
      ["العنوان",selected.adresse],["الحالة",selected.statut],
      ["تاريخ التسجيل",selected.created_at],
    ];

    return (
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:2000,
        display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
        <div style={{background:"#fff",borderRadius:16,padding:22,maxWidth:500,width:"100%",
          maxHeight:"85vh",overflow:"auto"}} dir="rtl">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <h3 style={{margin:0,fontSize:15,color:color}}>{title}</h3>
            <button onClick={()=>setSelected(null)} style={{border:"none",background:"none",fontSize:18,cursor:"pointer"}}>✕</button>
          </div>
          {fields.filter(([,v])=>v).map(([l,v])=>(
            <div key={l} style={{display:"flex",gap:10,padding:"6px 0",borderBottom:"1px solid #f3f4f6"}}>
              <span style={{color:"#6b7280",fontSize:13,minWidth:130,flexShrink:0}}>{l}</span>
              <span style={{fontSize:13,fontWeight:500}}>{v}</span>
            </div>
          ))}
          {isDriver&&(
            <div style={{marginTop:16}}>
              <p style={{fontSize:12,color:"#6b7280",marginBottom:8}}>تغيير الحالة:</p>
              <div style={{display:"flex",gap:8}}>
                {["جديد","مقبول","مرفوض"].map(s=>(
                  <button key={s} onClick={()=>updateStatut(selected.id,s)} style={{
                    flex:1,padding:"8px 0",borderRadius:8,border:`2px solid ${statutColor(s)}`,
                    background:selected.statut===s?statutColor(s):"#fff",
                    color:selected.statut===s?"#fff":statutColor(s),
                    cursor:"pointer",fontWeight:600,fontSize:13
                  }}>{s}</button>
                ))}
              </div>
            </div>
          )}
          {isBooklet&&(
            <a href={`${API_BASE}/print-seat-certificate/${selected.id}`} target="_blank"
              style={{display:"block",marginTop:16,padding:12,borderRadius:10,border:"none",
                background:"#b45309",color:"#fff",textAlign:"center",fontWeight:700,
                fontSize:14,textDecoration:"none"}}>
              🖨️ طباعة شهادة التسجيل (مع QR)
            </a>
          )}
        </div>
      </div>
    );
  }

  // ── تبويب رخص ذوي الحقوق ──
  function HeritageTab() {
    return (
      <div>
        <div style={{display:"flex",gap:10,marginBottom:14,alignItems:"center"}}>
          <input style={{...inp2,flex:1}} placeholder="بحث بالاسم، NIN، رقم القرار، بلدية الالحاق..."
            value={heritageSearch} onChange={e=>setHeritageSearch(e.target.value)}/>
          <a href={`${API_BASE}/admin/export/csv/heritage-licenses`}
            style={{padding:"9px 16px",background:"#7c3aed",color:"#fff",borderRadius:8,
              textDecoration:"none",fontWeight:600,fontSize:12,whiteSpace:"nowrap"}}>
            ⬇ Excel
          </a>
        </div>
        {heritageLoading&&<div style={{textAlign:"center",padding:20,color:"#9ca3af"}}>جارٍ التحميل...</div>}
        <div style={{overflowX:"auto",borderRadius:10,border:"1px solid #e5e7eb"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead>
              <tr>
                {["#","اللقب والاسم (عربي)","Nom Prénom","تاريخ الميلاد","مكان الميلاد",
                  "NIN","البلدية","الولاية","العنوان",
                  "رقم القرار","تاريخ القرار","بلدية الالحاق","رقم الباب",
                  "الحالة","تاريخ التسجيل"].map(h=>(
                  <th key={h} style={thStyle("#7c3aed")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!heritage.length ? (
                <tr><td colSpan={15} style={{textAlign:"center",padding:30,color:"#9ca3af"}}>لا توجد نتائج</td></tr>
              ) : heritage.map((r,i)=>(
                <tr key={r.id} onClick={()=>setSelected({...r,_type:"heritage"})}
                  style={{background:i%2?"#fafafa":"#fff",cursor:"pointer"}}
                  onMouseEnter={e=>e.currentTarget.style.background="#f5f3ff"}
                  onMouseLeave={e=>e.currentTarget.style.background=i%2?"#fafafa":"#fff"}>
                  <td style={tdStyle()}>{r.id}</td>
                  <td style={{...tdStyle(),fontWeight:600}}>{r.nom_ar} {r.prenom_ar}</td>
                  <td style={tdStyle()}>{r.nom_fr} {r.prenom_fr}</td>
                  <td style={tdStyle()}>{r.date_naissance}</td>
                  <td style={tdStyle()}>{r.lieu_naissance}</td>
                  <td style={{...tdStyle(),fontFamily:"monospace"}}>{r.nin}</td>
                  <td style={tdStyle()}>{r.commune}</td>
                  <td style={tdStyle()}>{r.wilaya}</td>
                  <td style={tdStyle()}>{r.adresse}</td>
                  <td style={{...tdStyle(),fontWeight:700,color:"#7c3aed"}}>{r.num_decision}</td>
                  <td style={tdStyle()}>{r.date_decision}</td>
                  <td style={{...tdStyle(),fontWeight:600}}>{r.commune_rattachement}</td>
                  <td style={{...tdStyle(),fontFamily:"monospace"}}>{r.num_porte}</td>
                  <td style={tdStyle()}>
                    <span style={{padding:"2px 8px",borderRadius:12,fontSize:11,fontWeight:700,
                      background:"#7c3aed18",color:"#7c3aed"}}>{r.statut}</span>
                  </td>
                  <td style={tdStyle()}>{(r.created_at||"").slice(0,10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{color:"#9ca3af",fontSize:11,marginTop:8,textAlign:"center"}}>{heritageTotal} مسجّل</p>
      </div>
    );
  }

  const TABS = [
    {id:"drivers",  label:"🚕 سائقو سيارات الأجرة",  count:driversTotal,   color:"#1a6b3c"},
    {id:"companies",label:"🏢 شركات سيارات الأجرة",   count:companiesTotal, color:"#2563eb"},
    {id:"booklets", label:"📘 دفتر المقاعد",           count:bookletsTotal,  color:"#b45309"},
    {id:"heritage", label:"📜 رخص ذوي الحقوق",        count:heritageTotal,  color:"#7c3aed"},
  ];

  return (
    <div style={{position:"fixed",inset:0,background:"#f9fafb",zIndex:1000,overflow:"auto",padding:20,fontFamily:"inherit"}} dir="rtl">
      <div style={{maxWidth:1100,margin:"0 auto"}}>

        {/* Header */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
          <h2 style={{margin:0,color:"#1a6b3c",fontSize:18}}>🗂️ لوحة إدارة التسجيلات</h2>
          <button onClick={onClose} style={{padding:"7px 14px",borderRadius:8,border:"1px solid #d1d5db",background:"#fff",cursor:"pointer",fontSize:13}}>✕ إغلاق</button>
        </div>

        {/* Tabs */}
        <div style={{display:"flex",gap:8,marginBottom:20,borderBottom:"2px solid #e5e7eb",paddingBottom:0}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{
              padding:"10px 18px",borderRadius:"8px 8px 0 0",border:"none",
              background:tab===t.id?t.color:"#fff",
              color:tab===t.id?"#fff":"#374151",
              cursor:"pointer",fontWeight:700,fontSize:13,
              borderBottom:tab===t.id?`2px solid ${t.color}`:"2px solid transparent",
              marginBottom:-2
            }}>
              {t.label}
              <span style={{marginRight:6,background:tab===t.id?"rgba(255,255,255,.3)":t.color+"18",
                color:tab===t.id?"#fff":t.color,padding:"1px 7px",borderRadius:10,fontSize:11,fontWeight:700}}>
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {/* Content */}
        {tab==="drivers"   && <DriversTab/>}
        {tab==="companies" && <CompaniesTab/>}
        {tab==="booklets"  && <BookletsTab/>}
        {tab==="heritage"  && <HeritageTab/>}

        {/* Detail Modal */}
        <DetailModal/>
      </div>
    </div>
  );
}

// ==================== MAIN ====================