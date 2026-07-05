import React from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const Icon = ({ path }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d={path} />
  </svg>
);

const ICONS = {
  dashboard: "M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6v-9h-6v9Zm0-16v5h6V4h-6Z",
  new: "M12 5v14M5 12h14",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.3l2-1.6-2-3.4-2.4 1a7.3 7.3 0 0 0-2.2-1.3L14 2h-4l-.4 2.5a7.3 7.3 0 0 0-2.2 1.3l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.6l-2 1.6 2 3.4 2.4-1a7.3 7.3 0 0 0 2.2 1.3L10 22h4l.4-2.5a7.3 7.3 0 0 0 2.2-1.3l2.4 1 2-3.4-2-1.6c.07-.43.1-.86.1-1.3Z",
};

export default function Sidebar() {
  const location = useLocation();
  const { user, logout } = useAuth();

  const links = [
    { path: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { path: "/projects/new", label: "New Project", icon: "new" },
    { path: "/settings", label: "Settings", icon: "settings" },
  ];

  const initials = (user?.name || "?")
    .split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <aside className="w-64 bg-surface/70 backdrop-blur border-r border-borderSoft h-screen flex flex-col fixed left-0 top-0">
      <div className="px-6 pt-7 pb-6">
        <span className="wordmark text-[15px]">BAAKHAPAA</span>
        <div className="text-inkMuted text-[10px] tracking-[0.22em] uppercase mt-1.5">
          Pre-Production
        </div>
      </div>

      <nav className="flex-1 px-3 mt-2">
        {links.map((link) => {
          const active = location.pathname === link.path;
          return (
            <Link
              key={link.path}
              to={link.path}
              className={`group relative flex items-center gap-3 px-3.5 py-2.5 rounded-lg mb-1 text-sm transition ${
                active
                  ? "bg-goldDim text-gold"
                  : "text-inkSoft hover:text-ink hover:bg-white/[0.03]"
              }`}
            >
              <span
                className={`absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full bg-gold transition-all ${
                  active ? "h-5 opacity-100" : "h-0 opacity-0"
                }`}
              />
              <Icon path={ICONS[link.icon]} />
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="m-3 p-3 rounded-xl bg-elevated/60 border border-borderSoft flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-gold-sheen flex items-center justify-center text-[12px] font-semibold text-bgDeep shrink-0">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm text-ink truncate">{user?.name || "Guest"}</div>
          <div className="text-[11px] text-inkMuted capitalize">
            {user?.subscription_tier || "free"} plan
          </div>
        </div>
        <button
          onClick={logout}
          title="Sign out"
          className="text-inkMuted hover:text-gold transition"
        >
          <Icon path="M16 17l5-5-5-5M21 12H9M12 19H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h7" />
        </button>
      </div>
    </aside>
  );
}
