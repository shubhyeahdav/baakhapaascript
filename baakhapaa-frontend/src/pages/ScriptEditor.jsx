import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { scripts, exportApi, streamSSE } from "../services/api";
import { downloadBlob, safeFilename } from "../utils/download";
import { harvestVocabulary, suggestFor } from "../components/FormatShortcuts";
import ReviewModal from "../components/ReviewModal";
import TeamPanel from "../components/TeamPanel";
import SceneRail from "../components/SceneRail";
import EditorHeader from "../components/EditorHeader";
import AssistPanel, { FOCUSES } from "../components/AssistPanel";
import ScriptPage from "../components/ScriptPage";
import { enterText } from "../utils/screenplayFormat";
import { countWords } from "../utils/draft";
import { saveRescue, clearRescue } from "../utils/draftRescue";
import { transliterateWord, WORD_PATTERN, DANDA } from "../utils/nepaliTransliterate";
import { useT } from "../i18n";

// What the shortcuts dropdown lists. Kept beside the editor rather than in
// FormatShortcuts so the reference and the engine can't silently disagree
// about which letters do what — this is the one place a human reads them.
import StructureTimeline from "../components/StructureTimeline";
import ShortFormTimeline from "../components/ShortFormTimeline";
import CompactTimeline from "../components/CompactTimeline";
import Corkboard from "../components/Corkboard";
import OutlineView from "../components/OutlineView";
import CastView from "../components/CastView";

// One-click focuses for pattern recommendations. The pattern library is
// indexed by the PROBLEM a technique solves, so each chip just names that
// problem in the retrieval query — no extra endpoint, no extra cost.
// `origin_tradition` is a real cinema for 12 of the 29 entries and filler for
// the other 17. Rendering the filler puts a category-shaped word on the card
// that carries nothing; rendering the real ones tells a writer in Kathmandu
// that a technique comes from a cinema near them, which is the whole point of
// having tagged them.


// Caret moves that produce no text change, so `onChange` never sees them.
const NAV_KEYS = new Set([
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "PageUp", "PageDown", "Home", "End",
]);

// The pointer over the page, as a cycle. `next` makes the menu entry a single
// control rather than three that have to be kept mutually exclusive.


