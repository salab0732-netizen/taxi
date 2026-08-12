// ==================== UPLOAD DOCUMENTS (رخصة + بطاقة رمادية) ====================
function UploadDocuments({ onDone }) {
  const [permisImg,   setPermisImg]   = useState(null); // base64 preview
  const [permisB64,   setPermisB64]   = useState("");
  const [permisData,  setPermisData]  = useState(null);
  const [permisLoad,  setPermisLoad]  = useState(false);
  const [permisErr,   setPermisErr]   = useState("");

  const [griseImg,    setGriseImg]    = useState(null);
  const [griseB64,    setGriseB64]    = useState("");
  const [griseData,   setGriseData]   = useState(null);
  const [griseLoad,   setGriseLoad]   = useState(false);
  const [griseErr,    setGriseErr]    = useState("");

  const permisRef = useRef();
  const griseRef  = useRef();

  async function handlePermis(file) {
    if (!file) return;
    setPermisErr(""); setPermisLoad(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const b64  = e.target.result.split(",")[1];
      const mime = file.type || "image/jpeg";
      setPermisImg(e.target.result);
      setPermisB64(b64);
      try {
        const res = await fetch(`${API_BASE}/ocr`, {
          method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({image_base64: b64, mime_type: mime})
        });
        const d = await res.json();
        if (d.success) setPermisData(d.data);
        else setPermisErr(d.error || "فشل استخراج بيانات الرخصة");
      } catch(e) { setPermisErr("خطأ في الاتصال"); }
      setPermisLoad(false);
    };
    reader.readAsDataURL(file);
  }

  async function handleGrise(file) {
    if (!file) return;
    setGriseErr(""); setGriseLoad(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const b64  = e.target.result.split(",")[1];
      const mime = file.type || "image/jpeg";
      setGriseImg(e.target.result);
      setGriseB64(b64);
      try {
        const res = await fetch(`${API_BASE}/ocr-carte-grise`, {
          method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({image_base64: b64, mime_type: mime})
        });
        const d = await res.json();
        if (d.success) setGriseData(d.data);
        else setGriseErr(d.error || "فشل استخراج بيانات البطاقة الرمادية");
      } catch(e) { setGriseErr("خطأ في الاتصال"); }
      setGriseLoad(false);
    };
    reader.readAsDataURL(file);
  }

  function handleContinue() {
    onDone(permisData, griseData, permisImg);
  }

  const cardStyle = {
    border:"2px dashed #d1d5db", borderRadius:14, padding:"16px 12px",
    textAlign:"center", cursor:"pointer", background:"#f9fafb",
    marginBottom:12, transition:"border-color .2s"
  };
  const cardActiveStyle = {...cardStyle, borderColor:"#1a6b3c", background:"#f0fdf4"};

  function ResultBadge({ data, label }) {
    if (!data) return null;
    const fields = Object.entries(data).filter(([,v])=>v&&v!==""&&!(Array.isArray(v)&&v.length===0));
    return (
      <div style={{background:"#f0fdf4",border:"1px solid #86efac",borderRadius:8,
        padding:"8px 12px",marginTop:8,textAlign:"right"}}>
        <div style={{color:"#15803d",fontWeight:700,fontSize:12,marginBottom:4}}>
          ✅ تم استخراج {fields.length} حقل
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
          {fields.slice(0,6).map(([k,v])=>(
            <span key={k} style={{background:"#dcfce7",color:"#166534",
              padding:"2px 6px",borderRadius:4,fontSize:11}}>
              {Array.isArray(v)?v.join(","): String(v).slice(0,15)}
            </span>
          ))}
          {fields.length>6&&<span style={{color:"#6b7280",fontSize:11}}>+{fields.length-6} أخرى</span>}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h3 style={{color:"#1a6b3c",fontWeight:800,fontSize:17,marginBottom:20,textAlign:"center"}}>
        📄 رفع وثائق السائق
      </h3>

      {/* رخصة السياقة */}
      <div style={{marginBottom:20}}>
        <div style={{fontWeight:700,fontSize:14,color:"#374151",marginBottom:8}}>
          🪪 رخصة السياقة
        </div>
        <div onClick={()=>!permisLoad&&permisRef.current.click()}
          style={permisImg ? cardActiveStyle : cardStyle}>
          {permisLoad ? (
            <div style={{color:"#1a6b3c",fontSize:13}}>
              <div style={{width:28,height:28,border:"3px solid #1a6b3c",
                borderTopColor:"transparent",borderRadius:"50%",
                animation:"spin 1s linear infinite",margin:"0 auto 8px"}}/>
              جاري قراءة الرخصة...
            </div>
          ) : permisImg ? (
            <img src={permisImg} style={{maxHeight:120,maxWidth:"100%",borderRadius:6}} alt="رخصة"/>
          ) : (
            <div style={{color:"#9ca3af",fontSize:13}}>
              <div style={{fontSize:32,marginBottom:6}}>🪪</div>
              اضغط لرفع صورة رخصة السياقة
            </div>
          )}
        </div>
        <input ref={permisRef} type="file" accept="image/*" style={{display:"none"}}
          onChange={e=>handlePermis(e.target.files[0])}/>
        {permisErr && <div style={{color:"#dc2626",fontSize:12,marginTop:4}}>⚠️ {permisErr}</div>}
        <ResultBadge data={permisData} label="رخصة"/>
      </div>

      {/* البطاقة الرمادية */}
      <div style={{marginBottom:20}}>
        <div style={{fontWeight:700,fontSize:14,color:"#374151",marginBottom:8}}>
          🚗 البطاقة الرمادية
        </div>
        <div onClick={()=>!griseLoad&&griseRef.current.click()}
          style={griseImg ? {...cardStyle,borderColor:"#2563eb",background:"#eff6ff"} : cardStyle}>
          {griseLoad ? (
            <div style={{color:"#2563eb",fontSize:13}}>
              <div style={{width:28,height:28,border:"3px solid #2563eb",
                borderTopColor:"transparent",borderRadius:"50%",
                animation:"spin 1s linear infinite",margin:"0 auto 8px"}}/>
              جاري قراءة البطاقة الرمادية...
            </div>
          ) : griseImg ? (
            <img src={griseImg} style={{maxHeight:120,maxWidth:"100%",borderRadius:6}} alt="بطاقة رمادية"/>
          ) : (
            <div style={{color:"#9ca3af",fontSize:13}}>
              <div style={{fontSize:32,marginBottom:6}}>🚗</div>
              اضغط لرفع صورة البطاقة الرمادية
            </div>
          )}
        </div>
        <input ref={griseRef} type="file" accept="image/*" style={{display:"none"}}
          onChange={e=>handleGrise(e.target.files[0])}/>
        {griseErr && <div style={{color:"#dc2626",fontSize:12,marginTop:4}}>⚠️ {griseErr}</div>}
        <ResultBadge data={griseData} label="بطاقة رمادية"/>
      </div>

      <button onClick={handleContinue}
        style={{width:"100%",padding:13,borderRadius:10,border:"none",
          background:"#1a6b3c",color:"#fff",cursor:"pointer",fontWeight:700,fontSize:15}}>
        متابعة لمراجعة البيانات ←
      </button>
      <p style={{textAlign:"center",color:"#9ca3af",fontSize:12,marginTop:8}}>
        يمكنك المتابعة حتى بدون رفع الوثائق — ستُدخل البيانات يدوياً
      </p>
    </div>
  );
}