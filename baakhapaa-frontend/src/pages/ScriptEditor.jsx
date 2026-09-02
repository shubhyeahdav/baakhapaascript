import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { scripts, exportApi, streamSSE } from "../services/api";
import { downloadBlob, safeFilename } from "../utils/download";
import VersionHistory from "../components/VersionHistory";
import CommentThreads from "../components/CommentThreads";
import CraftPanel from "../components/CraftPanel";
import FormatShortcuts, { harvestVocabulary, suggestFor } from "../components/FormatShortcuts";
import ToolbarMenu from "../components/ToolbarMenu";
import GuidePanel from "../components/GuidePanel";
import PenPrompt from "../components/PenPrompt";
import ImportScript from "../components/ImportScript";
import CoveragePanel from "../components/CoveragePanel";
import AccessLog from "../components/AccessLog";
import ReviewModal from "../components/ReviewModal";
import TeamPanel from "../components/TeamPanel";
import SceneRail from "../components/SceneRail";
import { enterText } from "../utils/screenplayFormat";
import { saveRescue, clearRescue } from "../utils/draftRescue";
import { transliterateWord, WORD_PATTERN, DANDA } from "../utils/nepaliTransliterate";
import { useT } from "../i18n";

// What the shortcuts dropdown lists. Kept beside the editor rather than in
// FormatShortcuts so the reference and the engine can't silently disagree
// about which letters do what — this is the one place a human reads them.
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
import StructureTimeline from "../components/StructureTimeline";
import ShortFormTimeline from "../components/ShortFormTimeline";
import CompactTimeline from "../components/CompactTimeline";
import Corkboard from "../components/Corkboard";
import OutlineView from "../components/OutlineView";

// One-click focuses for pattern recommendations. The pattern library is
// indexed by the PROBLEM a technique solves, so each chip just names that
// problem in the retrieval query — no extra endpoint, no extra cost.
// `origin_tradition` is a real cinema for 12 of the 29 entries and filler for
// the other 17. Rendering the filler puts a category-shaped word on the card
// that carries nothing; rendering the real ones tells a writer in Kathmandu
// that a technique comes from a cinema near them, which is the whole point of
// having tagged them.
const GENERIC_TRADITIONS = new Set(["screen craft", "shorts-general", "general"]);
const namedTradition = (t) =>
  t && !GENERIC_TRADITIONS.has(String(t).trim().toLowerCase()) ? t : null;

// Caret moves that produce no text change, so `onChange` never sees them.
const NAV_KEYS = new Set([
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "PageUp", "PageDown", "Home", "End",
]);

const FOCUSES = [
  // Alone among these, this one queries the DRAFT rather than a named problem.
  // The label says "read" so the difference is visible without a legend.
  { key: "scene", label: "Read my page", query: "" },
  { key: "flat", label: "Feels flat", query: "this scene feels flat and skippable, nothing changes in it, the characters just talk and it drags" },
  { key: "dialogue", label: "On the nose", query: "my dialogue is on the nose, characters say exactly what they feel, it sounds like a therapy transcript with no subtext" },
  { key: "character", label: "Thin character", query: "my characters sound the same and feel predictable, thin, described rather than shown" },
  { key: "structure", label: "Structure", query: "the middle sags and the ending feels unearned, the protagonist is passive and things just happen to them" },
  { key: "melodrama", label: "Melodramatic", query: "the emotion is overwrought and melodramatic, it feels sentimental and false rather than restrained" },
];
import { useAuth } from "../context/AuthContext";

