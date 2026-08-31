import React, { useCallback, useEffect, useState } from "react";
import { scripts, learn } from "../services/api";
import { useLanguage } from "../i18n";

/**
 * The free tier's craft feedback: deterministic lint flags plus a corpus
 * benchmark. Neither costs an AI call.
 *
 * Both run on request rather than on every keystroke. Linting is cheap enough
 * to run continuously, but feedback that reshuffles while you type reads as
 * noise — and a writer mid-sentence is the worst possible moment to tell them
 * the sentence is wrong.
 *
 * This panel is also the *only* place the product teaches while you write. A
 * flag used to end in a link to the course, which answered "why is this wrong"
 * by throwing the writer out of their draft and onto another screen — and the
 * draft is the entire context that made the answer make sense. The explanation
 * now opens in place. The fourteen-lesson course stays where it belongs, on its
 * own page, as a thing you sit down to do rather than a thing you fall into
 * mid-scene.
 */

// How arguable a note is, which the writer deserves to see. Severity says what
// a problem costs; confidence says how sure the rule is that it IS one.
// "The camera cannot show this" and "I read this as on the nose" should not
// arrive wearing the same authority — writing is subjective, and a tool that
// pretends otherwise gets switched off by the writers worth keeping.
const CONFIDENCE = {
  mechanical: { label: "can't be filmed", cls: "text-red-300/80 border-red-400/25" },
  convention: { label: "convention", cls: "text-amber-300/80 border-amber-400/25" },
  judgement: { label: "a reading", cls: "text-inkMuted border-borderSoft" },
};

const SEVERITY = {
  high: { dot: "bg-red-400", label: "text-red-300" },
  medium: { dot: "bg-amber-400", label: "text-amber-300" },
  low: { dot: "bg-sky-400", label: "text-sky-300" },
};

// craft_level -> how to introduce that group. Same taxonomy writers already
// use by hand when reconciling notes from several readers.
const LEVEL_LABEL = {
  structure: "Structure",
  scene: "Scene",
  dialogue: "Dialogue",
  character: "Character",
  image: "Image",
  other: "Other",
};

/**
 * The craft point behind one flag, opened in place.
 *
 * Fetched from `/learn/for-rule/{rule}` — the same lesson the course teaches,
 * so there is one explanation of a technique in the product rather than two
 * that drift. Only the concept is shown: the exercise and its grading belong
 * to the course, where the writer has chosen to be taught rather than being
 * interrupted while writing.
 */
