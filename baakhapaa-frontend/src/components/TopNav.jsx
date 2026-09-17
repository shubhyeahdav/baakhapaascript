import React, { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import PlanNotice from "./PlanNotice";
import { useT, useLanguage, LANGUAGES } from "../i18n";

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
  const t = useT();
  const { lang, setLang } = useLanguage();
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

  // `label` stays English because `active` is matched against it; only the
  // rendered text is translated. Matching on a translated string would break
  // the highlight the moment somebody switched language.
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
    <header className="flex-none">
      {/* Sits above the nav on every page that has one, so a plan about to
          lapse is seen before the writer starts work rather than when a paid
          feature suddenly 403s.

          INSIDE the header, not beside it: a banner rendered as a sibling of
          every landmark is content belonging to no region, which is the axe
          `region` rule and, more to the point, content a screen-reader user
          cannot navigate to by region. It renders null on most sessions, so
          the violation only appeared for the users being warned. */}
      <PlanNotice />
      <div className="flex items-center gap-4 md:gap-9 px-4 md:px-8 lg:px-14 pt-4 md:pt-6 pb-4 md:pb-5">
      {/* 129px of a 375px viewport, for a link the "Projects" tab beside it
          already provides. It is the first thing to go on a phone: the bar's
          job there is navigation, and nothing becomes unreachable. */}
      <Link to="/dashboard" className="wordmark text-[15px] shrink-0 hidden md:block tap">
        BAAKHAPAA
      </Link>

      <nav className="flex gap-5 md:gap-7 text-[13px] md:ml-3">
        {items.map((it) => {
          const isActive = it.label === active;
          const cls = `pb-[3px] transition-colors tap ${
            isActive
              ? "text-ink border-b border-gold"
              : "text-inkMuted hover:text-inkSoft"
          }`;
          return <Link key={it.label} to={it.to} className={cls}>{t(it.label)}</Link>;
        })}
      </nav>

      <div className="ml-auto flex items-center gap-3 md:gap-6">
        {right || (
          <>
            {/* The label is a keyboard shortcut, and a phone has no ⌘K. The
                palette itself is not lost below md — it is the first thing in
                the account menu. */}
            <button
              onClick={() => window.dispatchEvent(new Event("open-command-palette"))}
              className="hidden md:block text-[12.5px] text-inkMuted hover:text-inkSoft transition-colors tap"
              title="Search — ⌘K"
            >
              ⌘K {t("Search")}
            </button>
            {/* Below md the label is a "+". It is the primary action and stays
                on the surface, but 76px of it is a word the icon already says
                on the one screen where the width is spent. */}
            <button
              onClick={() => navigate("/projects/new")}
              aria-label={t("New project")}
              title={t("New project")}
              className="text-[13px] font-semibold text-bgDeep bg-ink hover:bg-gold w-[30px] h-[30px] md:w-auto md:h-auto md:px-[18px] md:py-2 rounded-full transition-colors flex items-center justify-center"
            >
              <span aria-hidden="true" className="md:hidden text-[17px] leading-none">+</span>
              <span className="hidden md:inline">{t("New project")}</span>
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
                  {/* Language sits above the destinations because it changes
                      what they are called. A writer hunting for it is hunting
                      for the word in their own script, so the Nepali option is
                      labelled नेपाली rather than "Nepali". */}
                  <div className="flex gap-1 px-3 py-2.5 border-b border-borderSoft">
                    {LANGUAGES.map((l) => (
                      <button
                        key={l.code}
                        onClick={() => setLang(l.code)}
                        aria-pressed={lang === l.code}
                        className={`flex-1 text-[12px] py-1 rounded-md transition ${
                          lang === l.code
                            ? "bg-goldDim text-gold"
                            : "text-inkMuted hover:text-ink"
                        }`}
                      >
                        {l.label}
                      </button>
                    ))}
                  </div>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      window.dispatchEvent(new Event("open-command-palette"));
                    }}
                    className="md:hidden w-full text-left px-4 py-2.5 text-[13px] text-inkSoft hover:bg-white/[0.03] hover:text-ink transition-colors"
                  >
                    {t("Search")}
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => go("/settings")}
                    className="w-full text-left px-4 py-2.5 text-[13px] text-inkSoft hover:bg-white/[0.03] hover:text-ink transition-colors"
                  >
                    {t("Settings")}
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => go("/pricing")}
                    className="w-full text-left px-4 py-2.5 text-[13px] text-inkSoft hover:bg-white/[0.03] hover:text-ink transition-colors"
                  >
                    {t("Pricing & plan")}
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => { setMenuOpen(false); logout(); }}
                    className="w-full text-left px-4 py-2.5 text-[13px] text-red-400 hover:bg-red-500/10 transition-colors border-t border-borderSoft"
                  >
                    {t("Sign out")}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
      </div>
    </header>
    </>
  );
}
