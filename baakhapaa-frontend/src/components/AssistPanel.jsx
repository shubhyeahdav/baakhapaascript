import React, { useState, useEffect } from "react";
import { learn } from "../services/api";
import VersionHistory from "./VersionHistory";
import CommentThreads from "./CommentThreads";
import CraftPanel from "./CraftPanel";
import CoveragePanel from "./CoveragePanel";
import AccessLog from "./AccessLog";
import GuidePanel from "./GuidePanel";

/**
 * The editor's right-hand column — a sheet over the page below `lg`.
 *
 * Lifted out of `ScriptEditor` with the markup unchanged, for the same reason
 * the header was: the file was 2,397 lines and this was another 365 of them.
 *
 * **The prop list is the finding.** Forty-odd props is not a component that was
 * given its own state; it is a component whose state stayed behind, and every
 * name below is a real read that something else in the editor also does. The
 * panel's own state — the AI mode, the open pattern, the tab — is written here
 * and read by `handleAI`, `acceptAI`, `loadPatterns` and three effects, all of
 * which reach for the caret, the textarea and the draft. Moving the state down
 * means moving those with it, and they are not separable from the page.
 *
 * So this commit moves the markup and leaves the ownership where it is, rather
 * than pretending a split happened that did not. What the list buys is that the
 * coupling is now written down instead of being invisible inside one file.
 */
const GENERIC_TRADITIONS = new Set(["screen craft", "shorts-general", "general"]);
const namedTradition = (t) =>
  t && !GENERIC_TRADITIONS.has(String(t).trim().toLowerCase()) ? t : null;

// Exported: `loadPatterns` in ScriptEditor reads a focus's query string, but
// the tabs that name them are here.
export const FOCUSES = [
  // Alone among these, this one queries the DRAFT rather than a named problem.
  // The label says "read" so the difference is visible without a legend.
  { key: "scene", label: "Read my page", query: "" },
  { key: "flat", label: "Feels flat", query: "this scene feels flat and skippable, nothing changes in it, the characters just talk and it drags" },
  { key: "dialogue", label: "On the nose", query: "my dialogue is on the nose, characters say exactly what they feel, it sounds like a therapy transcript with no subtext" },
  // This chip used to open with "my characters sound the same", which is
  // verbatim the `problem` field of a DIALOGUE entry ("Give a character one
  // phrase they return to"). Retrieval returned that entry and was right to;
  // the chip was asking a dialogue question under a character label, so it
  // could only ever be half answered. The voice half now has its own chip
  // below, and this one asks what the character-level entries actually
  // address: a protagonist nobody finds interesting, and side characters with
  // no life of their own.
  { key: "character", label: "Thin character", query: "my main character is boring and predictable, likeable but nobody finds them interesting, and my side characters only exist to move the story along" },
  { key: "voice", label: "Same voice", query: "my characters all sound the same, I could swap their dialogue between them and nothing would break" },
  { key: "structure", label: "Structure", query: "the middle sags and the ending feels unearned, the protagonist is passive and things just happen to them" },
  { key: "melodrama", label: "Melodramatic", query: "the emotion is overwrought and melodramatic, it feels sentimental and false rather than restrained" },
];

// What each paid mode actually does. A free user pressing "Execute AI Action"
// used to get `Error: AI generation requires a Pro or Studio plan` in the
// response box — a refusal styled as a failure, with nothing to act on. If the
// tab is going to be visible, it should describe the feature and offer the plan.
const PAID_MODES = {
  generate: "Write a full scene from a description — correctly formatted, in your project's language.",
  improve: "Rewrite a line you have highlighted, or the whole scene if you have not, keeping the characters and the beat.",
  suggest: "Three different ways this scene could continue, read from what you've written so far.",
};

