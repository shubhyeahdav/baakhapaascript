import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import { projects, scripts } from "../services/api";

const GENRES = ["Drama", "Romance", "Thriller", "Comedy", "Action", "Horror", "Documentary", "Social Issue"];
const TONES = ["Emotional", "Dark", "Lighthearted", "Tense", "Inspirational", "Melancholic"];
const AUDIENCES = ["Youth", "General", "Mature", "Children"];

export default function NewProject() {
  const [form, setForm] = useState({
    title: "", genre: "Drama", tone: "Emotional", target_audience: "Youth",
    duration_minutes: 15, language: "English",
  });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const projectRes = await projects.create(form);
      const projectId = projectRes.data.id;
      const structureRes = await scripts.generateStructure(form, projectId);
      navigate(`/projects/${structureRes.data.script_id}/editor`);
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to create project. Check your API keys.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-bg min-h-screen">
      <Sidebar />
      <div className="ml-60 p-8 max-w-2xl">
        <h1 className="text-2xl text-white font-semibold mb-6">New Project</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input placeholder="Project title" className="input-dark" value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })} required />

          <select className="input-dark" value={form.genre} onChange={(e) => setForm({ ...form, genre: e.target.value })}>
            {GENRES.map((g) => <option key={g}>{g}</option>)}
          </select>

          <select className="input-dark" value={form.tone} onChange={(e) => setForm({ ...form, tone: e.target.value })}>
            {TONES.map((t) => <option key={t}>{t}</option>)}
          </select>

          <select className="input-dark" value={form.target_audience} onChange={(e) => setForm({ ...form, target_audience: e.target.value })}>
            {AUDIENCES.map((a) => <option key={a}>{a}</option>)}
          </select>

          <div>
            <label className="text-sm text-gray-400">Duration: {form.duration_minutes} minutes</label>
            <input type="range" min="1" max="120" value={form.duration_minutes} className="w-full"
              onChange={(e) => setForm({ ...form, duration_minutes: parseInt(e.target.value) })} />
          </div>

          <div className="flex gap-2">
            {["English", "Nepali", "Bilingual"].map((lang) => (
              <button type="button" key={lang}
                onClick={() => setForm({ ...form, language: lang })}
                className={`px-4 py-2 rounded-lg text-sm ${form.language === lang ? "bg-gold text-bg" : "bg-elevated text-gray-400"}`}>
                {lang}
              </button>
            ))}
          </div>

          <button type="submit" disabled={loading} className="btn-gold w-full">
            {loading ? "Generating Structure..." : "Generate Structure"}
          </button>
        </form>
      </div>
    </div>
  );
}
