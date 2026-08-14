import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import { projects, scripts } from "../services/api";
import { useAuth } from "../context/AuthContext";

// Suggestions, not constraints. Every one of these fields is free text on the
// server because they feed prompts and retrieval — a project that is a Nepali
// social-realist docudrama should not have to be filed as "Drama" because that
// is the least wrong item on someone else's list.
const GENRES = ["Drama", "Romance", "Thriller", "Comedy", "Action", "Horror",
                "Documentary", "Social Issue", "Coming of Age", "Family", "Mystery", "Musical"];
const TONES = ["Emotional", "Dark", "Lighthearted", "Tense", "Inspirational",
               "Melancholic", "Satirical", "Warm", "Bittersweet", "Absurd"];
const AUDIENCES = ["Youth", "General", "Mature", "Children", "Family", "Festival"];

const FORMATS = [
  // Short-form is measured in SECONDS and has its own beat spine — it is not
  // a very short film, and running it through a three-act split would produce
  // advice about act breaks for a 30-second video.
  { key: "short_form", label: "Short-form", blurb: "Reel / vertical, 15–90s", typical: 45, max: 180, unit: "s" },
  { key: "short", label: "Short Film", blurb: "One sitting, one idea", typical: 12, max: 40, unit: "min" },
  { key: "film", label: "Feature Film", blurb: "Full-length, three acts", typical: 100, max: 600, unit: "min" },
  { key: "web_series", label: "Web Series", blurb: "Episodes with a through-line", typical: 22, max: 120, unit: "min" },
];

const HARD_MAX_MINUTES = 600; // mirrors models.MAX_DURATION_MINUTES
const HARD_MAX_SECONDS = 180; // mirrors models.MAX_DURATION_SECONDS

// The single highest-leverage choice in short-form: it decides whether
// anything after it gets seen. Pick one and commit.
const HOOK_TYPES = [
  { key: "relatable_pain", label: "Relatable pain", blurb: "Name a frustration they own" },
  { key: "curiosity_gap", label: "Curiosity gap", blurb: "Promise a payoff, withhold its shape" },
  { key: "bold_claim", label: "Bold claim", blurb: "State something contestable as fact" },
  { key: "visual_shock", label: "Visual shock", blurb: "Lead with the image" },
  { key: "pattern_interrupt", label: "Pattern interrupt", blurb: "Break the expected rhythm" },
  { key: "question", label: "Question", blurb: "Ask the gap directly" },
];

const SHORT_FORM_CATEGORIES = [
  { key: "storytime", label: "Storytime" },
  { key: "educational", label: "Educational" },
  { key: "transformation", label: "Transformation" },
  { key: "comedy_skit", label: "Comedy skit" },
];

// A combobox: type anything, or pick a suggestion. `list` gives the native
// dropdown without locking the value the way <select> does.
function ComboField({ label, value, options, onChange, placeholder, listId }) {
  return (
    <div>
      <label className="field-label">{label}</label>
      <input
        className="field"
        list={listId}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        maxLength={60}
        required
      />
      <datalist id={listId}>
        {options.map((o) => <option key={o} value={o} />)}
      </datalist>
    </div>
  );
}

