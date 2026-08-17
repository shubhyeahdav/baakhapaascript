import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import TopNav from "../components/TopNav";
import { learn } from "../services/api";

/**
 * The course. Fourteen lessons ending in a finished short.
 *
 * Every lesson ends in the user writing something, and the submission is
 * graded by the craft linter rather than by a Next button. That is the whole
 * design: feedback that says "line 3, and here is why" teaches something,
 * feedback that says "well done" does not.
 */

function ProgressRing({ done, total }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-1.5 rounded-full bg-elevated overflow-hidden">
        <div className="h-full bg-gold transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-[11px] text-inkMuted shrink-0">
        {done}/{total}
      </span>
    </div>
  );
}

function Feedback({ result }) {
  if (!result) return null;

  if (result.passed) {
    return (
      <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/5 p-4">
        <p className="text-[13px] text-emerald-300 font-semibold mb-1">Passed.</p>
        <p className="text-[12px] text-inkSoft leading-relaxed">
          Technique unlocked — <span className="text-gold">{result.technique_unlocked}</span>
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-4">
      <p className="text-[13px] text-amber-300 font-semibold mb-2">Not yet.</p>
      <ul className="space-y-1.5">
        {result.problems.map((p, i) => (
          <li key={i} className="text-[12px] text-inkSoft leading-snug">— {p}</li>
        ))}
      </ul>
      <p className="text-[11px] text-inkMuted mt-2.5 leading-snug">
        These are the same checks that run in the editor. Fix and resubmit —
        there is no penalty for trying.
      </p>
    </div>
  );
}

export default function LearnPage() {
  const [lessons, setLessons] = useState([]);
  const [completed, setCompleted] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [draft, setDraft] = useState("");
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [params] = useSearchParams();

  const load = useCallback(async () => {
    try {
      const res = await learn.lessons();
      setLessons(res.data.lessons);
      setCompleted(res.data.completed);
      setActiveId((cur) => {
        if (cur) return cur;
        // Arriving from a linter flag ("Learn this") opens that exact lesson.
        // Otherwise resume at the first unfinished one — resuming beats
        // re-choosing.
        const requested = params.get("lesson");
        if (requested && res.data.lessons.some((l) => l.id === requested)) return requested;
        return (res.data.lessons.find((l) => !l.completed) || res.data.lessons[0])?.id;
      });
    } catch (err) {
      setLoadError("Could not load the course.");
    }
  }, [params]);

  useEffect(() => { load(); }, [load]);

  const active = useMemo(() => lessons.find((l) => l.id === activeId), [lessons, activeId]);

  // Switching lessons must not carry the previous answer across.
  useEffect(() => {
    setResult(null);
    setDraft(active?.starter || "");
  }, [activeId]); // eslint-disable-line

  const submit = async () => {
    if (!active) return;
    setSubmitting(true);
    try {
      const res = await learn.submit(active.id, draft);
      setResult(res.data);
      if (res.data.passed) await load();
    } catch (err) {
      setResult({ passed: false, problems: ["Could not reach the server."] });
    } finally {
      setSubmitting(false);
    }
  };

  const byModule = useMemo(() => {
    const out = [];
    lessons.forEach((l) => {
      const bucket = out.find((b) => b.module === l.module);
      if (bucket) bucket.items.push(l);
      else out.push({ module: l.module, items: [l] });
    });
    return out;
  }, [lessons]);

  const nextLesson = useMemo(() => {
    const i = lessons.findIndex((l) => l.id === activeId);
    return i >= 0 ? lessons[i + 1] : null;
  }, [lessons, activeId]);

  return (
    <div className="cine-bg min-h-screen">
      <TopNav />
      <div className="max-w-6xl mx-auto px-8 py-8 animate-fade-up">
        <div className="mb-6">
          <p className="text-inkMuted text-xs tracking-[0.2em] uppercase mb-2">Learn</p>
          <h1 className="font-display text-4xl text-ink mb-1">Write your first short</h1>
          <p className="text-inkMuted text-sm">
            Fourteen lessons. Every one ends in you writing something the app checks.
          </p>
        </div>

        {loadError && <p className="text-red-400 text-sm">{loadError}</p>}

        <div className="mb-6 max-w-md">
          <ProgressRing done={completed.length} total={lessons.length} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 items-start">
          {/* Curriculum */}
          <nav className="bg-surface border border-borderSoft rounded-2xl p-4 space-y-4">
            {byModule.map((mod) => (
              <div key={mod.module}>
                <div className="font-mono text-[9.5px] uppercase tracking-wider text-inkMuted mb-2">
                  {mod.module}
                </div>
                <ul className="space-y-1">
                  {mod.items.map((l) => (
                    <li key={l.id}>
                      <button
                        onClick={() => setActiveId(l.id)}
                        className={`w-full text-left px-2.5 py-2 rounded-lg text-[12.5px] leading-snug transition flex items-start gap-2 ${
                          l.id === activeId
                            ? "bg-goldDim text-gold"
                            : "text-inkMuted hover:text-ink hover:bg-elevated/40"
                        }`}
                      >
                        <span className={`mt-0.5 shrink-0 font-mono text-[11px] ${l.completed ? "text-emerald-400" : "opacity-40"}`}>
                          {l.completed ? "✓" : "○"}
                        </span>
                        <span>{l.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>

          {/* Lesson */}
          {active && (
            <div className="bg-surface border border-borderSoft rounded-2xl p-7 space-y-5">
              <div>
                <div className="font-mono text-[9.5px] uppercase tracking-wider text-inkMuted mb-1.5">
                  {active.module}
                  {active.completed && <span className="text-emerald-400 ml-2">· completed</span>}
                </div>
                <h2 className="font-display text-2xl text-ink">{active.title}</h2>
              </div>

              <p className="text-[13.5px] text-inkSoft leading-relaxed">{active.concept}</p>

              {/* A measurement from the corpus, never a quotation — this is the
                  only place the script library speaks, and it speaks in numbers. */}
              <div className="rounded-xl border-l-2 border-gold/40 bg-elevated/30 pl-4 pr-3 py-2.5">
                <div className="font-mono text-[9px] uppercase tracking-wider text-gold/70 mb-1">
                  From the corpus
                </div>
                <p className="text-[12px] text-inkMuted leading-snug">{active.corpus_proof}</p>
              </div>

              <div>
                <div className="font-mono text-[9.5px] uppercase tracking-wider text-inkMuted mb-2">
                  Exercise
                </div>
                <p className="text-[13px] text-ink leading-relaxed whitespace-pre-wrap mb-3">
                  {active.exercise}
                </p>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  spellCheck={false}
                  className="w-full h-56 bg-bgDeep/50 border border-border rounded-xl p-4 text-[13px] text-inkSoft font-mono leading-relaxed resize-y focus:outline-none focus:border-gold/40"
                  placeholder="Write here…"
                />
              </div>

              <Feedback result={result} />

              <div className="flex items-center gap-3">
                <button
                  onClick={submit}
                  disabled={submitting || !draft.trim()}
                  className="btn-gold px-6 py-2.5 text-sm disabled:opacity-40"
                >
                  {submitting ? "Checking…" : "Check my work"}
                </button>
                {result?.passed && nextLesson && (
                  <button
                    onClick={() => setActiveId(nextLesson.id)}
                    className="text-sm text-inkMuted hover:text-gold transition-colors"
                  >
                    Next: {nextLesson.title} →
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
