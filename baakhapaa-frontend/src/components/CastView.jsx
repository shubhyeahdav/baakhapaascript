import React, { useEffect, useState } from "react";
import { scripts } from "../services/api";

/**
 * Every character's dialogue, in one place.
 *
 * The reading this product did not have. The linter reads a page, the benchmark
 * reads a shape, the corkboard reads an order — and none of them can answer the
 * question a writer actually arrives with around page thirty, which is "do
 * these two people sound the same?"
 *
 * Reading a character's lines end to end, with nothing between them, is how
 * that gets settled. It is also the oldest trick in the craft and every
 * professional tool has it; this one did not.
 *
 * Free on every tier and no AI call — it is the parser and arithmetic.
 */

/**
 * The three numbers, and why these three.
 *
 * Not a score. Each is chosen because a writer can act on it directly:
 * how long their lines run, how wide their vocabulary is, and how often they
 * ask rather than tell — which is usually the fastest way to see that two
 * voices have collapsed into one.
 */
const MEASURES = [
  { key: "avg_words", label: "words per line", hint: "Two people written at the same speed sound alike" },
  { key: "distinct_ratio", label: "vocabulary", hint: "Share of their words that are different words" },
  { key: "question_share", label: "asks", hint: "How often they ask rather than tell" },
];

function Measure({ label, value, hint }) {
  return (
    <div title={hint} className="min-w-0">
      <div className="font-mono text-[13px] text-ink tabular-nums">{value}</div>
      <div className="text-[9.5px] uppercase tracking-wider text-inkMuted truncate">{label}</div>
    </div>
  );
}

export default function CastView({ scriptId, onOpenLine }) {
  const [characters, setCharacters] = useState(null);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    scripts
      .cast(scriptId)
      .then((res) => live && setCharacters(res.data.characters || []))
      .catch(() => live && setError("Could not read the cast."));
    return () => { live = false; };
  }, [scriptId]);

  if (error) return <p className="text-[12px] text-red-400 px-4">{error}</p>;
  if (!characters) {
    return (
      <div className="space-y-2 px-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 rounded-xl bg-elevated/40 border border-borderSoft animate-pulse" />
        ))}
      </div>
    );
  }

  if (characters.length === 0) {
    return (
      <p className="text-[11.5px] text-inkMuted leading-snug px-4">
        Nobody has spoken yet. Characters appear here once they have lines.
      </p>
    );
  }

  return (
    <div className="px-4 pb-4 space-y-2">
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-inkMuted">
        Cast — {characters.length} {characters.length === 1 ? "voice" : "voices"}
      </div>
      <p className="font-mono text-[10px] text-inkMuted/70 leading-snug pb-1">
        read one voice end to end, with nothing between the lines
      </p>

      {characters.map((c) => {
        const expanded = open === c.name;
        return (
          <div key={c.name} className="rounded-xl border border-borderSoft bg-elevated/40 overflow-hidden">
            <button
              onClick={() => setOpen(expanded ? null : c.name)}
              aria-expanded={expanded}
              className="w-full text-left p-3 hover:bg-elevated/60 transition-colors"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-[12px] text-gold truncate">{c.name}</span>
                <span className="text-[9.5px] font-mono text-inkMuted shrink-0">
                  {c.line_count} {c.line_count === 1 ? "line" : "lines"}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 mt-2">
                {MEASURES.map((m) => (
                  <Measure key={m.key} label={m.label} value={c[m.key]} hint={m.hint} />
                ))}
              </div>

              {/* The voice they described, beside the voice they wrote. This is
                  the only comparison that settles the argument, and the bible
                  was previously spent on prompts and shown to the writer
                  nowhere. */}
              {c.voice && (
                <p className="text-[11px] text-inkSoft leading-snug mt-2 pt-2 border-t border-borderSoft">
                  <span className="text-inkMuted">meant to sound: </span>{c.voice}
                </p>
              )}
            </button>

            {expanded && (
              <div className="border-t border-borderSoft divide-y divide-borderSoft/60">
                {c.lines.map((l) => (
                  <button
                    key={l.line}
                    onClick={() => onOpenLine?.(l.line)}
                    title={`Go to line ${l.line}`}
                    className="w-full text-left px-3 py-1.5 hover:bg-goldDim/30 transition-colors"
                  >
                    <span className="font-mono text-[9.5px] text-gold/60 mr-2">{l.line}</span>
                    <span className="text-[11.5px] text-inkSoft">{l.text}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
