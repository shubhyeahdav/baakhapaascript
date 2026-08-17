import React from "react";

/**
 * Beat sheet for short-form video.
 *
 * A separate component from StructureTimeline rather than a branch inside it,
 * because the two share almost nothing: acts have durations in minutes and
 * hold scene cards you add one at a time; beats are a fixed contiguous spine
 * measured in seconds where every beat is already present and the only
 * question is what goes in it. Forcing both through one component would mean a
 * component whose every line is an if.
 *
 * The bar is proportional to seconds, which makes the hook's share visible —
 * three seconds out of forty-five looks as small as it is, and that is the
 * point the format most needs to make.
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

export default function ShortFormTimeline({ structure }) {
  const beats = structure?.beats || [];
  if (beats.length === 0) return null;

  const total = structure.total_seconds || beats.reduce((n, b) => n + b.duration_seconds, 0) || 1;

  return (
    <div className="shrink-0 border-b border-border bg-surface/60 px-5 pt-4 pb-5 overflow-y-auto max-h-[45%]">
      <div className="flex items-baseline justify-between mb-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-inkMuted">
          Beat sheet — {structure.category?.replace("_", " ")}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-inkMuted">
          {total}s total
        </span>
      </div>

      {/* Proportional bar. The hook is deliberately tiny — that is the lesson. */}
      <div className="flex gap-0.5 h-2 mb-1 rounded-full overflow-hidden">
        {beats.map((b, i) => (
          <div
            key={b.beat_number}
            className={BEAT_TINT[i % BEAT_TINT.length]}
            style={{ width: `${(b.duration_seconds / total) * 100}%` }}
            title={`${b.name} · ${b.duration_seconds}s`}
          />
        ))}
      </div>
      <div className="flex justify-between font-mono text-[9px] text-inkMuted mb-4">
        <span>0s</span>
        <span>{total}s</span>
      </div>

      <div className="space-y-2">
        {beats.map((b, i) => (
          <div
            key={b.beat_number}
            className="rounded-xl border border-borderSoft bg-elevated/40 p-3"
          >
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <div className="flex items-baseline gap-2 min-w-0">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${BEAT_TINT[i % BEAT_TINT.length]}`} />
                <span className="text-[13px] text-ink font-medium truncate">{b.name}</span>
                <span className="font-mono text-[9.5px] uppercase tracking-wider text-gold/70 shrink-0">
                  {RETENTION_LABEL[b.retention_function] || b.retention_function}
                </span>
              </div>
              <span className="font-mono text-[10px] text-inkMuted shrink-0">
                {b.start_second}–{b.start_second + b.duration_seconds}s
              </span>
            </div>
            <p className="text-[12px] text-inkSoft leading-snug">{b.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
