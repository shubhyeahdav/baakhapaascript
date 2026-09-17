/**
 * What the keyboard does on the screenplay page.
 *
 * Lifted out of `ScriptEditor.jsx` unchanged. That file is 1,712 lines and is
 * the product; this was 118 of them, it is the most-used logic in the editor —
 * it runs on every keystroke a writer makes — and inside a component it could
 * not be tested at all without mounting the whole editor.
 *
 * A factory rather than a hook, deliberately. Nothing here holds React state:
 * it reads values and calls handlers it is given. A plain function can be
 * called directly from a test with a fake event, which is the difference
 * between testing the Tab cycle and testing a rendered textarea.
 *
 * Recreated on every render, exactly as the inline arrow function was. It
 * closes over nothing but its own argument, so there is nothing to memoise and
 * a stale-closure bug has nowhere to live.
 *
 * The rules themselves are screenplay rules — the indent cycle is
 * action/character/parenthetical/dialogue, and Enter follows
 * `utils/screenplayFormat`. A second format needs a second factory beside this
 * one, not a flag inside it.
 */
import { enterText } from "../utils/screenplayFormat";
import { DANDA } from "../utils/nepaliTransliterate";

/**
 * The keys that end a word.
 *
 * Space and Enter do most of the work; the punctuation is here so a line
 * ending in "?" converts its last word too, which in dialogue is most of them.
 */
export const WORD_BOUNDARY_KEYS = [" ", "Enter", ".", ",", "?", "!", ";", ":"];

export function createScreenplayKeyHandler({
  nepaliMode,
  transliterateBehindCaret,
  replaceRange,
  suggest,
  dismissed,
  setDismissed,
  applySuggestion,
  suggestIndex,
  setSuggestIndex,
  scrollCaretIntoView,
  typewriter,
  zenMode,
}) {
  return (e) => {
      // Nepali phonetic input, before anything else looks at the key. Not
      // prevented — the boundary character itself still gets typed, after the
      // word in front of it has become Devanagari.
      if (nepaliMode && WORD_BOUNDARY_KEYS.includes(e.key)) {
        transliterateBehindCaret(e.currentTarget);
      }

      // Devanagari ends a sentence with a danda, not a full stop. `|` is the
      // convention Roman Nepali already uses for it, and typing a pipe into
      // dialogue is not otherwise a thing anyone does.
      if (nepaliMode && e.key === "|") {
        e.preventDefault();
        transliterateBehindCaret(e.currentTarget);
        const ta = e.currentTarget;
        requestAnimationFrame(() => replaceRange(ta.selectionStart, ta.selectionEnd, DANDA));
        return;
      }

      // Completion keys, only while a suggestion is showing. Tab is the key a
      // screenwriter already reaches for to "make the format right", so it does
      // both jobs: take the completion when there is one, cycle the indent when
      // there isn't. The two never compete — a suggestion requires typed text,
      // and indent-cycling is what you want on a line you haven't typed on yet.
      const open = suggest && !dismissed;
      if (open) {
        // Tab completes. Enter never does.
        //
        // Enter used to take the completion whenever exactly one was showing,
        // which cost a writer the one key they cannot do without: finishing a
        // slugline offered the word already typed, Enter "applied" it, nothing
        // changed, the same suggestion returned, and the line break never
        // happened. The strip has always said Tab; now that is the whole truth.
        if (e.key === "Tab") {
          e.preventDefault();
          applySuggestion(suggestIndex);
          return;
        }
        if (e.key === "Enter") {
          // Fall through to the newline, and get the strip out of the way.
          setDismissed(true);
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSuggestIndex((i) => (i + 1) % suggest.options.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSuggestIndex((i) => (i - 1 + suggest.options.length) % suggest.options.length);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setDismissed(true);
          return;
        }
      }

      if (e.key === "Tab") {
        e.preventDefault();
        const { selectionStart, value } = e.target;
      
        const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
        const lineEnd = value.indexOf("\n", selectionStart);
        const currentLine = value.slice(lineStart, lineEnd === -1 ? value.length : lineEnd);
      
        const leadingSpaces = currentLine.match(/^ */)[0].length;
        const lineContent = currentLine.trim();
      
        let newLeadingSpaces = 0;
        if (leadingSpaces === 0) {
          newLeadingSpaces = 22; // Character Name
        } else if (leadingSpaces === 22) {
          newLeadingSpaces = 15; // Parenthetical
        } else if (leadingSpaces === 15) {
          newLeadingSpaces = 10; // Dialogue
        } else {
          newLeadingSpaces = 0;  // Action
        }
      
        const newCurrentLine = " ".repeat(newLeadingSpaces) + lineContent;
        // Re-indent through the browser's editing pipeline so Ctrl+Z can undo
        // it. Rewriting the whole value with setContent discards the undo stack,
        // and Tab runs on almost every line of a screenplay.
        replaceRange(lineStart, lineEnd === -1 ? value.length : lineEnd, newCurrentLine);

        requestAnimationFrame(() => {
          const newCursorPos = lineStart + newLeadingSpaces + lineContent.length;
          e.target.setSelectionRange(newCursorPos, newCursorPos);
          scrollCaretIntoView(typewriter || zenMode);
        });
      } else if (e.key === "Enter") {
        const { selectionStart, value } = e.target;
        const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
        const currentLine = value.slice(lineStart, selectionStart);
      
        // What the next line should be, in screenplay terms. The rule lives in
        // utils/screenplayFormat so it can be tested — it runs on every line a
        // writer types, and inline here it shipped inserting a bare newline
        // everywhere, which is not screenplay format at all.
        const atLineEnd = selectionStart === value.length || value[selectionStart] === "\n";

        e.preventDefault();
        const insertText = enterText(currentLine, atLineEnd);
        replaceRange(selectionStart, selectionStart, insertText);

        requestAnimationFrame(() => {
          const newCursorPos = selectionStart + insertText.length;
          e.target.setSelectionRange(newCursorPos, newCursorPos);
          // Every mode, not just zen: Enter is preventDefault-ed and inserted
          // programmatically, so the browser will not follow the caret for us.
          scrollCaretIntoView(typewriter || zenMode);
        });
      }
  };
}
