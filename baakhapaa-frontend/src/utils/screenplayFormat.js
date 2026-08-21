/**
 * What Enter does, in screenplay terms.
 *
 * Kept out of the editor component because this is the single most-used piece
 * of logic in the product — it runs on every line a writer types — and inline
 * in a keydown handler it could not be tested at all. It shipped inserting a
 * bare newline everywhere, which is not screenplay format: a writer had to
 * press Enter twice all day, and a page typed the natural way came out as one
 * solid block that the parser, the page count and the exports each read
 * differently from how it looked on screen.
 *
 * The column values are the ones the Tab cycle uses, so the two agree about
 * what element an indent means.
 */
export const ACTION_COL = 0;
export const DIALOGUE_COL = 10;
export const PARENTHETICAL_COL = 15;
export const CHARACTER_COL = 22;

const SLUG_RE = /^(INT\.|EXT\.|INT\/EXT\.|INT\.\/EXT\.|I\/E\.)/i;
// A transition is all-caps and short, exactly like a cue, and ends in a colon
// rather than a full stop — so the "unpunctuated" test alone let CUT TO: read
// as somebody about to speak, and Enter indented the next line as dialogue.
const TRANSITION_RE = /^(CUT TO:|DISSOLVE TO:|SMASH CUT TO:|MATCH CUT TO:|FADE (IN|OUT)\.?:?|FADE TO BLACK\.?|THE END\.?)$/i;

/** A slugline: the line that opens a scene. */
export function isSlugline(trimmed) {
  return SLUG_RE.test(trimmed);
}

/**
 * A character cue: short, all-caps, unpunctuated.
 *
 * Deliberately the same shape the backend parser uses, so the editor and the
 * parser cannot disagree about what a cue is — a line the editor indents as
 * dialogue but the parser reads as action would corrupt every downstream
 * count.
 */
export function isCharacterCue(trimmed, indent) {
  if (indent === CHARACTER_COL) return true;
  if (!trimmed || trimmed.length > 45) return false;
  if (isSlugline(trimmed)) return false;
  if (TRANSITION_RE.test(trimmed)) return false;
  if (trimmed !== trimmed.toUpperCase()) return false;
  if (!/[A-Z]/.test(trimmed)) return false;
  return !/[.!?,:]$/.test(trimmed);
}

export function isParenthetical(trimmed, indent) {
  return indent === PARENTHETICAL_COL || (trimmed.startsWith("(") && trimmed.endsWith(")"));
}

/**
 * Given the line the caret is leaving, what the next line should be.
 *
 * Returns `{ indent, blankLine }`. A blank line goes between every pair of
 * elements EXCEPT a cue (or its parenthetical) and the dialogue beneath it —
 * that pair is set solid, which is what makes a screenplay page readable.
 *
 * `atLineEnd` is false when the writer is splitting a line from the middle;
 * that must never gain a blank line, and neither must Enter on an already
 * empty line. Both would insert white space nobody asked for.
 */
export function nextLine(currentLine, atLineEnd = true) {
  const indent = currentLine.match(/^ */)[0].length;
  const trimmed = currentLine.trim();

  let result;
  if (isSlugline(trimmed)) {
    result = { indent: ACTION_COL, blankLine: true };
  } else if (isCharacterCue(trimmed, indent)) {
    result = { indent: DIALOGUE_COL, blankLine: false };
  } else if (isParenthetical(trimmed, indent)) {
    result = { indent: DIALOGUE_COL, blankLine: false };
  } else if (indent === DIALOGUE_COL) {
    result = { indent: ACTION_COL, blankLine: true };
  } else {
    result = { indent, blankLine: true };
  }

  if (!trimmed || !atLineEnd) result.blankLine = false;
  return result;
}

/** The literal text Enter inserts. */
export function enterText(currentLine, atLineEnd = true) {
  const { indent, blankLine } = nextLine(currentLine, atLineEnd);
  return (blankLine ? "\n\n" : "\n") + " ".repeat(indent);
}
