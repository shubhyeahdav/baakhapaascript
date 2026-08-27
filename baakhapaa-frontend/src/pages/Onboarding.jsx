import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, learn } from "../services/api";
import { useAuth } from "../context/AuthContext";
import ThePen from "../components/ThePen";

/**
 * Onboarding, guided by the Pen.
 *
 * This used to be four questions and a redirect. The writer answered them,
 * landed on a blank editor, and the nineteen-lesson course that would have
 * taught them what to do with it sat behind a nav item they had no reason to
 * press. The best thing in the product was the thing nobody found.
 *
 * So the course comes to them. The Pen asks the four questions, then teaches
 * the first lesson right here — the writer produces one real scene heading and
 * one real action line, and the craft linter grades it before they have seen
 * the editor at all. They arrive having already written something correct,
 * which is a different feeling from arriving at a blank page.
 *
 * WHAT IS DELIBERATELY NOT COPIED FROM DUOLINGO. Hearts and lives would
 * contradict the course's own rule — "there is no penalty for trying" — and
 * punishing a wrong first slugline is exactly the wrong lesson for someone who
 * has never written one. Streaks suit daily drilling and not creative work; a
 * screenwriter who writes hard for three days and rests is not failing. And
 * points would put a number on writing in a product whose whole discipline is
 * that it reports measurements rather than scores. What carries over is the
 * part that actually teaches: a guide, one small task, and immediate specific
 * feedback.
 *
 * The rule for including a question is unchanged: the answer has to change
 * something the writer will notice.
 *
 *   experience → how much craft guidance the editor shows
 *   format     → which beat grammar the structure follows, and the duration
 *   language   → the default for dialogue and export
 *   genre/tone → prefills the new-project wizard
 */
