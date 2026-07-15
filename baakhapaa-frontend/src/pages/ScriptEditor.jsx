import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { scripts, exportApi } from "../services/api";
import VersionHistory from "../components/VersionHistory";
import CommentThreads from "../components/CommentThreads";
import CollabBar from "../components/CollabBar";
import StructureTimeline from "../components/StructureTimeline";
import CompactTimeline from "../components/CompactTimeline";

// One-click focuses for pattern recommendations. The pattern library is
// indexed by the PROBLEM a technique solves, so each chip just names that
// problem in the retrieval query — no extra endpoint, no extra cost.
const FOCUSES = [
  { key: "scene", label: "This scene", query: "" },
  { key: "hook", label: "Hook", query: "opening hook, grabbing attention, inciting incident that starts the story" },
  { key: "middle", label: "Middle", query: "sagging middle, rising tension, complications compounding toward a crisis" },
  { key: "ending", label: "Ending", query: "resolution, earned ending, paying off the dramatic question" },
  { key: "character", label: "Character", query: "antagonist pressure, character motivation, subtext in dialogue" },
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
  const [focus, setFocus] = useState("scene");
  const [openPattern, setOpenPattern] = useState(null);

  const { user } = useAuth();
  const isFree = !["pro", "studio"].includes(user?.subscription_tier);

  // Free plan's AI feature is RAG pattern recommendations — make it the
  // default tab so free users land on something that works for them.
  useEffect(() => {
    if (isFree) setAiMode("patterns");
  }, [isFree]);

  // Custom Screenwriting Usability State
  const [zenMode, setZenMode] = useState(false);
  const [pageTheme, setPageTheme] = useState("light");
  const [activeScene, setActiveScene] = useState(0);
  const textareaRef = useRef(null);

  const [loadError, setLoadError] = useState("");

  // Jump the editor to a scene: find the Nth slugline (INT./EXT.) in the script
  // and scroll the caret there. Scenes are written in order, so the Nth slug ≈
  // scene N; if it hasn't been written yet, jump to the end so the writer can add it.
  const goToScene = (index) => {
    setActiveScene(index);
    const ta = textareaRef.current;
    if (!ta) return;
    const text = ta.value;
    const re = /^[ \t]*(INT\.|EXT\.|INT\/EXT\.)/gim;
    const starts = [];
    let m;
    while ((m = re.exec(text)) !== null) starts.push(m.index);
    const pos = starts.length > index ? starts[index] : text.length;
    ta.focus();
    ta.setSelectionRange(pos, pos);
    const line = text.slice(0, pos).split("\n").length - 1;
    ta.scrollTop = Math.max(0, line * 25 - 90); // ~25px line height
  };

  const [showStructure, setShowStructure] = useState(false);
  const [addingScene, setAddingScene] = useState(null);

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
      // Insert into the local scene list keeping act/order sorting.
      setScript((prev) => ({
        ...prev,
        scenes: [...(prev.scenes || []), res.data].sort(
          (a, b) => a.act_number - b.act_number || a.order_index - b.order_index
        ),
      }));
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
    } catch (err) {
      setPatterns([]);
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
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `script.${type === "word" ? "docx" : "pdf"}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      alert(err.response?.data?.detail || "Export failed.");
    }
  };

  // Keyboard Navigation & Screenwriting Tab-and-Enter helper rules
  const handleKeyDown = (e) => {
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
      const newValue = value.slice(0, lineStart) + newCurrentLine + value.slice(lineEnd === -1 ? value.length : lineEnd);
      
      setContent(newValue);
      
      setTimeout(() => {
        const newCursorPos = lineStart + newLeadingSpaces + lineContent.length;
        e.target.setSelectionRange(newCursorPos, newCursorPos);
      }, 0);
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
      const newValue = value.slice(0, selectionStart) + insertText + value.slice(selectionStart);
      setContent(newValue);
      
      setTimeout(() => {
        const newCursorPos = selectionStart + insertText.length;
        e.target.setSelectionRange(newCursorPos, newCursorPos);
      }, 0);
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
          <CollabBar scriptId={id} />
          <div className="h-4 w-px bg-borderSoft" />
          <span className="text-[11px] font-semibold text-inkMuted uppercase tracking-wider mr-2">{saving ? "Saving..." : "Synced"}</span>
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
      {showStructure && suggestions ? (
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
          <div className="flex-1 screenplay-container min-h-0">
            <textarea
              ref={textareaRef}
              className={`screenplay-page ${pageTheme === "dark" ? "dark-page" : ""} resize-none`}
              placeholder="Type Scene Headings starting with INT. or EXT., and press TAB to format characters, parentheticals, and dialogue..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
        </div>

        {/* AI Assistant */}
        {!zenMode && (
          <aside className="w-80 bg-surface border-l border-border p-5 overflow-y-auto shrink-0 animate-fade-up flex flex-col">
            <div className="flex gap-2 mb-4">
              {[
                { key: "ai", label: "AI Writer" },
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
                            {p.origin_tradition} · {p.genre}
                          </span>
                          <span className="font-mono text-[10px] text-inkMuted shrink-0">
                            {Math.round(p.similarity * 100)}%
                          </span>
                        </div>
                        {/* The takeaway is the actionable line — keep it whole.
                            The mechanics only unfold when asked for. */}
                        <p className="text-[13px] text-ink leading-snug">{p.one_line_takeaway}</p>
                        {open ? (
                          <p className="text-[12px] text-inkSoft leading-relaxed mt-2 pt-2 border-t border-borderSoft">
                            {p.structural_pattern}
                          </p>
                        ) : (
                          <span className="text-[10px] text-inkMuted mt-1.5 inline-block">How it's built ↓</span>
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
