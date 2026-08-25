import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import TopNav from "../components/TopNav";
import { projects, scripts } from "../services/api";

// Storyboards are per-project, so this is the index that gets you into one.
// Same editorial index-row language as the dashboard.
export default function StoryboardsPage() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    projects
      .getAll()
      .then((res) => setList(res.data))
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  }, []);

  // The storyboard route takes a SCRIPT id — resolve it from the project first.
  const open = async (projectId) => {
    if (opening) return;
    setOpening(projectId);
    try {
      const res = await scripts.getByProject(projectId);
      navigate(`/projects/${res.data.id}/storyboard`);
    } catch (err) {
      alert(err.response?.data?.detail || "Could not open this storyboard.");
      setOpening(null);
    }
  };

  return (
    <div className="cine-bg min-h-screen flex flex-col text-ink">
      <TopNav active="Projects" />

      <main className="flex-1 px-8 md:px-14 pb-14">
        <div className="py-8">
          <p className="font-mono text-[11px] tracking-[0.16em] text-inkMuted mb-2">STUDIO</p>
          <h1 className="font-display text-4xl md:text-5xl text-ink">Storyboards</h1>
        </div>

        {loading ? (
          <div className="space-y-px">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 bg-elevated/30 animate-pulse" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-start justify-center min-h-[40vh] animate-fade-up">
            <p className="font-mono text-[11px] tracking-[0.14em] text-inkMuted mb-5">NOTHING TO BOARD YET</p>
            <h2 className="font-display text-4xl md:text-5xl leading-[1] text-ink mb-6 max-w-2xl">
              Storyboards start<br />with a script.
            </h2>
            <button onClick={() => navigate("/projects/new")} className="btn-gold">
              Start a project →
            </button>
          </div>
        ) : (
          <div className="animate-fade-up">
            <div className="flex items-baseline justify-between py-4">
              <span className="font-mono text-[11px] tracking-[0.14em] text-inkMuted">
                ALL PROJECTS ({list.length})
              </span>
              <span className="font-mono text-[11px] tracking-[0.14em] text-inkMuted">
                OPEN TO GENERATE FRAMES
              </span>
            </div>
            {list.map((p, i) => (
              <button
                key={p.id}
                onClick={() => open(p.id)}
                disabled={opening === p.id}
                className="group w-full flex items-baseline gap-6 py-[18px] border-b border-borderSoft text-left hover:bg-white/[0.02] transition-colors disabled:opacity-60"
              >
                <span className="font-mono text-xs text-gold w-8 flex-none">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="font-display text-xl md:text-2xl text-ink flex-1 min-w-0 truncate group-hover:text-gold transition-colors">
                  {p.title}
                </span>
                <span className="hidden sm:block text-[12.5px] text-inkMuted w-40 flex-none">
                  {p.genre} · {p.language}
                </span>
                <span className="font-mono text-[11px] text-inkMuted w-24 flex-none text-right">
                  {opening === p.id ? "opening…" : "Storyboard →"}
                </span>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
