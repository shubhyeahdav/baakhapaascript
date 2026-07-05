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
    <div className="cine-bg min-h-screen">
      <Sidebar />
      <div className="ml-64 px-10 py-9 max-w-2xl animate-fade-up">
        {/* Header */}
        <div className="mb-8">
          <p className="text-inkMuted text-xs tracking-[0.2em] uppercase mb-2">
            Create Project
          </p>
          <h1 className="font-display text-4xl text-ink">
            New Project
          </h1>
        </div>

        {/* Card Form */}
        <div className="bg-surface border border-borderSoft p-8 rounded-2xl shadow-card">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="field-label">Project Title</label>
              <input
                placeholder="e.g. Seto Bagh"
                className="field"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="field-label">Genre</label>
                <div className="relative">
                  <select
                    className="field appearance-none pr-10"
                    value={form.genre}
                    onChange={(e) => setForm({ ...form, genre: e.target.value })}
                  >
                    {GENRES.map((g) => <option key={g} className="bg-bg">{g}</option>)}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-inkMuted">
                    <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                  </div>
                </div>
              </div>

              <div>
                <label className="field-label">Tone</label>
                <div className="relative">
                  <select
                    className="field appearance-none pr-10"
                    value={form.tone}
                    onChange={(e) => setForm({ ...form, tone: e.target.value })}
                  >
                    {TONES.map((t) => <option key={t} className="bg-bg">{t}</option>)}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-inkMuted">
                    <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className="field-label">Target Audience</label>
              <div className="relative">
                <select
                  className="field appearance-none pr-10"
                  value={form.target_audience}
                  onChange={(e) => setForm({ ...form, target_audience: e.target.value })}
                >
                  {AUDIENCES.map((a) => <option key={a} className="bg-bg">{a}</option>)}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-inkMuted">
                  <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                </div>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-inkMuted">Duration</label>
                <span className="text-sm font-semibold text-gold">{form.duration_minutes} minutes</span>
              </div>
              <input
                type="range"
                min="1"
                max="120"
                value={form.duration_minutes}
                className="custom-slider w-full my-2"
                onChange={(e) => setForm({ ...form, duration_minutes: parseInt(e.target.value) })}
              />
            </div>

            <div>
              <label className="field-label mb-3">Language</label>
              <div className="flex gap-2">
                {["English", "Nepali", "Bilingual"].map((lang) => (
                  <button
                    type="button"
                    key={lang}
                    onClick={() => setForm({ ...form, language: lang })}
                    className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition flex-1 border ${
                      form.language === lang
                        ? "bg-goldDim border-gold text-gold"
                        : "bg-surface border-border text-inkMuted hover:text-ink hover:border-border/30"
                    }`}
                  >
                    {lang}
                  </button>
                ))}
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-gold w-full py-3.5 mt-4">
              {loading ? "Generating Project Structure..." : "Generate Project Structure"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
