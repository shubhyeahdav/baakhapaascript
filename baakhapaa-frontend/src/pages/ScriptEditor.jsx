import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { scripts, exportApi } from "../services/api";

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

  useEffect(() => {
    scripts.getById(id).then((res) => {
      setScript(res.data);
      setContent(res.data.content || "");
    });
  }, [id]);

  const saveContent = useCallback(async () => {
    setSaving(true);
    try {
      await scripts.save(id, content);
    } finally {
      setSaving(false);
    }
  }, [id, content]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (content) saveContent();
    }, 30000);
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
    await saveContent();
    await scripts.finalize(id);
    navigate(`/projects/${id}/storyboard`);
  };

  const handleExport = async (type) => {
    const res = await exportApi[type](id);
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `script.${type === "word" ? "docx" : "pdf"}`);
    document.body.appendChild(link);
    link.click();
  };

  if (!script) return <div className="h-screen bg-bg flex items-center justify-center text-gold">Loading...</div>;

  return (
    <div className="h-screen bg-bg flex flex-col">
      {/* Toolbar */}
      <div className="h-14 bg-surface border-b border-border flex items-center justify-between px-4">
        <button onClick={() => navigate("/dashboard")} className="text-gray-400 hover:text-white">&larr; Back</button>
        <span className="text-white font-medium">Script Editor</span>
        <div className="flex gap-2 items-center">
          <span className="text-xs text-gray-500">{saving ? "Saving..." : "Saved"}</span>
          <button onClick={() => handleExport("pdf")} className="text-xs text-gray-400 hover:text-gold border border-border px-3 py-1.5 rounded-lg">
            Export PDF
          </button>
          <button onClick={handleFinalize} className="btn-gold text-sm">Finalize & Storyboard</button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Scene list */}
        <div className="w-56 bg-elevated border-r border-border overflow-y-auto p-3">
          <div className="text-xs text-gray-500 mb-2">SCENES</div>
          {script.scenes?.map((scene, i) => (
            <div key={scene.id} className="p-2 mb-1 rounded-lg bg-surface border border-border text-sm">
              <div className="text-white">{i + 1}. {scene.title}</div>
              <div className="flex justify-between mt-1">
                <span className={`text-xs ${scene.scene_type === "major" ? "text-gold" : "text-gray-500"}`}>
                  {scene.scene_type.toUpperCase()}
                </span>
                <span className="text-xs text-gray-500">{scene.time_allocation}m</span>
              </div>
            </div>
          ))}
        </div>

        {/* Editor */}
        <div className="flex-1 p-6 overflow-y-auto">
          <textarea
            className="w-full h-full bg-transparent text-white font-mono text-sm resize-none focus:outline-none"
            placeholder="Start writing your screenplay, or use the AI Assistant to generate scenes..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </div>

        {/* AI Assistant */}
        <div className="w-80 bg-elevated border-l border-border p-4 overflow-y-auto">
          <div className="text-gold font-medium mb-3">AI Assistant</div>
          <div className="flex gap-1 mb-3">
            {["generate", "improve", "suggest"].map((mode) => (
              <button key={mode} onClick={() => setAiMode(mode)}
                className={`text-xs px-3 py-1.5 rounded-lg flex-1 ${aiMode === mode ? "bg-gold text-bg" : "bg-surface text-gray-400"}`}>
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
          <textarea
            className="input-dark h-24 mb-3 text-sm"
            placeholder={
              aiMode === "generate" ? "Describe what should happen in this scene..." :
              aiMode === "improve" ? "What should be changed or improved..." :
              "Press generate to get 3 continuations"
            }
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
          />
          <button onClick={handleAI} disabled={aiLoading} className="btn-gold w-full text-sm mb-3">
            {aiLoading ? "Generating..." : "Generate"}
          </button>
          {aiResponse && (
            <div className="bg-surface border border-border rounded-lg p-3">
              <div className="text-xs text-gray-300 whitespace-pre-wrap mb-3">{aiResponse}</div>
              <div className="flex gap-2">
                <button onClick={acceptAI} className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg flex-1">Accept</button>
                <button onClick={() => setAiResponse("")} className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg flex-1">Reject</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
