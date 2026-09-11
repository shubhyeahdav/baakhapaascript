import React from "react";
import ThePen from "./ThePen";

/**
 * The Pen, in the middle of a draft.
 *
 * `PenPrompt` is the same character on an empty page; this is what it says
 * once there is a script. The logic for *when* lives in `lib/milestones.js` and
 * is tested there — this file is only the saying of it.
 *
 * It sits at the foot of the page rather than over it. `PenPrompt` can float
 * because there is nothing underneath; here there are pages of the writer's
 * own words, and putting a character on top of them would be exactly the
 * interruption the whole design is trying not to be. So it comes after the
 * last line: a writer scrolling to where they stopped writing arrives at it,
 * and a writer working further up never sees it at all.
 *
 * Dismissal is a real X, unlike PenPrompt's — that one vanishes on the first
 * keystroke and so never needs one. This one is anchored to a moment in the
 * script rather than to an empty page, and a writer who does not want to be
 * spoken to needs a way to say so that the product remembers.
 *
 * Colours come from the page theme for the reason PenPrompt documents: the
 * app's ink tokens are tuned for near-black chrome and wash out on #FAF9F6
 * paper.
 */

const PAPER = {
  light: {
    nib: "text-[#8A6A18]/70",
    lead: "text-[#3A362F]",
    sub: "text-[#6B665C]",
    action: "text-[#8A6A18] border-[#8A6A18]/35 hover:bg-[#8A6A18]/8",
    close: "text-[#6B665C]/60 hover:text-[#3A362F]",
    rule: "border-[#8A6A18]/15",
  },
  dark: {
    nib: "text-gold/70",
    lead: "text-inkSoft",
    sub: "text-inkMuted",
    action: "text-gold border-gold/30 hover:bg-goldDim",
    close: "text-inkMuted hover:text-ink",
    rule: "border-border",
  },
};

export default function MilestoneNote({
  milestone,
  facts,
  pageTheme = "light",
  onAct,
  onDismiss,
}) {
  if (!milestone) return null;
  const c = PAPER[pageTheme] || PAPER.light;

  return (
    <aside
      aria-label="A note from The Pen"
      className={`mt-8 pt-5 border-t ${c.rule} flex gap-3 items-start`}
    >
      <ThePen decorative className={`w-5 h-5 shrink-0 mt-0.5 ${c.nib}`} />

      <div className="flex-1 min-w-0">
        <p className={`text-[13px] leading-snug ${c.lead}`}>
          {milestone.lead(facts)}
        </p>
        <p className={`text-[12.5px] leading-relaxed mt-1 ${c.sub}`}>
          {milestone.body}
        </p>
        <button
          type="button"
          onClick={() => onAct?.(milestone)}
          className={`tap mt-2.5 text-[11.5px] px-2.5 py-1 rounded-full border transition-colors ${c.action}`}
        >
          {milestone.cta.label}
        </button>
      </div>

      <button
        type="button"
        onClick={() => onDismiss?.(milestone)}
        aria-label="Dismiss this note"
        title="Dismiss this note"
        // `tap` fixes the HEIGHT only — its overlay keeps the element's own
        // width so it cannot steal a neighbour's clicks. At px-1.5 this was
        // 22px wide, still 2px under the 24px floor, so the padding carries
        // the width and `tap` carries the height.
        className={`tap text-[15px] leading-none px-2 py-1 shrink-0 transition-colors ${c.close}`}
      >
        ×
      </button>
    </aside>
  );
}
