// Notifications.jsx — شارة التنبيهات
export function NotifBadge({ count }) {
  if (!count) return null;
  return (
    <span style={{ position:"absolute", top:-6, right:-6,
      background:"#ef4444", color:"#fff", borderRadius:"50%",
      width:18, height:18, fontSize:11, fontWeight:700,
      display:"flex", alignItems:"center", justifyContent:"center" }}>
      {count > 9 ? "9+" : count}
    </span>
  );
}
