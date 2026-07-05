import React from "react";
import { useNavigate } from "react-router-dom";

const statusColors = {
  draft: "bg-gray-600",
  in_progress: "bg-blue-600",
  finalized: "bg-green-600",
};

export default function ProjectCard({ project }) {
  const navigate = useNavigate();
  return (
    <div
      onClick={() => navigate(`/projects/${project.id}/editor`)}
      className="bg-surface border border-border rounded-xl p-4 cursor-pointer hover:border-gold transition"
    >
      <div className="flex justify-between items-start mb-2">
        <h3 className="text-white font-semibold">{project.title}</h3>
        <span className={`text-xs px-2 py-1 rounded-full ${statusColors[project.status] || "bg-gray-600"}`}>
          {project.status}
        </span>
      </div>
      <div className="flex gap-2 mb-2">
        <span className="text-xs border border-gold text-gold px-2 py-0.5 rounded-full">{project.genre}</span>
        <span className="text-xs border border-border text-gray-400 px-2 py-0.5 rounded-full">{project.language}</span>
      </div>
      <p className="text-xs text-gray-500">{project.duration_minutes} minutes</p>
    </div>
  );
}