function UpgradePrompt({ mode, onUpgrade }) {
  return (
    <div className="rounded-xl border border-gold/25 bg-goldDim/40 p-4 mb-4">
      <div className="font-mono text-[9.5px] uppercase tracking-wider text-gold mb-1.5">
        Pro / Studio
      </div>
      <p className="text-[12.5px] text-inkSoft leading-snug mb-3">{PAID_MODES[mode]}</p>
      <button onClick={onUpgrade} className="btn-gold w-full text-xs py-2">
        See plans
      </button>
      <p className="text-[11px] text-inkMuted mt-2.5 leading-snug">
        Your free plan already includes the Patterns tab and the Craft checks —
        both read the analysed script library, so neither costs a paid model call.
      </p>
    </div>
  );
}


/**
 * The way out of a loop, offered only once the loop is real.
 *
 * A recommendation the writer has been given twice and has not acted on is no
 * longer a recommendation problem: either they do not believe it or they do not
 * know how, and both of those are what a lesson is for. A FIRST showing never
 * escalates — being sent to a course the moment you are first told something
 * reads as being told off.
 *
 * Nineteen lessons cannot cover thirty-nine craft entries, so most techniques
 * have none. That is the common case and it renders nothing at all, rather than
 * an empty box or an apology.
 */
function LessonEscalation({ technique }) {

  const [lesson, setLesson] = useState(null);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState("idle");

  useEffect(() => {
    let live = true;
    setState("loading");
    learn
      .forTechnique(technique)
      .then((res) => {
        if (!live) return;
        setLesson(res.data);
        setState("done");
      })
      .catch(() => live && setState("none"));
    return () => { live = false; };
  }, [technique]);

  if (state !== "done" || !lesson) return null;

  return (
    <div className="pt-2 border-t border-borderSoft">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="text-[10.5px] text-gold hover:text-goldBright transition-colors underline decoration-dotted underline-offset-2"
      >
        {open ? "Hide the lesson" : "There is a lesson on this"}
      </button>
      {open && (
        <div className="mt-1.5 rounded-lg border border-borderSoft bg-bgDeep/40 p-2.5">
          <p className="text-[11px] text-gold/80 font-semibold mb-1 leading-snug">
            {lesson.title}
          </p>
          <p className="text-[11.5px] text-inkSoft leading-relaxed">
            {lesson.concept}
          </p>
        </div>
      )}
    </div>
  );
}

