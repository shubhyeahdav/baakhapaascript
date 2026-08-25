import React, { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import PlanNotice from "./PlanNotice";

// Shared top navigation for the whole app shell — both the editorial (dashboard,
// wizard, exports) and utilitarian (editor, storyboard, structure) modes hang
// off this one bar. Gold is reserved for the active section only.
//
// Three destinations, not five. Storyboards and Exports were global indexes of
// things that only exist inside a project, so they asked the writer to hold a
// second, flatter mental model of their own work alongside the real one; both
// are still routable, and both are reached from the project they belong to.
// "Team" was a nav item pointing at a Settings tab. What is left is the way a
// writer actually thinks: the work, the course, and the account.
//
// `active` is one of: "Projects" | "Learn" | "Settings".
// `right` optionally overrides the right-hand region (utilitarian screens pass
// their own dense toolbar); by default it shows the ⌘K hint + New project + avatar.
export default function TopNav({ active = "Projects", right }) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Close the account menu on outside-click or Escape so it behaves like a
  // normal dropdown (the avatar used to log you out on a single click —
  // easy to trigger by accident).
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const items = [
    { label: "Projects", to: "/dashboard" },
    { label: "Learn", to: "/learn" },
    { label: "Settings", to: "/settings" },
  ];

  const initials = (user?.name || "?")
    .split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  const go = (path) => { setMenuOpen(false); navigate(path); };

  return (
    <>
    {/* Sits above the nav on every page that has one, so a plan about to lapse
        is seen before the writer starts work rather than when a paid feature
        suddenly 403s. */}
    <PlanNotice />
    <header className="flex-none flex items-center gap-9 px-8 md:px-14 pt-6 pb-5">
      <Link to="/dashboard" className="wordmark text-[15px] shrink-0">BAAKHAPAA</Link>

      <nav className="flex gap-7 text-[13px] ml-3">
        {items.map((it) => {
          const isActive = it.label === active;
          const cls = `pb-[3px] transition-colors ${
            isActive
              ? "text-ink border-b border-gold"
              : "text-inkMuted hover:text-inkSoft"
          }`;
          return <Link key={it.label} to={it.to} className={cls}>{it.label}</Link>;
        })}
      </nav>

      <div className="ml-auto flex items-center gap-6">
        {right || (
          <>
            <button
              onClick={() => window.dispatchEvent(new Event("open-command-palette"))}
              className="text-[12.5px] text-inkMuted hover:text-inkSoft transition-colors"
              title="Search — ⌘K"
            >
              ⌘K Search
            </button>
            <button
              onClick={() => navigate("/projects/new")}
              className="text-[13px] font-semibold text-bgDeep bg-ink hover:bg-gold px-[18px] py-2 rounded-full transition-colors"
            >
              New project
            </button>

            {/* Account menu — a single click opens the dropdown, it no longer
                logs you out directly. */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                title={user?.name || "Account"}
                className={`w-[30px] h-[30px] rounded-full border flex items-center justify-center text-[11px] text-inkSoft transition-colors ${
                  menuOpen ? "bg-goldDim border-gold/40" : "bg-elevated border-border hover:bg-goldDim"
                }`}
              >
                {initials}
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-56 bg-surface border border-border rounded-xl shadow-2xl overflow-hidden z-50 animate-fade-up"
                >
                  <div className="px-4 py-3 border-b border-borderSoft">
                    <div className="text-[13px] text-ink truncate">{user?.name || "Guest"}</div>
                    <div className="text-[11.5px] text-inkMuted truncate">{user?.email}</div>
                    <div className="mt-1 text-[10px] font-mono uppercase tracking-wider text-gold">
                      {(user?.subscription_tier || "free")} plan
                    </div>
                  </div>
                  <button
                    role="menuitem"
                    onClick={() => go("/settings")}
                    className="w-full text-left px-4 py-2.5 text-[13px] text-inkSoft hover:bg-white/[0.03] hover:text-ink transition-colors"
                  >
                    Settings
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => go("/pricing")}
                    className="w-full text-left px-4 py-2.5 text-[13px] text-inkSoft hover:bg-white/[0.03] hover:text-ink transition-colors"
                  >
                    Pricing & plan
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => { setMenuOpen(false); logout(); }}
                    className="w-full text-left px-4 py-2.5 text-[13px] text-red-400 hover:bg-red-500/10 transition-colors border-t border-borderSoft"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </header>
    </>
  );
}
