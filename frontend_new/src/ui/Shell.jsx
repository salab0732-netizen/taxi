// غلاف التطبيق بشريط جانبي (لوحة الإدارة وفضاء الشركات)
import { useState, useEffect } from "react";
import Icon from "./Icon.jsx";
import { Avatar, Button, Toaster, ConfirmHost } from "./kit.jsx";

export function BrandMark({ size = 40 }) {
  return (
    <div className="brand-mark" style={{ width: size, height: size }}>
      <Icon name="taxi" size={size * .55} stroke={2.1}/>
    </div>
  );
}

export function AppShell({ brandName, brandSub, top, nav, active, onNavigate, user, userSub, onLogout, title, crumbs, topActions, children }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); }, [active]);
  return (
    <div className={`shell ${open ? "nav-open" : ""}`} dir="rtl">
      <aside className="sidebar" aria-label="القائمة الرئيسية">
        <div className="sidebar-brand">
          <BrandMark/>
          <div style={{ minWidth: 0 }}>
            <div className="brand-name">{brandName}</div>
            <div className="brand-sub">{brandSub}</div>
          </div>
        </div>
        {top}
        <nav className="sidebar-section" style={{ flex: 1, overflowY: "auto" }}>
          {nav.map((g, gi) => (
            <div key={gi}>
              {g.label && <div className="sidebar-label">{g.label}</div>}
              {g.items.map(it => (
                <button key={it.id} className={`nav-item ${active === it.id ? "active" : ""}`} onClick={() => onNavigate(it.id)}>
                  <Icon name={it.icon} size={18}/>
                  <span>{it.label}</span>
                  {it.count ? <span className="count-pill">{it.count}</span> : null}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="user-chip">
            <Avatar name={user} dark/>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ color: "#fff", fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user}</div>
              <div style={{ color: "rgba(214,235,230,.55)", fontSize: 11.5 }}>{userSub}</div>
            </div>
            <button className="btn btn-ghost btn-sm btn-icon" style={{ color: "rgba(214,235,230,.8)" }} onClick={onLogout} title="تسجيل الخروج" aria-label="تسجيل الخروج">
              <Icon name="logout" size={17}/>
            </button>
          </div>
        </div>
      </aside>
      <div className="sidebar-backdrop" onClick={() => setOpen(false)}/>
      <div className="main">
        <header className="topbar">
          <Button variant="ghost" size="sm" icon="menu" className="menu-btn" onClick={() => setOpen(true)} aria-label="القائمة"/>
          <div style={{ minWidth: 0 }}>
            {crumbs && <div className="crumbs">{crumbs}</div>}
            <div className="topbar-title">{title}</div>
          </div>
          <div className="spacer"/>
          {topActions}
        </header>
        <main key={active} className="anim-fade" style={{ flex: 1 }}>{children}</main>
      </div>
      <Toaster/>
      <ConfirmHost/>
    </div>
  );
}
