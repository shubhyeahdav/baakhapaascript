import React from "react";
import ThePen from "./ThePen";

/**
 * The Pen, on the blank page.
 *
 * `GuidePanel`'s own docstring says the product "shipped a blank page with a
 * line of formatting jargon on it" — and it was still true of the editor after
 * that panel was built, because the guide lives behind a tab in a four-tab
 * panel and a first-time writer has no reason to press it. The placeholder they
 * actually met read: *"Type Scene Headings starting with INT. or EXT., and
 * press TAB to format characters, parentheticals, and dialogue…"* Which is
 * accurate, and is four pieces of vocabulary aimed at somebody who has none.
 *
 * This is the moment worth spending a character on. The wizard no longer
 * generates a structure, so a new project opens genuinely empty — the single
 * most stuck a writer will ever be in this product. The Pen offers one
 * concrete line to type, and a way into the walkthrough that already exists.
 *
 * THREE RULES, all about not becoming a mascot:
 *
 * 1. It appears only on an empty draft and vanishes on the first keystroke.
 *    Nothing here waits for a dismissal, because anything a writer has to close
 *    is something we made them do.
 * 2. It never appears in focus mode. That mode's whole promise is that nothing
 *    is on the page but the page.
 * 3. It does not block the textarea — `pointer-events-none` on the wrapper — so
 *    a writer who ignores it entirely and starts typing is never interrupted.
 *
 * TWO THINGS THAT ARE EASY TO GET WRONG HERE, both found by opening the page:
 *
 * It needs a z-index. The prompt is painted before the textarea and the
 * screenplay page has an opaque background, so without one the page covers it
 * completely and the component "works" while being invisible.
 *
 * And it sits on the PAPER, not on the app. The app's `inkSoft`/`inkMuted`
 * tokens are tuned for the near-black chrome; on a #FAF9F6 page they wash out
 * to nearly nothing. The paper has its own two themes, so the colours are
 * chosen per page theme rather than inherited from the surrounding app.
 */

const FIRST_LINE = "INT. CHIYA PASAL - DAY";

// Ink for the page, not for the app around it.
const PAPER = {
  light: {
    nib: "text-[#8A6A18]/70",
    lead: "text-[#3A362F]",
    sub: "text-[#6B665C]",
    action: "text-[#8A6A18] border-[#8A6A18]/35 hover:bg-[#8A6A18]/8",
    link: "text-[#5B564C] hover:text-[#8A6A18]",
  },
  dark: {
    nib: "text-gold/70",
    lead: "text-inkSoft",
    sub: "text-inkMuted",
    action: "text-gold border-gold/30 hover:bg-goldDim",
    link: "text-inkSoft hover:text-gold",
  },
};

export default function PenPrompt({ onInsert, onOpenGuide, pageTheme = "light" }) {
  const ink = PAPER[pageTheme] || PAPER.light;
  return (
    <div
      // A fixed offset, not a percentage. The page it sits on is ~1056px tall
      // in light mode and collapses to its content in dark mode, which is
      // pageless by design — so a percentage put the prompt in two completely
      // different places. This clears the first line in both.
      className="absolute inset-x-0 top-28 z-10 flex justify-center px-6 pointer-events-none"
      // Not `aria-live`: this is present from the moment the page loads rather
      // than arriving as news, so announcing it would talk over the writer.
    >
      <div className="pointer-events-auto max-w-md w-full text-center">
        <ThePen mood="idle" size={44} className={`${ink.nib} mx-auto mb-4`} decorative />

        <p className={`text-[14.5px] ${ink.lead} leading-relaxed mb-1`}>
          Every scene starts by saying where we are and when.
        </p>
        <p className={`text-[13px] ${ink.sub} leading-relaxed mb-5`}>
          Type a line like this one, then what the camera sees.
        </p>

        <button
          type="button"
          onClick={() => onInsert(FIRST_LINE)}
          className={`font-mono text-[13px] border rounded-lg px-4 py-2
                      transition-colors ${ink.action}`}
        >
          {FIRST_LINE}
        </button>

        <p className={`text-[12px] ${ink.sub} mt-5`}>
          or{" "}
          <button
            type="button"
            onClick={onOpenGuide}
            className={`underline decoration-dotted underline-offset-2
                        transition-colors ${ink.link}`}
          >
            walk me through a whole scene
          </button>
        </p>
      </div>
    </div>
  );
}
