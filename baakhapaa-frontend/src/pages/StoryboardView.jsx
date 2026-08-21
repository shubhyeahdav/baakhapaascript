import React, { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { storyboard } from "../services/api";

/**
 * The storyboard workspace.
 *
 * Proposal FR09 asks for four controls: regenerate a frame, override its shot
 * type, add camera movement notes, and reorder frames. The backend routes for
 * all four shipped with the first storyboard commit and nothing ever called
 * them — the board was a read-only grid of "Frame 1 · Wide Shot", with no way
 * to tell which scene a frame belonged to, which is also why reordering was
 * meaningless. Frames now arrive carrying their scene.
 */

const FALLBACK_SHOT_TYPES = [
  "Wide Shot", "Medium Wide Shot", "Medium Shot",
  "Medium Close Up", "Close Up", "Extreme Close Up",
  "Over The Shoulder", "Point Of View", "Insert",
];

export default function StoryboardView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [frames, setFrames] = useState([]);
  const [shotTypes, setShotTypes] = useState(FALLBACK_SHOT_TYPES);
  const [loading, setLoading] = useState(false);
  const [busyFrame, setBusyFrame] = useState(null);
  const [error, setError] = useState("");
  // Notes are edited locally and committed on blur: saving each keystroke would
  // be a request per character, and saving only on an explicit button is how
  // notes get lost when someone clicks away.
  const [noteDrafts, setNoteDrafts] = useState({});

  const load = useCallback(async () => {
    try {
      const res = await storyboard.getAll(id);
      setFrames(res.data);
    } catch {
      setFrames([]);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    storyboard.shotTypes()
      .then((res) => setShotTypes(res.data.shot_types || FALLBACK_SHOT_TYPES))
      .catch(() => setShotTypes(FALLBACK_SHOT_TYPES));
  }, []);

  const handleGenerate = async () => {
    setLoading(true);
    setError("");
    try {
      await storyboard.generate(id);
      await load(); // refetch, so frames arrive with their scene attached
    } catch (err) {
      setError(err.response?.data?.detail || "Storyboard generation failed.");
    } finally {
      setLoading(false);
    }
  };

  /** Patch one frame and fold the server's row back into local state. */
  const patchFrame = async (frame, patch) => {
    setBusyFrame(frame.id);
    setError("");
    try {
      const res = await storyboard.update(frame.id, patch);
      setFrames((prev) =>
        prev.map((f) => (f.id === frame.id ? { ...f, ...res.data } : f))
          .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
      );
    } catch (err) {
      setError(err.response?.data?.detail || "Could not save that change.");
    } finally {
      setBusyFrame(null);
    }
  };

  const handleRegenerate = async (frame) => {
    setBusyFrame(frame.id);
    setError("");
    try {
      const res = await storyboard.regenerate(frame.id, { shotType: frame.shot_type });
      setFrames((prev) => prev.map((f) => (f.id === frame.id ? { ...f, ...res.data } : f)));
    } catch (err) {
      setError(err.response?.data?.detail || "Could not regenerate this frame.");
    } finally {
      setBusyFrame(null);
    }
  };

  /**
   * Swap a frame with its neighbour.
   *
   * Order lives in `order_index` on each row, so a move is two writes. They run
   * in sequence rather than in parallel: if the second fails, one frame has
   * moved and the refetch below puts the board back in a state that matches the
   * server rather than a half-applied swap.
   */
  const move = async (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= frames.length) return;
    const a = frames[index];
    const b = frames[target];

    setBusyFrame(a.id);
    setError("");
    try {
      await storyboard.update(a.id, { order_index: b.order_index ?? target });
      await storyboard.update(b.id, { order_index: a.order_index ?? index });
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || "Could not reorder the frames.");
      await load();
    } finally {
      setBusyFrame(null);
    }
  };

  const sceneLabel = (frame) => {
    const s = frame.scene || {};
    return s.slugline || s.title || s.location || "Unassigned scene";
  };

  return (
    <div className="min-h-screen bg-bg cine-bg text-ink flex flex-col">
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
              {frames.length ? "Regenerate Board" : "Generate Storyboard"}
            </>
          )}
        </button>
      </header>

      {error && (
        <div className="bg-red-400/10 border-b border-red-400/25 px-6 py-2.5 flex items-start gap-3 shrink-0">
          <p className="text-[12px] text-red-300 leading-snug flex-1">{error}</p>
          <button onClick={() => setError("")} className="text-[11px] text-red-300/70 hover:text-red-200 shrink-0">
            Dismiss
          </button>
        </div>
      )}

      <main className="flex-1 p-8 overflow-y-auto max-w-7xl mx-auto w-full animate-fade-up">
        {frames.length === 0 ? (
          <div className="text-center py-24 border border-dashed border-border rounded-2xl bg-surface/30 max-w-xl mx-auto mt-12">
            <div className="w-16 h-16 rounded-2xl bg-goldDim flex items-center justify-center mx-auto mb-6">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M21 15l-5-5L5 21M9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/></svg>
            </div>
            <p className="text-ink text-lg font-display mb-2">No storyboard frames yet</p>
            <p className="text-inkMuted text-sm max-w-md mx-auto mb-8 px-6">
              Frames are drawn from your scenes — write a scene heading (INT./EXT.)
              or add one from the structure panel, then generate.
            </p>
            <button onClick={handleGenerate} disabled={loading} className="btn-gold">
              Generate Storyboard
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {frames.map((frame, i) => {
              const busy = busyFrame === frame.id;
              const note = noteDrafts[frame.id] ?? frame.camera_notes ?? "";
              return (
                <div
                  key={frame.id}
                  className={`group bg-surface border border-borderSoft rounded-2xl overflow-hidden shadow-card
                              hover:border-gold/30 transition duration-300 flex flex-col h-full ${busy ? "opacity-60" : ""}`}
                >
                  <div className="aspect-[16/9] bg-bgDeep flex items-center justify-center relative overflow-hidden shrink-0 border-b border-borderSoft">
                    {frame.image_url ? (
                      <img src={frame.image_url} alt={`Frame ${i + 1}`} className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-inkMuted">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                        <span className="text-[11px]">No Frame Image</span>
                      </div>
                    )}
                  </div>

                  <div className="p-4 flex-1 flex flex-col gap-3">
                    <div className="flex justify-between items-baseline gap-2">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-inkMuted shrink-0">
                        Frame {i + 1}
                      </span>
                      {frame.scene?.act_number && (
                        <span className="text-[10px] font-mono text-inkMuted">Act {frame.scene.act_number}</span>
                      )}
                    </div>

                    {/* Which scene this is. Without it the board cannot be
                        matched back to the script, on set or anywhere else. */}
                    <p className="text-[12px] font-mono text-gold leading-snug truncate" title={sceneLabel(frame)}>
                      {sceneLabel(frame)}
                    </p>
                    {frame.scene?.characters?.length > 0 && (
                      <p className="text-[11px] text-inkMuted -mt-2 truncate">
                        {frame.scene.characters.join(", ")}
                      </p>
                    )}

                    <label className="block">
                      <span className="text-[9.5px] font-mono uppercase tracking-wider text-inkMuted">Shot type</span>
                      <select
                        aria-label={`Shot type for frame ${i + 1}`}
                        value={frame.shot_type || ""}
                        disabled={busy}
                        onChange={(e) => patchFrame(frame, { shot_type: e.target.value })}
                        className="mt-1 w-full bg-bg border border-border rounded-lg px-2 py-1.5 text-[12px] text-inkSoft"
                      >
                        {[...new Set([...(frame.shot_type ? [frame.shot_type] : []), ...shotTypes])].map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <span className="text-[9.5px] font-mono uppercase tracking-wider text-inkMuted">Camera notes</span>
                      <textarea
                        aria-label={`Camera notes for frame ${i + 1}`}
                        value={note}
                        disabled={busy}
                        placeholder="Movement, lens, blocking…"
                        onChange={(e) => setNoteDrafts((d) => ({ ...d, [frame.id]: e.target.value }))}
                        onBlur={() => {
                          const next = (noteDrafts[frame.id] ?? "").trim();
                          if (noteDrafts[frame.id] === undefined) return;
                          if (next === (frame.camera_notes || "").trim()) return;
                          patchFrame(frame, { camera_notes: next });
                        }}
                        className="mt-1 w-full bg-bgDeep/40 border border-borderSoft rounded-lg px-2 py-1.5
                                   text-[11.5px] text-inkSoft font-mono leading-relaxed h-16 resize-none"
                      />
                    </label>

                    <div className="flex items-center gap-1.5 pt-1 mt-auto">
                      <button
                        onClick={() => move(i, -1)}
                        disabled={busy || i === 0}
                        title="Move earlier"
                        aria-label={`Move frame ${i + 1} earlier`}
                        className="px-2 py-1 rounded-lg border border-border text-inkMuted hover:text-ink disabled:opacity-30 text-[11px]"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => move(i, 1)}
                        disabled={busy || i === frames.length - 1}
                        title="Move later"
                        aria-label={`Move frame ${i + 1} later`}
                        className="px-2 py-1 rounded-lg border border-border text-inkMuted hover:text-ink disabled:opacity-30 text-[11px]"
                      >
                        ↓
                      </button>
                      <button
                        onClick={() => handleRegenerate(frame)}
                        disabled={busy}
                        className="ml-auto text-[11px] px-3 py-1 rounded-full border border-border text-inkSoft
                                   hover:text-gold hover:border-gold/40 transition-colors disabled:opacity-40"
                      >
                        {busy ? "Working…" : "↻ Redraw"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
