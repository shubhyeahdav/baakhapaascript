import React from "react";
import PenPrompt from "./PenPrompt";
import MilestoneNote from "./MilestoneNote";
import FormatShortcuts from "./FormatShortcuts";
import { countWords, scenesFromDraft } from "../utils/draft";

// Caret moves that produce no text change, so `onChange` never sees them.
//
// This lived in ScriptEditor.jsx until 2026-09-17 and was left behind when the
// page was extracted out of it: a module-local const in one file, referenced
// from another that never imported it. Every keyup in typewriter mode threw a
// ReferenceError. 1,244 tests did not catch it because ScriptPage.test.jsx
// renders with `typewriter: false`, so the branch is never entered — the first
// run of the new frontend linter found it in seconds.
const NAV_KEYS = new Set([
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "PageUp", "PageDown", "Home", "End",
]);

/**
 * The page a writer types on, and the status line that survives focus mode.
 *
 * Third and last of the extractions out of `ScriptEditor`. Unlike the header
 * and the panel this one is not presentational: the textarea it renders is the
 * caret, the undo stack and the autosave, and every prop below is a live wire
 * back into the page's owner. `replaceRange` exists in the parent precisely
 * because `setContent` discards undo, and nothing here may route around that.
 *
 * Which is also why the state did not come with it. The draft is read by the
 * scene sync, the pagination, the craft linter, the benchmark and the exports;
 * `content` living here would mean lifting it straight back up on the next
 * feature. It is a component so the file can be read, not because ownership
 * moved.
 */
