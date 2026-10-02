// Layout.jsx — غلاف عام للصفحة
export default function Layout({ children }) {
  return (
    <div style={{ maxWidth:720, margin:"0 auto", padding:"20px 14px" }}>
      {children}
    </div>
  );
}
