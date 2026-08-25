import React, { useState } from "react";

/**
 * Beat sheet for short-form video.
 *
 * A separate component from StructureTimeline rather than a branch inside it,
 * because the two share almost nothing: acts have durations in minutes and
 * hold scene cards you add one at a time; beats are a fixed contiguous spine
 * measured in seconds where every beat is already present and the only
 * question is what goes in it.
 *
 * The bar is proportional to seconds, which makes the hook's share visible —
 * three seconds out of forty-five looks as small as it is, and that is the
 * point the format most needs to make.
 *
 * It used to render every beat as a full card underneath that bar, and with
 * five beats the strip took a third of the editor: the writing page began
 * below the fold on a laptop, which is an odd thing for a writing tool to do.
 * The information was not the problem — a beat sheet you can see while writing
 * is the whole point — the shape was. The bar already divides the runtime, so
 * the beats are now labelled *inside it* and the prose for one beat appears
 * only when you ask for it. Same content, roughly a third of the height.
 */

const RETENTION_LABEL = {
  stop_scroll: "stop the scroll",
  open_loop: "open a loop",
  payoff: "pay it off",
  rewatch_trigger: "earn a rewatch",
  share_trigger: "earn a share",
};

// Warm at the hook, cooling toward the CTA — reads as a timeline, not a chart.
const BEAT_TINT = [
  "bg-gold/70",
  "bg-gold/50",
  "bg-gold/35",
  "bg-skyAccent/40",
  "bg-inkMuted/30",
];

// Below this share of the runtime a segment cannot hold its own name. The hook
// is routinely 6% of a reel, so this is the normal case, not the edge one.
const LABEL_MIN_SHARE = 0.14;

export default function ShortFormTimeline({ structure }) {
  const beats = structure?.beats || [];
  // The hook is beat one and the one most worth reading, so it opens selected
  // rather than making the writer discover that the bar is clickable.
  const [selected, setSelected] = useState(0);

  if (beats.length === 0) return null;

  const total =
    structure.total_seconds || beats.reduce((n, b) => n + b.duration_seconds, 0) || 1;
  const active = beats[Math.min(selected, beats.length - 1)];

  return (
    <div className="shrink-0 border-b border-border bg-surface/60 px-5 pt-3 pb-3.5">
      <div className="flex items-baseline justify-between mb-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-inkMuted">
          Beat sheet — {structure.category?.replace("_", " ")}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-inkMuted">
          {total}s total
        </span>
      </div>

      {/* The bar carries the beats. Proportional, so the hook stays visibly
          tiny, and each segment is the control that opens its own detail. */}
      <div
        className="flex w-full h-9 rounded overflow-hidden border border-border"
        role="tablist"
        aria-label="Beats"
      >
        {beats.map((b, i) => {
          const share = b.duration_seconds / total;
          const isActive = i === Math.min(selected, beats.length - 1);
          return (
            <button
              key={b.beat_number}
              role="tab"
              aria-selected={isActive}
              onClick={() => setSelected(i)}
              style={{ width: `${share * 100}%` }}
              title={`${b.name} · ${b.start_second}–${b.start_second + b.duration_seconds}s`}
              className={`relative flex items-center gap-1.5 px-2 border-r border-border last:border-r-0 min-w-0 transition ${
                isActive ? "bg-elevated" : "bg-elevated/40 hover:bg-elevated/70"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${BEAT_TINT[i % BEAT_TINT.length]}`} />
              {share >= LABEL_MIN_SHARE && (
                <span
                  className={`text-[11px] truncate ${isActive ? "text-ink" : "text-inkSoft"}`}
                >
                  {b.name}
                </span>
              )}
              {/* The underline is what makes this read as a selected tab rather
                  than a coloured block. */}
              {isActive && (
                <span className="absolute left-0 right-0 bottom-0 h-[2px] bg-gold" />
              )}
            </button>
          );
        })}
      </div>

      {/* One beat's prose, in the space one card used to take for five. */}
      {active && (
        <div className="flex items-baseline gap-2 mt-2">
          <span className="font-mono text-[9.5px] uppercase tracking-wider text-gold/70 shrink-0">
            {RETENTION_LABEL[active.retention_function] || active.retention_function}
          </span>
          <span className="font-mono text-[9.5px] text-inkMuted shrink-0">
            {active.start_second}–{active.start_second + active.duration_seconds}s
          </span>
          <p className="text-[12px] text-inkSoft leading-snug min-w-0">
            {active.description}
          </p>
        </div>
      )}
    </div>
  );
}
