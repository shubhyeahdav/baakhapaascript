import React, { memo } from "react";
import ToolbarMenu from "./ToolbarMenu";
import ImportScript from "./ImportScript";

/**
 * The editor's toolbar, lifted out of `ScriptEditor` unchanged.
 *
 * It is here because `ScriptEditor.jsx` was 2,397 lines and this was 342 of
 * them, and because a header is the one part of that file with no share in the
 * caret, the autosave or the undo stack — it reads state and calls handlers,
 * and nothing else in the editor reads it back. Extracting it first costs the
 * least and is the easiest to prove: every existing ScriptEditor test passes
 * untouched, which is the whole standard for this split.
 *
 * The props are flat and many. Grouping them into objects would read better
 * and would also change what re-renders when, and this commit is supposed to
 * change nothing.
 *
 * Everything below `lg` is one overflow menu; see the comments inline, which
 * came with the markup and are the record of why each control sits where it
 * does.
 */
const SHORTCUT_HINTS = [
  { keys: "i", gives: "INT.", where: "line start" },
  { keys: "e", gives: "EXT.", where: "line start" },
  { keys: "c", gives: "CUT TO:", where: "line start" },
  { keys: "f", gives: "FADE IN: / OUT.", where: "line start" },
  { keys: "d", gives: "DAY / DAWN / DUSK", where: "after  - " },
  { keys: "n", gives: "NIGHT", where: "after  - " },
  { keys: "m", gives: "MORNING", where: "after  - " },
  { keys: "a–z", gives: "a location", where: "after INT." },
  { keys: "a–z", gives: "a character", where: "cue column" },
  { keys: "(", gives: "(beat), (V.O.)…", where: "parenthetical" },
];
const CURSORS = {
  pen:  { label: "Pen",     next: "ring", hint: "The nib, as everywhere else in this product" },
  ring: { label: "Ring",    next: "text", hint: "A small sight, for placing the caret exactly" },
  text: { label: "Default", next: "pen",  hint: "Your system's own text pointer" },
};