export default function AssistPanel({
  // the panel itself
  panelOpen, setPanelOpen, panelTab, setPanelTab,
  // the script and its project
  id, genre, tone, navigate,
  // the draft, for the panels that read or write it
  content, setContent, textareaRef, caretLine, selection, selectionRange,
  insertAtPosition,
  // generation
  aiMode, setAiMode, aiLocked, aiLoading, aiResponse, setAiResponse,
  instruction, setInstruction, handleAI, acceptAI,
  // patterns
  patterns, patternsLoading, loadPatterns, patternSource, diagnosed,
  focus, setFocus, openPattern, setOpenPattern,
  showAllPatterns, setShowAllPatterns, seen,
}) {
  // What the writer types when no chip fits. The chips reach at most eighteen
  // of the corpus's thirty-nine entries, so more than half the library had no
  // door in the interface at all — a writer whose problem was "my flashback
  // kills the momentum" could press six buttons and never be asked. The
  // backend has always accepted an arbitrary string here; this only stops the
  // UI choosing the question on the writer's behalf. Nepali works in it, in
  // both scripts, as of `craft_query.normalise`.
  const [asked, setAsked] = useState("");

  return (
    <>
    {panelOpen && (
      <button
        type="button"
        aria-label="Close panel"
        onClick={() => setPanelOpen(false)}
        className="lg:hidden fixed inset-0 z-30 bg-black/50"
      />
    )}
    {/* NO `animate-fade-up` here, and it is not a style preference.
        That animation ends on `transform: translateY(0)` with
        `animation-fill-mode: both`, so its final keyframe keeps overriding the
        `translate-x-full` that parks this sheet off-canvas — an animated
        transform outranks a declared one. Below `lg` the panel therefore sat
        permanently open, 85vw of it on top of the page: at 375px it covered the
        toolbar and every line of the script, and at 820px it cut the action
        lines off mid-word. It looked like a z-index bug and was a specificity
        one. Found on a phone; the responsive audit passed the editor because a
        fixed overlay does not overflow anything. */}
    <aside
      className={`bg-surface border-l border-border p-5 overflow-y-auto overflow-x-hidden shrink-0 flex flex-col
        lg:static lg:z-auto lg:w-80 lg:translate-x-0
        fixed inset-y-0 right-0 z-40 w-[85vw] max-w-sm transition-transform
        ${panelOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"}`}
    >
      {/* Three tabs, and they answer three different questions: write
          this for me, tell me what is wrong with it, show me what changed.
          There were five. "Story" was setup rather than feedback and moved
          to the project setup screen; "Versions" and "Notes" are both the
          document's history and now share one tab. Five 10.5px labels in a
          320px panel had already forced the padding down until the row
          still overflowed and clipped a label mid-word — the cramping was
          the symptom, the wrong grouping was the cause. */}
      <div className="flex gap-1 mb-4">
        {[
          { key: "ai", label: "Assist" },
          { key: "craft", label: "Craft" },
          { key: "guide", label: "Guide" },
          { key: "history", label: "History" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setPanelTab(t.key)}
            aria-pressed={panelTab === t.key}
            className={`text-[11px] font-semibold uppercase tracking-wide px-2 py-1.5 rounded-lg flex-1 min-w-0 transition duration-200 border ${
              panelTab === t.key ? "bg-goldDim text-gold border-gold/30" : "text-inkMuted hover:text-ink border-transparent"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Remounts on open so it re-reads the current draft rather than
          showing a check from three edits ago. */}
      {/* Always here, never a popup that fires once and vanishes. A
          writer who needs to be told how a parenthetical works needs it
          in week three as much as on day one, and by then a dismissed
          tour is unreachable. */}
      {panelTab === "guide" && (
        <GuidePanel
          content={content}
          onInsert={(text) => {
            const ta = textareaRef.current;
            const at = ta ? ta.selectionStart : content.length;
            insertAtPosition(at, `${text}
`);
          }}
        />
      )}

      {panelTab === "craft" && (
        <>
          <CraftPanel content={content} genre={genre} tone={tone} />
          {/* Coverage is the Craft tab's question asked about the whole
              draft rather than the line under the caret, so it belongs
              here rather than earning a fifth tab. */}
          <div className="border-t border-borderSoft pt-5 mt-6">
            <p className="font-mono text-[9.5px] uppercase tracking-wider text-inkMuted mb-2">
              Coverage
            </p>
            <CoveragePanel scriptId={id} />
          </div>
        </>
      )}

      {/* Versions and comments are one question — what happened to this
          document — asked about the machine's record and about people. */}
      {panelTab === "history" && (
        <div className="space-y-6">
          <VersionHistory scriptId={id} onRestore={(restored) => setContent(restored)} />
          <div className="border-t border-borderSoft pt-5">
            <CommentThreads scriptId={id} caretLine={caretLine} />
          </div>
          {/* Versions answer what changed; this answers who was here.
              Renders nothing for anyone but a project admin. */}
          <div className="border-t border-borderSoft pt-5">
            <AccessLog scriptId={id} />
          </div>
        </div>
      )}

      {panelTab === "ai" && (
      <>
      <div className="flex border-b border-borderSoft mb-4">
        {["patterns", "generate", "improve", "suggest"].map((mode) => (
          <button
            key={mode}
            onClick={() => setAiMode(mode)}
            title={aiLocked && mode !== "patterns" ? "Pro / Studio feature" : undefined}
            className={`text-xs pb-2.5 font-semibold capitalize flex-1 border-b-2 transition duration-200 ${
              aiMode === mode
                ? "border-gold text-gold"
                : "border-transparent text-inkMuted hover:text-ink"
            }`}
          >
            {mode}{aiLocked && mode !== "patterns" ? " ✦" : ""}
          </button>
        ))}
      </div>

      {aiMode === "patterns" ? (
        <>
          {/* One tap = the kind of help you need. Loads on open; each
              chip re-queries for that problem type. */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {FOCUSES.map((f, i) => (
              <React.Fragment key={f.key}>
                {/* A hairline after the first chip. It reads the draft;
                    every chip after it names a problem instead. The rule
                    shows that split without a sentence explaining it. */}
                {i === 1 && (
                  <span
                    aria-hidden="true"
                    className="self-center h-3.5 w-px bg-borderSoft mx-0.5"
                  />
                )}
                <button
                  onClick={() => { setFocus(f.key); setOpenPattern(null); loadPatterns(f.key); }}
                  title={
                    f.key === "scene"
                      ? "Match against what you have written so far"
                      : `Match against: ${f.query}`
                  }
                  className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                    focus === f.key
                      ? "bg-goldDim border-gold/40 text-gold"
                      : "border-border text-inkMuted hover:text-ink"
                  }`}
                >
                  {f.label}
                </button>
              </React.Fragment>
            ))}
          </div>
          {/* The writer's own words. A form, so Enter submits and the mobile
              keyboard shows a Search key instead of a newline. Submitting an
              empty box would silently re-run whichever chip was last selected,
              which reads as the button being broken, so it is a no-op. */}
          <form
            className="mb-3"
            onSubmit={(e) => {
              e.preventDefault();
              const q = asked.trim();
              if (!q) return;
              setFocus("asked");
              setOpenPattern(null);
              loadPatterns("asked", q);
            }}
          >
            <label htmlFor="craft-ask" className="sr-only">
              Describe what is wrong with your script
            </label>
            <div className="flex gap-1.5">
              <input
                id="craft-ask"
                type="search"
                value={asked}
                onChange={(e) => setAsked(e.target.value)}
                placeholder="…or say it in your own words"
                className="flex-1 min-w-0 bg-surface border border-border rounded-full px-3 py-1.5 text-[11px] text-ink placeholder:text-inkMuted focus:outline-none focus:border-gold/40"
              />
              <button
                type="submit"
                disabled={!asked.trim() || patternsLoading}
                className="tap text-[11px] px-3 py-1.5 rounded-full border border-border text-inkMuted hover:text-gold disabled:opacity-40 transition-colors"
              >
                Ask
              </button>
            </div>
          </form>

          <div className="flex items-center justify-between mb-3">
            <span className="font-mono text-[10px] uppercase tracking-wider text-inkMuted">
              {genre} · {tone}
            </span>
            <button
              onClick={() => loadPatterns(focus, focus === "asked" ? asked.trim() : undefined)}
              disabled={patternsLoading}
              className="tap text-[11px] text-inkMuted hover:text-gold transition-colors disabled:opacity-50"
            >
              {patternsLoading ? "Matching…" : "↻ Refresh"}
            </button>
          </div>

          {/* Say why. Generic advice is the single most common complaint
              writers make about paid script coverage — naming the line
              that triggered each pattern is what separates this from it. */}
          {patternSource === "diagnosis" && diagnosed.length > 0 && (
            <div className="mb-3 rounded-xl border border-gold/25 bg-goldDim/40 p-3">
              <div className="font-mono text-[9.5px] uppercase tracking-wider text-gold mb-1.5">
                Found in your draft
              </div>
              <ul className="space-y-1">
                {diagnosed.map((d) => (
                  <li key={`${d.rule}-${d.line}`} className="text-[11.5px] text-inkSoft leading-snug">
                    <span className="font-mono text-gold/80">L{d.line}</span> — {d.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : aiLocked ? (
        <UpgradePrompt mode={aiMode} onUpgrade={() => navigate("/pricing")} />
      ) : (
        <>
          {/* What Improve is about to touch. A writer who has highlighted
              a line and a writer who has highlighted nothing are asking
              for very different amounts of change, and until this said so
              the only way to find out which you had asked for was to
              press the button and read the result. */}
          {aiMode === "improve" && (
            <div className="mb-3 rounded-lg border border-border bg-surface/60 px-3 py-2">
              {selectionRange(content, selection) ? (
                <>
                  <div className="font-mono text-[9.5px] uppercase tracking-wider text-gold mb-1">
                    Rewriting your selection
                  </div>
                  <div className="text-[11.5px] text-inkSoft leading-snug line-clamp-2 font-mono">
                    {selection.trim()}
                  </div>
                </>
              ) : (
                <div className="text-[11.5px] text-inkMuted leading-snug">
                  Rewriting the whole scene.{" "}
                  <span className="text-inkSoft">
                    Highlight a line first to change only that.
                  </span>
                </div>
              )}
            </div>
          )}
          <textarea
            className="field h-28 mb-4 text-sm"
            placeholder={
              aiMode === "generate" ? "Describe the scene action or dialogue to generate..." :
              aiMode === "improve" ? "Instruction on how to improve the scene content..." :
              "Get suggestions and story directions based on current scene writing."
            }
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
          />
          <button onClick={handleAI} disabled={aiLoading} className="btn-gold w-full text-sm py-2.5 mb-4">
            {aiLoading ? "Generating lines..." : "Execute AI Action"}
          </button>
        </>
      )}

      {aiMode === "patterns" && (
        patternsLoading && !patterns ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 rounded-xl bg-elevated/40 border border-borderSoft animate-pulse" />
            ))}
          </div>
        ) : patterns?.length === 0 ? (
          <p className="text-inkMuted text-sm">No patterns matched — try writing a little more first.</p>
        ) : (
          <div className="space-y-2">
            {patterns?.map((p, i) => {
              // Three cards of apparently equal weight is a menu, and a
              // menu is what a writer skips. The first card has the
              // strongest evidence behind it — it is either a line the
              // linter found or the technique this script has been shown
              // and has not dealt with — so it leads, open, and the rest
              // fold behind one control.
              if (i > 0 && !showAllPatterns) return null;
              const open = openPattern === i || (i === 0 && openPattern === null);
              // An exact hit came from a linter flag, not from embedding
              // distance. Its similarity is a placeholder 1.0, so showing
              // "100%" would dress a diagnosis up as a perfect semantic
              // match. Show the line it answers instead.
              const hit = diagnosed.find((d) => d.technique === p.technique);
              return (
                <div
                  key={i}
                  className={`rounded-xl border transition-colors ${
                    open ? "bg-elevated/60 border-gold/30" : "bg-elevated/40 border-borderSoft hover:border-gold/20"
                  }`}
                >
                <button
                  onClick={() => setOpenPattern(open ? null : i)}
                  className="w-full text-left p-3.5"
                >
                  <div className="flex items-baseline justify-between gap-2 mb-1.5">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-gold truncate">
                      {p.craft_level || "craft"}
                      {namedTradition(p.origin_tradition)
                        ? ` · ${namedTradition(p.origin_tradition)}`
                        : ""}
                    </span>
                    {/* Only a diagnosis earns this slot. The similarity
                        score that used to sit here was a cosine distance
                        a writer cannot act on, and it implied a precision
                        that is not there — 78% is not better advice than
                        72%. Worse, it shared the slot with "line 12", so
                        one position meant both "here is exactly where you
                        did this" and "here is a number about vectors". */}
                    {hit && (
                      <span className="font-mono text-[10px] text-gold shrink-0">
                        line {hit.line}
                      </span>
                    )}
                  </div>
                  {/* Lead with the technique. The mechanics, the concrete
                      steps and a worked example unfold only when asked. */}
                  <p className="text-[13px] text-ink leading-snug font-medium">
                    {p.technique || p.one_line_takeaway}
                  </p>
                  {/* Said before, and still true. This is the difference
                      between advice and nagging: naming the repetition
                      makes it evidence, where saying the same thing
                      silently for the third time is just noise. */}
                  {seen[p.technique]?.times_shown > 1 && (
                    <p className="text-[10px] text-inkMuted mt-1">
                      Suggested {seen[p.technique].times_shown} times — still on the page.
                    </p>
                  )}
                  {open ? (
                    <div className="mt-2 pt-2 border-t border-borderSoft space-y-2.5">
                      {p.how_to_apply && (
                        <div>
                          <div className="font-mono text-[9.5px] uppercase tracking-wider text-inkMuted mb-1">Do this</div>
                          <p className="text-[12px] text-inkSoft leading-relaxed">{p.how_to_apply}</p>
                        </div>
                      )}
                      {p.worked_example && (
                        <div>
                          <div className="font-mono text-[9.5px] uppercase tracking-wider text-inkMuted mb-1">On the page</div>
                          <p className="text-[12px] text-inkSoft leading-relaxed font-mono bg-bgDeep/40 border border-borderSoft rounded-lg p-2.5 whitespace-pre-wrap">
                            {p.worked_example}
                          </p>
                        </div>
                      )}
                      {p.warning_sign && (
                        <div>
                          <div className="font-mono text-[9.5px] uppercase tracking-wider text-inkMuted mb-1">You need this if</div>
                          <p className="text-[12px] text-inkMuted leading-relaxed italic">{p.warning_sign}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-[10px] text-inkMuted mt-1.5 inline-block">How to use it ↓</span>
                  )}
                </button>

                {/* Outside the card's own button, because a button inside
                    a button is invalid and the browser takes it apart.
                    Advice given twice and not taken is not a
                    recommendation problem any more: either the writer
                    does not believe it or does not know how, and both of
                    those are what a lesson is for. A first showing never
                    escalates — being sent to a course the moment you are
                    first told something reads as being told off. */}
                {seen[p.technique]?.times_shown > 1 && (
                  <div className="px-3.5 pb-3">
                    <LessonEscalation technique={p.technique} />
                  </div>
                )}
                </div>
              );
            })}

            {patterns?.length > 1 && (
              <button
                onClick={() => setShowAllPatterns((v) => !v)}
                className="w-full text-[11px] font-mono text-inkMuted hover:text-gold transition-colors py-1.5"
              >
                {showAllPatterns
                  ? "Show only the strongest"
                  : `${patterns.length - 1} more ${patterns.length === 2 ? "pattern" : "patterns"}`}
              </button>
            )}
          </div>
        )
      )}
      
      {aiResponse && (
        <div className="bg-elevated/40 border border-borderSoft rounded-xl p-4 mt-2">
          <div className="text-xs text-inkMuted font-mono uppercase tracking-wider mb-2">AI Suggestion</div>
          <div className="text-sm text-inkSoft whitespace-pre-wrap mb-4 font-mono leading-relaxed max-h-60 overflow-y-auto bg-bgDeep/40 p-3 rounded-lg border border-borderSoft">{aiResponse}</div>
          <div className="flex gap-2">
            <button onClick={acceptAI} className="text-xs border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 px-3 py-2 rounded-lg flex-1 hover:bg-emerald-500/20 transition">Accept</button>
            <button onClick={() => setAiResponse("")} className="text-xs border border-red-500/20 bg-red-500/10 text-red-400 px-3 py-2 rounded-lg flex-1 hover:bg-red-500/20 transition">Reject</button>
          </div>
        </div>
      )}
      </>
      )}
    </aside>
    </>
  );
}
