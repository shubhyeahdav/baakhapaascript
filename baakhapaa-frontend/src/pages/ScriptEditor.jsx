import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { scripts, exportApi } from "../services/api";
import { downloadBlob } from "../utils/download";
import VersionHistory from "../components/VersionHistory";
import CommentThreads from "../components/CommentThreads";
import CraftPanel from "../components/CraftPanel";
import FormatGuide from "../components/FormatGuide";
import FormatShortcuts, { harvestVocabulary, suggestFor } from "../components/FormatShortcuts";
import StructureTimeline from "../components/StructureTimeline";
import ShortFormTimeline from "../components/ShortFormTimeline";
import CompactTimeline from "../components/CompactTimeline";

// One-click focuses for pattern recommendations. The pattern library is
// indexed by the PROBLEM a technique solves, so each chip just names that
// problem in the retrieval query — no extra endpoint, no extra cost.
const FOCUSES = [
  { key: "scene", label: "This scene", query: "" },
  { key: "flat", label: "Feels flat", query: "this scene feels flat and skippable, nothing changes in it, the characters just talk and it drags" },
  { key: "dialogue", label: "On the nose", query: "my dialogue is on the nose, characters say exactly what they feel, it sounds like a therapy transcript with no subtext" },
  { key: "character", label: "Thin character", query: "my characters sound the same and feel predictable, thin, described rather than shown" },
  { key: "structure", label: "Structure", query: "the middle sags and the ending feels unearned, the protagonist is passive and things just happen to them" },
  { key: "melodrama", label: "Melodramatic", query: "the emotion is overwrought and melodramatic, it feels sentimental and false rather than restrained" },
];
import { useAuth } from "../context/AuthContext";

