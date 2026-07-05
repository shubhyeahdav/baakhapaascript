import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { storyboard } from "../services/api";

export default function StoryboardView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [frames, setFrames] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    storyboard
      .getAll(id)
      .then((res) => setFrames(res.data))
      .catch(() => setFrames([]));
  }, [id]);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const res = await storyboard.generate(id);
      setFrames(res.data.frames);
    } catch (err) {
      alert(err.response?.data?.detail || "Storyboard generation failed. Check your OpenAI API key.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg cine-bg text-ink flex flex-col">
      {/* Header */}
      <header className="h-14 bg-surface border-b border-border flex items-center justify-between px-6 shrink-0 relative z-20">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-inkMuted hover:text-ink transition duration-200 text-sm">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Back to Script
        </button>
        <span className="font-display font-medium text-ink text-base">Storyboard Workspace</span>
        <button onClick={handleGenerate} disabled={loading} className="btn-gold text-xs py-1.5 px-3.5 flex items-center gap-1.5">
          {loading ? (
            <>
              <svg className="animate-spin h-3 w-3 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
              Generating...
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              Generate Storyboard
            </>
          )}
        </button>
      </header>

      {/* Main Grid */}
      <main className="flex-1 p-8 overflow-y-auto max-w-7xl mx-auto w-full animate-fade-up">
        {frames.length === 0 ? (
          <div className="text-center py-24 border border-dashed border-border rounded-2xl bg-surface/30 max-w-xl mx-auto mt-12">
            <div className="w-16 h-16 rounded-2xl bg-goldDim flex items-center justify-center mx-auto mb-6">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M21 15l-5-5L5 21M9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/></svg>
            </div>
            <p className="text-ink text-lg font-display mb-2">No storyboard frames yet</p>
            <p className="text-inkMuted text-sm max-w-md mx-auto mb-8 px-6">Click "Generate Storyboard" above to parse your script scenes and generate cinematic DALL-E frames.</p>
            <button onClick={handleGenerate} disabled={loading} className="btn-gold">
              Generate Storyboard
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {frames.map((frame, i) => (
              <div key={frame.id} className="group bg-surface border border-borderSoft rounded-2xl overflow-hidden shadow-card hover:border-gold/30 transition duration-300 flex flex-col h-full">
                {/* Visual Image container */}
                <div className="aspect-[16/9] bg-bgDeep flex items-center justify-center relative overflow-hidden shrink-0 border-b border-borderSoft">
                  {frame.image_url ? (
                    <img src={frame.image_url} alt={`Scene ${i + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-inkMuted">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                      <span className="text-[11px]">No Frame Image</span>
                    </div>
                  )}
                </div>

                {/* Description details */}
                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-inkMuted">Frame {i + 1}</span>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-gold bg-goldDim/40 px-2 py-0.5 rounded border border-gold/10">
                      {frame.shot_type}
                    </span>
                  </div>
                  {frame.camera_notes && (
                    <p className="text-xs text-inkMuted italic bg-bgDeep/40 p-2.5 rounded-lg border border-borderSoft font-mono mb-2">
                      {frame.camera_notes}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