// What each paid mode actually does. A free user pressing "Execute AI Action"
// used to get `Error: AI generation requires a Pro or Studio plan` in the
// response box — a refusal styled as a failure, with nothing to act on. If the
// tab is going to be visible, it should describe the feature and offer the plan.
const PAID_MODES = {
  generate: "Write a full scene from a description — correctly formatted, in your project's language.",
  improve: "Rewrite the scene you're on against an instruction, keeping the characters and the beat.",
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

/** Words in a draft, counting the screenplay as a reader would rather than as a
 *  tokeniser would: runs of non-whitespace, so "INT." is one word and an em
 *  dash between two words is not a third. */
function countWords(text) {
  const trimmed = (text || "").trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export default function ScriptEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const t = useT();
  const [searchParams] = useSearchParams();
  const [script, setScript] = useState(null);
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  // Patterns, not Generate. Generate is a paid tab that needs an instruction
  // typed before it does anything; Patterns is free on every tier, costs no
  // API call, and has loaded three grounded suggestions by the time the panel
  // finishes opening. Landing a free user on a locked tab was the single
  // worst thing about this panel.
  const [aiMode, setAiMode] = useState("patterns");
  const [instruction, setInstruction] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [panelTab, setPanelTab] = useState("ai");
  // Nepali phonetic input. Remembered across sessions because it is a property
  // of the writer, not of the draft — someone who writes in Nepali writes in
  // Nepali tomorrow too, and having to switch it back on every morning is the
  // kind of friction that gets a feature abandoned.
  // On a phone the assist panel cannot hold 320px of permanent width beside a
  // 375px page, so below `lg` it becomes a sheet the writer summons. Above it,
  // nothing changes and this is ignored.
  const [panelOpen, setPanelOpen] = useState(false);
  const [nepaliMode, setNepaliMode] = useState(
    () => window.localStorage.getItem("baakhapaa:nepali") === "on"
  );
  const [patterns, setPatterns] = useState(null);
  const [patternsLoading, setPatternsLoading] = useState(false);
  // Why the current patterns were chosen: [] plus "similarity" means nothing
  // was flagged and these are semantic matches; a populated list plus
  // "diagnosis" means each one answers a specific flagged line.
  const [diagnosed, setDiagnosed] = useState([]);
  const [patternSource, setPatternSource] = useState("similarity");

  // Type-ahead completion. `suggest` holds what the caret position offers;
  // `suggestIndex` is which one Tab will take.
  const [suggest, setSuggest] = useState(null);
  const [suggestIndex, setSuggestIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [bible, setBible] = useState(null);
  const [focus, setFocus] = useState("scene");
  const [openPattern, setOpenPattern] = useState(null);
  // FR07 review, held open until the writer decides what to do about it.
  const [review, setReview] = useState(null);
  const [reviewing, setReviewing] = useState(false);
  // Which line the caret sits on, 1-indexed to match the Notes tab and the
  // linter's line numbers. Kept here because the textarea is the only thing
  // that knows it.
  const [caretLine, setCaretLine] = useState(0);

  const { user } = useAuth();
  const isFree = !["pro", "studio"].includes(user?.subscription_tier);
  // Set when the server refuses a generation the client thought was allowed —
  // a tier can change under a session that stays open for hours.
  const [serverLocked, setServerLocked] = useState(false);
  const aiLocked = isFree || serverLocked;

  // The wizard sends the writer here when the project was created but its
  // structure suggestion never came back. Silently opening an editor with an
  // empty Structure panel would leave them wondering what happened.
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const structureFailed = searchParams.get("structure_failed") === "1" && !noticeDismissed;

  // Free plan's AI feature is RAG pattern recommendations — make it the
  // default tab so free users land on something that works for them.
  useEffect(() => {
    if (isFree) setAiMode("patterns");
  }, [isFree]);

  // Close the shortcuts dropdown on an outside click. Not onBlur — a blur
  // fires on the opening click itself in some browsers, which closes the panel
  // in the same gesture that opened it.
  useEffect(() => {
    if (!showShortcuts) return undefined;
    const close = (e) => {
      if (!e.target.closest?.("[data-shortcuts]")) setShowShortcuts(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [showShortcuts]);

  // Vocabulary for type-ahead. The draft is the primary source, but the story
  // bible is merged in so a character can be completed the first time they are
  // written — before they have ever appeared on the page, which is exactly
  // when the completion is most useful.
  const vocab = useMemo(() => {
    const harvested = harvestVocabulary(content);
    const fromBible = bible?.characters?.map((c) => (c.name || "").trim().toUpperCase()) || [];
    const bibleLocations = bible?.locations?.map((l) => l.trim().toUpperCase()) || [];
    return {
      characters: [...new Set([...harvested.characters, ...fromBible.filter(Boolean)])],
      locations: [...new Set([...harvested.locations, ...bibleLocations.filter(Boolean)])],
    };
  }, [content, bible]);

  // The line the caret sits on decides what completion is offered.
  const trackCaret = (e) => {
    const { value, selectionStart } = e.target;
    const start = value.lastIndexOf("\n", selectionStart - 1) + 1;
    const end = value.indexOf("\n", selectionStart);
    const line = value.slice(start, end === -1 ? value.length : end);

    const next = suggestFor(line, selectionStart - start, vocab);
    setSuggest(next?.options?.length ? next : null);
    setSuggestIndex(0);
  };

  /** Replace the typed fragment on the current line with a completion. */
  const applySuggestion = (index) => {
    const ta = textareaRef.current;
    if (!ta || !suggest) return;
    const option = suggest.options[index];
    if (!option) return;

    const { value, selectionStart } = ta;
    const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
    // Replace only the fragment the caret is sitting after, so a completion
    // never eats text the writer typed earlier on the line.
    const from = selectionStart - suggest.fragment.length;

    ta.focus();
    ta.setSelectionRange(from, selectionStart);
    // Go through the browser's editing pipeline so Ctrl+Z still undoes it.
    if (!document.execCommand("insertText", false, option)) {
      const updated = value.slice(0, from) + option + value.slice(selectionStart);
      setContent(updated);
      const caret = from + option.length;
      requestAnimationFrame(() => ta.setSelectionRange(caret, caret));
    }
    setSuggest(null);
    setDismissed(false);
    void lineStart;
  };

  // Custom Screenwriting Usability State
  const [zenMode, setZenMode] = useState(false);
  const [pageTheme, setPageTheme] = useState("light");
  // Typewriter mode: the caret holds its line near the middle and the page
  // moves under it. Focus mode has always done this, but only as a side effect
  // of being focus mode — there was no way to write normally and still have it.
  // On by default inside focus mode, independently switchable outside it.
  const [typewriter, setTypewriter] = useState(false);
  // Set by an edit that should not wait for the autosave debounce.
  const saveSoonRef = useRef(false);

  /**
   * Change how long an act is planned to run.
   *
   * The 33/33/34 split is a default, not a law, and until now the only way to
   * alter it was to regenerate the whole structure — which throws away every
   * suggestion in it. The server recomputes the percentages, so nothing here
   * has to keep two numbers agreeing.
   */
  const setActMinutes = useCallback(async (actNumber, minutes) => {
    try {
      const res = await scripts.setActDurations(id, { [actNumber]: minutes });
      if (res?.data?.structure) {
        setScript((prev) => (prev
          ? { ...prev, suggestions_json: JSON.stringify(res.data.structure) }
          : prev));
      }
    } catch (err) {
      alert(err.response?.data?.detail || "Could not change the act length.");
    }
  }, [id]);

  /**
   * Rename scene N by rewriting its slugline in the draft.
   *
   * Deliberately edits the DOCUMENT rather than the scene row. `scene_sync`
   * rebuilds every row from the page on each save, so a rename written to the
   * row would be silently reverted by the next keystroke. Editing the line the
   * row was derived from is the only version that survives.
   */
  const renameScene = useCallback((index, next) => {
    const lines = content.split("\n");
    let seen = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^\s*(INT\.|EXT\.)/i.test(lines[i])) {
        seen += 1;
        if (seen === index) {
          lines[i] = next.toUpperCase();
          setContent(lines.join("\n"));
          // Save at once rather than waiting out the 15s autosave. The scene
          // rows are rebuilt server-side and returned by that request, so
          // until it runs the timeline still shows the old heading — the one
          // control the writer just used is the last thing to update.
          saveSoonRef.current = true;
          return;
        }
      }
    }
  }, [content]);
  // Turning the mode on should take effect on the line you are already on,
  // rather than waiting for the next keystroke to snap the page into place.
  useEffect(() => {
    if (typewriter) scrollCaretIntoView(true);
    // eslint-disable-next-line
  }, [typewriter]);
  const [activeScene, setActiveScene] = useState(0);
  const textareaRef = useRef(null);

  const [loadError, setLoadError] = useState("");

  // Jump the editor to a scene: find the Nth slugline (INT./EXT.) in the script
  // and scroll the caret there. Scenes are written in order, so the Nth slug ≈
  // scene N; if it hasn't been written yet, jump to the end so the writer can add it.
  // Scroll so the caret sits comfortably in view. Reads the real line height
  // instead of assuming 25px, which drifts as soon as the font or zoom
  // changes. In zen mode the caret is centred (typewriter scrolling) so the
  // writer's eye stays in one place.
  /**
   * Keep the caret visible.
   *
   * Two things were wrong here, and together they meant the page did not follow
   * you down the script:
   *
   * 1. It was only ever called in zen mode. Enter and Tab both `preventDefault()`
   *    and insert programmatically, which skips the browser's own "keep the
   *    caret in view" behaviour — so in normal mode nothing scrolled at all and
   *    the caret walked off the bottom of the page.
   * 2. The non-centred branch parked the caret four lines from the top on every
   *    call, whether or not it was already visible. That yanks the page on
   *    keystrokes that needed no scrolling.
   *
   * Centred (zen) is typewriter scrolling and stays as it was. Otherwise this is
   * scroll-if-needed: do nothing while the caret is comfortably on screen, and
   * when it isn't, move the smallest amount that brings it back with a margin.
   */
  const scrollCaretIntoView = useCallback((centre = false) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const cs = getComputedStyle(ta);
    const lineHeight = parseFloat(cs.lineHeight) || 25;
    // Text starts below the padding box, and zen mode uses a 45vh top pad to
    // make centring possible. Omitting it under-scrolls by that whole amount.
    const padTop = parseFloat(cs.paddingTop) || 0;
    const line = ta.value.slice(0, ta.selectionStart).split("\n").length - 1;
    const caretY = padTop + line * lineHeight;

    // Keep a couple of lines of breathing room at each edge, so the caret never
    // stops flush against a boundary.
    const margin = lineHeight * 2;

    // 1. The textarea's own scroll. It is a fixed-height "page", so this only
    //    engages once the draft is longer than that page box.
    if (ta.scrollHeight > ta.clientHeight) {
      if (centre) {
        ta.scrollTop = Math.max(0, caretY - ta.clientHeight / 2);
      } else if (caretY - margin < ta.scrollTop) {
        ta.scrollTop = Math.max(0, caretY - margin);
      } else if (caretY + lineHeight + margin > ta.scrollTop + ta.clientHeight) {
        ta.scrollTop = caretY + lineHeight + margin - ta.clientHeight;
      }
    }

    // 2. The container, which is what the writer actually looks through.
    //
    //    This is the one that was missing. The page is 1056px tall and the
    //    window onto it is more like 650px on a laptop, so from roughly line 26
    //    the caret sits inside the textarea's own box — nothing for it to
    //    scroll — while being hundreds of pixels below the visible fold. The
    //    browser only follows a caret out of the *textarea*, never out of an
    //    ancestor, so typing simply walked off the bottom of the screen.
    //
    //    Worked in viewport coordinates and applied as a delta, which stays
    //    correct whatever padding or zoom the page happens to have.
    const container = ta.parentElement;
    if (!container || container.scrollHeight <= container.clientHeight) return;

    const caretOnScreen = ta.getBoundingClientRect().top + caretY - ta.scrollTop;
    const box = container.getBoundingClientRect();

    if (centre) {
      container.scrollTop += caretOnScreen - (box.top + box.height / 2);
    } else if (caretOnScreen - margin < box.top) {
      container.scrollTop += caretOnScreen - margin - box.top;
    } else if (caretOnScreen + lineHeight + margin > box.bottom) {
      container.scrollTop += caretOnScreen + lineHeight + margin - box.bottom;
    }
  }, []);

  // Jump the editor to a scene: find the Nth slugline and put the caret there.
  // Scenes are written in order, so the Nth slugline is scene N.
  const goToScene = (index) => {
    setActiveScene(index);
    const ta = textareaRef.current;
    if (!ta) return;
    const starts = sluglinePositions(ta.value);
    const pos = starts.length > index ? starts[index] : ta.value.length;
    ta.focus();
    ta.setSelectionRange(pos, pos);
    scrollCaretIntoView(typewriter || zenMode);
  };

  const [showStructure, setShowStructure] = useState(false);
  // Sharing belongs on the work, not in an account screen. It used to live only
  // under Settings → Team Members, which asked a writer already inside a script
  // to go to their account, find a tab, and re-pick the project they were
  // looking at. Every tool people already use — Docs, Figma, Notion — puts
  // Share next to the thing being shared.
  const [showShare, setShowShare] = useState(false);
  // What the draft looked like when focus mode was entered, so the status line
  // can report THIS session's output rather than the script's total. "You have
  // written 400 words today" is a fact a writer acts on; "your script is 4,000
  // words" is one they already knew.
  const [sessionStart, setSessionStart] = useState(null);
  // Focus mode hides the app's own chrome; this hides the BROWSER's. They are
  // different wishes and compose — a writer can have neither, either or both.
  const [isFullPage, setIsFullPage] = useState(false);
  const [addingScene, setAddingScene] = useState(null);

  // Script / Corkboard / Outline, the way Final Draft and Arc Studio split it.
  // All three read the same scene rows, which is only possible because the rows
  // are now reconciled from the draft on load rather than on save alone.
  const [view, setView] = useState("script");
  // Page rules are drawn from the server's own PAGE_LINES so the editor and the
  // PDF export cannot disagree about what page a scene is on.
  const [pagination, setPagination] = useState({ page_lines: 45, page_count: 1 });
  const [caretPage, setCaretPage] = useState(1);

  // Focus mode keeps its own session baseline. Reset on entry rather than on
  // mount, so leaving and re-entering starts a fresh sprint — which is how
  // writers actually use a focus mode.
  useEffect(() => {
    if (!zenMode) {
      setSessionStart(null);
      return;
    }
    setSessionStart({ words: countWords(content), at: Date.now() });
    // Deliberately keyed on zenMode alone: `content` is read once, at the
    // moment focus mode opens, which is the baseline the session measures from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zenMode]);

  /**
   * Fill the screen using the browser's own fullscreen, not a CSS imitation.
   *
   * Focus mode hides what the APP draws; this hides what the BROWSER draws —
   * tabs, address bar, bookmarks. On a 13-inch laptop that is roughly 120px of
   * vertical space, which is four or five lines of screenplay.
   *
   * The two compose deliberately: a writer can have neither, either, or both.
   * The request can be refused (an iframe without the permission, or a browser
   * setting), so the state is read back from the document rather than assumed —
   * a toggle that lies about whether it worked is worse than one that does
   * nothing.
   */
  const toggleFullPage = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      // Refused. `fullscreenchange` never fires, so the menu keeps showing the
      // truthful state, which is "off".
    }
  }, []);

  // The browser owns this state — Esc and F11 change it without telling us —
  // so it is observed, never inferred.
  useEffect(() => {
    const sync = () => setIsFullPage(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", sync);
    sync();
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  // Zen mode: Esc leaves. Without a keyboard exit the only way out is a button
  // that zen mode itself has just hidden most of the context around.
  useEffect(() => {
    if (!zenMode) return;
    const onKey = (e) => {
      if (e.key === "Escape") setZenMode(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zenMode]);

  // Typewriter scrolling: hold the caret near the middle of the page so the
  // writer's eye stays in one place instead of tracking down the screen.
  useEffect(() => {
    if (!zenMode) return;
    const ta = textareaRef.current;
    if (!ta) return;
    const recentre = () => scrollCaretIntoView(true);
    ta.addEventListener("input", recentre);
    ta.addEventListener("click", recentre);
    recentre();
    return () => {
      ta.removeEventListener("input", recentre);
      ta.removeEventListener("click", recentre);
    };
  }, [zenMode, scrollCaretIntoView]);

  // The route reads `/projects/:id/editor`, but the id in it is a SCRIPT id:
  // the dashboard resolves project -> script before navigating. Existing links
  // therefore work, and a URL built honestly from a project id — a shared link,
  // anything constructed from the project list — 404s with "Script not found".
  //
  // Rather than rename the route and break every link already in the wild, the
  // editor accepts either: try it as a script, and on a 404 ask for the
  // project's script instead. `getByProject` is get-or-create, so it is also
  // the path that opens a project which has no script row yet.
  useEffect(() => {
    scripts
      .getById(id)
      .catch((err) => {
        if (err.response?.status !== 404) throw err;
        return scripts.getByProject(id);
      })
      .then((res) => {
        setScript(res.data);
        setContent(res.data.content || "");
        // Arrives with the script so the type-ahead has character names
        // before the first keystroke, not after a second round trip.
        setBible(res.data.bible || null);
        if (res.data.pagination) setPagination(res.data.pagination);
        // Open the structure preview only when suggestions exist AND the
        // writer has something on the page. It used to open on arrival from the
        // wizard, so a new project greeted its author with a list of scenes
        // they had not chosen. Suggestions are now generated on request, which
        // makes their presence the signal that they are wanted.
        if (res.data.suggestions_json && (res.data.scenes || []).length === 0
            && (res.data.content || "").trim()) {
          setShowStructure(true);
        }
      })
      .catch((err) => setLoadError(err.response?.data?.detail || "Could not load this script."));
  }, [id]);

  // A scene's length as the writer would state it. `draft_json.minutes` is what
  // is on the page; `time_allocation` is what was planned for it.
  // AI suggestion set (persisted on the script row) + which are already added.
  const suggestions = React.useMemo(() => {
    try { return script?.suggestions_json ? JSON.parse(script.suggestions_json) : null; }
    catch { return null; }
  }, [script?.suggestions_json]);
  const addedKeys = React.useMemo(
    () => new Set((script?.scenes || []).map((s) => `${s.act_number}:${s.title}`)),
    [script?.scenes]
  );

  // Positions of every slugline in the draft, in document order.
  const sluglinePositions = (text) => {
    const re = /^[ \t]*(INT\.|EXT\.|INT\/EXT\.|I\/E\.)/gim;
    const out = [];
    let m;
    while ((m = re.exec(text)) !== null) out.push(m.index);
    return out;
  };

  // A scene block the writer can immediately work on: a slugline (so the
  // structure panel and cursor can find it) plus the beat description as a
  // starting action line.
  const sceneBlock = (scene) => {
    const where = (scene.location || scene.title || "LOCATION").toUpperCase();
    const heading = `INT. ${where} - DAY`;
    const body = scene.description ? `\n${scene.description}\n` : "\n";
    return `${heading}\n${body}\n`;
  };

  /**
   * Insert text at `pos` THROUGH the browser's own editing pipeline.
   *
   * Writing to React state directly (setContent) replaces the textarea's value
   * wholesale, which wipes the native undo stack — that is why Ctrl+Z did
   * nothing after adding a scene. `execCommand("insertText")` performs the edit
   * the way a keystroke would, so the browser records an undo entry and fires
   * an input event that React's onChange picks up.
   *
   * execCommand is deprecated but remains the only way to preserve native undo
   * in a plain textarea; there is no standards-track replacement yet. The
   * setContent path below is a fallback for browsers that refuse it.
   */
  const replaceRange = useCallback((start, end, text) => {
    const ta = textareaRef.current;
    if (!ta) return false;
    ta.focus();
    ta.setSelectionRange(start, end);
    const ok = document.execCommand && document.execCommand("insertText", false, text);
    if (!ok) {
      // Fallback: correct output, but this edit will not be undoable.
      setContent((prev) => prev.slice(0, start) + text + prev.slice(end));
    }
    return true;
  }, []);

  /**
   * Convert the romanised word behind the caret to Devanagari.
   *
   * Runs on a word boundary rather than per keystroke: converting live makes
   * the word change shape underneath the cursor while it is still being typed,
   * so you cannot read back what you wrote until you stop. This way the writer
   * sees the Roman word they meant, then sees it become Nepali once.
   *
   * Goes through `replaceRange` so the browser records it as an ordinary edit
   * and Ctrl+Z still walks back through the draft. A conversion the writer
   * cannot undo is worse than no conversion.
   */
  const transliterateBehindCaret = useCallback(
    (ta) => {
      if (!ta) return;
      const caret = ta.selectionStart;
      if (caret !== ta.selectionEnd) return;

      const match = ta.value.slice(0, caret).match(new RegExp("(" + WORD_PATTERN + ")$"));
      if (!match) return;

      const word = match[1];
      const converted = transliterateWord(word);
      // `shouldConvert` already refused sluglines, character cues and anything
      // with a digit, so an unchanged word here means there was nothing to do.
      if (converted === word) return;

      replaceRange(caret - word.length, caret, converted);
    },
    [replaceRange]
  );

  const insertAtPosition = (pos, text) => {
    if (!replaceRange(pos, pos, text)) {
      setContent((prev) => prev.slice(0, pos) + text + prev.slice(pos));
      return;
    }
    // Leave the caret on the new scene's action line, ready to write.
    const caret = pos + text.indexOf("\n\n") + 2;
    requestAnimationFrame(() => {
      textareaRef.current?.setSelectionRange(caret, caret);
      scrollCaretIntoView(typewriter || zenMode);
    });
  };

  const handleAddScene = async (scene, actNumber, orderIndex) => {
    const key = `${actNumber}:${scene.title}`;
    setAddingScene(key);
    try {
      const res = await scripts.addScene({
        script_id: id,
        title: scene.title || "Untitled scene",
        description: scene.description || "",
        act_number: actNumber,
        scene_type: scene.scene_type || "minor",
        time_allocation: scene.time_allocation || 0,
        order_index: orderIndex,
        // The structure generator produced these; sending them is what lets a
        // storyboard frame know where the scene is, who is in it and how it
        // feels before a word of it has been written.
        location: scene.location || "",
        emotional_beat: scene.emotional_beat || "",
        characters: scene.characters || [],
      });

      const nextScenes = [...(script?.scenes || []), res.data].sort(
        (a, b) => a.act_number - b.act_number || a.order_index - b.order_index
      );

      // Write the scene into the screenplay itself. Without this the card
      // reads "Added" while the page stays blank, and the structure panel
      // and the draft drift apart.
      const rank = nextScenes.findIndex((s) => s.id === res.data.id);
      const starts = sluglinePositions(textareaRef.current?.value ?? content);
      const at = rank < starts.length ? starts[rank] : (textareaRef.current?.value ?? content).length;

      insertAtPosition(at, sceneBlock(scene));
      setActiveScene(rank);

      setScript((prev) => ({ ...prev, scenes: nextScenes }));
    } catch (err) {
      alert(err.response?.data?.detail || "Could not add this scene.");
    } finally {
      setAddingScene(null);
    }
  };

  // Which printed page the caret is on. Same rule as the rules drawn on the
  // page and as the PDF export, so all three agree.
  const updateCaretPage = (ta) => {
    if (!ta) return;
    const before = ta.value.slice(0, ta.selectionStart);
    setCaretPage(Math.floor(before.split("\n").length / (pagination.page_lines || 45)) + 1);
  };

  /**
   * Move a scene by dragging its card — by moving the scene IN THE SCRIPT.
   *
   * The draft is the authority: `scene_sync` derives every row's order from
   * document position, so reordering rows on their own would be undone by the
   * next save. Moving the text is the only reorder that survives, and it is
   * also what the writer means.
   */
  const moveScene = (from, to) => {
    const text = textareaRef.current?.value ?? content;
    const starts = sluglinePositions(text);
    if (from >= starts.length || from === to) return;

    const head = text.slice(0, starts[0]);
    const blocks = starts.map((pos, i) =>
      text.slice(pos, i + 1 < starts.length ? starts[i + 1] : text.length)
    );
    const [moved] = blocks.splice(from, 1);
    blocks.splice(Math.min(to, blocks.length), 0, moved);

    const next = head + blocks.join("");
    // Whole-document rewrite, so this goes through state rather than
    // execCommand — a reorder is not a keystroke and does not belong on the
    // typing undo stack.
    setContent(next);
    setActiveScene(Math.min(to, blocks.length - 1));
    scripts
      .save(id, next)
      .then((res) => {
        if (res?.data?.scenes) setScript((prev) => ({ ...prev, scenes: res.data.scenes }));
        if (res?.data?.pagination) setPagination(res.data.pagination);
      })
      .catch(() => {});
  };

  /**
   * A scene the writer invented, rather than one the AI proposed.
   *
   * `POST /scripts/add-scene` has accepted these since the first structure
   * commit and nothing ever called it that way, so every scene in the product
   * had to originate from a generated suggestion.
   */
  const addCustomScene = async (actNumber = 1, heading = "") => {
    // The slugline is composed inline in the view that asked for it. This used
    // `window.prompt`, which some embedded browsers refuse outright — and which
    // is the wrong way to ask a screenwriter for a scene heading regardless.
    if (!heading || !heading.trim()) return;

    const title = heading.trim().toUpperCase();
    setAddingScene("custom");
    try {
      const orderIndex = (script?.scenes || []).length;
      const res = await scripts.addScene({
        script_id: id,
        title,
        description: "",
        act_number: actNumber,
        scene_type: "minor",
        time_allocation: 0,
        order_index: orderIndex,
        location: title.replace(/^(INT\.|EXT\.|INT\/EXT\.|I\/E\.)\s*/i, "").split(" - ")[0],
        emotional_beat: "",
        characters: [],
      });

      // Write it into the page too. A card that says a scene exists while the
      // script stays blank is the drift this whole sync layer exists to stop.
      const text = textareaRef.current?.value ?? content;
      const at = text.length;
      const block = `${text.endsWith("\n") || !text ? "" : "\n\n"}${title}\n\n`;
      insertAtPosition(at, block);

      setScript((prev) => ({ ...prev, scenes: [...(prev?.scenes || []), res.data] }));
      setActiveScene(orderIndex);
      setView("script");
    } catch (err) {
      alert(err.response?.data?.detail || "Could not add this scene.");
    } finally {
      setAddingScene(null);
    }
  };

  const saveContent = useCallback(async () => {
    setSaving(true);
    try {
      const res = await scripts.save(id, content);
      // The server reconciles the scene rows with the draft on every save and
      // returns them, so the index cards refresh from this same round trip
      // instead of going stale until the page is reloaded.
      if (res?.data?.scenes) {
        setScript((prev) => (prev ? { ...prev, scenes: res.data.scenes } : prev));
      }
      if (res?.data?.pagination) setPagination(res.data.pagination);
      // The server has it now, so the local rescue copy has nothing left to
      // rescue. Dropped rather than left behind: a stale copy that outlives the
      // draft it mirrors is the thing that eventually overwrites good work.
      clearRescue(id);
    } catch (err) {
      console.error("Auto-save failed:", err.response?.data?.detail || err.message);
    } finally {
      setSaving(false);
    }
  }, [id, content]);

  // Mirror the draft locally as it is typed. Autosave runs every 15s and a
  // render can throw at any point inside that window; without this, everything
  // typed since the last round trip dies with the component. `ErrorBoundary`
  // reads this back out and offers it to the writer.
  useEffect(() => {
    if (content) saveRescue(id, content);
  }, [id, content]);

  useEffect(() => {
    // An edit that asked to be saved now — a timeline rename — skips the
    // debounce. `saveContent` closes over `content`, so this runs on the
    // render AFTER the change, by which point it carries the new text.
    if (saveSoonRef.current) {
      saveSoonRef.current = false;
      if (content) saveContent();
      return undefined;
    }
    const timer = setTimeout(() => {
      if (content) saveContent();
    }, 15000); // Save every 15s instead of 30s for higher reliability
    return () => clearTimeout(timer);
  }, [content, saveContent]);

  // Ctrl/Cmd+S. Autosave already runs, but "save my work" is a reflex a writer
  // should never have to suppress — and without this the browser's own Save
  // Page dialog opened over the draft, which is the opposite of reassuring.
  useEffect(() => {
    const onSave = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveContent();
      }
    };
    window.addEventListener("keydown", onSave);
    return () => window.removeEventListener("keydown", onSave);
  }, [saveContent]);

  // AI calls follow the project's own genre/tone/language rather than guessing.
  const proj = script?.project || {};
  const genre = proj.genre || "Drama";
  const tone = proj.tone || "Emotional";
  const language = proj.language || "English";

  // Fetch pattern recommendations. `focus` steers what KIND of pattern comes
  // back (see FOCUSES) — the library is indexed by the problem a technique
  // solves, so naming the problem is what makes retrieval land.
  const loadPatterns = useCallback(async (focusKey) => {
    setPatternsLoading(true);
    try {
      const f = FOCUSES.find((x) => x.key === focusKey) || FOCUSES[0];
      // The draft ALWAYS goes in scene_text, because that is what gets
      // diagnosed. The chip goes in `focus`, which steers only the semantic
      // half — mixing the scene text into the query drowns the short focus
      // phrase in the embedding and every chip returns the same three
      // patterns, which is what made them decorative.
      //
      // These were one field until 2026-08-31, so choosing a chip replaced the
      // draft with the chip's own complaint. The linter then diagnosed the
      // complaint, and this panel reported the result as "found in your draft,
      // line 1" — pointing at a line of a sentence the writer never typed.
      const res = await scripts.recommendations({
        scene_text: content || instruction,
        focus: f.key === "scene" ? "" : f.query,
        genre,
        tone,
      });
      setPatterns(res.data.patterns);
      // `diagnosed` is why these patterns came back: the linter flagged a
      // specific line and named the technique that fixes it. Showing the
      // reason is the difference between advice and a horoscope.
      setDiagnosed(res.data.diagnosed || []);
      setPatternSource(res.data.source || "similarity");
    } catch (err) {
      setPatterns([]);
      setDiagnosed([]);
    } finally {
      setPatternsLoading(false);
    }
  }, [content, instruction, genre, tone]);

  // Load once when the Patterns tab is opened — no button press needed.
  useEffect(() => {
    if (aiMode === "patterns" && patterns === null && script) loadPatterns(focus);
    // eslint-disable-next-line
  }, [aiMode, script]);

  const handleAI = async () => {
    setAiLoading(true);
    try {
      if (aiMode === "generate") {
        // `script_id` is what lets the server load the story bible and ground
        // the prompt in it. Without it the model never learns what a character
        // wants, needs, or sounds like — all of which the writer already typed
        // into the Story tab.
        // Streamed, so the scene appears as it is written rather than after
        // it is finished. Two thousand tokens is a long time to show a writer
        // nothing, in a product whose whole claim is keeping them in flow.
        await streamSSE(
          "/scripts/generate-scene/stream",
          { scene_description: instruction, genre, tone, language, script_id: id },
          setAiResponse,
        );
      } else if (aiMode === "improve") {
        // This one matters more: the writer is watching their OWN words being
        // replaced, and seeing it land line by line is what lets them stop it
        // when it goes somewhere they did not want.
        await streamSSE(
          "/scripts/improve/stream",
          { scene_text: content, instruction, language, script_id: id },
          setAiResponse,
        );
      } else {
        const res = await scripts.suggest({ scene_text: content, genre, tone });
        setAiResponse(res.data.suggestions.join("\n\n---\n\n"));
      }
    } catch (err) {
      if (err.response?.status === 403) {
        // Show the offer rather than leaving a refusal in the response box.
        setAiResponse("");
        setServerLocked(true);
      } else {
        setAiResponse("Error: " + (err.response?.data?.detail || "AI request failed"));
      }
    } finally {
      setAiLoading(false);
    }
  };

  /**
   * Put the accepted text where the caret is, through the browser's editing
   * pipeline.
   *
   * Two bugs in one line before this: appending to the end of the draft dropped
   * a scene written for act 1 after act 3, and `setContent` replaced the whole
   * textarea value, which discards the native undo stack — the exact failure
   * `replaceRange` exists to avoid (see its comment).
   */
  const acceptAI = () => {
    const ta = textareaRef.current;
    const value = ta?.value ?? content;
    const at = ta ? ta.selectionStart : value.length;
    // Land as its own block, but don't stack blank lines if one is already there.
    const gap = at > 0 && !value.slice(0, at).endsWith("\n\n") ? "\n\n" : "";
    const text = `${gap}${aiResponse.trim()}\n`;

    if (ta) {
      replaceRange(at, at, text);
      const caret = at + text.length;
      requestAnimationFrame(() => {
        ta.setSelectionRange(caret, caret);
        scrollCaretIntoView(typewriter || zenMode);
      });
    } else {
      setContent(value.slice(0, at) + text + value.slice(at));
    }
    setAiResponse("");
    setInstruction("");
  };

  /**
   * Finalize, with the review in front of it (proposal FR07).
   *
   * The review runs first and reports what it found — near-duplicate character
   * names, scenes far off their allotted time, an act out of balance. It does
   * not block: a writer may finalize a script this tool disagrees with. What it
   * must not do is let them do it without being shown, which is what happened
   * while the reviewer sat in `script_engine` wired to nothing.
   */
  const handleFinalize = async () => {
    setReviewing(true);
    try {
      await saveContent();
      const res = await scripts.review(id);
      if ((res.data.findings || []).length > 0) {
        setReview(res.data);
        return;
      }
      await confirmFinalize();
    } catch (err) {
      alert(err.response?.data?.detail || "Could not review the script.");
    } finally {
      setReviewing(false);
    }
  };

  const confirmFinalize = async () => {
    try {
      await scripts.finalize(id);
      setReview(null);
      navigate(`/projects/${id}/storyboard`);
    } catch (err) {
      alert(err.response?.data?.detail || "Could not finalize the script.");
    }
  };

  const EXPORT_EXT = { pdf: "pdf", word: "docx", fdx: "fdx", package: "pdf" };

  const handleExport = async (type) => {
    try {
      const res = await exportApi[type](id);
      // Name the file after the project. Every export used to land as
      // `script.pdf`, so three projects produced three files a writer had to
      // open to tell apart — and the browser silently renamed the collisions.
      downloadBlob(res.data, `${safeFilename(proj.title || "script")}.${EXPORT_EXT[type]}`);
    } catch (err) {
      alert(err.response?.data?.detail || "Export failed.");
    }
  };

  // Keyboard Navigation & Screenwriting Tab-and-Enter helper rules
  // The keys that end a word. Space and Enter do most of the work; the
  // punctuation is here so a line ending in "?" converts its last word too,
  // which in dialogue is most of them.
  const WORD_BOUNDARY_KEYS = [" ", "Enter", ".", ",", "?", "!", ";", ":"];

  const handleKeyDown = (e) => {
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
      const { selectionStart, selectionEnd, value } = e.target;
      
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
      const leadingSpaces = currentLine.match(/^ */)[0].length;
      const trimmed = currentLine.trim();
      
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

  if (loadError)
    return (
      <div className="h-screen bg-bg flex flex-col items-center justify-center gap-4 text-ink">
        <p className="text-inkSoft">{loadError}</p>
        <button onClick={() => navigate("/dashboard")} className="btn-gold text-sm">
          Back to Dashboard
        </button>
      </div>
    );

  if (!script) return <div className="h-screen bg-bg flex items-center justify-center text-gold">Loading...</div>;

  return (
    <div className="h-screen bg-bg flex flex-col overflow-hidden text-ink">
      {/* Toolbar */}
      {/* Scrolls sideways on a phone rather than wrapping. A wrapped toolbar
          silently eats the page height it is sitting above, and there is not
          enough of that on a 375px screen to give any away.

          Hidden entirely in focus mode. It was not, which meant "focus mode"
          removed the timeline and the scene rail and left thirteen controls
          sitting above the page — most of the chrome, and all of the visual
          noise, still there. The status line inside the page is the deliberate
          replacement: page, session words, save state. Esc brings this back. */}
      {!zenMode && (
      <header className="h-14 bg-surface border-b border-border flex items-center gap-4 px-4 md:px-6 shrink-0 relative z-20 overflow-x-auto lg:overflow-visible">
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
                       max-w-[8rem] md:max-w-[12rem] lg:max-w-[18rem]"
            title={script.project?.title || "Untitled"}
          >
            {script.project?.title || "Untitled"}
          </span>
          {/* The story bible moved out of the writing panel to its own screen.
              This is the way back to it, from the one place a writer is when
              they realise the character's want was wrong. */}
          <button
            onClick={() => navigate(`/projects/${id}/setup`)}
            className="shrink-0 text-[11px] font-sans text-inkMuted hover:text-gold border border-border hover:border-gold/40 rounded-full px-2.5 py-0.5 transition"
            title="Story bible and project format"
          >
            Setup
          </button>
        </div>
        <div className="flex gap-3 items-center ml-auto shrink-0">
          <span className="text-[11px] font-semibold text-inkMuted uppercase tracking-wider whitespace-nowrap">{saving ? "Saving..." : "Synced"}</span>
          {/* Where the writer is, in the unit their craft actually uses. A
              screenplay note is "cut ten pages", never "cut some words" — and
              until now the editor could not answer "what page am I on" at all.
              Same page numbering as the exported PDF. */}
          {view === "script" && (
            <span
              className="text-[11px] font-mono text-inkMuted tabular-nums whitespace-nowrap"
              title="Page under the caret / pages in the draft — matches the PDF export"
            >
              p. {Math.min(caretPage, pagination.page_count)} / {pagination.page_count}
            </span>
          )}
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
          <ImportScript
            scriptId={id}
            onImported={(data) => {
              setContent(data.content || "");
              if (data.scenes) setScript((prev) => (prev ? { ...prev, scenes: data.scenes } : prev));
              if (data.pagination) setPagination(data.pagination);
            }}
          />

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
                key: "zen",
                label: "Focus mode",
                hint: "Hide everything except the page",
                active: zenMode,
                onSelect: () => setZenMode((z) => !z),
              },
              {
                key: "full",
                label: "Full page",
                hint: "Fill the whole screen — browser chrome and all",
                active: isFullPage,
                onSelect: toggleFullPage,
              },
              {
                key: "theme",
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
            {reviewing ? "Reviewing…" : "Finalize & Storyboard"}
          </button>
        </div>
      </header>
      )}

      {/* FR07: what the review found, before finalizing. Reports, never blocks. */}
      {showShare && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6"
          onMouseDown={() => setShowShare(false)}
        >
          <div
            className="bg-surface border border-borderSoft rounded-2xl shadow-card
                       max-w-lg w-full max-h-[80vh] overflow-y-auto p-6"
            onMouseDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Share this project"
          >
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="font-display text-xl text-ink">Share</h2>
              <button
                onClick={() => setShowShare(false)}
                aria-label="Close"
                className="text-inkMuted hover:text-ink text-xl leading-none"
              >
                ×
              </button>
            </div>
            {/* The same panel Settings mounts, told which project it is on —
                one implementation, so roles cannot mean two different things
                in two places. */}
            {/* `script.project` is a whitelisted subset of project FIELDS and
                carries no id — the id is top-level `project_id`. Passing
                `proj.id` silently handed TeamPanel `undefined`, which made it
                fall back to its project picker and ask a writer already inside
                a script which project they meant. */}
            <TeamPanel projectId={script?.project_id} />
          </div>
        </div>
      )}

      <ReviewModal
        review={review}
        onKeepWriting={() => setReview(null)}
        onFinalizeAnyway={confirmFinalize}
      />

      {structureFailed && (
        <div className="bg-amber-400/10 border-b border-amber-400/25 px-6 py-2.5 flex items-start gap-3 shrink-0">
          <p className="text-[12px] text-amber-200 leading-snug flex-1">
            The project was created, but its structure suggestion didn't come
            back. Everything else works — the Structure panel stays empty until a
            structure is generated, and you can start writing now.
          </p>
          <button
            onClick={() => setNoticeDismissed(true)}
            className="text-[11px] text-amber-200/70 hover:text-amber-100 shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Structure zone. Expanded: the full preview (act bar + suggestion
          cards you can add from). Minimized: the compact 2b timeline
          instrument, so act balance and runtime stay visible while writing. */}
      {showStructure && suggestions?.short_form ? (
        // Short-form has beats, not acts. The act timeline reads
        // `structure.acts` and renders nothing for these, which left the panel
        // silently empty for every short-form project.
        <ShortFormTimeline structure={suggestions} />
      ) : showStructure && suggestions ? (
        <StructureTimeline
          structure={suggestions}
          addedKeys={addedKeys}
          onAdd={handleAddScene}
          adding={addingScene}
        />
      ) : (
        !zenMode && (
          <CompactTimeline
            onRenameScene={renameScene}
            onSetActMinutes={setActMinutes}
            scenes={script.scenes || []}
            suggestions={suggestions}
            activeScene={activeScene}
            onSceneClick={goToScene}
            onExpand={() => setShowStructure(true)}
          />
        )
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* The rail now stays in every view, because it carries the view
            switch. It still does not draw the cards outside Script — Corkboard
            and Outline are a fuller version of that same list — so the 256px
            is spent on navigation and totals rather than on saying the same
            thing twice. */}
        {!zenMode && (
          <SceneRail
            scenes={script.scenes}
            activeScene={activeScene}
            onSceneClick={goToScene}
            view={view}
            onViewChange={setView}
          >
            {/* Corkboard and Outline live in the rail now, not over the page.
                Restructuring happens BESIDE the writing rather than instead of
                it: the reason to move a card is almost always something you
                just read, and covering the script to move it meant holding the
                scene in your head while you did. `onOpen` no longer switches
                view either — the page is already there, so it just jumps. */}
            {view === "corkboard" && (
              <Corkboard
                scenes={script.scenes || []}
                activeScene={activeScene}
                onOpen={goToScene}
                onMove={moveScene}
                onAdd={addCustomScene}
                adding={addingScene}
              />
            )}
            {view === "outline" && (
              <OutlineView
                scenes={script.scenes || []}
                suggestions={suggestions}
                activeScene={activeScene}
                onOpen={goToScene}
                onAdd={addCustomScene}
                adding={addingScene}
              />
            )}
          </SceneRail>
        )}

        {/* Workspace: the screenplay, always. */}
        <div className="flex-1 flex flex-col min-w-0">

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
                  p. {Math.min(caretPage, pagination.page_count)} / {pagination.page_count}
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
            <div className="relative w-full max-w-[816px] flex">
              <textarea
              ref={textareaRef}
              className={`screenplay-page ${pageTheme === "dark" ? "dark-page" : ""} ${zenMode ? "zen-page" : ""} ${typewriter && !zenMode ? "typewriter-page" : ""} resize-none`}
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
                setContent(e.target.value);
                setDismissed(false);
                trackCaret(e);
                // Ordinary typing needs this as much as Enter does: the caret
                // leaves the container's visible window long before it leaves
                // the textarea, and the browser only follows it out of the latter.
                scrollCaretIntoView(typewriter || zenMode);
              }}
              onKeyDown={handleKeyDown}
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
              onBlur={() => setSuggest(null)}
              />
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

        {/* Format guide — sits between the page and the assistant so the
            example column lines up beside what you are typing. */}

        {/* AI Assistant. A column on a laptop; a sheet over the page on a
            phone, because 320px of permanent panel beside a 375px screen
            leaves nothing to write on. */}
        {!zenMode && (
          <>
          {panelOpen && (
            <button
              type="button"
              aria-label="Close panel"
              onClick={() => setPanelOpen(false)}
              className="lg:hidden fixed inset-0 z-30 bg-black/50"
            />
          )}
          <aside
            className={`bg-surface border-l border-border p-5 overflow-y-auto overflow-x-hidden shrink-0 animate-fade-up flex flex-col
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
                <div className="flex items-center justify-between mb-3">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-inkMuted">
                    {genre} · {tone}
                  </span>
                  <button
                    onClick={() => loadPatterns(focus)}
                    disabled={patternsLoading}
                    className="text-[11px] text-inkMuted hover:text-gold transition-colors disabled:opacity-50"
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
                    const open = openPattern === i;
                    // An exact hit came from a linter flag, not from embedding
                    // distance. Its similarity is a placeholder 1.0, so showing
                    // "100%" would dress a diagnosis up as a perfect semantic
                    // match. Show the line it answers instead.
                    const hit = diagnosed.find((d) => d.technique === p.technique);
                    return (
                      <button
                        key={i}
                        onClick={() => setOpenPattern(open ? null : i)}
                        className={`w-full text-left rounded-xl p-3.5 border transition-colors ${
                          open ? "bg-elevated/60 border-gold/30" : "bg-elevated/40 border-borderSoft hover:border-gold/20"
                        }`}
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
                    );
                  })}
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
        )}
      </div>
    </div>
  );
}