export default function ScriptEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [script, setScript] = useState(null);
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [aiMode, setAiMode] = useState("generate");
  const [instruction, setInstruction] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [panelTab, setPanelTab] = useState("ai");
  const [patterns, setPatterns] = useState(null);
  const [patternsLoading, setPatternsLoading] = useState(false);
  // Why the current patterns were chosen: [] plus "similarity" means nothing
  // was flagged and these are semantic matches; a populated list plus
  // "diagnosis" means each one answers a specific flagged line.
  const [diagnosed, setDiagnosed] = useState([]);
  const [patternSource, setPatternSource] = useState("similarity");

  // Format guide. Onboarding's first-timer option promises "show me what a
  // slugline is and check my format as I write", so honour that answer by
  // default — but remember a dismissal, because a guide that returns every
  // session is a guide people learn to close rather than read.
  const guideDismissed = () => {
    try { return localStorage.getItem("baakhapaa.formatGuide.off") === "1"; }
    catch { return false; }
  };
  const [showGuide, setShowGuide] = useState(false);
  const [currentLine, setCurrentLine] = useState("");

  // Type-ahead completion. `suggest` holds what the caret position offers;
  // `suggestIndex` is which one Tab will take.
  const [suggest, setSuggest] = useState(null);
  const [suggestIndex, setSuggestIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [focus, setFocus] = useState("scene");
  const [openPattern, setOpenPattern] = useState(null);

  const { user } = useAuth();
  const isFree = !["pro", "studio"].includes(user?.subscription_tier);

  // Free plan's AI feature is RAG pattern recommendations — make it the
  // default tab so free users land on something that works for them.
  useEffect(() => {
    if (isFree) setAiMode("patterns");
  }, [isFree]);

  // Open the guide for writers who said this is their first screenplay.
  useEffect(() => {
    if (user?.preferences?.experience === "first_time" && !guideDismissed()) {
      setShowGuide(true);
    }
  }, [user]); // eslint-disable-line

  const closeGuide = () => {
    setShowGuide(false);
    try { localStorage.setItem("baakhapaa.formatGuide.off", "1"); } catch { /* private mode */ }
  };

  // Vocabulary for type-ahead — locations and character names already in the
  // draft. Recomputed only when the text changes, not per keystroke of the
  // caret moving.
  const vocab = useMemo(() => harvestVocabulary(content), [content]);

  // Which line the caret sits on — drives both the guide's live indicator and
  // the completion offered.
  const trackCaret = (e) => {
    const { value, selectionStart } = e.target;
    const start = value.lastIndexOf("\n", selectionStart - 1) + 1;
    const end = value.indexOf("\n", selectionStart);
    const line = value.slice(start, end === -1 ? value.length : end);
    setCurrentLine(line);

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
    const target = centre
      ? caretY - ta.clientHeight / 2
      : caretY - lineHeight * 4;
    ta.scrollTop = Math.max(0, target);
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
    scrollCaretIntoView(zenMode);
  };

  const [showStructure, setShowStructure] = useState(false);
  const [addingScene, setAddingScene] = useState(null);

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

  useEffect(() => {
    scripts
      .getById(id)
      .then((res) => {
        setScript(res.data);
        setContent(res.data.content || "");
        // Open the structure preview by default when the script has AI
        // suggestions but no scenes added yet (fresh from the wizard).
        if (res.data.suggestions_json && (res.data.scenes || []).length === 0) {
          setShowStructure(true);
        }
      })
      .catch((err) => setLoadError(err.response?.data?.detail || "Could not load this script."));
  }, [id]);

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

  const insertAtPosition = (pos, text) => {
    if (!replaceRange(pos, pos, text)) {
      setContent((prev) => prev.slice(0, pos) + text + prev.slice(pos));
      return;
    }
    // Leave the caret on the new scene's action line, ready to write.
    const caret = pos + text.indexOf("\n\n") + 2;
    requestAnimationFrame(() => {
      textareaRef.current?.setSelectionRange(caret, caret);
      scrollCaretIntoView(zenMode);
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

  const saveContent = useCallback(async () => {
    setSaving(true);
    try {
      await scripts.save(id, content);
    } catch (err) {
      console.error("Auto-save failed:", err.response?.data?.detail || err.message);
    } finally {
      setSaving(false);
    }
  }, [id, content]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (content) saveContent();
    }, 15000); // Save every 15s instead of 30s for higher reliability
    return () => clearTimeout(timer);
  }, [content, saveContent]);

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
      // "This scene" matches on what you've written. A focus chip instead
      // queries the problem itself — mixing in the scene text drowns the
      // short focus phrase in the embedding and every chip returns the same
      // three patterns, which makes the chips decorative.
      const res = await scripts.recommendations({
        scene_text: f.key === "scene" ? (content || instruction) : f.query,
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
        const res = await scripts.generateScene({
          scene_description: instruction, genre, tone, language,
        });
        setAiResponse(res.data.scene_text);
      } else if (aiMode === "improve") {
        const res = await scripts.improve({ scene_text: content, instruction, language });
        setAiResponse(res.data.improved_text);
      } else {
        const res = await scripts.suggest({ scene_text: content, genre, tone });
        setAiResponse(res.data.suggestions.join("\n\n---\n\n"));
      }
    } catch (err) {
      setAiResponse("Error: " + (err.response?.data?.detail || "AI request failed"));
    } finally {
      setAiLoading(false);
    }
  };

  const acceptAI = () => {
    setContent((prev) => prev + "\n\n" + aiResponse);
    setAiResponse("");
    setInstruction("");
  };

  const handleFinalize = async () => {
    try {
      await saveContent();
      await scripts.finalize(id);
      navigate(`/projects/${id}/storyboard`);
    } catch (err) {
      alert(err.response?.data?.detail || "Could not finalize the script.");
    }
  };

  const handleExport = async (type) => {
    try {
      const res = await exportApi[type](id);
      downloadBlob(res.data, `script.${type === "word" ? "docx" : "pdf"}`);
    } catch (err) {
      alert(err.response?.data?.detail || "Export failed.");
    }
  };

  // Keyboard Navigation & Screenwriting Tab-and-Enter helper rules
  const handleKeyDown = (e) => {
    // Completion keys, only while a suggestion is showing. Tab is the key a
    // screenwriter already reaches for to "make the format right", so it does
    // both jobs: take the completion when there is one, cycle the indent when
    // there isn't. The two never compete — a suggestion requires typed text,
    // and indent-cycling is what you want on a line you haven't typed on yet.
    const open = suggest && !dismissed;
    if (open) {
      if (e.key === "Tab" || (e.key === "Enter" && suggest.options.length === 1)) {
        e.preventDefault();
        applySuggestion(suggestIndex);
        return;
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
      });
    } else if (e.key === "Enter") {
      const { selectionStart, value } = e.target;
      const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
      const currentLine = value.slice(lineStart, selectionStart);
      const leadingSpaces = currentLine.match(/^ */)[0].length;
      const trimmed = currentLine.trim();
      
      let nextLeadingSpaces = 0;
      if (trimmed.startsWith("INT.") || trimmed.startsWith("EXT.")) {
        nextLeadingSpaces = 0; 
      }
      else if (leadingSpaces === 22 || (trimmed === trimmed.toUpperCase() && trimmed.length > 0 && isNaN(trimmed))) {
        nextLeadingSpaces = 10; // Under Character -> indent Dialogue
      }
      else if (leadingSpaces === 15 || (trimmed.startsWith("(") && trimmed.endsWith(")") )) {
        nextLeadingSpaces = 10; // Under Parenthetical -> indent Dialogue
      }
      else if (leadingSpaces === 10) {
        nextLeadingSpaces = 0;  // Under Dialogue -> go back to Action
      } else {
        nextLeadingSpaces = leadingSpaces; // Keep same indent
      }
      
      e.preventDefault();
      const insertText = "\n" + " ".repeat(nextLeadingSpaces);
      replaceRange(selectionStart, selectionStart, insertText);

      requestAnimationFrame(() => {
        const newCursorPos = selectionStart + insertText.length;
        e.target.setSelectionRange(newCursorPos, newCursorPos);
        if (zenMode) scrollCaretIntoView(true);
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
      <header className="h-14 bg-surface border-b border-border flex items-center justify-between px-6 shrink-0 relative z-20">
        <button onClick={() => navigate("/dashboard")} className="flex items-center gap-1.5 text-inkMuted hover:text-ink transition duration-200 text-sm">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Back
        </button>
        <div className="font-display font-medium text-ink text-[15px] flex items-center gap-2">
          <span className="opacity-45 text-sm font-sans">Workspace /</span> {script.project?.title || "Untitled"}
        </div>
        <div className="flex gap-3 items-center">
          <span className="text-[11px] font-semibold text-inkMuted uppercase tracking-wider mr-2">{saving ? "Saving..." : "Synced"}</span>
          <button
            onClick={() => {
              setShowGuide((v) => !v);
              // Reopening is a decision too — respect it next session.
              try { localStorage.setItem("baakhapaa.formatGuide.off", showGuide ? "1" : "0"); }
              catch { /* private mode */ }
            }}
            title="Screenplay format guide"
            className={`p-2 rounded-lg border transition duration-200 ${
              showGuide ? "bg-goldDim border-gold text-gold" : "bg-bg border-border text-inkMuted hover:text-ink"
            }`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
            </svg>
          </button>
          <button
            onClick={() => setZenMode(!zenMode)}
            className={`p-2 rounded-lg border transition duration-200 ${zenMode ? "bg-goldDim border-gold text-gold" : "bg-bg border-border text-inkMuted hover:text-ink"}`}
            title="Zen Focus Mode"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <button 
            onClick={() => setPageTheme(pageTheme === "light" ? "dark" : "light")} 
            className={`p-2 rounded-lg border transition duration-200 ${pageTheme === "dark" ? "bg-goldDim border-gold text-gold" : "bg-bg border-border text-inkMuted hover:text-ink"}`}
            title="Toggle Page Theme"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          </button>
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
          <button onClick={() => handleExport("pdf")} className="btn-ghost text-xs py-1.5 px-3">
            Export PDF
          </button>
          <button onClick={handleFinalize} className="btn-gold text-xs py-1.5 px-3.5">Finalize & Storyboard</button>
        </div>
      </header>

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
            scenes={script.scenes || []}
            suggestions={suggestions}
            activeScene={activeScene}
            onSceneClick={goToScene}
            onExpand={() => setShowStructure(true)}
          />
        )
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Scene list */}
        {!zenMode && (
          <aside className="w-64 bg-surface border-r border-border overflow-y-auto p-4 shrink-0 animate-fade-up">
            <div className="text-[10px] font-bold text-inkMuted uppercase tracking-wider mb-4">Scene Index Cards</div>
            {script.scenes?.map((scene, i) => (
              <button
                key={scene.id}
                onClick={() => goToScene(i)}
                title="Jump to this scene"
                className={`w-full text-left p-3 mb-2 rounded-xl border transition duration-200 ${
                  activeScene === i
                    ? "border-gold/50 bg-goldDim"
                    : "border-borderSoft bg-surface/50 hover:border-gold/30 hover:bg-elevated/40"
                }`}
              >
                <div className="text-[10px] font-mono text-gold mb-1 uppercase tracking-wider">Scene {i + 1}</div>
                <div className="text-ink font-semibold text-sm truncate mb-2">{scene.title}</div>
                <div className="flex justify-between items-center text-[10px] uppercase font-bold tracking-wider">
                  <span className={scene.scene_type === "major" ? "text-skyAccent bg-skyDim px-2 py-0.5 rounded" : "text-inkMuted bg-borderSoft px-2 py-0.5 rounded"}>
                    {scene.scene_type}
                  </span>
                  <span className="text-inkMuted">{scene.time_allocation}m</span>
                </div>
              </button>
            ))}
          </aside>
        )}

        {/* Editor */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className={`flex-1 screenplay-container min-h-0 ${zenMode ? "zen-container" : ""}`}>
            {zenMode && <div className="zen-hint">Esc to leave focus mode</div>}
            <textarea
              ref={textareaRef}
              className={`screenplay-page ${pageTheme === "dark" ? "dark-page" : ""} ${zenMode ? "zen-page" : ""} resize-none`}
              placeholder="Type Scene Headings starting with INT. or EXT., and press TAB to format characters, parentheticals, and dialogue..."
              value={content}
              onChange={(e) => { setContent(e.target.value); setDismissed(false); trackCaret(e); }}
              onKeyDown={handleKeyDown}
              onClick={trackCaret}
              onKeyUp={trackCaret}
              onBlur={() => setSuggest(null)}
            />
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
        {showGuide && !zenMode && (
          <FormatGuide currentLine={currentLine} onClose={closeGuide} />
        )}

        {/* AI Assistant */}
        {!zenMode && (
          <aside className="w-80 bg-surface border-l border-border p-5 overflow-y-auto shrink-0 animate-fade-up flex flex-col">
            <div className="flex gap-2 mb-4">
              {[
                { key: "ai", label: "AI Writer" },
                { key: "craft", label: "Craft" },
                { key: "versions", label: "Versions" },
                { key: "comments", label: "Notes" },
              ].map((t) => (
                <button
                  key={t.key}
                  onClick={() => setPanelTab(t.key)}
                  className={`text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-lg flex-1 transition duration-200 border ${
                    panelTab === t.key ? "bg-goldDim text-gold border-gold/30" : "text-inkMuted hover:text-ink border-transparent"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Remounts on open so it re-reads the current draft rather than
                showing a check from three edits ago. */}
            {panelTab === "craft" && (
              <CraftPanel content={content} genre={genre} tone={tone} />
            )}

            {panelTab === "versions" && (
              <VersionHistory scriptId={id} onRestore={(restored) => setContent(restored)} />
            )}

            {panelTab === "comments" && <CommentThreads scriptId={id} />}

            {panelTab === "ai" && (
            <>
            <div className="flex border-b border-borderSoft mb-4">
              {["patterns", "generate", "improve", "suggest"].map((mode) => (
                <button
                  key={mode}
                  onClick={() => setAiMode(mode)}
                  title={isFree && mode !== "patterns" ? "Pro / Studio feature" : undefined}
                  className={`text-xs pb-2.5 font-semibold capitalize flex-1 border-b-2 transition duration-200 ${
                    aiMode === mode
                      ? "border-gold text-gold"
                      : "border-transparent text-inkMuted hover:text-ink"
                  }`}
                >
                  {mode}{isFree && mode !== "patterns" ? " ✦" : ""}
                </button>
              ))}
            </div>

            {aiMode === "patterns" ? (
              <>
                {/* One tap = the kind of help you need. Loads on open; each
                    chip re-queries for that problem type. */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {FOCUSES.map((f) => (
                    <button
                      key={f.key}
                      onClick={() => { setFocus(f.key); setOpenPattern(null); loadPatterns(f.key); }}
                      className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                        focus === f.key
                          ? "bg-goldDim border-gold/40 text-gold"
                          : "border-border text-inkMuted hover:text-ink"
                      }`}
                    >
                      {f.label}
                    </button>
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
                            {p.craft_level || "craft"} · {p.origin_tradition}
                          </span>
                          <span className="font-mono text-[10px] text-inkMuted shrink-0">
                            {hit ? `line ${hit.line}` : `${Math.round((p.similarity || 0) * 100)}%`}
                          </span>
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
        )}
      </div>
    </div>
  );
}
