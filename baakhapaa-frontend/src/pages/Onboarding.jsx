import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../services/api";
import { useAuth } from "../context/AuthContext";

/**
 * Four questions, one screen each.
 *
 * The rule for including a question: the answer has to change something the
 * writer will notice. Anything that only fills a database column was left out —
 * onboarding that feels like a form gets abandoned, and every extra step costs
 * completions.
 *
 *   experience → how much craft guidance the editor shows
 *   format     → which beat grammar the structure follows, and the duration
 *   language   → the default for dialogue and export
 *   genre/tone → prefills the new-project wizard
 */
const STEPS = [
  {
    key: "experience",
    title: "Have you written a screenplay before?",
    hint: "This sets how much guidance you see. You can change it later.",
    options: [
      { value: "first_time", label: "This is my first", detail: "Show me what a slugline is and check my format as I write" },
      { value: "some", label: "I've written a few", detail: "Structural nudges, not the basics" },
      { value: "experienced", label: "I write regularly", detail: "Stay out of the way unless something's genuinely off" },
    ],
  },
  {
    key: "format",
    title: "What are you making?",
    hint: "Each format has its own beat structure, so this changes the guidance.",
    options: [
      { value: "short", label: "Short film", detail: "5 to 20 minutes, one clear turn" },
      { value: "web_series", label: "Web series episode", detail: "Needs an ending that pulls to the next episode" },
      { value: "film", label: "Feature film", detail: "Three acts, longer arcs" },
    ],
  },
  {
    key: "language",
    title: "Which language will you write in?",
    hint: "Dialogue in Devanagari, action lines in English, if you pick bilingual.",
    options: [
      { value: "Bilingual", label: "Bilingual", detail: "Nepali dialogue, English action — how most Kathmandu scripts read" },
      { value: "Nepali", label: "Nepali", detail: "Devanagari throughout" },
      { value: "English", label: "English", detail: "English throughout" },
    ],
  },
  {
    key: "genre",
    title: "What kind of story pulls you?",
    hint: "Only a starting point — every project can differ.",
    options: [
      { value: "Drama", label: "Drama", detail: "Family, ambition, the cost of choices" },
      { value: "Romance", label: "Romance", detail: "Two people, one obstacle" },
      { value: "Thriller", label: "Thriller", detail: "Something is wrong and time is short" },
      { value: "Comedy", label: "Comedy", detail: "A premise pushed until it breaks" },
      { value: "Social Issue", label: "Social issue", detail: "A person inside a system" },
    ],
  },
];

// Sensible tone per genre, so the fourth question doesn't need a fifth.
const TONE_FOR_GENRE = {
  Drama: "Emotional",
  Romance: "Emotional",
  Thriller: "Tense",
  Comedy: "Lighthearted",
  "Social Issue": "Inspirational",
};

export default function Onboarding() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const choose = async (value) => {
    const next = { ...answers, [current.key]: value };
    setAnswers(next);

    if (!isLast) {
      setStep(step + 1);
      return;
    }

    setSaving(true);
    setError("");
    try {
      await auth.setPreferences({
        experience: next.experience,
        format: next.format,
        language: next.language,
        genre: next.genre,
        tone: TONE_FOR_GENRE[next.genre] || "Emotional",
        onboarded: true,
      });
      await refreshUser?.();
      navigate("/projects/new");
    } catch (err) {
      setError(err.response?.data?.detail || "Could not save your answers.");
      setSaving(false);
    }
  };

  const skip = async () => {
    setSaving(true);
    try {
      await auth.setPreferences({ onboarded: true });
      await refreshUser?.();
    } catch {
      /* skipping should never block someone from reaching the app */
    }
    navigate("/dashboard");
  };

  return (
    <div className="min-h-screen bg-bg text-ink flex flex-col">
      {/* progress */}
      <div className="h-1 bg-borderSoft">
        <div
          className="h-full bg-gold transition-all duration-500"
          style={{ width: `${((step + (saving ? 1 : 0)) / STEPS.length) * 100}%` }}
        />
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-xl">
          <p className="text-[11px] uppercase tracking-[0.18em] text-inkMuted mb-3">
            Step {step + 1} of {STEPS.length}
          </p>

          <h1 className="font-display text-3xl md:text-4xl mb-2">{current.title}</h1>
          <p className="text-inkMuted text-sm mb-8">{current.hint}</p>

          <div className="flex flex-col gap-3">
            {current.options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => choose(opt.value)}
                disabled={saving}
                className="text-left rounded-xl border border-border bg-surface hover:border-gold
                           hover:bg-elevated transition duration-200 px-5 py-4 disabled:opacity-50"
              >
                <div className="text-ink font-semibold">{opt.label}</div>
                <div className="text-inkMuted text-sm mt-0.5">{opt.detail}</div>
              </button>
            ))}
          </div>

          {error && <p className="text-red-400 text-sm mt-5">{error}</p>}

          <div className="flex items-center justify-between mt-8 text-sm">
            <button
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0 || saving}
              className="text-inkMuted hover:text-ink disabled:opacity-0 transition"
            >
              ← Back
            </button>
            <button onClick={skip} disabled={saving} className="text-inkMuted hover:text-ink transition">
              Skip for now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
