import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { scripts, exportApi } from "../services/api";
import VersionHistory from "../components/VersionHistory";
import CommentThreads from "../components/CommentThreads";
import CollabBar from "../components/CollabBar";

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

  // Custom Screenwriting Usability State
  const [zenMode, setZenMode] = useState(false);
  const [pageTheme, setPageTheme] = useState("light");
  const textareaRef = useRef(null);

  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    scripts
      .getById(id)
      .then((res) => {
        setScript(res.data);
        setContent(res.data.content || "");
      })
      .catch((err) => setLoadError(err.response?.data?.detail || "Could not load this script."));
  }, [id]);

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

  const handleAI = async () => {
    setAiLoading(true);
    try {
      if (aiMode === "generate") {
        const res = await scripts.generateScene({
          scene_description: instruction, genre: "Drama", tone: "Emotional", language: "English",
        });
        setAiResponse(res.data.scene_text);
      } else if (aiMode === "improve") {
        const res = await scripts.improve({ scene_text: content, instruction, language: "English" });
        setAiResponse(res.data.improved_text);
      } else {
        const res = await scripts.suggest({ scene_text: content, genre: "Drama", tone: "Emotional" });
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
          <span className="opacity-45 text-sm font-sans">Workspace /</span> {script.title}
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
          <button onClick={() => handleExport("pdf")} className="btn-ghost text-xs py-1.5 px-3">
            Export PDF
          </button>
          <button onClick={handleFinalize} className="btn-gold text-xs py-1.5 px-3.5">Finalize & Storyboard</button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Scene list */}
        {!zenMode && (
          <aside className="w-64 bg-surface border-r border-border overflow-y-auto p-4 shrink-0 animate-fade-up">
            <div className="text-[10px] font-bold text-inkMuted uppercase tracking-wider mb-4">Scene Index Cards</div>
            {script.scenes?.map((scene, i) => (
              <div key={scene.id} className="p-3 mb-2 rounded-xl bg-surface/50 border border-borderSoft hover:border-gold/30 hover:bg-elevated/40 transition duration-300">
                <div className="text-[10px] font-mono text-gold mb-1 uppercase tracking-wider">Scene {i + 1}</div>
                <div className="text-ink font-semibold text-sm truncate mb-2">{scene.title}</div>
                <div className="flex justify-between items-center text-[10px] uppercase font-bold tracking-wider">
                  <span className={scene.scene_type === "major" ? "text-skyAccent bg-skyDim px-2 py-0.5 rounded" : "text-inkMuted bg-borderSoft px-2 py-0.5 rounded"}>
                    {scene.scene_type}
                  </span>
                  <span className="text-inkMuted">{scene.time_allocation}m</span>
                </div>
              </div>
            ))}
          </aside>
        )}

        {/* Editor */}
        <div className="flex-1 screenplay-container">
          <textarea
            ref={textareaRef}
            className={`screenplay-page ${pageTheme === "dark" ? "dark-page" : ""} resize-none`}
            placeholder="Type Scene Headings starting with INT. or EXT., and press TAB to format characters, parentheticals, and dialogue..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
          />
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
              {["generate", "improve", "suggest"].map((mode) => (
                <button 
                  key={mode} 
                  onClick={() => setAiMode(mode)}
                  className={`text-xs pb-2.5 font-semibold capitalize flex-1 border-b-2 transition duration-200 ${
                    aiMode === mode 
                      ? "border-gold text-gold" 
                      : "border-transparent text-inkMuted hover:text-ink"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
            
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