function EditorHeader({
  // identity and navigation
  id, title, navigate, t,
  // save state and position
  saving, view, caretPage, pageCount,
  // typing
  nepaliMode, setNepaliMode, textareaRef,
  showShortcuts, setShowShortcuts,
  // structure
  suggestions, showStructure, setShowStructure,
  // view options
  zenMode, setZenMode, isFullPage, toggleFullPage,
  cursor, setCursor, typewriter, setTypewriter, pageTheme, setPageTheme,
  // actions
  handleExport, handleFinalize, reviewing,
  setShowShare, setPanelOpen,
  importRef, onImported,
}) {
  return (
    <header className="h-14 bg-surface border-b border-border flex items-center gap-1.5 lg:gap-4 px-2 md:px-6 shrink-0 relative z-20 lg:overflow-visible">
      <button onClick={() => navigate("/dashboard")} className="flex items-center gap-1.5 shrink-0 text-inkMuted hover:text-ink transition duration-200 text-sm">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        Back
      </button>
      {/* The only region allowed to shrink, because a truncated title still
          identifies the project while a truncated control is just broken.
          "Workspace /" used to sit in front of it — a label that told a
          writer nothing they could not see, costing width that the view
          switcher then had to give up, which is why "Outline" was rendering
          as "Outl". */}
      {/* `min-w-0` alone let flex crush this whole group to 24px — narrower
          than the Setup button inside it, which then escaped its container and
          collided with the SYNCED / page-number status beside it, rendering as
          "SetuSYNCED". The group no longer shrinks; the TITLE truncates
          instead, within a bounded width, and the header (already
          `overflow-x-auto`) scrolls when there is genuinely not enough room. */}
      <div className="flex items-center gap-2 shrink-0">
        <span
          className="font-display font-medium text-ink text-[15px] truncate
                     max-w-[4.5rem] sm:max-w-[8rem] md:max-w-[12rem] lg:max-w-[18rem]"
          title={title}
        >
          {title}
        </span>
        {/* The story bible moved out of the writing panel to its own screen.
            This is the way back to it, from the one place a writer is when
            they realise the character's want was wrong. */}
        <button
          onClick={() => navigate(`/projects/${id}/setup`)}
          className="hidden lg:inline-block shrink-0 text-[11px] font-sans text-inkMuted hover:text-gold border border-border hover:border-gold/40 rounded-full px-2.5 py-0.5 transition"
          title="Story bible and project format"
        >
          Setup
        </button>
      </div>
      {/* `gap-1.5` below `lg`: four controls with 12px between them spend
          48px of a 359px budget on air. */}
      <div className="flex gap-1.5 lg:gap-3 items-center ml-auto shrink-0">
        {/* "Is my work saved" is the fact that breaks focus fastest, so it
            stays on the surface at every width — but as a dot below `lg`,
            because the word costs 42px and a phone header has none spare. */}
        <span className="hidden lg:inline text-[11px] font-semibold text-inkMuted uppercase tracking-wider whitespace-nowrap">
          {saving ? "Saving..." : "Synced"}
        </span>
        <span
          className={`lg:hidden h-2 w-2 rounded-full shrink-0 ${
            saving ? "bg-gold animate-pulse" : "bg-emerald-500/70"
          }`}
          role="status"
          aria-label={saving ? "Saving" : "Saved"}
          title={saving ? "Saving…" : "Saved"}
        />
        {/* Where the writer is, in the unit their craft actually uses. A
            screenplay note is "cut ten pages", never "cut some words" — and
            until now the editor could not answer "what page am I on" at all.
            Same page numbering as the exported PDF. */}
        {view === "script" && (
          <span
            className="text-[11px] font-mono text-inkMuted tabular-nums whitespace-nowrap"
            title="Page under the caret / pages in the draft — matches the PDF export"
          >
            p. {Math.min(caretPage, pageCount)} / {pageCount}
          </span>
        )}
        {/* Everything from here to the closing tag is desktop only. Each of
            these is used occasionally rather than while writing, which is the
            rule `ToolbarMenu` already states — it was applied for desktop and
            never extended down. On a phone they are in the overflow menu
            below. */}
        <div className="hidden lg:flex items-center gap-3">
        {/* Shortcut reference. A dropdown rather than a standing panel:
            you need it while learning the letters and never again, so it
            shouldn't hold editor width permanently. */}
        <div className="relative" data-shortcuts>
          <button
            onClick={() => setShowShortcuts((v) => !v)}
            title="Format shortcuts"
            className={`px-2.5 py-2 rounded-lg border transition duration-200 font-mono text-[11px] ${
              showShortcuts ? "bg-goldDim border-gold text-gold" : "bg-bg border-border text-inkMuted hover:text-ink whitespace-nowrap"
            }`}
          >
            ⌨ shortcuts
          </button>
          {showShortcuts && (
            <div className="absolute right-0 top-full mt-1.5 w-72 z-30 rounded-xl border border-borderSoft bg-surface shadow-card p-3">
              <p className="text-[11px] text-inkMuted mb-2.5 leading-snug">
                Type the letter, press <kbd className="px-1 py-0.5 rounded bg-elevated border border-borderSoft font-mono text-[10px]">Tab</kbd>.
              </p>
              <div className="space-y-1">
                {SHORTCUT_HINTS.map((s) => (
                  <div key={s.keys + s.gives} className="flex items-baseline gap-2 text-[11.5px]">
                    <span className="font-mono text-gold w-8 shrink-0">{s.keys}</span>
                    <span className="font-mono text-inkSoft">{s.gives}</span>
                    <span className="text-inkMuted text-[10.5px] ml-auto shrink-0">{s.where}</span>
                  </div>
                ))}
              </div>
              <p className="text-[10.5px] text-inkMuted mt-2.5 pt-2 border-t border-borderSoft leading-snug">
                Character names and locations come from your draft and your
                Story tab.
              </p>
            </div>
          )}
        </div>
        <div className="h-4 w-px bg-borderSoft mx-1" />
        {/* Nepali phonetic input. Labelled in both scripts rather than with
            an icon, because the thing it switches between IS the two scripts
            — a glyph would need explaining and these explain themselves. */}
        <div className="flex rounded-lg border border-border overflow-hidden shrink-0" role="group" aria-label="Typing script">
          {[
            { on: false, label: "A", title: "Type in English" },
            { on: true, label: "अ", title: "Type Nepali phonetically — write ‘namaste’, get नमस्ते" },
          ].map((opt) => (
            <button
              key={opt.label}
              onClick={() => {
                setNepaliMode(opt.on);
                window.localStorage.setItem("baakhapaa:nepali", opt.on ? "on" : "off");
                textareaRef.current?.focus();
              }}
              aria-pressed={nepaliMode === opt.on}
              title={opt.title}
              className={`text-xs py-1.5 px-3 transition ${
                nepaliMode === opt.on
                  ? "bg-goldDim text-gold"
                  : "text-inkMuted hover:text-ink hover:bg-elevated/50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {/* Script / Corkboard / Outline moved into the left rail. They name
            what you are LOOKING AT, and the left column is that thing; up
            here they sat beside Import and Export, which are things you do
            TO a script rather than ways of reading it. */}
        <div className="h-4 w-px bg-borderSoft mx-1" />
        {suggestions && (
          <button
            onClick={() => setShowStructure((s) => !s)}
            className={`text-xs py-1.5 px-3 rounded-full border transition ${
              showStructure
                ? "bg-goldDim border-gold/40 text-gold"
                : "border-border text-inkMuted hover:text-ink"
            }`}
            title="Show/hide the AI-suggested three-act structure"
          >
            Structure
          </button>
        )}
        {/* One menu rather than a button per format. Two of the four were
            only reachable from a different page entirely, and naming them
            in a list says what each is FOR — which "Export PDF" beside
            ".fdx" never did. */}
        {/* Beside Export, because "get a script out" and "get a script in"
            are the same question asked in two directions. */}
        <button
          type="button"
          onClick={() => importRef.current?.open()}
          className="text-xs py-1.5 px-3 rounded-lg border border-border text-inkMuted hover:text-ink transition"
          title="Import a screenplay from Final Draft, Fountain, Word, plain text or PDF"
        >
          Import
        </button>

        <button
          onClick={() => setShowShare(true)}
          title="Share this project"
          className="text-xs py-1.5 px-3 rounded-lg border border-border text-inkMuted
                     hover:text-ink transition"
        >
          Share
        </button>

        <ToolbarMenu
          label="Export"
          title="Download this script"
          items={[
            { key: "pdf", label: "PDF", hint: "For reading and sending", onSelect: () => handleExport("pdf") },
            { key: "fdx", label: "Final Draft (.fdx)", hint: "Opens in Final Draft, Celtx, Arc Studio", onSelect: () => handleExport("fdx") },
            { key: "word", label: "Word (.docx)", hint: "For editing outside the app", onSelect: () => handleExport("word") },
            { key: "d1", divider: true },
            { key: "package", label: "Production package", hint: "Script, shot list and storyboard in one PDF", onSelect: () => handleExport("package") },
          ]}
        />

        <ToolbarMenu
          label="View"
          title="Display options"
          items={[
            {
              // Focus mode and Full page were separate entries — one hid the
              // app's chrome, the other the browser's. True, and a
              // distinction nobody standing at this menu wants to make: a
              // writer asking for fewer things on screen means all of them.
              // One control now does both, and leaving focus restores both.
              key: "zen",
              label: "Focus mode",
              hint: "Nothing on screen but the page",
              active: zenMode,
              onSelect: () => {
                const next = !zenMode;
                setZenMode(next);
                if (next !== isFullPage) toggleFullPage();
              },
            },
            {
              // One entry, three states. The menu was just cut from four
              // items to three and adding three more would undo that; a
              // cycling control says what it is and what comes next.
              key: "cursor",
              label: `Cursor: ${CURSORS[cursor].label}`,
              hint: CURSORS[cursor].hint,
              onSelect: () => setCursor(CURSORS[cursor].next),
            },
            {
              key: "typewriter",
              label: typewriter ? "Typewriter mode: on" : "Typewriter mode",
              hint: "Hold the caret at the middle of the page",
              onSelect: () => setTypewriter((t) => !t),
            },
            {
              label: pageTheme === "dark" ? "Light page" : "Dark page",
              hint: "The colour of the paper, not the app",
              onSelect: () => setPageTheme(pageTheme === "light" ? "dark" : "light"),
            },
          ]}
        />
        </div>

        {/* The same controls on a phone, as one menu. A flat list rather than
            nested menus: a submenu inside a dropdown on a touch screen is a
            thing people close by accident. Grouped with dividers instead —
            reading, then the page, then getting a script in and out. */}
        <ToolbarMenu
          label="⋯"
          title="More"
          align="right"
          className="lg:hidden"
          items={[
            { key: "setup", label: "Story bible and format",
              hint: "Logline, characters, what the story is for",
              onSelect: () => navigate(`/projects/${id}/setup`) },
            ...(suggestions
              ? [{ key: "structure",
                   label: showStructure ? "Hide the structure" : "Show the structure",
                   hint: "The suggested three acts",
                   active: showStructure,
                   onSelect: () => setShowStructure((v) => !v) }]
              : []),
            { key: "d0", divider: true },
            { key: "nepali",
              label: nepaliMode ? "Typing: नेपाली" : "Typing: English",
              hint: "Write ‘namaste’, get नमस्ते",
              active: nepaliMode,
              onSelect: () => {
                const next = !nepaliMode;
                setNepaliMode(next);
                window.localStorage.setItem("baakhapaa:nepali", next ? "on" : "off");
                textareaRef.current?.focus();
              } },
            { key: "shortcuts", label: "Format shortcuts",
              hint: "Type the letter, press Tab",
              active: showShortcuts,
              onSelect: () => setShowShortcuts((v) => !v) },
            { key: "zen", label: "Focus mode",
              hint: "Nothing on screen but the page",
              active: zenMode,
              onSelect: () => {
                const next = !zenMode;
                setZenMode(next);
                if (next !== isFullPage) toggleFullPage();
              } },
            { key: "pagetheme",
              label: pageTheme === "dark" ? "Light page" : "Dark page",
              hint: "The colour of the paper, not the app",
              onSelect: () => setPageTheme(pageTheme === "light" ? "dark" : "light") },
            { key: "d1", divider: true },
            { key: "import", label: "Import a screenplay",
              hint: "Final Draft, Fountain, Word, text or PDF",
              onSelect: () => importRef.current?.open() },
            { key: "share", label: "Share this project",
              hint: "Invite a reader or an editor",
              onSelect: () => setShowShare(true) },
            { key: "d2", divider: true },
            { key: "pdf", label: "Export PDF", hint: "For reading and sending",
              onSelect: () => handleExport("pdf") },
            { key: "fdx", label: "Export Final Draft (.fdx)",
              hint: "Opens in Final Draft, Celtx, Arc Studio",
              onSelect: () => handleExport("fdx") },
            { key: "word", label: "Export Word (.docx)",
              hint: "For editing outside the app",
              onSelect: () => handleExport("word") },
            { key: "package", label: "Export production package",
              hint: "Script, shot list and storyboard in one PDF",
              onSelect: () => handleExport("package") },
          ]}
        />

        {/* Rendered at every width with no button of its own: desktop has one
            in the row above, the phone has a menu item, and both call
            `open()` on it. What must not be behind a breakpoint is its error
            — the server explains why a file could not be read, and that
            sentence is the whole point of the component. */}
        <ImportScript
          ref={importRef}
          showButton={false}
          scriptId={id}
          onImported={onImported}
        />

        {/* Only below lg. Above it the panel is always there and a button to
            open it would do nothing. */}
        <button
          onClick={() => setPanelOpen(true)}
          aria-label="Open the assist panel"
          title={t("Assist")}
          className="lg:hidden text-xs py-1.5 px-2.5 rounded-lg border border-border text-inkMuted whitespace-nowrap shrink-0"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 6h16M4 12h10M4 18h13" />
          </svg>
        </button>

        <button onClick={handleFinalize} disabled={reviewing} className="btn-gold text-xs py-1.5 px-3.5 whitespace-nowrap">
          {reviewing ? "Reviewing…" : (
            <>
              {/* 139px of label is a third of a phone screen. The word alone
                  still says what the button does, and this is the one control
                  that must never be the thing that gets moved into a menu. */}
              <span className="lg:hidden">Finalize</span>
              <span className="hidden lg:inline">Finalize &amp; Storyboard</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
}

/* The toolbar does not read the draft. Everything it shows either never
   changes while you type (the title, the mode toggles) or changes on a page
   boundary (`caretPage`, `pageCount`), so re-rendering all 342 lines of it on
   every keystroke drew nothing new. Memoised, it renders when one of its own
   props actually moves. */
export default memo(EditorHeader);