import { useAuth } from "../context/AuthContext";


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
  // The other two cards, folded away until asked for. Three pieces of advice
  // of apparently equal weight is a menu, and a menu is what a writer skips.
  const [showAllPatterns, setShowAllPatterns] = useState(false);
  // What the panel has already said about this script, keyed by technique:
  // {times_shown, resolved}. Advice the writer has seen before and not acted
  // on is worth saying so about; advice they have already taken should not be
  // coming back at all.
  const [seen, setSeen] = useState({});
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
  // Which pointer floats over the page. The nib is the default because it is
  // already this product's character everywhere else.
  const [cursor, setCursor] = useState("pen");
  // True while typing, false the moment the mouse moves. Applies to whichever
  // style is chosen rather than being a style of its own.
  const [resting, setResting] = useState(false);

  useEffect(() => {
    const wake = () => setResting(false);
    // `mousemove` only — a click without movement should not bring it back,
    // because that is what happens when a trackpad is brushed while typing.
    window.addEventListener("mousemove", wake);
    return () => window.removeEventListener("mousemove", wake);
  }, []);
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
      const res = await scripts.setActDurations(scriptId, { [actNumber]: minutes });
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
  // Import is a button on desktop and a menu item on a phone, so the component
  // that owns the file input is rendered once and opened through this rather
  // than rendered twice.
  const importRef = useRef(null);
  // The header owns the file picker; this is the only thing it hands back.
  const handleImported = useCallback((data) => {
    setContent(data.content || "");
    if (data.scenes) setScript((prev) => (prev ? { ...prev, scenes: data.scenes } : prev));
    if (data.pagination) setPagination(data.pagination);
  }, []);
  // What the writer has highlighted on the page, verbatim. Held as text rather
  // than as offsets because offsets go stale the moment anything is typed while
  // a request is in flight, and a stale offset replaces the wrong words
  // silently. Text can be re-located, or found to be gone, which is the honest
  // outcome.
  const [selection, setSelection] = useState("");
  // The selection as it was when Improve was pressed. The writer can keep
  // working while the rewrite streams, so this is what the answer belongs to,
  // not whatever is highlighted by the time it arrives.
  const improveScope = useRef("");

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

  /* Tell the command palette what is on the page, so ⌘K can jump to a scene.

     The palette is global and the draft is not, so the direction has to be
     this way round: the editor announces, the palette listens. Sluglines are
     read from the DRAFT rather than from `script.scenes`, because `goToScene`
     addresses the Nth slugline in the textarea and the two can differ for as
     long as it takes a save to come back — and a jump to the wrong scene is
     worse than no jump.

     `editor-closed` on unmount, or the palette would keep offering scenes from
     a script the writer has left. */
  useEffect(() => {
    const titles = (content.match(/^\s*(?:INT|EXT|INT\/EXT|I\/E)\..*$/gim) || [])
      .map((line, index) => ({ index, title: line.trim() }));
    window.dispatchEvent(new CustomEvent("editor-scenes", { detail: { scenes: titles } }));
  }, [content]);

  useEffect(() => () => window.dispatchEvent(new Event("editor-closed")), []);

  useEffect(() => {
    const onJump = (e) => {
      const index = e.detail?.index;
      if (typeof index === "number") goToScene(index);
    };
    window.addEventListener("jump-to-scene", onJump);
    return () => window.removeEventListener("jump-to-scene", onJump);
  });

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

  /**
   * How many pages, counted here rather than waited for.
   *
   * `pagination` arrives with a save, and saves are debounced by fifteen
   * seconds — so the indicator sat on a stale total for most of a session and
   * only caught up long after the page it described had been written. The rule
   * is one line: the same PAGE_LINES the server paginates on and the PDF lays
   * out with, so the two cannot disagree by more than the wrapped-line drift
   * the server has too. Both places that show it — the toolbar and focus
   * mode's status line — read this.
   */
  const pageCount = useMemo(() => {
    const lines = (content || "").split("\n").length;
    return Math.max(1, Math.ceil(lines / (pagination.page_lines || 45)));
  }, [content, pagination.page_lines]);
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
    /* `live` is not ceremony. StrictMode mounts, unmounts and remounts, so two
       identical loads go out and only the second one's result is wanted. The
       first was still allowed to write, and what it usually wrote was a
       failure: two simultaneous requests to the same URL, and the loser comes
       back as a bare network error with no response on it — so the editor
       showed "Could not load this script." over a script that had loaded
       perfectly a moment earlier. Roughly one open in eight, and permanent,
       because nothing ever cleared `loadError` again.

       That is also the shape of every flaky connection, which is the one this
       product is for. A dropped request on a phone should cost a reload, not
       the session. */
    let live = true;
    setLoadError("");
    scripts
      .getById(id)
      .catch((err) => {
        if (err.response?.status !== 404) throw err;
        return scripts.getByProject(id);
      })
      .then((res) => {
        if (!live) return;
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
      .catch((err) => {
        if (!live) return;
        setLoadError(err.response?.data?.detail || "Could not load this script.");
      });
    return () => { live = false; };
  }, [id]);

  /* The route reads `/projects/:id/editor`, and that param is in practice a
     SCRIPT id: the dashboard resolves project -> script before navigating, and
     `ProjectSetup`, the storyboard, versions, comments and all four export
     routes take a script id too. The `/projects/` in the path is historical.

     The load effect above additionally TOLERATES a project id, so a URL built
     honestly from the project list still opens — and that tolerance is what
     made this a silent fault rather than a loud one. Everything after the load
     kept using the route param, so opening the editor that way put every later
     request against a script that does not exist: autosave PUT to
     `/scripts/{projectId}`, took a 404, and the page carried on looking like it
     was working while nothing at all reached the server.

     `script.id` is the authority the moment there is one. Before that there is
     nothing to load but the param. */
  const scriptId = script?.id || id;

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

  /* Which scenes carry the turning points, answered by the writer.

     Optimistic, and deliberately: the badge is a two-state toggle the writer
     will press while reading their board, and a round trip before the label
     changes makes a card feel broken. On failure the row is put back exactly
     as it was rather than left showing a value the server does not hold. */
  const setSceneType = useCallback(async (scene, next) => {
    const previous = scene.scene_type;
    setScript((prev) => prev ? {
      ...prev,
      scenes: (prev.scenes || []).map((s) =>
        s.id === scene.id ? { ...s, scene_type: next } : s),
    } : prev);
    try {
      await scripts.setSceneType(scene.id, next);
    } catch {
      setScript((prev) => prev ? {
        ...prev,
        scenes: (prev.scenes || []).map((s) =>
          s.id === scene.id ? { ...s, scene_type: previous } : s),
      } : prev);
    }
  }, []);

  const handleAddScene = async (scene, actNumber, orderIndex) => {
    const key = `${actNumber}:${scene.title}`;
    setAddingScene(key);
    try {
      const res = await scripts.addScene({
        script_id: scriptId,
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
  /* Park the insertion point at the END of the draft the first time one loads.
     A textarea starts every session with `selectionStart` at 0, so any focus
     that carries no position — a phone keyboard opening, a Tab into the page,
     an assistive tap — put the caret in front of the first slugline. On a
     laptop that is a curiosity. On a phone it is the first thing that happens:
     you open yesterday's script, the keyboard comes up, you type, and the words
     go in before `INT.`

     An effect rather than a callback after the fetch, because the textarea is
     still holding the previous value when that resolves and the range would be
     clamped to it. This runs after the commit that put the draft on the page.

     It does not focus anything. Setting the range on an unfocused textarea only
     decides where the caret WILL be, so opening the keyboard stays the writer's
     move, and a tap still wins — tap placement was measured as exact and is
     untouched. Once only: after the first draft, the caret is the writer's. */
  const caretParked = useRef(false);
  useEffect(() => {
    if (caretParked.current || !content) return;
    caretParked.current = true;
    const ta = textareaRef.current;
    if (ta) ta.setSelectionRange(content.length, content.length);
  }, [content]);

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
      .save(scriptId, next)
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
        script_id: scriptId,
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
      const res = await scripts.save(scriptId, content);
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
      clearRescue(scriptId);
    } catch (err) {
      console.error("Auto-save failed:", err.response?.data?.detail || err.message);
    } finally {
      setSaving(false);
    }
  }, [id, content]);

  // Mirror the draft locally as it is typed. Autosave runs after a short pause and a
  // render can throw at any point inside that window; without this, everything
  // typed since the last round trip dies with the component. `ErrorBoundary`
  // reads this back out and offers it to the writer.
  useEffect(() => {
    if (content) saveRescue(scriptId, content);
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
    }, 1000);
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
  //
  // `typedQuery` is the writer's own words, from the Ask box. It is passed
  // explicitly rather than smuggled in as a fake FOCUSES entry, because a
  // typed question is not a chip: it has no key, no label, and it changes on
  // every submit, so caching or comparing it against `focus` would be wrong.
  const loadPatterns = useCallback(async (focusKey, typedQuery) => {
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
        // Lets the panel remember what it has already said about THIS script,
        // and whether the writer went and fixed it. Without it every request
        // is the first request, which is how the same three cards kept coming
        // back after the writer had acted on them.
        script_id: scriptId,
        scene_text: content || instruction,
        // A typed question wins over the chip. "Read my page" is the one
        // focus that deliberately sends an empty string — it means "diagnose
        // the draft", not "no query" — so the chip fallback keeps that.
        focus: typedQuery !== undefined
          ? typedQuery
          : (f.key === "scene" ? "" : f.query),
        genre,
        tone,
      });
      setPatterns(res.data.patterns);
      setSeen(res.data.seen || {});
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

  /**
   * Where a selection sits in the draft, or null if it cannot be acted on.
   *
   * This is the same rule the server applies in `script_engine.scoped_selection`,
   * and the two have to agree: the server decides what to rewrite, this decides
   * what to replace, and if they disagree the writer gets a line pasted over a
   * scene or a scene pasted over a line.
   *
   * Ambiguity is refused rather than guessed. "I know." is exactly the kind of
   * short line a screenplay repeats, and picking the first occurrence would
   * rewrite one three pages from where the writer is looking.
   */
  const selectionRange = (text, sel) => {
    if (!sel || !sel.trim()) return null;
    const first = text.indexOf(sel);
    if (first === -1 || text.indexOf(sel, first + 1) !== -1) return null;
    return { start: first, end: first + sel.length };
  };

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
          { scene_description: instruction, genre, tone, language, script_id: scriptId },
          setAiResponse,
        );
      } else if (aiMode === "improve") {
        // This one matters more: the writer is watching their OWN words being
        // replaced, and seeing it land line by line is what lets them stop it
        // when it goes somewhere they did not want.
        // A writer asking for a rewrite usually means one line, not the scene
        // around it. Sending the highlighted text lets the server rewrite only
        // that, and `improveScope` remembers what was asked so the answer can
        // land back in the same place.
        improveScope.current = selection;
        await streamSSE(
          "/scripts/improve/stream",
          {
            scene_text: content, instruction, language, script_id: scriptId,
            selection,
          },
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

    // A scoped rewrite replaces the words it was asked about, in place. It is
    // re-located in the CURRENT text rather than trusted from when the request
    // was sent, because the writer can keep working while it streams — and if
    // those words are now gone, or now appear twice, there is no safe place to
    // put the answer and this falls back to inserting at the caret.
    const scope = selectionRange(value, improveScope.current);
    if (aiMode === "improve" && scope) {
      const text = aiResponse.trim();
      if (ta) {
        replaceRange(scope.start, scope.end, text);
        const caret = scope.start + text.length;
        requestAnimationFrame(() => {
          ta.setSelectionRange(caret, caret);
          scrollCaretIntoView(typewriter || zenMode);
        });
      } else {
        setContent(value.slice(0, scope.start) + text + value.slice(scope.end));
      }
      improveScope.current = "";
      setSelection("");
      setAiResponse("");
      setInstruction("");
      return;
    }

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
  /* Stable identities for the two handlers the header calls.
     `handleExport` closes over the project title and `handleFinalize` over
     `saveContent`, which closes over the draft — so both are new functions on
     every keystroke, and a memoised header would never have hit. Neither is
     ever READ, only called from a click, so a ref holding the latest version
     is exact rather than a cache: the click always runs today's closure. */
  const latestHandlers = useRef({});
  const stableExport = useCallback((type) => latestHandlers.current.handleExport(type), []);
  const stableFinalize = useCallback(() => latestHandlers.current.handleFinalize(), []);

  const handleFinalize = async () => {
    setReviewing(true);
    try {
      await saveContent();
      const res = await scripts.review(scriptId);
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
      await scripts.finalize(scriptId);
      setReview(null);
      navigate(`/projects/${scriptId}/storyboard`);
    } catch (err) {
      alert(err.response?.data?.detail || "Could not finalize the script.");
    }
  };

  const EXPORT_EXT = { pdf: "pdf", word: "docx", fdx: "fdx", package: "pdf" };

  const handleExport = async (type) => {
    try {
      const res = await exportApi[type](scriptId);
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

  latestHandlers.current = { handleExport, handleFinalize };

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
      {/* No horizontal scroll below `lg`.
          It used to be `overflow-x-auto`, and that is why this was not visibly
          broken: twelve controls came to 817px in a 375px viewport, so the
          header quietly scrolled sideways for 2.7 screens. Finalize sat 877px
          off-screen, and so did the assist toggle — which is the one control
          that exists ONLY on mobile. Because the header scrolled as a single
          unit, reaching either pushed Back and the project title off the left.

          Below `lg` the occasional controls now live in one overflow menu, so
          there is nothing to scroll to. `gap-2` rather than `gap-4` because
          four controls on a 375px screen need the twelve pixels more than they
          need the air. */}
      {!zenMode && (
      <EditorHeader
        id={scriptId}
        title={script.project?.title || "Untitled"}
        navigate={navigate}
        t={t}
        saving={saving}
        view={view}
        setView={setView}
        caretPage={caretPage}
        pageCount={pageCount}
        nepaliMode={nepaliMode}
        setNepaliMode={setNepaliMode}
        textareaRef={textareaRef}
        showShortcuts={showShortcuts}
        setShowShortcuts={setShowShortcuts}
        suggestions={suggestions}
        showStructure={showStructure}
        setShowStructure={setShowStructure}
        zenMode={zenMode}
        setZenMode={setZenMode}
        isFullPage={isFullPage}
        toggleFullPage={toggleFullPage}
        cursor={cursor}
        setCursor={setCursor}
        typewriter={typewriter}
        setTypewriter={setTypewriter}
        pageTheme={pageTheme}
        setPageTheme={setPageTheme}
        handleExport={stableExport}
        handleFinalize={stableFinalize}
        reviewing={reviewing}
        setShowShare={setShowShare}
        setPanelOpen={setPanelOpen}
        importRef={importRef}
        onImported={handleImported}
      />
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
                onSetSceneType={setSceneType}
                scenes={script.scenes || []}
                activeScene={activeScene}
                onOpen={goToScene}
                onMove={moveScene}
                onAdd={addCustomScene}
                adding={addingScene}
              />
            )}
            {view === "cast" && (
              <CastView
                scriptId={scriptId}
                onOpenLine={(line) => {
                  // Jump the caret to that line of the draft. Reading a voice
                  // and then fixing a line of it should not require finding it
                  // again by eye.
                  const ta = textareaRef.current;
                  if (!ta) return;
                  // +1 per line for the newline `join` leaves out — without
                  // it the offset is the END of the previous line, and the
                  // caret arrives one row above the line you clicked.
                  const at = ta.value.split("\n")
                    .slice(0, line - 1)
                    .reduce((n, l) => n + l.length + 1, 0);
                  ta.focus();
                  ta.setSelectionRange(at, at);
                  scrollCaretIntoView(true);
                }}
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
        <ScriptPage
          content={content}
          setContent={setContent}
          textareaRef={textareaRef}
          handleKeyDown={handleKeyDown}
          trackCaret={trackCaret}
          updateCaretPage={updateCaretPage}
          scrollCaretIntoView={scrollCaretIntoView}
          insertAtPosition={insertAtPosition}
          selection={selection}
          setSelection={setSelection}
          suggest={suggest}
          setSuggest={setSuggest}
          suggestIndex={suggestIndex}
          dismissed={dismissed}
          setDismissed={setDismissed}
          applySuggestion={applySuggestion}
          view={view}
          saving={saving}
          caretPage={caretPage}
          pageCount={pageCount}
          sessionStart={sessionStart}
          script={script}
          user={user}
          zenMode={zenMode}
          setZenMode={setZenMode}
          pageTheme={pageTheme}
          typewriter={typewriter}
          cursor={cursor}
          resting={resting}
          setResting={setResting}
          focus={focus}
          setPanelOpen={setPanelOpen}
          setPanelTab={setPanelTab}
          setScript={setScript}
        />

        {/* Format guide — sits between the page and the assistant so the
            example column lines up beside what you are typing. */}

        {/* AI Assistant. A column on a laptop; a sheet over the page on a
            phone, because 320px of permanent panel beside a 375px screen
            leaves nothing to write on. */}
        {!zenMode && (
          <AssistPanel
            panelOpen={panelOpen}
            setPanelOpen={setPanelOpen}
            panelTab={panelTab}
            setPanelTab={setPanelTab}
            script={script}
            id={scriptId}
            suggestions={suggestions}
            genre={genre}
            tone={tone}
            navigate={navigate}
            t={t}
            content={content}
            setContent={setContent}
            textareaRef={textareaRef}
            caretLine={caretLine}
            selection={selection}
            selectionRange={selectionRange}
            insertAtPosition={insertAtPosition}
            aiMode={aiMode}
            setAiMode={setAiMode}
            aiLocked={aiLocked}
            aiLoading={aiLoading}
            aiResponse={aiResponse}
            setAiResponse={setAiResponse}
            instruction={instruction}
            setInstruction={setInstruction}
            handleAI={handleAI}
            acceptAI={acceptAI}
            patterns={patterns}
            patternsLoading={patternsLoading}
            loadPatterns={loadPatterns}
            patternSource={patternSource}
            diagnosed={diagnosed}
            focus={focus}
            setFocus={setFocus}
            openPattern={openPattern}
            setOpenPattern={setOpenPattern}
            showAllPatterns={showAllPatterns}
            setShowAllPatterns={setShowAllPatterns}
            seen={seen}
            suggest={suggest}
            dismissed={dismissed}
          />
        )}
      </div>
    </div>
  );
}
