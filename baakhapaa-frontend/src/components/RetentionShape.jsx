import React from "react";
import { shape, timecode } from "../lib/retention";

/**
 * Where a long-form video's sections fall, against where attention goes.
 *
 * The screenplay equivalent is `CompactTimeline`, which draws act balance. A
 * video essay has no acts; it has a runtime with known places people leave. So
 * this is the same kind of object — an instrument, not a diagram — reading the
 * thing this format actually fails at: a forty-second hook and a twenty-second
 * payoff.
 *
 * **It says the curve is a convention.** Nothing in this repository can observe
 * how anyone watches a video; a writer's own analytics would be a measurement
 * and this is not. The line under the bar states that, and it is not decorative
 * — an instrument that implies a precision it does not have is worse than no
 * instrument, because it gets believed.
 *
 * Nothing here tells a writer their hook is too long. It says how long the hook
 * is and where the drop conventionally falls. A forty-second hook is wrong in
 * most videos and exactly right in some, and this cannot tell which.
 */

// One colour per section kind. Hook and payoff carry the gold because they are
// the two the instrument exists to compare; the middle is deliberately quieter.
const KIND = {
  hook: { fill: "bg-gold/70", text: "text-gold", label: "Hook" },
  promise: { fill: "bg-gold/40", text: "text-gold", label: "Promise" },
  segment: { fill: "bg-inkMuted/30", text: "text-inkSoft", label: "Segment" },
  payoff: { fill: "bg-gold/55", text: "text-gold", label: "Payoff" },
  cta: { fill: "bg-inkMuted/20", text: "text-inkMuted", label: "Call to action" },
};

const kindOf = (k) => KIND[k] || KIND.segment;

export default function RetentionShape({ sections = [], onOpen }) {
  const { total, bands, marks } = shape(sections);

  if (!bands.length) {
    // No reading. An instrument with nothing to show shows nothing — a bar of
    // equal grey blocks would be an invented shape.
    return (
      <p className="text-[12.5px] text-inkMuted leading-relaxed">
        Give a section a target — <span className="font-mono">## HOOK - 0:15</span> —
        and the shape of the video appears here.
      </p>
    );
  }

  return (
    <section aria-label="The shape of this video" className="mb-5">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="font-mono text-[10px] uppercase tracking-wider text-inkMuted">
          Shape
        </h3>
        <span className="font-mono text-[10px] text-inkMuted tabular-nums">
          {timecode(total)}
        </span>
      </div>

      <div className="relative">
        {/* The sections, proportional. A button rather than a div: the whole
            point is getting from "the payoff is tiny" to the payoff. */}
        <div className="flex h-8 rounded overflow-hidden border border-border">
          {bands.map((band) => {
            const k = kindOf(band.kind);
            const over = band.overrunSeconds;
            return (
              <button
                key={band.key}
                type="button"
                onClick={() => onOpen?.(band)}
                style={{ flexGrow: band.share, flexBasis: 0 }}
                title={
                  `${band.heading || k.label} — ${timecode(band.seconds)} planned`
                  + (band.writtenSeconds
                    ? `, ${timecode(band.writtenSeconds)} written`
                    : ", nothing written yet")
                  + (over ? ` (${over > 0 ? "+" : ""}${Math.round(over)}s)` : "")
                }
                /* `min-w-[24px]`, not a proportion. `retention.MIN_SHARE`
                   floors a section's SHARE of the bar, which guarantees nothing
                   in pixels: measured at 320px, a fifteen-second hook in a
                   eleven-minute video rendered 7px wide — a control no thumb
                   can hit, and precisely the section this instrument exists to
                   draw attention to. The WCAG 2.2 floor is 24px. */
                className={`${k.fill} min-w-[24px] border-r border-bg/40 last:border-r-0
                            hover:brightness-125 transition-[filter] relative`}
              >
                <span className="sr-only">
                  {band.heading || k.label}, {timecode(band.seconds)}
                </span>
              </button>
            );
          })}
        </div>

        {/* The conventional drop-offs, over the sections rather than beside
            them — the whole question is which section a drop lands in. */}
        {marks.map((mark) => (
          <div
            key={mark.key}
            aria-hidden="true"
            title={`${mark.label} — ${mark.note}`}
            style={{ left: `${mark.position * 100}%` }}
            className="absolute top-0 h-8 w-px bg-ink/60 pointer-events-none"
          >
            <span className="absolute -top-0.5 -translate-x-1/2 text-[9px] font-mono text-ink/70 bg-bg px-1 rounded">
              {mark.label}
            </span>
          </div>
        ))}
      </div>

      {/* What each block is. Four kinds is few enough to name rather than make
          somebody hover to find out. */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
        {bands.map((band) => {
          const k = kindOf(band.kind);
          return (
            /* The legend is the reliable way in, and on a phone it is the
               only one: enough sections at 320px and the bar runs out of room
               for 24px blocks, at which point it clips. A written-out row per
               section cannot clip, and it is a real target at any width. */
            <button
              key={`k-${band.key}`}
              type="button"
              onClick={() => onOpen?.(band)}
              aria-label={`Go to ${band.heading || k.label}`}
              className="tap font-mono text-[9.5px] tabular-nums text-inkMuted hover:text-ink transition-colors"
            >
              <span className={k.text}>{band.heading || k.label}</span>{" "}
              {timecode(band.seconds)}
            </button>
          );
        })}
      </div>

      {/* Not a footnote. An instrument that implies a precision it does not
          have gets believed, and this one cannot see a single real viewer. */}
      <p className="text-[11px] text-inkMuted leading-relaxed mt-2.5">
        The marks are where viewers generally leave — a convention, not a
        measurement of your video. Your own analytics are the real answer.
      </p>
    </section>
  );
}
