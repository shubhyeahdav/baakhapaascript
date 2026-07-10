import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import TopNav from "../components/TopNav";
import { projects, scripts } from "../services/api";
import { useAuth } from "../context/AuthContext";

// Deterministic warm poster gradient per genre (kept on-theme: sepia/bronze,
// never bright gold — gold stays reserved for actions/active).
const GENRE_POSTER = {
  Drama: "linear-gradient(145deg,#2a2320,#0e0c0a)",
  Romance: "linear-gradient(145deg,#2e1f22,#0e0c0a)",
  Thriller: "linear-gradient(145deg,#1e2428,#0e0c0a)",
  Comedy: "linear-gradient(145deg,#2b2818,#0e0c0a)",
  Action: "linear-gradient(145deg,#2d2119,#0e0c0a)",
  Horror: "linear-gradient(145deg,#241a1a,#0e0c0a)",
  Documentary: "linear-gradient(145deg,#22261f,#0e0c0a)",
  "Social Issue": "linear-gradient(145deg,#26221c,#0e0c0a)",
};
const poster = (genre) => GENRE_POSTER[genre] || "linear-gradient(145deg,#26231e,#0e0c0a)";

const statusLabel = {
  draft: "Draft",
  in_progress: "In Progress",
  finalized: "Final",
};

function relTime(iso) {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : d < 7 ? `${d}d ago` : `${Math.floor(d / 7)}w ago`;
}

// A single poster tile in the bento grid.
function ProjectTile({ project, span, big, onOpen, opening }) {
  return (
    <button
      onClick={() => onOpen(project.id)}
      disabled={opening}
      style={{ background: poster(project.genre) }}
      className={`group relative overflow-hidden rounded-2xl border border-borderSoft text-left flex flex-col justify-end
                  hover:border-gold/40 transition-colors disabled:opacity-60 ${span}`}
    >
      {/* ghost genre wordmark */}
      <span className="pointer-events-none absolute top-4 left-5 font-display text-ink/[0.07] group-hover:text-gold/15 transition-colors"
        style={{ fontSize: big ? 64 : 34, lineHeight: 1 }}>
        {project.genre}
      </span>
      <span className="absolute top-4 right-4 text-[10px] uppercase tracking-wider text-inkSoft border border-border rounded-full px-2.5 py-0.5 backdrop-blur-sm">
        {statusLabel[project.status] || project.status}
      </span>

      <div className="relative p-5 bg-gradient-to-t from-black/50 to-transparent">
        <h3 className={`font-display text-ink group-hover:text-gold transition-colors truncate ${big ? "text-3xl mb-2" : "text-lg mb-1"}`}>
          {project.title}
        </h3>
        <div className="flex items-center gap-2 text-[12px] text-inkMuted">
          <span>{project.genre} · {project.language}</span>
          <span className="w-1 h-1 rounded-full bg-inkMuted/50" />
          <span>{project.duration_minutes} min</span>
          {big && <span className="ml-auto font-mono text-[11px] text-inkMuted">{relTime(project.created_at)}</span>}
        </div>
        {big && (
          <span className="inline-flex items-center gap-1.5 mt-4 text-sm font-medium text-gold opacity-0 group-hover:opacity-100 transition">
            Continue writing
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </span>
        )}
      </div>
    </button>
  );
}

function StatTile({ label, value }) {
  return (
    <div className="rounded-2xl border border-borderSoft bg-surface flex flex-col justify-center px-6">
      <div className="font-display text-4xl text-ink leading-none">{value}</div>
      <div className="text-inkMuted text-[11px] tracking-[0.14em] uppercase mt-2">{label}</div>
    </div>
  );
}

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

  const sorted = [...list].sort(
    (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
  );
  const stats = {
    total: list.length,
    drafts: list.filter((p) => p.status !== "finalized").length,
    finalized: list.filter((p) => p.status === "finalized").length,
  };

  return (
    <div className="cine-bg min-h-screen flex flex-col text-ink">
      <TopNav active="Projects" />

      <main className="flex-1 px-8 md:px-14 pb-14">
        {/* Heading */}
        <div className="flex flex-wrap items-end justify-between gap-4 py-8 animate-fade-up">
          <div>
            <p className="font-mono text-[11px] tracking-[0.16em] text-inkMuted mb-2">STUDIO</p>
            <h1 className="font-display text-4xl md:text-5xl text-ink">
              Welcome back, {user?.name?.split(" ")[0] || "filmmaker"}
            </h1>
          </div>
          <button onClick={() => navigate("/projects/new")} className="btn-gold flex items-center gap-2">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
            New Project
          </button>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 auto-rows-[190px] gap-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className={`rounded-2xl bg-surface border border-borderSoft animate-pulse ${i === 0 ? "col-span-2 row-span-2" : ""}`} />
            ))}
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-start justify-center min-h-[50vh] animate-fade-up">
            <p className="font-mono text-[11px] tracking-[0.14em] text-inkMuted mb-5">NO PROJECTS YET</p>
            <h2 className="font-display text-5xl md:text-6xl leading-[0.98] text-ink mb-6 max-w-2xl">
              Every story starts<br />on a blank page.
            </h2>
            <p className="text-inkSoft text-[15px] max-w-md mb-8">
              Give the studio a genre, a tone, and a runtime — it returns a
              three-act structure you can write straight into.
            </p>
            <button onClick={() => navigate("/projects/new")} className="btn-gold">
              Start your first story →
            </button>
          </div>
        ) : (
          /* Bento grid */
          <div className="grid grid-cols-2 md:grid-cols-4 auto-rows-[190px] gap-4 animate-fade-up">
            {/* Hero = most recent, spans 2x2 */}
            <ProjectTile
              project={sorted[0]} big span="col-span-2 row-span-2"
              onOpen={open} opening={opening === sorted[0].id}
            />

            {/* Two stat tiles beside the hero */}
            <StatTile label="Projects" value={stats.total} />
            <StatTile label="Finalized" value={stats.finalized} />

            {/* Remaining projects — every 3rd one goes wide for rhythm */}
            {sorted.slice(1).map((p, i) => (
              <ProjectTile
                key={p.id}
                project={p}
                span={i % 3 === 2 ? "col-span-2" : "col-span-1"}
                onOpen={open}
                opening={opening === p.id}
              />
            ))}

            {/* New-project tile */}
            <button
              onClick={() => navigate("/projects/new")}
              className="rounded-2xl border border-dashed border-border flex flex-col items-center justify-center gap-3 text-inkMuted hover:text-gold hover:border-gold/40 transition-colors"
            >
              <span className="w-11 h-11 rounded-full bg-goldDim flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
              </span>
              <span className="text-sm">New project</span>
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