function WhyThis({ rule }) {
  const [open, setOpen] = useState(false);
  const [lesson, setLesson] = useState(null);
  const [state, setState] = useState("idle");
  // The lesson behind a flag is translated like the rest of the course. A
  // Nepali interface that answers "why this matters" in English is the gap
  // this product can least afford.
  const { lang } = useLanguage();

  const toggle = async () => {
    if (open) return setOpen(false);
    setOpen(true);
    if (lesson || state === "loading") return;
    setState("loading");
    try {
      const res = await learn.forRule(rule, lang);
      setLesson(res.data);
      setState("done");
    } catch {
      // No lesson covers every rule, and that is not an error worth a red box.
      setState("none");
    }
  };

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="text-[10.5px] text-inkMuted hover:text-gold transition-colors underline decoration-dotted underline-offset-2"
      >
        {open ? "Hide" : "Why this matters"}
      </button>

      {open && (
        <div className="mt-1.5 rounded-lg border border-borderSoft bg-bgDeep/40 p-2.5">
          {state === "loading" && (
            <p className="text-[11px] text-inkMuted">Loading…</p>
          )}
          {state === "none" && (
            <p className="text-[11px] text-inkMuted leading-snug">
              No written lesson for this one yet — the note above is the whole
              of it.
            </p>
          )}
          {lesson && (
            <>
              <p className="text-[11px] text-gold/80 font-semibold mb-1 leading-snug">
                {lesson.technique}
              </p>
              <p className="text-[11.5px] text-inkSoft leading-relaxed">
                {lesson.concept}
              </p>
              {lesson.corpus_proof && (
                <p className="text-[10.5px] text-inkMuted mt-1.5 leading-snug italic">
                  {lesson.corpus_proof}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}


function Flags({ byLevel, counts }) {
  const levels = Object.keys(byLevel || {});
  if (!levels.length) {
    return (
      <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/5 p-3.5">
        <p className="text-[12.5px] text-emerald-300 leading-snug">
          Nothing flagged in this draft.
        </p>
        <p className="text-[11px] text-inkMuted mt-1 leading-snug">
          These checks are deliberately conservative — silence means nothing
          tripped them, not that the draft is finished.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2 text-[10px] font-mono uppercase tracking-wider">
        {["high", "medium", "low"].map((s) =>
          counts?.[s] ? (
            <span key={s} className={`flex items-center gap-1.5 ${SEVERITY[s].label}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${SEVERITY[s].dot}`} />
              {counts[s]} {s}
            </span>
          ) : null
        )}
      </div>

      {levels.map((level) => (
        <div key={level}>
          <div className="font-mono text-[9.5px] uppercase tracking-wider text-inkMuted mb-1.5">
            {LEVEL_LABEL[level] || level}
          </div>
          <div className="space-y-1.5">
            {byLevel[level].map((f, i) => (
              <div
                key={`${f.rule}-${f.line}-${i}`}
                className="rounded-lg border border-borderSoft bg-elevated/40 p-2.5"
              >
                <div className="flex items-start gap-2">
                  <span
                    className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                      SEVERITY[f.severity]?.dot || "bg-inkMuted"
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="text-[12px] text-inkSoft leading-snug">
                      <span className="font-mono text-[10px] text-gold/80 mr-1.5">L{f.line}</span>
                      {f.message}
                    </p>
                    {CONFIDENCE[f.confidence] && (
                      <span
                        className={`inline-block mt-1 text-[9.5px] font-mono uppercase tracking-wider
                                    px-1.5 py-0.5 rounded border ${CONFIDENCE[f.confidence].cls}`}
                        title={
                          f.confidence === "mechanical"
                            ? "A property of the medium, not an opinion."
                            : f.confidence === "convention"
                              ? "Professional consensus. Break it knowingly."
                              : "The rule spotted a shape that is often a problem and is sometimes the point."
                        }
                      >
                        {CONFIDENCE[f.confidence].label}
                      </span>
                    )}
                    {f.technique && (
                      <p className="text-[11px] text-gold/70 mt-1 leading-snug">
                        → {f.technique}
                      </p>
                    )}
                    {/* Teaches here, in the draft that raised it. */}
                    {f.rule && <WhyThis rule={f.rule} />}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Benchmark({ data }) {
  if (!data) return null;

  // Not enough draft yet. The progress message IS the feature — it says when
  // the report opens, rather than showing a percentile invented from 2 scenes.
  if (!data.ready) {
    const p = data.progress || {};
    const bar = (have, need) => Math.min(100, Math.round((have / need) * 100));
    return (
      <div className="rounded-xl border border-borderSoft bg-elevated/40 p-3.5 space-y-2.5">
        <p className="text-[12px] text-inkSoft leading-snug">{data.reason}</p>
        {[
          ["Scenes", p.scenes, p.scenes_needed],
          ["Dialogue lines", p.dialogue_lines, p.dialogue_lines_needed],
        ].map(([label, have, need]) => (
          <div key={label}>
            <div className="flex justify-between text-[10px] font-mono text-inkMuted mb-1">
              <span>{label}</span>
              <span>{have} / {need}</span>
            </div>
            <div className="h-1 rounded-full bg-bgDeep/60 overflow-hidden">
              <div className="h-full bg-gold/60" style={{ width: `${bar(have || 0, need || 1)}%` }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const b = data.benchmark || {};
  if (!b.available) {
    return (
      <div className="rounded-xl border border-borderSoft bg-elevated/40 p-3.5">
        <p className="text-[12px] text-inkMuted leading-snug">{b.reason}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="font-mono text-[9.5px] uppercase tracking-wider text-inkMuted">
        vs {b.cohort} · n={b.cohort_size}
      </p>
      {b.notes?.length === 0 ? (
        <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/5 p-3.5">
          <p className="text-[12.5px] text-emerald-300 leading-snug">
            Your draft's shape sits inside the corpus norm.
          </p>
        </div>
      ) : (
        b.notes?.map((n) => (
          <div key={n.metric} className="rounded-lg border border-borderSoft bg-elevated/40 p-2.5">
            <p className="text-[12px] text-inkSoft leading-snug">{n.observation}</p>
            <p className="text-[10.5px] font-mono text-inkMuted mt-1">
              you {n.your_value} · median {n.corpus_median} · {Math.round(n.percentile * 100)}th pct
            </p>
          </div>
        ))
      )}
    </div>
  );
}

/**
 * Pages, the way a writer says them.
 *
 * `estimated_pages` arrives as a float and was printed raw, so a scene in
 * progress read "0.24" — two decimal places of a unit nobody counts in
 * fractions. A page is the unit of screen time in this craft; a quarter of one
 * is "under a page", and pretending to hundredths implies a precision the
 * line-count estimate does not have.
 */
function pageCount(n) {
  if (n == null) return "—";
  if (n < 1) return "under 1";
  return n < 10 ? n.toFixed(1).replace(/\.0$/, "") : Math.round(n);
}

export default function CraftPanel({ content, genre, tone }) {
  const [lint, setLint] = useState(null);
  const [bench, setBench] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const run = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = { scene_text: content || "", genre, tone };
      const [lintRes, benchRes] = await Promise.all([
        scripts.lint(payload),
        scripts.benchmark(payload),
      ]);
      setLint(lintRes.data);
      setBench(benchRes.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Could not analyse the draft.");
    } finally {
      setLoading(false);
    }
  }, [content, genre, tone]);

  // Run once when the panel is first opened, then only on request.
  useEffect(() => {
    if (lint === null) run();
    // eslint-disable-next-line
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-inkMuted">
          Craft check · free
        </span>
        <button
          onClick={run}
          disabled={loading}
          className="text-[11px] text-inkMuted hover:text-gold transition-colors disabled:opacity-50"
        >
          {loading ? "Reading…" : "↻ Re-check"}
        </button>
      </div>

      {error && <p className="text-[12px] text-red-400">{error}</p>}

      {loading && !lint ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 rounded-xl bg-elevated/40 border border-borderSoft animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          <Flags byLevel={lint?.by_craft_level} counts={lint?.counts} />

          {/* What the draft IS, before what it compares to. These four were
              at the very bottom under the Story-track card, which put a link
              between two blocks of measurement. Order now runs: what is wrong
              -> what this draft is -> how it compares -> what none of it can
              see. */}
          {lint?.statistics && (
            <div className="pt-1">
              <div className="font-mono text-[9.5px] uppercase tracking-wider text-inkMuted mb-2">
                This draft
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                <dt className="text-inkMuted">Scenes</dt>
                <dd className="text-ink text-right tabular-nums">{lint.statistics.scene_count}</dd>
                <dt className="text-inkMuted">Pages</dt>
                <dd className="text-ink text-right tabular-nums">{pageCount(lint.statistics.estimated_pages)}</dd>
                <dt className="text-inkMuted">Speaking parts</dt>
                <dd className="text-ink text-right tabular-nums">{lint.statistics.character_count}</dd>
                {lint.statistics.dialogue_action_ratio != null && (
                  <>
                    {/* "dialogue/action" read as a division. It is a balance. */}
                    <dt className="text-inkMuted">Dialogue per action line</dt>
                    <dd className="text-ink text-right tabular-nums">
                      {lint.statistics.dialogue_action_ratio}
                    </dd>
                  </>
                )}
              </dl>
            </div>
          )}

          <div className="pt-1">
            <div className="font-mono text-[9.5px] uppercase tracking-wider text-inkMuted mb-2">
              Shape vs corpus
            </div>
            <Benchmark data={bench} />
          </div>

          {/* The way into the story track.
              The linter reads pages and the benchmark reads shape; neither can
              tell a writer their midpoint does not flip or their protagonist
              never chooses anything. Those are read, not measured — so the
              story track cannot wait to be summoned by a flag the way pen
              lessons can, and needs a door. Saying plainly what this panel
              cannot see is also the honest framing: a tool that implied its
              silence meant the story was fine would be lying. */}
          <div className="pt-1">
            <a
              href="/learn?track=story"
              className="block rounded-xl border border-borderSoft bg-elevated/40 p-3
                         hover:border-gold/40 transition-colors"
            >
              <p className="text-[12px] text-inkSoft leading-snug">
                These checks read your <span className="text-ink">pages</span>.
                They cannot see whether the story works.
              </p>
              <p className="text-[11.5px] text-gold mt-1">
                The Story track →
              </p>
            </a>
          </div>

        </>
      )}
    </div>
  );
}
