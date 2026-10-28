import React, { useEffect, useRef, useState } from "react";
import { scripts as scriptsApi } from "../services/api";

/**
 * The short-form rhythm meter (Month 4, Day 7).
 *
 * "Vary your sentence length" is advice in every short-form course; this is
 * that advice as a number, read off the draft as it is typed. Measured by
 * `rhythm.py` on the server — one implementation, the same rule the speaking
 * rate follows.
 *
 * IT REPORTS AND NEVER JUDGES. No score, no red, no green: the spread is shown
 * as a number in the same ink as every other number, and the flattest run is
 * named by WHERE it is so the writer can go and listen to it. Whether it is a
 * problem is theirs to decide — some flat runs are the point.
 *
 * Nothing renders for an empty draft (not a row of zeros), and a single
 * sentence shows no spread at all rather than "0.0", which would read as
 * perfect monotony when it means there is nothing yet to vary.
 */
export const DEBOUNCE_MS = 900;

export default function RhythmMeter({ content, language, onJumpToLine }) {
  const [m, setM] = useState(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!(content || "").trim()) {
      setM(null);
      return undefined;
    }
    const mine = ++seq.current;
    const t = setTimeout(() => {
      scriptsApi
        .rhythm({ text: content, language })
        .then((res) => {
          // A slow answer to an older draft must not overwrite a newer one.
          if (mine === seq.current) setM(res.data);
        })
        .catch(() => {
          // A meter that cannot measure says nothing rather than a stale number.
          if (mine === seq.current) setM(null);
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [content, language]);

  if (!m || !m.word_count) return null;

  const run = m.monotone_run;
  return (
    <div
      className="shrink-0 border-b border-border bg-surface/40 px-5 py-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] text-inkSoft"
      aria-label="Rhythm"
      data-testid="rhythm-meter"
    >
      <span className="text-[10px] tracking-[0.16em] uppercase text-inkMuted latin-caps">Rhythm</span>

      {m.sentence_length_sigma != null && (
        <span title="Standard deviation of sentence length, in words. Higher means more varied.">
          sentence lengths vary by <span className="font-mono text-ink tabular-nums">{m.sentence_length_sigma.toFixed(1)}</span> words
        </span>
      )}

      {run && (
        <button
          type="button"
          onClick={() => onJumpToLine && onJumpToLine(run.from_line)}
          className="hover:text-ink underline decoration-dotted underline-offset-2"
          title="Go to this run"
        >
          {run.sentences} sentences of similar length, from line {run.from_line}
        </button>
      )}

      {m.estimated_seconds != null && (
        <span title={`Estimated at ${m.wpm} words a minute — a convention, not a timing.`}>
          about <span className="font-mono text-ink tabular-nums">{Math.round(m.estimated_seconds)}</span>s spoken
        </span>
      )}

      {(m.observations || []).map((o) => (
        <span key={o.rule} className="basis-full text-inkMuted">
          {o.message}
        </span>
      ))}
    </div>
  );
}
