import React, { useCallback, useEffect, useState } from "react";
import { scripts } from "../services/api";

/**
 * The free tier's craft feedback: deterministic lint flags plus a corpus
 * benchmark. Neither costs an AI call.
 *
 * Both run on request rather than on every keystroke. Linting is cheap enough
 * to run continuously, but feedback that reshuffles while you type reads as
 * noise — and a writer mid-sentence is the worst possible moment to tell them
 * the sentence is wrong.
 */

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
                    {f.technique && (
                      <p className="text-[11px] text-gold/70 mt-1 leading-snug">
                        → {f.technique}
                      </p>
                    )}
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

          <div className="pt-1">
            <div className="font-mono text-[9.5px] uppercase tracking-wider text-inkMuted mb-2">
              Shape vs corpus
            </div>
            <Benchmark data={bench} />
          </div>

          {lint?.statistics && (
            <div className="pt-1 border-t border-borderSoft">
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 pt-2.5 text-[10.5px] font-mono text-inkMuted">
                <span>scenes</span><span className="text-inkSoft text-right">{lint.statistics.scene_count}</span>
                <span>est. pages</span><span className="text-inkSoft text-right">{lint.statistics.estimated_pages}</span>
                <span>speakers</span><span className="text-inkSoft text-right">{lint.statistics.character_count}</span>
                {lint.statistics.dialogue_action_ratio != null && (
                  <>
                    <span>dialogue/action</span>
                    <span className="text-inkSoft text-right">{lint.statistics.dialogue_action_ratio}</span>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
