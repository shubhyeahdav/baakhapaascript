import React, { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { versions as versionsApi } from "../services/api";
import { userLabel, formatTime } from "../utils/format";

export default function VersionHistory({ scriptId, onRestore }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null); // version shown in the preview modal
  const [restoring, setRestoring] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    versionsApi
      .getAll(scriptId)
      .then((res) => {
        // Newest first (backend already orders desc, sort again to be safe).
        const sorted = [...res.data].sort(
          (a, b) => new Date(b.created_at) - new Date(a.created_at)
        );
        setList(sorted);
        setError("");
      })
      .catch((err) => setError(err.response?.data?.detail || "Could not load versions"))
      .finally(() => setLoading(false));
  }, [scriptId]);

  useEffect(() => { load(); }, [load]);

  const handleRestore = async () => {
    if (!selected) return;
    setRestoring(true);
    try {
      const res = await versionsApi.restore(selected.id);
      if (onRestore) onRestore(res.data?.content ?? selected.content);
      setSelected(null);
      load();
    } catch (err) {
      setError(err.response?.data?.detail || "Restore failed");
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div>
      <div className="text-gold font-medium mb-3">Version History</div>

      {loading ? (
        <div className="text-gray-500 text-sm">Loading versions...</div>
      ) : error ? (
        <div className="text-red-400 text-sm">{error}</div>
      ) : list.length === 0 ? (
        <div className="text-gray-500 text-sm">
          No versions saved yet. Snapshots are captured automatically each time you save.
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((v) => (
            <button
              key={v.id}
              onClick={() => setSelected(v)}
              className="w-full text-left bg-surface border border-border rounded-lg p-3 hover:border-gold transition"
            >
              <div className="flex justify-between items-center mb-1">
                <span className="text-white text-sm">{formatTime(v.created_at)}</span>
                <span className="text-xs text-gold">{v.label || "Snapshot"}</span>
              </div>
              <div className="text-xs text-gray-500">{userLabel(v)}</div>
            </button>
          ))}
        </div>
      )}

      {/* Read-only preview modal (portaled to body so it escapes any transformed ancestor) */}
      {selected && createPortal((
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-surface border border-border rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start px-5 py-4 border-b border-border">
              <div>
                <div className="text-white font-medium">{formatTime(selected.created_at)}</div>
                <div className="text-xs text-gray-500">
                  {(selected.label || "Snapshot")} · {userLabel(selected)}
                </div>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-gray-400 hover:text-white text-2xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <pre className="text-gray-300 text-sm font-mono whitespace-pre-wrap">
                {selected.content || "(empty version)"}
              </pre>
            </div>

            <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
              <button onClick={() => setSelected(null)} className="btn-ghost text-sm">
                Close
              </button>
              <button onClick={handleRestore} disabled={restoring} className="btn-gold text-sm">
                {restoring ? "Restoring..." : "Restore this version"}
              </button>
            </div>
          </div>
        </div>
      ), document.body)}
    </div>
  );
}
