// ==================== CARTE GRISE UPLOAD (مستقل) ====================
function UploadCarteGrise({ onDone, color="#1a6b3c" }) {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError]     = useState("");
  const fileRef = useRef();

  async function handleFile(file) {
    if (!file) return;
    setError(""); setLoading(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const b64 = e.target.result.split(",")[1];
      const mime = file.type || "image/jpeg";
      setPreview(e.target.result);
      try {
        const res = await fetch(`${API_BASE}/ocr-carte-grise`, {
          method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({image_base64: b64, mime_type: mime})
        });
        const d = await res.json();
        if (d.success) onDone(d.data, e.target.result);
        else setError(d.error || "تعذّر استخراج البيانات — راجعها يدوياً");
      } catch(err) {
        setError("خطأ في الاتصال بالخادم");
      }
      setLoading(false);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div>
      <div
        onClick={()=>!loading&&fileRef.current.click()}
        onDragOver={e=>e.preventDefault()}
        onDrop={e=>{e.preventDefault();handleFile(e.dataTransfer.files[0]);}}
        style={{border:`2px dashed ${color}`,borderRadius:14,padding:"20px 16px",
          textAlign:"center",cursor:loading?"default":"pointer",background:"#f8fffe",
          marginBottom:8,transition:"all .2s"}}
      >
        {loading ? (
          <div style={{color,fontSize:13}}>
            <div style={{width:28,height:28,border:`3px solid ${color}`,borderTopColor:"transparent",
              borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 8px"}}/>
            جاري استخراج بيانات المركبة...
          </div>
        ) : preview ? (
          <img src={preview} style={{maxHeight:140,maxWidth:"100%",borderRadius:8}} alt="carte grise"/>
        ) : (
          <div style={{color:"#9ca3af",fontSize:13}}>
            <div style={{fontSize:32,marginBottom:8}}>🚗</div>
            اضغط أو اسحب صورة البطاقة الرمادية هنا
          </div>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}}
        onChange={e=>handleFile(e.target.files[0])}/>
      {error&&<div style={{color:"#dc2626",fontSize:12,marginBottom:8}}>⚠️ {error}</div>}
      {preview&&!loading&&(
        <button onClick={()=>fileRef.current.click()}
          style={{width:"100%",padding:"8px",borderRadius:8,border:`1.5px solid ${color}`,
            background:"#fff",color,cursor:"pointer",fontWeight:600,fontSize:12}}>
          🔄 تغيير الصورة
        </button>
      )}
    </div>
  );
}