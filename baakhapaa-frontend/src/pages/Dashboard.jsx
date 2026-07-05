import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import ProjectCard from "../components/ProjectCard";
import { projects } from "../services/api";
import { useAuth } from "../context/AuthContext";

function Stat({ label, value }) {
  return (
    <div className="bg-surface border border-borderSoft rounded-xl px-5 py-4">
      <div className="font-display text-3xl text-ink leading-none">{value}</div>
      <div className="text-inkMuted text-[11px] tracking-[0.14em] uppercase mt-2">{label}</div>
    </div>
  );
}

export default function Dashboard() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    projects
      .getAll()
      .then((res) => setList(res.data))
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  }, []);

  const stats = {
    total: list.length,
    drafts: list.filter((p) => p.status === "draft").length,
    finalized: list.filter((p) => p.status === "finalized").length,
  };

  return (
    <div className="cine-bg min-h-screen">
      <Sidebar />
      <main className="ml-64 px-10 py-9 max-w-6xl">
        {/* Header */}
        <div className="flex justify-between items-end mb-9 animate-fade-up">
          <div>
            <p className="text-inkMuted text-xs tracking-[0.2em] uppercase mb-2">
              Studio Dashboard
            </p>
            <h1 className="font-display text-4xl text-ink">
              Welcome back, {user?.name?.split(" ")[0] || "filmmaker"}
            </h1>
          </div>
          <button onClick={() => navigate("/projects/new")} className="btn-gold flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
            New Project
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-10 animate-fade-up">
          <Stat label="Projects" value={stats.total} />
          <Stat label="In Draft" value={stats.drafts} />
          <Stat label="Finalized" value={stats.finalized} />
        </div>

        {/* Projects */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-ink text-sm tracking-[0.14em] uppercase">Your Projects</h2>
          <div className="flex-1 ml-5 h-px bg-borderSoft" />
        </div>

        {loading ? (
          <div className="grid grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-52 rounded-2xl bg-surface border border-borderSoft animate-pulse" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-border rounded-2xl">
            <div className="w-14 h-14 rounded-2xl bg-goldDim flex items-center justify-center mx-auto mb-5">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#D4A843" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v16H4zM4 9h16M9 9v11"/></svg>
            </div>
            <p className="text-ink text-lg font-display mb-1">No projects yet</p>
            <p className="text-inkMuted text-sm mb-6">Start your first screenplay and let the studio do the heavy lifting.</p>
            <button onClick={() => navigate("/projects/new")} className="btn-gold">
              Create Your First Project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {list.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