const STEPS = [
  {
    key: "experience",
    says: "Before the blank page — four questions, then I'll show you one thing.",
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
    says: "Different shapes break in different places.",
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
    says: "I read Nepali too — dialogue, not just the labels.",
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
    says: "Last one. This only sets a starting point.",
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

// The lesson taught here. `the-page` is the right one and not an arbitrary
// pick: it is the only lesson whose exercise can be completed by somebody who
// does not yet know what a screenplay looks like, which is the whole audience
// for an onboarding.
const FIRST_LESSON = "the-page";
const STARTER = "INT. ";

/** The Pen, and whatever it is saying. */
function Guide({ mood, children }) {
  return (
    <div className="flex items-start gap-4 mb-8">
      <ThePen mood={mood} size={52} className="text-gold shrink-0 mt-0.5" />
      <p className="text-[15px] text-inkSoft leading-relaxed pt-2" aria-live="polite">
        {children}
      </p>
    </div>
  );
}

export default function Onboarding() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // The lesson, which is the last step rather than a fifth question.
  const [draft, setDraft] = useState(STARTER);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState(null);

  const onLesson = step === STEPS.length;
  const current = STEPS[step];

  /**
   * Save what was actually answered, and nothing else.
   *
   * Building the payload unconditionally meant a writer who skipped at step one
   * still had a genre-derived tone written for them — a preference invented on
   * behalf of somebody who had declined to express one, which then quietly
   * prefilled their first project.
   */
  const persist = async (next) => {
    const prefs = { onboarded: true };
    for (const key of ["experience", "format", "language", "genre"]) {
      if (next[key]) prefs[key] = next[key];
    }
    if (next.genre) prefs.tone = TONE_FOR_GENRE[next.genre] || "Emotional";
    return auth.setPreferences(prefs);
  };

  const choose = async (value) => {
    const next = { ...answers, [current.key]: value };
    setAnswers(next);

    if (step < STEPS.length - 1) {
      setStep(step + 1);
      return;
    }

    // Save the answers before the lesson, not after. The lesson is a gift, not
    // a gate — someone who closes the tab mid-exercise must not be asked the
    // four questions again next time.
    setSaving(true);
    setError("");
    try {
      await persist(next);
      await refreshUser?.();
      setStep(STEPS.length);
    } catch (err) {
      setError(err.response?.data?.detail || "Could not save your answers.");
    } finally {
      setSaving(false);
    }
  };

  const check = async () => {
    setChecking(true);
    try {
      const res = await learn.submit(FIRST_LESSON, draft);
      setResult(res.data);
    } catch {
      // The lesson is optional, so a failed check must not become a wall. Let
      // them through rather than blocking the door on our own network.
      setResult({ passed: true, offline: true });
    } finally {
      setChecking(false);
    }
  };

  const finish = () => navigate("/projects/new");

  const skip = async () => {
    setSaving(true);
    try {
      await persist(answers);
      await refreshUser?.();
    } catch {
      /* skipping should never block someone from reaching the app */
    }
    navigate("/dashboard");
  };

  // Steps plus the lesson, so the bar reaches the end when the writing does.
  const total = STEPS.length + 1;
  const done = onLesson ? (result?.passed ? total : STEPS.length) : step;

  return (
    <div className="min-h-screen bg-bg text-ink flex flex-col">
      <div className="h-1 bg-borderSoft">
        <div
          className="h-full bg-gold transition-all duration-500"
          style={{ width: `${(done / total) * 100}%` }}
        />
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-xl">
          {onLesson ? (
            <>
              <p className="text-[11px] uppercase tracking-[0.18em] text-inkMuted mb-3">
                One thing before you start
              </p>

              {!result ? (
                <>
                  <Guide mood="thinking">
                    Every scene opens by saying where we are and when. Interior or
                    exterior, the place, the time. Then one line of what we see.
                  </Guide>
                  <h1 className="font-display text-2xl md:text-3xl mb-2">
                    Write one scene heading, and one line under it.
                  </h1>
                  <p className="text-inkMuted text-sm mb-5">
                    Something like <span className="font-mono text-inkSoft">INT. CHIYA PASAL - DAY</span>,
                    then what the camera sees. I'll check it.
                  </p>

                  <label className="sr-only" htmlFor="first-scene">Your first scene</label>
                  <textarea
                    id="first-scene"
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    spellCheck={false}
                    className="w-full h-40 bg-bgDeep/50 border border-border rounded-xl p-4
                               text-[13.5px] font-mono text-inkSoft leading-relaxed
                               focus:outline-none focus:border-gold/40 resize-none"
                  />

                  <div className="flex items-center gap-3 mt-4">
                    <button
                      onClick={check}
                      disabled={checking || !draft.trim()}
                      className="btn-gold px-6 py-2.5 text-sm disabled:opacity-40"
                    >
                      {checking ? "Reading…" : "Check it"}
                    </button>
                    <button onClick={finish} className="text-sm text-inkMuted hover:text-ink transition">
                      Skip this
                    </button>
                  </div>
                </>
              ) : result.passed ? (
                <>
                  <Guide mood="pleased">
                    That's a screenplay. Format is most of what stops people
                    starting, and you've just done it — the rest is story.
                  </Guide>
                  <h1 className="font-display text-2xl md:text-3xl mb-2">
                    You've written your first slugline.
                  </h1>
                  <p className="text-inkMuted text-sm mb-7">
                    {result.offline
                      ? "I couldn't reach the checker just now, so take my word for it."
                      : "Eighteen more lessons are waiting whenever you want them — but a project is the better next step."}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <button onClick={finish} className="btn-gold px-6 py-2.5 text-sm">
                      Start a project
                    </button>
                    <button
                      onClick={() => navigate("/learn")}
                      className="btn-ghost px-5 py-2.5 text-sm"
                    >
                      See the course
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <Guide mood="nudging">
                    Nearly. Here's what I'm looking for — fix it and check again.
                    Nothing is lost by trying.
                  </Guide>
                  <ul className="space-y-1.5 mb-5">
                    {(result.problems || []).map((p, i) => (
                      <li key={i} className="text-[13px] text-amber-300 leading-snug">— {p}</li>
                    ))}
                  </ul>

                  <label className="sr-only" htmlFor="first-scene-retry">Your first scene</label>
                  <textarea
                    id="first-scene-retry"
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    spellCheck={false}
                    className="w-full h-40 bg-bgDeep/50 border border-border rounded-xl p-4
                               text-[13.5px] font-mono text-inkSoft leading-relaxed
                               focus:outline-none focus:border-gold/40 resize-none"
                  />
                  <div className="flex items-center gap-3 mt-4">
                    <button
                      onClick={() => { setResult(null); check(); }}
                      disabled={checking || !draft.trim()}
                      className="btn-gold px-6 py-2.5 text-sm disabled:opacity-40"
                    >
                      {checking ? "Reading…" : "Check again"}
                    </button>
                    <button onClick={finish} className="text-sm text-inkMuted hover:text-ink transition">
                      Skip this
                    </button>
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <p className="text-[11px] uppercase tracking-[0.18em] text-inkMuted mb-3">
                Step {step + 1} of {STEPS.length}
              </p>

              <Guide mood={step === 0 ? "idle" : "thinking"}>{current.says}</Guide>

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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
