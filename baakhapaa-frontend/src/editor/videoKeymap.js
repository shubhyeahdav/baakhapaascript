/**
 * Keyboard rules for long-form video.
 *
 * The second factory `screenplayKeymap.js` asks for in its own header:
 *
 *   "A second format needs a second factory beside this one, not a flag
 *    inside it."
 *
 * Same option object as the screenplay factory, so `ScriptEditor` chooses
 * between them with one expression and neither knows the other exists. The
 * options it does not use are accepted and ignored rather than omitted —
 * making the caller pass a different shape per format is how the call site
 * grows a branch, which is the thing this split exists to prevent.
 *
 * What is NOT here is the point. No indent cycle, no character column, no
 * dialogue column, no slugline completion. A screenplay page has columns
 * because the format is read by a crew; a video script is prose read aloud by
 * one person, and inheriting that geometry would indent narration into a
 * dialogue block the parser then reads as narration anyway.
 */
import { ELEMENTS, elementOf, enterText, tabCycle } from "../utils/videoFormat";
import { DANDA } from "../utils/nepaliTransliterate";
import { placeCaret } from "./placeCaret";

// Shared with the screenplay factory on purpose: a writer switching formats
// should not find the Nepali keys behaving differently.
export const WORD_BOUNDARY_KEYS = [" ", "Enter", ".", ",", "?", "!", ";", ":"];

/** The bounds of the line the caret sits on. */
function lineBounds(value, caret) {
  const start = value.lastIndexOf("\n", caret - 1) + 1;
  const end = value.indexOf("\n", caret);
  return { start, end: end === -1 ? value.length : end };
}

export function createVideoKeyHandler({
  nepaliMode,
  transliterateBehindCaret,
  replaceRange,
  scrollCaretIntoView,
  typewriter,
  zenMode,
}) {
  return (e) => {
    // Nepali phonetic input first, before anything else reads the key. Not
    // prevented — the boundary character still gets typed, after the word in
    // front of it has become Devanagari.
    if (nepaliMode && WORD_BOUNDARY_KEYS.includes(e.key)) {
      transliterateBehindCaret(e.currentTarget);
    }

    // Devanagari ends a sentence with a danda. `|` is the convention romanised
    // Nepali already uses, and typing a pipe into narration is not otherwise a
    // thing anyone does.
    if (nepaliMode && e.key === "|") {
      e.preventDefault();
      const ta = e.currentTarget;
      replaceRange(ta.selectionStart, ta.selectionEnd, DANDA);
      return;
    }

    const ta = e.currentTarget;

    // A selection means the writer is replacing text, not formatting a line.
    // Tab with a selection would silently delete it, which is the kind of loss
    // that is only noticed later.
    if (ta.selectionStart !== ta.selectionEnd) return;

    const caret = ta.selectionStart;
    const { start, end } = lineBounds(ta.value, caret);
    const line = ta.value.slice(start, end);

    if (e.key === "Enter") {
      e.preventDefault();
      // Inside a cue, Enter CLOSES it: the newline goes after the `]`, not at
      // the caret. Tab lands the caret inside the bracket, so "type the cue,
      // press Enter" is the normal path — and inserting at the caret split
      // `[B-ROLL: city|]` into `[B-ROLL: city` and a stray `]`, both of which
      // then parse as narration and count toward the runtime.
      const el = elementOf(line);
      const inCue = el === ELEMENTS.BROLL || el === ELEMENTS.ON_SCREEN;
      const at = inCue ? end : caret;
      replaceRange(at, at, enterText(line));
      if (inCue && at !== caret) {
        placeCaret(ta, at + enterText(line).length);
      }
      scrollCaretIntoView(typewriter || zenMode);
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      // `caretOffset` is why this is not a text swap: a cue is inserted with
      // its bracket already closed, so the caret has to land INSIDE it or the
      // writer's next keystroke goes after the `]`.
      const { text, caretOffset } = tabCycle(line);
      replaceRange(start, end, text);
      placeCaret(ta, start + caretOffset, () => scrollCaretIntoView(typewriter || zenMode));
    }
  };
}
