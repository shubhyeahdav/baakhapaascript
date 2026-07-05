import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import ProjectCard from "../components/ProjectCard";
import { projects } from "../services/api";
import { useAuth } from "../context/AuthContext";

export default function Dashboard() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    projects
      .getAll()
      .then((res) => setList(res.data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="bg-bg min-h-screen">
      <Sidebar />
      <div className="ml-60 p-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl text-white font-semibold">Welcome back, {user?.name}</h1>
          <button onClick={() => navigate("/projects/new")} className="btn-gold">
            + New Project
          </button>
        </div>

        {loading ? (
          <div className="text-gray-500">Loading projects...</div>
        ) : list.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-500 mb-4">No projects yet</p>
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
      </div>
    </div>
  );
}
