import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import TopNav from "../components/TopNav";
import { projects, scripts } from "../services/api";
import { useAuth } from "../context/AuthContext";

// Relative "last edited" label from an ISO timestamp.
function relTime(iso) {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "yesterday";
  if (d < 7) return `${d}d ago`;
  return `${Math.floor(d / 7)}w ago`;
}

// Kathmandu wall-clock (UTC+5:45) for the footer ledger line.
function nptClock() {
  const utc = Date.now() + new Date().getTimezoneOffset() * 60000;
  const npt = new Date(utc + (5 * 60 + 45) * 60000);
  return npt.toTimeString().slice(0, 5);
}

const statusText = (s) =>
  s === "finalized" ? "FINAL" : s === "in_progress" ? "ACT II" : "DRAFT";

export default function Dashboard() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(null);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    projects
      .getAll()
      .then((res) => setList(res.data))
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  }, []);

  // The editor route takes a SCRIPT id — resolve (or create) the project's
  // script first (same path ProjectCard used).
  const open = async (projectId) => {
    if (opening) return;
    setOpening(projectId);
    try {
      const res = await scripts.getByProject(projectId);
      navigate(`/projects/${res.data.id}/editor`);
    } catch (err) {
      alert(err.response?.data?.detail || "Could not open this project.");
      setOpening(null);
    }
  };

  // "Continue" hero = most recent still-open project; fall back to newest.
  const sorted = [...list].sort(
    (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
  );
  const hero = sorted.find((p) => p.status !== "finalized") || sorted[0];
  const totalMin = list.reduce((n, p) => n + (p.duration_minutes || 0), 0);

  return (
    <div className="cine-bg min-h-screen flex flex-col text-ink">
      <TopNav active="Projects" />

      {loading ? (
        <div className="flex-1 px-8 md:px-14 pt-16">
          <div className="h-24 w-2/3 bg-elevated/50 rounded animate-pulse mb-10" />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 border-b border-borderSoft animate-pulse" />
          ))}
        </div>
      ) : list.length === 0 ? (
        /* Editorial empty state — no card, type carries it */
        <div className="flex-1 flex flex-col justify-center px-8 md:px-14 animate-fade-up">
          <p className="font-mono text-[11px] tracking-[0.14em] text-inkMuted mb-5">
            NO PROJECTS YET
          </p>
          <h1 className="font-display text-6xl md:text-7xl leading-[0.98] text-ink mb-6 max-w-3xl">
            Every story starts<br />on a blank page.
          </h1>
          <p className="text-inkSoft text-[15px] max-w-md mb-8">
            Give the studio a genre, a tone, and a runtime — it returns a
            three-act structure you can write straight into.
          </p>
          <button
            onClick={() => navigate("/projects/new")}
            className="btn-gold self-start"
          >
            Start your first story →
          </button>
        </div>
      ) : (
        <>
          {/* Continue hero */}
          {hero && (
            <div className="flex-none px-8 md:px-14 pt-10 pb-9 border-b border-border animate-fade-up">
              <div className="flex flex-wrap items-baseline gap-4 font-mono text-[11px] tracking-[0.14em] text-inkMuted mb-4">
                <span>CONTINUE</span>
                <span className="text-gold">{hero.genre?.toUpperCase()} · {hero.language?.toUpperCase()}</span>
                <span>LAST OPENED {relTime(hero.created_at).toUpperCase()}</span>
              </div>
              <div className="flex flex-wrap items-end gap-10">
                <h1 className="font-display font-medium text-5xl md:text-[84px] leading-[0.98] tracking-tight text-ink">
                  {hero.title}
                </h1>
                <div className="flex flex-col gap-3 pb-2">
                  <p className="text-[13.5px] text-inkSoft leading-relaxed max-w-xs">
                    {hero.genre} · {hero.language} · {hero.duration_minutes} min<br />
                    {hero.tone} · {statusText(hero.status).replace("_", " ")}
                  </p>
                  <button
                    onClick={() => open(hero.id)}
                    disabled={opening === hero.id}
                    className="font-display italic text-lg text-gold border-b border-gold/40 self-start pb-0.5 hover:border-gold transition-colors disabled:opacity-50"
                  >
                    {opening === hero.id ? "Opening…" : "Continue writing →"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Project index */}
          <div className="flex-1 min-h-0 flex flex-col px-8 md:px-14">
            <div className="flex items-baseline justify-between py-5">
              <span className="font-mono text-[11px] tracking-[0.14em] text-inkMuted">
                INDEX — ALL PROJECTS ({list.length})
              </span>
              <span className="font-mono text-[11px] tracking-[0.14em] text-inkMuted">
                SORTED BY LAST EDITED
              </span>
            </div>

            {sorted.map((p, i) => (
              <button
                key={p.id}
                onClick={() => open(p.id)}
                disabled={opening === p.id}
                className="group flex items-baseline gap-8 py-[18px] border-b border-borderSoft text-left hover:bg-white/[0.02] transition-colors disabled:opacity-60"
              >
                <span className="font-mono text-xs text-gold w-8 flex-none">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="font-display text-2xl md:text-[28px] text-ink flex-1 min-w-0 truncate group-hover:text-gold transition-colors">
                  {p.title}
                </span>
                <span className="hidden sm:block text-[12.5px] text-inkMuted w-40 flex-none">
                  {p.genre} · {p.language}
                </span>
                <span className="hidden md:block font-mono text-xs text-inkSoft w-28 flex-none">
                  {statusText(p.status)} · {p.duration_minutes}:00
                </span>
                <span className="font-mono text-[11px] text-inkMuted w-20 flex-none text-right">
                  {opening === p.id ? "opening…" : relTime(p.created_at)}
                </span>
              </button>
            ))}

            {/* Start-new row */}
            <button
              onClick={() => navigate("/projects/new")}
              className="flex items-baseline gap-8 py-[18px] text-left hover:opacity-100 opacity-80 transition"
            >
              <span className="font-mono text-xs text-inkMuted w-8 flex-none">
                {String(sorted.length + 1).padStart(2, "0")}
              </span>
              <span className="font-display italic text-2xl md:text-[28px] text-inkMuted flex-1">
                Start a new story…
              </span>
            </button>
          </div>

          {/* Ledger footer */}
          <div className="flex-none flex justify-between px-8 md:px-14 py-5 border-t border-border font-mono text-[10.5px] tracking-[0.12em] text-inkMuted/70">
            <span>KATHMANDU — {nptClock()} NPT</span>
            <span>{list.length} PROJECTS · {totalMin} MIN PLANNED</span>
            <span>{(user?.name || "Creator").toUpperCase()} — {(user?.subscription_tier || "free").toUpperCase()}</span>
          </div>
        </>
      )}
    </div>
  );
}
