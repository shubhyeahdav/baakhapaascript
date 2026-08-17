import React from "react";

/**
 * Screenplay format guide for the editor.
 *
 * Onboarding asks how much experience the writer has and the first option
 * promises "Show me what a slugline is and check my format as I write." Until
 * now nothing delivered that: `experience` was stored and never read by
 * anything. This is the thing it was promising.
 *
 * The live indicator reads the current line's INDENTATION, not its content.
 * That is deliberate. The Tab key in this editor cycles a line through
 * 0 → 22 → 15 → 10 → 0 spaces, and those columns *are* the format — so a
 * legend for the indentation the editor itself produces needs no parser and
 * cannot drift from screenplay.py. The linter remains the authority on whether
 * a line is correct; this only says what column you are currently in.
 */

// Indent column -> element. Mirrors the Tab cycle in ScriptEditor.handleKeyDown.
const ELEMENTS = [
  {
    key: "scene_heading",
    indent: 0,
    label: "Scene heading",
    example: "INT. CHIYA PASAL, PATAN - MORNING",
    hint: "Where and when. Starts INT. (inside) or EXT. (outside), ends with the time of day.",
  },
  {
    key: "action",
    indent: 0,
    label: "Action",
    example: "Steam rises from the glasses. Prerana reaches for the next frame.",
    hint: "Only what the camera can see. Present tense. Keep paragraphs under four lines.",
  },
  {
    key: "character",
    indent: 22,
    label: "Character cue",
    example: "SANJANA",
    hint: "The name of whoever speaks next, in capitals.",
  },
  {
    key: "parenthetical",
    indent: 15,
    label: "Parenthetical",
    example: "(not looking up)",
    hint: "Use sparingly. An emotion here is usually the actor's job, not yours.",
  },
  {
    key: "dialogue",
    indent: 10,
    label: "Dialogue",
    example: "Timro result aayo?",
    hint: "What they say. Shorter than real speech — two or three lines at a time.",
  },
  {
    key: "transition",
    indent: 0,
    label: "Transition",
    example: "CUT TO:",
    hint: "Rarely needed. The cut is assumed between scenes.",
  },
];

const SLUG_RE = /^\s*(INT|EXT|I\/E)[.\s/]/i;
const TRANSITION_RE = /^\s*(CUT TO:|FADE (IN|OUT)|DISSOLVE TO:)/i;

/** Which element the caret is currently sitting in, by column. */
function activeElement(line) {
  if (line == null || !line.trim()) return null;
  const indent = line.match(/^ */)[0].length;

  if (indent >= 20) return "character";
  if (indent >= 13) return "parenthetical";
  if (indent >= 8) return "dialogue";
  if (TRANSITION_RE.test(line)) return "transition";
  if (SLUG_RE.test(line)) return "scene_heading";
  return "action";
}

export default function FormatGuide({ currentLine, onClose }) {
  const active = activeElement(currentLine);

  return (
    <aside className="w-72 bg-surface border-l border-border p-5 overflow-y-auto shrink-0 animate-fade-up">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-inkMuted">
            Format guide
          </p>
          <p className="text-[11px] text-inkMuted mt-1 leading-snug">
            Press <kbd className="px-1 py-0.5 rounded bg-elevated border border-borderSoft font-mono text-[10px]">Tab</kbd> to
            move a line between these.
          </p>
        </div>
        <button
          onClick={onClose}
          title="Hide the format guide"
          aria-label="Hide the format guide"
          className="text-inkMuted hover:text-ink text-lg leading-none px-1"
        >
          ×
        </button>
      </div>

      {/* What the caret is in right now. Silent on an empty line rather than
          guessing — a blank line has no element and saying "action" would be
          a confident lie. */}
      <div className="mb-4 rounded-xl border border-borderSoft bg-elevated/40 px-3 py-2.5">
        <div className="font-mono text-[9px] uppercase tracking-wider text-inkMuted mb-0.5">
          You're writing
        </div>
        <div className={`text-[13px] font-medium ${active ? "text-gold" : "text-inkMuted"}`}>
          {active ? ELEMENTS.find((e) => e.key === active).label : "— start typing —"}
        </div>
      </div>

      <div className="space-y-2">
        {ELEMENTS.map((el) => {
          const on = el.key === active;
          return (
            <div
              key={el.key}
              className={`rounded-xl border p-3 transition-colors ${
                on ? "border-gold/40 bg-goldDim/30" : "border-borderSoft bg-elevated/30"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2 mb-1.5">
                <span className={`text-[12.5px] font-semibold ${on ? "text-gold" : "text-inkSoft"}`}>
                  {el.label}
                </span>
                <span className="font-mono text-[9px] text-inkMuted shrink-0">
                  col {el.indent}
                </span>
              </div>
              <pre className="text-[11px] font-mono text-inkSoft bg-bgDeep/50 border border-borderSoft rounded-lg px-2.5 py-1.5 mb-1.5 overflow-x-auto whitespace-pre">
{" ".repeat(Math.min(el.indent, 12))}{el.example}
              </pre>
              <p className="text-[11px] text-inkMuted leading-snug">{el.hint}</p>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-inkMuted mt-4 leading-snug">
        The <span className="text-gold">Craft</span> tab checks your draft against
        these and explains anything it flags.
      </p>
    </aside>
  );
}
