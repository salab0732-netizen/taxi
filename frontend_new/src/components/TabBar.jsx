// TabBar.jsx — شريط التبويبات
const COLOR = "#125950";

export default function TabBar({ tabs, active, onChange }) {
  return (
    <div style={{ display:"flex", borderBottom:"2px solid #e5e7eb", overflowX:"auto" }}>
      {tabs.map(tab => (
        <button key={tab.id}
          onClick={() => onChange(tab.id)}
          style={{ flex:1, padding:"14px 8px", border:"none",
            background: active === tab.id ? "#f0fdf4" : "#fff",
            borderBottom: active === tab.id ? `3px solid ${COLOR}` : "3px solid transparent",
            cursor:"pointer", fontSize:12, fontWeight:600,
            color: active === tab.id ? COLOR : "#6b7280",
            transition:"all .15s", whiteSpace:"nowrap", minWidth:80 }}>
          <div style={{ fontSize:20, marginBottom:4 }}>{tab.icon}</div>
          {tab.label}
        </button>
      ))}
    </div>
  );
}
