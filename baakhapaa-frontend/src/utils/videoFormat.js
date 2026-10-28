/**
 * What the keys do, in long-form video terms.
 *
 * Parallel to `screenplayFormat.js` and deliberately NOT a mode inside it:
 * this format has no column arithmetic at all. There is no cue column, no
 * dialogue indent, and an all-caps line is narration rather than a speaker.
 * Sharing the module would put every screenplay regression one branch away
 * from a video edit.
 *
 * The patterns match `videoscript.py`'s so the editor and the parser cannot
 * disagree about what a line is.
 */
const SECTION_RE = /^\s*##\s+([^\n\-—]+?)(?:\s*[-—]\s*(\d+):(\d{1,2}))?\s*$/;
const CUE_RE = /^\s*\[([A-Z][A-Z\s-]*?):\s*(.*?)\]\s*$/;

export const ELEMENTS = {
  NARRATION: "narration",
  BROLL: "broll",
  ON_SCREEN: "on_screen",
  HEADING: "section_heading",
};

export const UNTITLED_SECTION = "(untitled opening)";

const BROLL_OPEN = "[B-ROLL: ";
const ON_SCREEN_OPEN = "[ON SCREEN: ";

export function elementOf(line) {
  const trimmed = (line || "").trim();
  if (SECTION_RE.test(trimmed)) return ELEMENTS.HEADING;
  const cue = CUE_RE.exec(trimmed);
  if (cue) {
    return cue[1].trim().toUpperCase().startsWith("ON SCREEN")
      ? ELEMENTS.ON_SCREEN
      : ELEMENTS.BROLL;
  }
  return ELEMENTS.NARRATION;
}

/**
 * A heading and a cue both END something, so both get a blank line after them.
 * Narration is continuous prose and gets a single newline.
 */
export function enterText(currentLine) {
  const el = elementOf(currentLine);
  return el === ELEMENTS.NARRATION ? "\n" : "\n\n";
}

/**
 * narration -> b-roll -> on-screen -> narration.
 *
 * Three of the four element types; the fourth is the section heading, which
 * Tab does not produce. Headings come from the scaffold and the completions,
 * because inventing one silently would put a structural boundary in a draft
 * the writer did not ask for.
 */
export function tabCycle(currentLine) {
  const el = elementOf(currentLine);
  if (el === ELEMENTS.HEADING) return { text: currentLine, caretOffset: currentLine.length };
  if (el === ELEMENTS.NARRATION) {
    return { text: `${BROLL_OPEN}]`, caretOffset: BROLL_OPEN.length };
  }
  if (el === ELEMENTS.BROLL) {
    return { text: `${ON_SCREEN_OPEN}]`, caretOffset: ON_SCREEN_OPEN.length };
  }
  return { text: "", caretOffset: 0 };
}

const WORDS = (s) => (s.trim() ? s.trim().split(/\s+/).length : 0);

/**
 * Which section the caret is in, and how much has been SAID in it.
 *
 * Only narration counts toward the word total. Nobody reads a heading or a
 * bracketed cue aloud, and counting them would inflate every runtime the
 * status line shows -- the same rule `videoscript.runtime_seconds` follows.
 */
export function sectionAt(content, caretLine) {
  const lines = (content || "").split("\n");
  if (!(content || "").trim()) return null;

  let current = null;
  for (let i = 0; i < lines.length; i += 1) {
    const lineNo = i + 1;
    const m = SECTION_RE.exec(lines[i].trim());
    if (m) {
      const next = {
        name: (m[1] || "").trim(),
        kind: null,
        targetSeconds: m[2] === undefined ? null : Number(m[2]) * 60 + Number(m[3]),
        wordsBefore: 0,
      };
      if (lineNo > caretLine && current) break;
      current = next;
      continue;
    }
    if (lineNo > caretLine) break;
    if (!current) {
      current = { name: UNTITLED_SECTION, kind: null, targetSeconds: null, wordsBefore: 0 };
    }
    if (elementOf(lines[i]) === ELEMENTS.NARRATION) {
      current.wordsBefore += WORDS(lines[i]);
    }
  }
  return current;
}
