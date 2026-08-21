import React from "react";

/**
 * Type-ahead completion for screenplay format.
 *
 * Type `i` on a blank line and the editor offers `INT. `; type `d` after the
 * dash and it offers `DAY`. The point is that a first-time writer should not
 * have to memorise the shape of a slugline to produce one — they type a letter
 * and the format arrives correctly spelled and correctly spaced.
 *
 * Two of the five vocabularies are harvested from the writer's own draft
 * (locations and character names), which is what makes this better than a
 * static cheat sheet: by scene three, `s` offers SANJANA because Sanjana is in
 * the script.
 *
 * On the deliberate duplication: the harvest below reads lines by shape rather
 * than calling `screenplay.py`. That is a reliability-bar judgement, not an
 * oversight. A missed completion costs a keystroke; a missed lint flag costs
 * trust — so the parser stays the authority for anything that is *judged*
 * (linting, statistics, export), and this only has to be approximately right
 * to be useful. It also has to run on every keystroke, which rules out a
 * round trip.
 */

// Column thresholds mirror ScriptEditor's Tab cycle: 0 → 22 → 15 → 10 → 0.
const CHARACTER_COL = 20;
const PARENTHETICAL_COL = 13;
const DIALOGUE_COL = 8;

const SLUG_PREFIXES = ["INT. ", "EXT. ", "INT./EXT. "];
const TRANSITIONS = ["CUT TO:", "DISSOLVE TO:", "SMASH CUT TO:", "MATCH CUT TO:",
                     "FADE IN:", "FADE OUT.", "FADE TO BLACK."];
const TIMES_OF_DAY = ["DAY", "NIGHT", "MORNING", "EVENING", "AFTERNOON",
                      "DAWN", "DUSK", "CONTINUOUS", "LATER", "MOMENTS LATER"];
const CUE_EXTENSIONS = ["(V.O.)", "(O.S.)", "(CONT'D)"];
const PARENTHETICALS = ["(beat)", "(to himself)", "(to herself)", "(off her look)",
                        "(not looking up)", "(quietly)", "(overlapping)"];

const SLUG_RE = /^\s*(INT\.?\/EXT\.?|EXT\.?\/INT\.?|INT\.?|EXT\.?|I\/E\.?)[\s.]/i;
const TRANSITION_RE = /^\s*(CUT TO:|FADE (IN|OUT)|DISSOLVE TO:|SMASH CUT TO:|MATCH CUT TO:|FADE TO BLACK)/i;

