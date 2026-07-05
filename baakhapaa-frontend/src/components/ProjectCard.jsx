import React from "react";
import { useNavigate } from "react-router-dom";

const statusStyle = {
  draft: "text-inkMuted border-border bg-bgDeep/40",
  in_progress: "text-skyAccent border-skyAccent/30 bg-skyDim",
  finalized: "text-emerald-400 border-emerald-500/20 bg-emerald-500/10",
};

const statusLabel = {
  draft: "Draft",
  in_progress: "In Progress",
  finalized: "Finalized",
};

export default function ProjectCard({ project }) {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate(`/projects/${project.id}/editor`)}
      className="group text-left bg-surface border border-borderSoft rounded-2xl overflow-hidden shadow-card
                 hover:border-gold/40 hover:-translate-y-1 transition-all duration-300 flex flex-col h-full"
    >
      {/* Poster strip */}
      <div className="relative h-24 w-full overflow-hidden shrink-0">
        <div className="absolute inset-0 cine-bg group-hover:scale-110 transition-transform duration-700" />
        <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/40 to-transparent" />
        <span className="absolute top-3 left-4 font-display text-2xl text-ink/10 group-hover:text-gold/20 transition duration-300">
          {project.genre}
        </span>
        <span
          className={`absolute top-3 right-3 text-[11px] font-medium px-2.5 py-1 rounded-full border backdrop-blur-sm transition duration-300 ${
            statusStyle[project.status] || statusStyle.draft
          }`}
        >
          {statusLabel[project.status] || project.status}
        </span>
      </div>

      <div className="p-5 flex-1 flex flex-col justify-between">
        <div>
          <h3 className="text-ink font-semibold text-[15px] mb-3 group-hover:text-gold transition-colors duration-300 truncate">
            {project.title}
          </h3>
          <div className="flex flex-wrap gap-1.5 mb-5">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-gold border border-gold/20 bg-goldDim px-2.5 py-0.5 rounded-full">
              {project.genre}
            </span>
            {project.tone && (
              <span className="text-[10px] uppercase tracking-wider font-semibold text-inkMuted border border-border px-2.5 py-0.5 rounded-full">
                {project.tone}
              </span>
            )}
            <span className="text-[10px] uppercase tracking-wider font-semibold text-inkMuted border border-border px-2.5 py-0.5 rounded-full">
              {project.language}
            </span>
          </div>
        </div>
        
        <div className="flex items-center justify-between text-inkMuted text-xs pt-3 border-t border-borderSoft">
          <span className="flex items-center gap-1">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            {project.duration_minutes} min
          </span>
          <span className="text-gold opacity-0 group-hover:opacity-100 transition duration-300 flex items-center gap-1 font-medium">
            Open
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </span>
        </div>
      </div>
    </button>
  );
}
