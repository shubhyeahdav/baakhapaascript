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
//
// The tile is a div rather than a button because it now holds a second control:
// a button cannot legally contain another button, and the delete affordance has
// to sit on top of the open target rather than inside it.
function ProjectTile({ project, span, big, onOpen, opening, onDelete, deleting, confirming, onConfirm, onCancel }) {
  return (
    <div
      style={{ background: poster(project.genre) }}
      className={`group relative overflow-hidden rounded-2xl border border-borderSoft
                  hover:border-gold/40 transition-colors ${deleting ? "opacity-50" : ""} ${span}`}
    >
      <button
        onClick={() => onOpen(project.id)}
        disabled={opening || deleting}
        aria-label={`Open ${project.title}`}
        className="absolute inset-0 w-full h-full text-left flex flex-col justify-end disabled:opacity-60"
      >
      {/* ghost genre wordmark */}
      <span className="pointer-events-none absolute top-4 left-5 font-display text-ink/[0.07] group-hover:text-gold/15 transition-colors"
        style={{ fontSize: big ? 64 : 34, lineHeight: 1 }}>
        {project.genre}
      </span>

      <div className="relative w-full p-5 bg-gradient-to-t from-black/50 to-transparent">
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

      {/* Status + delete, above the open target.
          Deleting a project takes its script, scenes, storyboard frames and
          version history with it, so it confirms in place rather than firing on
          a single click near the corner of a tile someone meant to open. */}
      <div className="absolute top-4 right-4 flex items-center gap-1.5">
        {!confirming && (
          <span className="text-[10px] uppercase tracking-wider text-inkSoft border border-border rounded-full px-2.5 py-0.5 backdrop-blur-sm">
            {statusLabel[project.status] || project.status}
          </span>
        )}
        {confirming ? (
          <>
            <button
              onClick={() => onDelete(project)}
              disabled={deleting}
              className="text-[10px] uppercase tracking-wider rounded-full px-2.5 py-0.5 border border-red-400/40 bg-red-500/20 text-red-200 hover:bg-red-500/30 backdrop-blur-sm"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
            <button
              onClick={onCancel}
              className="text-[10px] uppercase tracking-wider rounded-full px-2.5 py-0.5 border border-border text-inkSoft hover:text-ink backdrop-blur-sm"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            onClick={onConfirm}
            title={`Delete ${project.title}`}
            aria-label={`Delete ${project.title}`}
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition rounded-full p-1.5 border border-border text-inkMuted hover:text-red-300 hover:border-red-400/40 backdrop-blur-sm"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
          </button>
        )}
      </div>
    </div>
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
  const [deleting, setDeleting] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [error, setError] = useState("");
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

  /**
   * Delete a project.
   *
   * `DELETE /projects/{id}` has existed since the first CRUD pass and nothing
   * ever called it. On the free plan that mattered more than it looks: the
   * allowance is one project, so a writer whose first attempt was a false start
   * had no way to begin a second one — the tool was a single use until they
   * paid, which is not what the free tier is for.
   */
  const remove = async (project) => {
    setDeleting(project.id);
    setError("");
    try {
      await projects.delete(project.id);
      setList((prev) => prev.filter((p) => p.id !== project.id));
      setConfirming(null);
    } catch (err) {
      setError(err.response?.data?.detail || `Could not delete "${project.title}".`);
    } finally {
      setDeleting(null);
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

      {error && (
        <div className="mx-8 md:mx-14 mt-4 rounded-xl border border-red-400/25 bg-red-400/10 px-4 py-2.5 flex items-start gap-3">
          <p className="text-[12px] text-red-300 leading-snug flex-1">{error}</p>
          <button onClick={() => setError("")} className="text-[11px] text-red-300/70 hover:text-red-200 shrink-0">
            Dismiss
          </button>
        </div>
      )}

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
              onDelete={remove} deleting={deleting === sorted[0].id}
              confirming={confirming === sorted[0].id}
              onConfirm={() => setConfirming(sorted[0].id)}
              onCancel={() => setConfirming(null)}
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
                onDelete={remove}
                deleting={deleting === p.id}
                confirming={confirming === p.id}
                onConfirm={() => setConfirming(p.id)}
                onCancel={() => setConfirming(null)}
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