export default function NewProject() {
  const { user } = useAuth();
  const prefs = user?.preferences;

  const initialFormat = FORMATS.find((f) => f.key === prefs?.format) || FORMATS[0];

  // Onboarding already asked these. Asking again is the kind of friction that
  // makes a wizard feel long, so the answers arrive pre-filled and editable.
  const [form, setForm] = useState({
    title: "",
    genre: prefs?.genre || "Drama",
    tone: prefs?.tone || "Emotional",
    target_audience: "Youth",
    duration_minutes: initialFormat.typical,
    language: prefs?.language || "English",
    format: initialFormat.key,
    episode_count: 6,
    duration_seconds: 45,
    hook_type: "relatable_pain",
    short_form_category: "storytime",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const activeFormat = FORMATS.find((f) => f.key === form.format) || FORMATS[0];
  const isSeries = form.format === "web_series";
  const isShortForm = form.format === "short_form";

  // Switching format retunes the duration to that format's typical runtime,
  // but only when the current value is still the previous format's default —
  // never overwrite a number the writer chose themselves.
  const pickFormat = (fmt) => {
    if (fmt.key === "short_form") return set({ format: fmt.key });
    const wasDefault = FORMATS.some((f) => f.unit === "min" && f.typical === form.duration_minutes);
    set({
      format: fmt.key,
      duration_minutes: wasDefault ? fmt.typical : form.duration_minutes,
    });
  };

  const setSeconds = (raw) => {
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return set({ duration_seconds: "" });
    set({ duration_seconds: Math.min(Math.max(n, 5), HARD_MAX_SECONDS) });
  };

  const setDuration = (raw) => {
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return set({ duration_minutes: "" });
    set({ duration_minutes: Math.min(Math.max(n, 1), HARD_MAX_MINUTES) });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const payload = { ...form, duration_minutes: parseInt(form.duration_minutes, 10) || 1 };
      const projectRes = await projects.create(payload);
      const projectId = projectRes.data.id;
      const structureRes = await scripts.generateStructure(payload, projectId);
      navigate(`/projects/${structureRes.data.script_id}/editor`);
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(
        typeof detail === "string"
          ? detail
          : Array.isArray(detail)
            ? detail.map((d) => d.msg).join("; ")
            : "Could not create the project. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const totalRuntime = isSeries
    ? (parseInt(form.duration_minutes, 10) || 0) * (parseInt(form.episode_count, 10) || 0)
    : null;

  return (
    <div className="cine-bg min-h-screen">
      <Sidebar />
      <div className="ml-64 px-10 py-9 max-w-2xl animate-fade-up">
        <div className="mb-8">
          <p className="text-inkMuted text-xs tracking-[0.2em] uppercase mb-2">Create Project</p>
          <h1 className="font-display text-4xl text-ink">New Project</h1>
        </div>

        <div className="bg-surface border border-borderSoft p-8 rounded-2xl shadow-card">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="field-label">Project Title</label>
              <input
                placeholder="e.g. Seto Bagh"
                className="field"
                value={form.title}
                onChange={(e) => set({ title: e.target.value })}
                maxLength={200}
                required
              />
            </div>

            {/* Format drives beat grammar and how duration is read. */}
            <div>
              <label className="field-label mb-3">Format</label>
              <div className="grid grid-cols-2 gap-2">
                {FORMATS.map((f) => (
                  <button
                    type="button"
                    key={f.key}
                    onClick={() => pickFormat(f)}
                    className={`px-3 py-3 rounded-xl text-left border transition ${
                      form.format === f.key
                        ? "bg-goldDim border-gold text-gold"
                        : "bg-surface border-border text-inkMuted hover:text-ink"
                    }`}
                  >
                    <span className="block text-sm font-semibold">{f.label}</span>
                    <span className="block text-[11px] opacity-70 mt-0.5 leading-tight">{f.blurb}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <ComboField
                label="Genre" listId="genre-options" options={GENRES}
                value={form.genre} onChange={(v) => set({ genre: v })}
                placeholder="Pick one or type your own"
              />
              <ComboField
                label="Tone" listId="tone-options" options={TONES}
                value={form.tone} onChange={(v) => set({ tone: v })}
                placeholder="Pick one or type your own"
              />
            </div>

            <ComboField
              label="Target Audience" listId="audience-options" options={AUDIENCES}
              value={form.target_audience} onChange={(v) => set({ target_audience: v })}
              placeholder="Pick one or type your own"
            />

            {isShortForm ? (
              <>
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-inkMuted">
                      Runtime
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number" min="5" max={HARD_MAX_SECONDS}
                        value={form.duration_seconds}
                        onChange={(e) => setSeconds(e.target.value)}
                        className="w-20 bg-bg border border-border rounded-lg px-2 py-1 text-sm text-gold font-semibold text-right"
                        aria-label="Runtime in seconds"
                      />
                      <span className="text-sm text-inkMuted">sec</span>
                    </div>
                  </div>
                  <input
                    type="range" min="5" max="90"
                    value={Math.min(form.duration_seconds || 5, 90)}
                    className="custom-slider w-full my-2"
                    onChange={(e) => setSeconds(e.target.value)}
                  />
                  <p className="text-[11px] text-inkMuted">
                    The hook gets the first 3 seconds regardless of total length —
                    that's the window where a viewer decides to stay.
                  </p>
                </div>

                <div>
                  <label className="field-label mb-2">Category</label>
                  <div className="grid grid-cols-2 gap-2">
                    {SHORT_FORM_CATEGORIES.map((c) => (
                      <button
                        type="button" key={c.key}
                        onClick={() => set({ short_form_category: c.key })}
                        className={`px-3 py-2 rounded-xl text-sm font-semibold border transition ${
                          form.short_form_category === c.key
                            ? "bg-goldDim border-gold text-gold"
                            : "bg-surface border-border text-inkMuted hover:text-ink"
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="field-label mb-2">Hook</label>
                  <p className="text-[11px] text-inkMuted mb-2 -mt-1">
                    Pick one and commit. A hook trying to be two things is doing neither.
                  </p>
                  <div className="space-y-1.5">
                    {HOOK_TYPES.map((h) => (
                      <button
                        type="button" key={h.key}
                        onClick={() => set({ hook_type: h.key })}
                        className={`w-full px-3 py-2 rounded-xl text-left border transition ${
                          form.hook_type === h.key
                            ? "bg-goldDim border-gold text-gold"
                            : "bg-surface border-border text-inkMuted hover:text-ink"
                        }`}
                      >
                        <span className="block text-[13px] font-semibold">{h.label}</span>
                        <span className="block text-[11px] opacity-70 leading-tight">{h.blurb}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-inkMuted">
                  {isSeries ? "Runtime per episode" : "Runtime"}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max={HARD_MAX_MINUTES}
                    value={form.duration_minutes}
                    onChange={(e) => setDuration(e.target.value)}
                    className="w-20 bg-bg border border-border rounded-lg px-2 py-1 text-sm text-gold font-semibold text-right"
                    aria-label={isSeries ? "Minutes per episode" : "Runtime in minutes"}
                  />
                  <span className="text-sm text-inkMuted">min</span>
                </div>
              </div>
              {/* The slider covers the format's usual span for quick tuning; the
                  number field above it goes all the way to the real ceiling, so
                  a 3-hour epic is typeable even though dragging there is not. */}
              <input
                type="range"
                min="1"
                max={activeFormat.max}
                value={Math.min(form.duration_minutes || 1, activeFormat.max)}
                className="custom-slider w-full my-2"
                onChange={(e) => setDuration(e.target.value)}
              />
              <p className="text-[11px] text-inkMuted">
                Typical {activeFormat.label.toLowerCase()}: {activeFormat.typical} min.
                Type any value up to {HARD_MAX_MINUTES}.
              </p>
            </div>
            )}

            {isSeries && (
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-inkMuted">
                    Episodes
                  </label>
                  <span className="text-sm text-inkMuted">
                    Season total <span className="text-gold font-semibold">{totalRuntime} min</span>
                  </span>
                </div>
                <input
                  type="number"
                  min="1"
                  max="200"
                  value={form.episode_count}
                  onChange={(e) => set({ episode_count: e.target.value })}
                  className="field"
                  aria-label="Number of episodes"
                />
              </div>
            )}

            <div>
              <label className="field-label mb-3">Language</label>
              <div className="flex gap-2">
                {["English", "Nepali", "Bilingual"].map((lang) => (
                  <button
                    type="button"
                    key={lang}
                    onClick={() => set({ language: lang })}
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

            {error && (
              <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button type="submit" disabled={loading} className="btn-gold w-full py-3.5 mt-4">
              {loading ? "Generating Project Structure..." : "Generate Project Structure"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
