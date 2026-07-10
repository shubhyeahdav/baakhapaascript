import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// Shared top navigation for the whole app shell — both the editorial (dashboard,
// wizard, exports) and utilitarian (editor, storyboard, structure) modes hang
// off this one bar. Gold is reserved for the active section only.
//
// `active` is one of: "Projects" | "Storyboards" | "Team" | "Exports".
// `right` optionally overrides the right-hand region (utilitarian screens pass
// their own dense toolbar); by default it shows the ⌘K hint + New project + avatar.
export default function TopNav({ active = "Projects", right }) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  // Only Projects is a real route today; the rest are placeholders the design
  // reserves in the bar. They render but don't navigate until their sections land.
  const items = [
    { label: "Projects", to: "/dashboard" },
    { label: "Storyboards", to: null },
    { label: "Team", to: null },
    { label: "Exports", to: null },
  ];

  const initials = (user?.name || "?")
    .split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
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
          return it.to ? (
            <Link key={it.label} to={it.to} className={cls}>{it.label}</Link>
          ) : (
            <span key={it.label} className={`${cls} cursor-default`} title="Coming soon">
              {it.label}
            </span>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center gap-6">
        {right || (
          <>
            <span className="text-[12.5px] text-inkMuted select-none" title="Command palette (coming soon)">
              ⌘K Search
            </span>
            <button
              onClick={() => navigate("/projects/new")}
              className="text-[13px] font-semibold text-bgDeep bg-ink hover:bg-gold px-[18px] py-2 rounded-full transition-colors"
            >
              New project
            </button>
            <button
              onClick={logout}
              title={`${user?.name || "Account"} — sign out`}
              className="w-[30px] h-[30px] rounded-full bg-elevated hover:bg-goldDim border border-border flex items-center justify-center text-[11px] text-inkSoft transition-colors"
            >
              {initials}
            </button>
          </>
        )}
      </div>
    </header>
  );
}