export default function ScriptPage({
  // the draft and the caret
  content, setContent, textareaRef, handleKeyDown, trackCaret,
  updateCaretPage, scrollCaretIntoView, insertAtPosition,
  setSelection,
  // completions
  suggest, setSuggest, suggestIndex, dismissed, setDismissed, applySuggestion,
  // where we are, and whether it is safe
  view, saving, caretPage, pageCount, sessionStart, script,
  milestone, milestoneFacts, onMilestoneAct, onMilestoneDismiss,
  // how the page looks
  zenMode, setZenMode, pageTheme, typewriter, cursor, resting, setResting,
  // handing off to the panel
  setPanelOpen, setPanelTab, setScript,
}) {
  /* The other half of the same rule. On a phone the rail and the page cannot
     both have the width, so exactly one of them is shown: the page while the
     view is `script`, the rail while it is anything else. Above `lg` the page
     is always there, because the rail is a column beside it rather than
     instead of it.

     The textarea is hidden, never unmounted — the caret, the native undo stack
     and the scroll position all live in that DOM node, and remounting it would
     silently throw away all three every time a writer glanced at the
     corkboard. */
  return (
    <div className={`${view === "script" ? "flex" : "hidden"} lg:flex flex-1 flex-col min-w-0`}>

      <div
        className={`flex-1 screenplay-container min-h-0 relative ${zenMode ? "zen-container" : ""}`}
        /* No longer hidden in the other views. Corkboard and Outline moved
           into the left rail, so the page is visible in all three — which
           is also why the caret and the native undo stack now survive a
           view switch by simply never being unmounted. */
      >
        {/* Focus mode's status line.
            Hiding the chrome hides the save indicator too, and "is my work
            saved" is the anxiety that pulls a writer out of focus faster
            than any toolbar would. So the three facts that survive are the
            three worth interrupting for: where you are in the script, what
            you have written since you started, and whether it is safe.
            Everything else stays gone. */}
        {/* The Pen, only on a blank page and never in focus mode.
            A new project now opens genuinely empty — the wizard stopped
            generating a structure — which makes this the most stuck a
            writer is ever going to be here. It disappears on the first
            keystroke rather than waiting to be dismissed. */}
        {view === "script" && !zenMode && !content.trim() && (
          <PenPrompt
            pageTheme={pageTheme}
            /* Without this the guide offers a slugline to a video writer, and
               videoscript parses a slugline as narration — so following the
               product's own advice produced a draft with no sections at all. */
            format={script?.project?.format || script?.format}
            onInsert={(line) => {
              insertAtPosition(0, `${line}

`);
              textareaRef.current?.focus();
            }}
            onOpenGuide={() => {
              setPanelTab("guide");
              setPanelOpen(true);
            }}
          />
        )}

        {zenMode && (
          <div className="zen-hint" aria-live="polite">
            <span className="tabular-nums">
              p. {Math.min(caretPage, pageCount)} / {pageCount}
            </span>
            {sessionStart && (
              <span className="tabular-nums ml-4">
                +{Math.max(0, countWords(content) - sessionStart.words)} words
              </span>
            )}
            <span className="ml-4">{saving ? "Saving…" : "Saved"}</span>
            {/* Clickable, because the toolbar that held the Focus mode
                toggle is now hidden and Esc would otherwise be the only way
                out — fine for anyone who knows, a trap for anyone who does
                not. The strip itself is pointer-events:none so it never
                steals a click meant for the page; this one control opts
                back in. */}
            <button
              type="button"
              onClick={() => setZenMode(false)}
              className="ml-4 opacity-60 hover:opacity-100 hover:text-gold
                         transition pointer-events-auto uppercase tracking-[0.08em]"
            >
              Esc to leave
            </button>
          </div>
        )}
        {/* Page breaks used to be drawn in here as an overlay. Removed:
            a textarea has one continuous flow, so the marker could only
            ever sit ON the text rather than move it, and neither a rule
            nor a gap earned the interruption. `p. N / M` in the toolbar
            still says where you are, and the PDF still paginates for
            real — the two places a page count is actually useful. */}
        {/* ONE flex child, and that is load-bearing.
            `.screenplay-container` is `display:flex` in ROW direction with
            `justify-content:center`, so every direct child becomes a column
            beside the page. The mid-draft note shipped as a second child and
            the pair got centred together — which pushed the paper left of
            centre and left the Pen's blank-page prompt, which centres on the
            container rather than on the paper, sitting off the right edge of
            the page. It looked like a PenPrompt bug and was a flex-direction
            one. Anything that belongs UNDER the page goes inside this column,
            never next to it. */}
        <div className="w-full max-w-[816px] flex flex-col min-w-0">
        <div className="relative w-full flex">
          <textarea
          ref={textareaRef}
          className={`screenplay-page ${pageTheme === "dark" ? "dark-page" : ""} ${zenMode ? "zen-page" : ""} ${typewriter && !zenMode ? "typewriter-page" : ""} ${cursor === "pen" ? "cursor-pen" : cursor === "ring" ? "cursor-ring" : ""} ${resting ? "cursor-resting" : ""} resize-none`}
          /* Short, because the Pen now says the useful version on an empty
             page. This read "Type Scene Headings starting with INT. or
             EXT., and press TAB to format characters, parentheticals, and
             dialogue…" — accurate, and four pieces of vocabulary aimed at
             somebody who has none. */
          placeholder="Start writing…"
          /* A real name, not just a placeholder. A placeholder disappears
             the moment there is text, so a screen-reader user returning to
             a written draft previously met an unnamed textarea — and it
             also means the copy above can change without breaking every
             test that needs to find the page. */
          aria-label="Screenplay"
          value={content}
          onChange={(e) => {
            const nextContent = e.target.value;
            setContent(nextContent);
            setScript((prev) => prev ? {
              ...prev,
              scenes: scenesFromDraft(nextContent, prev.scenes || []),
            } : prev);
            setDismissed(false);
            trackCaret(e);
            // Ordinary typing needs this as much as Enter does: the caret
            // leaves the container's visible window long before it leaves
            // the textarea, and the browser only follows it out of the latter.
            scrollCaretIntoView(typewriter || zenMode);
          }}
          onKeyDown={(e) => { setResting(true); handleKeyDown(e); }}
          onClick={(e) => { trackCaret(e); updateCaretPage(e.currentTarget); }}
          onKeyUp={(e) => {
            trackCaret(e);
            updateCaretPage(e.currentTarget);
            // Typing is handled by onChange. This is for moving the caret
            // WITHOUT typing — arrows, page keys, Home/End. In typewriter
            // mode the line has to hold its position however the caret got
            // there, or navigating up through a scene throws the page out
            // of alignment and the next keystroke snaps it back.
            if (typewriter && NAV_KEYS.has(e.key)) scrollCaretIntoView(true);
          }}
          /* Fires for every way a selection can change: dragging,
             shift-arrows, double-click, select-all. Cheaper and more
             complete than trying to catch each of those separately. */
          onSelect={(e) => {
            const { selectionStart, selectionEnd, value } = e.target;
            setSelection(
              selectionStart === selectionEnd
                ? ""
                : value.slice(selectionStart, selectionEnd),
            );
          }}
          /* Deliberately NOT clearing the selection on blur. Pressing
             Improve moves focus off the page, and the whole feature depends
             on what was highlighted a moment earlier still being known. */
          onBlur={() => setSuggest(null)}
          />
        </div>

        {/* The Pen, mid-draft. Under the last line rather than over it: there
            are pages of the writer's own words here, and a character on top of
            them is the interruption this is trying not to be. A writer
            scrolling to where they stopped arrives at it; a writer working
            further up never sees it. Never in focus mode, for the reason
            everything else is hidden there. */}
        {view === "script" && !zenMode && (
          <MilestoneNote
            milestone={milestone}
            facts={milestoneFacts}
            pageTheme={pageTheme}
            onAct={onMilestoneAct}
            onDismiss={onMilestoneDismiss}
          />
        )}
        </div>
      </div>

      {/* Type-ahead strip. Hidden in zen mode — the point of focus mode is
          that nothing appears while you write. */}
      {!zenMode && !dismissed && (
        <FormatShortcuts
          options={suggest?.options}
          activeIndex={suggestIndex}
          onPick={applySuggestion}
        />
      )}
    </div>
  );
}
