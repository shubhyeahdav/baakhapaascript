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
  // FR11: compare any two versions. `compareWith` is the second one picked;
  // `diff` is what the server made of the pair.
  const [compareWith, setCompareWith] = useState(null);
  const [diff, setDiff] = useState(null);
  const [diffing, setDiffing] = useState(false);

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

  /** Compare the open version against another, oldest side first. */
  const compare = async (other) => {
    if (!selected) return;
    setCompareWith(other);
    setDiffing(true);
    setDiff(null);
    try {
      const [older, newer] =
        new Date(other.created_at) < new Date(selected.created_at)
          ? [other, selected]
          : [selected, other];
      const res = await versionsApi.diff(older.id, newer.id);
      setDiff({ ...res.data, olderId: older.id, newerId: newer.id });
    } catch (err) {
      setError(err.response?.data?.detail || "Could not compare those versions");
      setCompareWith(null);
    } finally {
      setDiffing(false);
    }
  };

  const closeModal = () => {
    setSelected(null);
    setCompareWith(null);
    setDiff(null);
  };

  const handleRestore = async () => {
    if (!selected) return;
    setRestoring(true);
    try {
      const res = await versionsApi.restore(selected.id);
      if (onRestore) onRestore(res.data?.content ?? selected.content);
      closeModal();
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
          onClick={closeModal}
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
                onClick={closeModal}
                aria-label="Close"
                className="text-gray-400 hover:text-white text-2xl leading-none"
              >
                ×
              </button>
            </div>

            {/* Pick a second version to diff against. Only other snapshots of
                this script appear, and the pair is ordered by time for you —
                asking a writer which one is "a" is asking the wrong question. */}
            {list.length > 1 && (
              <div className="px-5 py-3 border-b border-border flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-500 shrink-0">Compare with</span>
                <select
                  aria-label="Compare with version"
                  value={compareWith?.id || ""}
                  onChange={(e) => {
                    const other = list.find((v) => v.id === e.target.value);
                    if (other) compare(other);
                    else { setCompareWith(null); setDiff(null); }
                  }}
                  className="bg-bg border border-border rounded-lg px-2 py-1 text-xs text-inkSoft flex-1 min-w-[160px]"
                >
                  <option value="">— none —</option>
                  {list.filter((v) => v.id !== selected.id).map((v) => (
                    <option key={v.id} value={v.id}>
                      {formatTime(v.created_at)} · {v.label || "Snapshot"}
                    </option>
                  ))}
                </select>
                {diff && <span className="text-xs text-gray-500">{diff.summary}</span>}
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-5">
              {diffing ? (
                <div className="text-gray-500 text-sm">Comparing…</div>
              ) : diff ? (
                diff.hunks.length === 0 ? (
                  <div className="text-gray-500 text-sm">
                    These two versions are identical.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {diff.hunks.map((hunk, i) => (
                      <div key={i} className="border border-borderSoft rounded-lg overflow-hidden">
                        {hunk.map((row, j) => (
                          <div
                            key={j}
                            className={`flex gap-3 px-3 py-0.5 font-mono text-xs whitespace-pre-wrap ${
                              row.type === "add"
                                ? "bg-emerald-500/10 text-emerald-300"
                                : row.type === "remove"
                                  ? "bg-red-500/10 text-red-300"
                                  : "text-gray-500"
                            }`}
                          >
                            <span className="w-8 shrink-0 text-right opacity-50 select-none">
                              {row.line}
                            </span>
                            <span className="w-3 shrink-0 select-none">
                              {row.type === "add" ? "+" : row.type === "remove" ? "-" : " "}
                            </span>
                            <span className="flex-1">{row.text || " "}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )
              ) : (
                <pre className="text-gray-300 text-sm font-mono whitespace-pre-wrap">
                  {selected.content || "(empty version)"}
                </pre>
              )}
            </div>

            <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
              <button onClick={closeModal} className="btn-ghost text-sm">
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