/** Locations and speakers already used in this draft. */
export function harvestVocabulary(text) {
  const locations = new Set();
  const characters = new Set();

  for (const raw of (text || "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;

    if (SLUG_RE.test(line)) {
      // "INT. CHIYA PASAL, PATAN - MORNING" -> "CHIYA PASAL, PATAN"
      const afterPrefix = line.replace(SLUG_RE, "").trim();
      const place = (afterPrefix.split(" - ")[0] || "").trim();
      if (place) locations.add(place.toUpperCase());
      continue;
    }

    if (TRANSITION_RE.test(line)) continue;

    // A character cue is a short all-caps line. Indented is the strong signal,
    // but unindented drafts are common enough to be worth accepting.
    const indent = raw.match(/^ */)[0].length;
    const isShoutedAction = /[.!?,]$/.test(line);
    if (line === line.toUpperCase() && /[A-Z]/.test(line) && line.length <= 40 && !isShoutedAction) {
      if (indent >= CHARACTER_COL || line.split(/\s+/).length <= 4) {
        characters.add(line.replace(/\s*\((V\.O\.|O\.S\.|CONT'D)\)\s*$/i, "").trim());
      }
    }
  }
  return { locations: [...locations], characters: [...characters] };
}

const startsWith = (candidate, fragment) =>
  candidate.toUpperCase().startsWith(fragment.toUpperCase());

/**
 * Drop completions that would complete nothing.
 *
 * Every branch below filters a vocabulary by "starts with what you typed", and
 * a word you have finished typing starts with itself — so finishing MORNING
 * offered you MORNING. That is not merely noise: with one option showing, Enter
 * applied it, the text did not change, the identical suggestion came straight
 * back, and Enter was consumed forever. A writer who typed a complete slugline
 * could not get to the next line at all without pressing Escape first.
 */
const completions = (candidates, fragment) => {
  const typed = (fragment || "").trim().toUpperCase();
  return candidates.filter((c) => c.trim().toUpperCase() !== typed);
};

/**
 * What to offer for the line the caret is on.
 * Returns { fragment, options } — `fragment` is the text to replace.
 */
export function suggestFor(line, caretCol, vocab) {
  const beforeCaret = line.slice(0, caretCol);
  const indent = line.match(/^ */)[0].length;
  const typed = beforeCaret.trim();

  // --- inside a slugline -------------------------------------------------
  if (SLUG_RE.test(beforeCaret)) {
    const dash = beforeCaret.lastIndexOf(" - ");
    if (dash !== -1) {
      // After the dash: time of day.
      const frag = beforeCaret.slice(dash + 3);
      return { fragment: frag, options: completions(TIMES_OF_DAY.filter((t) => startsWith(t, frag)), frag) };
    }
    // Between the prefix and the dash: a location from this draft.
    const frag = beforeCaret.replace(SLUG_RE, "").replace(/^\s+/, "");
    if (!frag) return null;
    return { fragment: frag, options: completions(vocab.locations.filter((l) => startsWith(l, frag)), frag) };
  }

  // --- character cue column ---------------------------------------------
  if (indent >= CHARACTER_COL) {
    if (!typed) return null;
    // Already a full name — offer the extensions that follow one.
    const exact = vocab.characters.find((c) => c.toUpperCase() === typed.toUpperCase());
    if (exact) {
      return { fragment: "", options: CUE_EXTENSIONS };
    }
    return { fragment: typed, options: completions(vocab.characters.filter((c) => startsWith(c, typed)), typed) };
  }

  // --- parenthetical column ---------------------------------------------
  if (indent >= PARENTHETICAL_COL) {
    const frag = typed;
    return {
      fragment: frag,
      options: PARENTHETICALS.filter((p) => !frag || startsWith(p.slice(1), frag.replace(/^\(/, ""))),
    };
  }

  // Dialogue is free prose — never interrupt it with completions.
  if (indent >= DIALOGUE_COL) return null;

  // --- start of a line: slugline prefix or transition --------------------
  if (!typed) return null;
  const options = completions(
    [...SLUG_PREFIXES, ...TRANSITIONS].filter((o) => startsWith(o, typed)),
    typed
  );
  return options.length ? { fragment: typed, options } : null;
}

/**
 * The suggestion strip. Docked under the page rather than floated at the
 * caret: a textarea does not expose caret coordinates, and the usual fix
 * (a mirrored div measuring text) desynchronises the moment the font,
 * padding, or wrap behaviour changes. A fixed strip is always right.
 */
export default function FormatShortcuts({ options, activeIndex, onPick }) {
  if (!options?.length) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-t border-borderSoft bg-surface/95 overflow-x-auto">
      <span className="font-mono text-[9.5px] uppercase tracking-wider text-inkMuted shrink-0">
        Tab
      </span>
      {options.map((opt, i) => (
        <button
          key={opt}
          type="button"
          onMouseDown={(e) => { e.preventDefault(); onPick(i); }}
          className={`shrink-0 font-mono text-[11.5px] px-2.5 py-1 rounded-lg border transition-colors ${
            i === activeIndex
              ? "bg-goldDim border-gold/50 text-gold"
              : "bg-elevated/40 border-borderSoft text-inkMuted hover:text-ink"
          }`}
        >
          {opt.trim()}
        </button>
      ))}
      <span className="text-[10px] text-inkMuted shrink-0 ml-auto pl-3">
        ↑↓ choose · Esc dismiss
      </span>
    </div>
  );
}
