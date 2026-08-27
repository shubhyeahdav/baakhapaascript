import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import TopNav from "../components/TopNav";
import { learn } from "../services/api";
import { useT, useLanguage } from "../i18n";

/**
 * The course, in two tracks, ending in a finished short.
 *
 * **The Pen** teaches the script page — format, action lines, dialogue, the
 * mechanics a camera can obey. **The Story** teaches what the page is for —
 * the storytelling fundamentals distilled from the analysed corpus. They are
 * separate tracks on purpose: page craft and story craft fail independently,
 * and a writer whose pages are clean can still have no story. A lesson's
 * `track` field decides where it lives; the switcher below splits on it.
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

// The two tracks. The Pen is the page; The Story is what the page is for.
// A visible pair rather than more modules in one list, because they answer
// different failures: clean pages with no story, or a strong story typed
// unreadably.
const TRACKS = [
  { key: "pen", label: "The Pen", blurb: "the script page" },
  { key: "story", label: "The Story", blurb: "what the page is for" },
];

export default function LearnPage() {
  const [lessons, setLessons] = useState([]);
  const [completed, setCompleted] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [draft, setDraft] = useState("");
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState("");
  // Which track's curriculum is showing. Following a lesson link (a linter
  // flag's "Learn this", or the resume-on-arrival pick) switches the track to
  // wherever that lesson lives, so the nav never shows a list the open lesson
  // is not in.
  const [track, setTrack] = useState("pen");
  const [params] = useSearchParams();
  const t = useT();
  const { lang } = useLanguage();

  const load = useCallback(async () => {
    try {
      const res = await learn.lessons(lang);
      setLessons(res.data.lessons);
      setCompleted(res.data.completed);
      setActiveId((cur) => {
        if (cur) return cur;
        // `?lesson=` opens that exact lesson — a linter flag's "Learn this".
        // `?track=` opens a track wherever the writer left off in it, which is
        // what the editor's craft panel links to: it points at a course rather
        // than at the answer to one flag. With neither, resume at the first
        // unfinished lesson, because resuming beats re-choosing.
        const requested = params.get("lesson");
        const wantedTrack = params.get("track");
        const pool = wantedTrack
          ? res.data.lessons.filter((l) => (l.track || "pen") === wantedTrack)
          : res.data.lessons;
        const opened =
          (requested && res.data.lessons.find((l) => l.id === requested)) ||
          pool.find((l) => !l.completed) ||
          pool[0] ||
          res.data.lessons[0];
        if (opened?.track) setTrack(opened.track);
        return opened?.id;
      });
    } catch (err) {
      setLoadError("Could not load the course.");
    }
    // `lang` is a dependency on purpose: switching language has to re-fetch the
    // course, or the chrome turns Nepali around nineteen English lessons.
  }, [params, lang]);

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
    lessons
      .filter((l) => (l.track || "pen") === track)
      .forEach((l) => {
        const bucket = out.find((b) => b.module === l.module);
        if (bucket) bucket.items.push(l);
        else out.push({ module: l.module, items: [l] });
      });
    return out;
  }, [lessons, track]);

  // Progress per track, so switching tracks reads as two courses with two
  // states rather than one number that jumps around.
  const trackProgress = useMemo(() => {
    const inTrack = lessons.filter((l) => (l.track || "pen") === track);
    return {
      done: inTrack.filter((l) => l.completed).length,
      total: inTrack.length,
    };
  }, [lessons, track]);

  const openLesson = (l) => {
    if (l.track) setTrack(l.track);
    setActiveId(l.id);
  };

  /** Left/right (and Home/End) move between tracks, per the ARIA tabs pattern. */
  const onTrackKey = (e) => {
    const i = TRACKS.findIndex((tr) => tr.key === track);
    let next = null;
    if (e.key === "ArrowRight") next = TRACKS[(i + 1) % TRACKS.length];
    else if (e.key === "ArrowLeft") next = TRACKS[(i - 1 + TRACKS.length) % TRACKS.length];
    else if (e.key === "Home") next = TRACKS[0];
    else if (e.key === "End") next = TRACKS[TRACKS.length - 1];
    if (!next) return;
    e.preventDefault();
    chooseTrack(next.key);
    document.getElementById(`track-tab-${next.key}`)?.focus();
  };

  /**
   * Switch track AND move the open lesson into it.
   *
   * Switching the nav alone left the pane showing a lesson from the other
   * track — the curriculum said Story while the exercise on screen was a
   * formatting one, which reads as the page having lost its place. Resuming at
   * the track's first unfinished lesson matches what arriving on the page does.
   */
  const chooseTrack = (key) => {
    setTrack(key);
    if (active && (active.track || "pen") === key) return;
    const inTrack = lessons.filter((l) => (l.track || "pen") === key);
    const resume = inTrack.find((l) => !l.completed) || inTrack[0];
    if (resume) setActiveId(resume.id);
  };

  // The next lesson within the SAME track. Crossing tracks on "Next" would
  // yank a writer from a story exercise into a formatting one mid-thought.
  const nextLesson = useMemo(() => {
    const own = lessons.filter((l) => (l.track || "pen") === (active?.track || "pen"));
    const i = own.findIndex((l) => l.id === activeId);
    return i >= 0 ? own[i + 1] : null;
  }, [lessons, activeId, active]);

  return (
    <div className="cine-bg min-h-screen">
      <TopNav active="Learn" />
      <div className="max-w-6xl mx-auto px-8 py-8 animate-fade-up">
        <div className="mb-6">
          <p className="text-inkMuted text-xs tracking-[0.2em] uppercase mb-2">Learn</p>
          <h1 className="font-display text-4xl text-ink mb-1">
            {t("Write your first short")}
          </h1>
          <p className="text-inkMuted text-sm">
            {t("Two tracks. Every lesson ends in you writing something the app checks.")}
          </p>
        </div>

        {/* Tabs, and the full ARIA pattern rather than half of it: each tab
            owns the curriculum panel by id, only the selected one is in the tab
            order, and the arrow keys move between them. `role="tab"` without
            those is worse than plain buttons — it promises a keyboard contract
            screen-reader users then find missing. */}
        <div className="flex gap-2 mb-6" role="tablist" aria-label="Course track">
          {TRACKS.map((tr) => (
            <button
              key={tr.key}
              id={`track-tab-${tr.key}`}
              role="tab"
              aria-selected={track === tr.key}
              aria-controls="track-curriculum"
              // Roving tabindex: Tab reaches the tablist once, arrows move
              // inside it. Two tab stops for one control would be noise.
              tabIndex={track === tr.key ? 0 : -1}
              onKeyDown={onTrackKey}
              onClick={() => chooseTrack(tr.key)}
              className={`text-left rounded-xl border px-4 py-2.5 transition
                          focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 ${
                track === tr.key
                  ? "border-gold/50 bg-goldDim"
                  : "border-borderSoft bg-surface hover:border-gold/30"
              }`}
            >
              <span className={`block text-[13.5px] font-semibold ${track === tr.key ? "text-gold" : "text-ink"}`}>
                {t(tr.label)}
              </span>
              <span className="block text-[11px] text-inkMuted">{t(tr.blurb)}</span>
            </button>
          ))}
        </div>

        {loadError && <p className="text-red-400 text-sm">{loadError}</p>}

        <div className="mb-6 max-w-md">
          <ProgressRing done={trackProgress.done} total={trackProgress.total} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 items-start">
          {/* Curriculum */}
          <nav
            id="track-curriculum"
            role="tabpanel"
            aria-labelledby={`track-tab-${track}`}
            className="bg-surface border border-borderSoft rounded-2xl p-4 space-y-4"
          >
            {byModule.map((mod) => (
              <div key={mod.module}>
                <div className="font-mono text-[9.5px] uppercase tracking-wider text-inkMuted mb-2">
                  {mod.module}
                </div>
                <ul className="space-y-1">
                  {mod.items.map((l) => (
                    <li key={l.id}>
                      <button
                        onClick={() => openLesson(l)}
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
                    onClick={() => openLesson(nextLesson)}
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
