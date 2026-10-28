/**
 * Type-ahead completion for long-form video.
 *
 * The screenplay version of this (`FormatShortcuts.suggestFor`) decides what
 * to offer from the caret's COLUMN: indent 20 means a character cue, 13 a
 * parenthetical, 8 dialogue. A video script has no columns, so none of that
 * transfers — and a mode flag inside it would put every screenplay regression
 * one branch away from a video edit, which is the reason `videoKeymap.js`
 * exists beside `screenplayKeymap.js` rather than inside it.
 *
 * ONE RULE WORTH STATING: completions here are TRIGGERED, never ambient.
 *
 * The screenplay path offers slugline prefixes from a single letter at the
 * start of a line, which works because a screenplay line starting with a bare
 * `i` is almost always about to be `INT.`. Narration is prose. A writer typing
 * "People keep asking me..." would be offered `## PROMISE` on the P, every
 * sentence, forever. So nothing is offered until the writer has typed `##` or
 * `[` — two characters that mean nothing else in this format and are the
 * format's own punctuation.
 *
 * The vocabulary comes from `videoSections.js`, which is pinned against
 * `videoscript.py`. Only canonical names are offered: the parser ACCEPTS
 * `## INTRO` for a hook, but offering a writer four names for one section is a
 * menu rather than help.
 */
import { kindsFor, modeOf, DEFAULT_MODE } from "./videoSections";

const HEADING_TRIGGER = "##";

/** `[B-ROLL: ]` and `[ON SCREEN: ]` — the same two the Tab cycle produces. */
export const CUE_COMPLETIONS = [
  { text: "[B-ROLL: ]", caretBack: 1 },
  { text: "[ON SCREEN: ]", caretBack: 1 },
];

/** `## HOOK` … `## CTA`, or `## OBJECTIVE` … `## CHECK`. */
export function headingsFor(mode = DEFAULT_MODE) {
  return kindsFor(mode).map((kind) => `## ${kind.toUpperCase()}`);
}

/**
 * Drop an option identical to what has been typed.
 *
 * Same guard, and the same reason, as the screenplay module's: a word you have
 * finished typing starts with itself, so finishing `## HOOK` offered you
 * `## HOOK`. With one option showing, Enter applied it, the text did not
 * change, the identical suggestion came straight back, and Enter was consumed
 * forever — a writer who typed a complete heading could not reach the next
 * line without pressing Escape first.
 */
const notAlreadyTyped = (candidates, typed) => {
  const t = (typed || "").trim().toUpperCase();
  return candidates.filter((c) => {
    const text = typeof c === "string" ? c : c.text;
    return text.trim().toUpperCase() !== t;
  });
};

const startsWith = (candidate, fragment) =>
  candidate.toUpperCase().startsWith(fragment.toUpperCase());

/**
 * What to offer for the line the caret is on.
 *
 * Returns `{ fragment, options, caretBack? }` to match the screenplay module,
 * because `ScriptEditor.applySuggestion` replaces exactly `fragment.length`
 * characters immediately before the caret. The fragment therefore INCLUDES the
 * `##` or `[` trigger — returning just the letters after it would leave the
 * trigger in place and produce `## ## HOOK`.
 *
 * `caretBack` is how far to step the caret back from the end of what was
 * inserted. A cue arrives with its bracket already closed, so without it the
 * writer's next keystroke lands after the `]` — the same trap `tabCycle`'s
 * `caretOffset` exists to avoid.
 */
export function suggestForVideo(line, caretCol, { mode = DEFAULT_MODE } = {}) {
  const beforeCaret = (line || "").slice(0, caretCol);
  const fragment = beforeCaret.replace(/^\s+/, "");

  // --- a section heading -------------------------------------------------
  if (fragment.startsWith(HEADING_TRIGGER)) {
    const typedName = fragment.slice(HEADING_TRIGGER.length).replace(/^\s+/, "");
    const candidates = headingsFor(mode).filter((h) =>
      startsWith(h.slice(HEADING_TRIGGER.length).trim(), typedName));
    const options = notAlreadyTyped(candidates, fragment);
    return options.length ? { fragment, options } : null;
  }

  // --- a cue -------------------------------------------------------------
  // Both modes. A course lesson cuts to b-roll and puts text on screen for the
  // same reasons an essay does; nothing about the two crafts differs here, and
  // withholding them from course writers would be a distinction with no
  // argument behind it.
  if (fragment.startsWith("[")) {
    const matching = CUE_COMPLETIONS.filter((c) => startsWith(c.text, fragment));
    const usable = notAlreadyTyped(matching, fragment);
    if (!usable.length) return null;
    return {
      fragment,
      options: usable.map((c) => c.text),
      // Both cues close with a single `]`, so one value serves the whole list.
      // If a cue with a longer tail is ever added, this becomes per-option.
      caretBack: usable[0].caretBack,
    };
  }

  // Narration is free prose — never interrupt it.
  return null;
}

/** The suggester for a project, by format and category. */
export const videoSuggesterFor = (videoCategory) => {
  const mode = modeOf(videoCategory);
  return (line, caretCol) => suggestForVideo(line, caretCol, { mode });
};
