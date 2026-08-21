import React, { useEffect, useState, useCallback } from "react";
import { comments as commentsApi } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { userLabel, formatTime } from "../utils/format";

/**
 * Notes on a script.
 *
 * `caretLine` is the line the writer's cursor is on in the editor. Typing a
 * line number by hand was the old way, and it is the kind of field people get
 * wrong or skip — a note anchored to line 0 is a note nobody can find again.
 */
export default function CommentThreads({ scriptId, caretLine }) {
  const { user } = useAuth();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [lineNumber, setLineNumber] = useState("");
  // Follow the caret until the writer types a line themselves, so the common
  // case ("note about the line I am looking at") needs no input at all.
  const [pinned, setPinned] = useState(false);
  const effectiveLine = pinned ? (parseInt(lineNumber, 10) || 0) : (caretLine || 0);
  const [posting, setPosting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    commentsApi
      .getAll(scriptId)
      .then((res) => {
        // The server orders these: anchored notes in page order, un-anchored
        // last, each group oldest first. Re-sorting here by time only would
        // scatter the line anchors back out of page order.
        setList(res.data);
        setError("");
      })
      .catch((err) => setError(err.response?.data?.detail || "Could not load comments"))
      .finally(() => setLoading(false));
  }, [scriptId]);

  useEffect(() => { load(); }, [load]);

  const handlePost = async (e) => {
    e.preventDefault();
    if (!draft.trim()) return;
    setPosting(true);
    try {
      await commentsApi.add(scriptId, draft.trim(), effectiveLine);
      setDraft("");
      setLineNumber("");
      setPinned(false);
      load();
    } catch (err) {
      setError(err.response?.data?.detail || "Could not post comment");
    } finally {
      setPosting(false);
    }
  };

  const handleDelete = async (commentId) => {
    try {
      await commentsApi.remove(commentId);
      setList((prev) => prev.filter((c) => c.id !== commentId));
    } catch (err) {
      setError(err.response?.data?.detail || "Could not delete comment");
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="text-gold font-semibold text-sm tracking-wider uppercase mb-4">Comments</div>

      {error && (
        <div className="text-red-400 text-xs mb-3 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-2 mb-4">
        {loading ? (
          <div className="text-inkMuted text-sm">Loading comments...</div>
        ) : list.length === 0 ? (
          <div className="text-inkMuted text-sm">
            No comments yet. Leave the first note for your collaborators.
          </div>
        ) : (
          list.map((c) => (
            <div key={c.id} className="bg-elevated/40 border border-borderSoft rounded-xl p-3">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-xs font-semibold text-ink">{userLabel(c)}</span>
                <span className="text-[10px] text-inkMuted">{formatTime(c.created_at)}</span>
              </div>
              <p className="text-sm text-inkSoft whitespace-pre-wrap">{c.content}</p>
              <div className="flex justify-between items-center mt-2">
                {c.line_number > 0 ? (
                  <span className="text-[10px] text-gold bg-goldDim px-2 py-0.5 rounded">
                    Line {c.line_number}
                  </span>
                ) : <span />}
                {user?.id === c.user_id && (
                  <button
                    onClick={() => handleDelete(c.id)}
                    className="text-[10px] text-inkMuted hover:text-red-400 transition"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <form onSubmit={handlePost} className="border-t border-borderSoft pt-3">
        <textarea
          className="field h-20 mb-2 text-sm"
          placeholder="Add a comment for your collaborators..."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className="flex gap-2 items-center">
          <input
            type="number"
            min="0"
            aria-label="Line number"
            className="field w-24 text-sm"
            placeholder={caretLine ? `L${caretLine}` : "Line #"}
            value={pinned ? lineNumber : ""}
            onChange={(e) => { setPinned(true); setLineNumber(e.target.value); }}
          />
          <button type="submit" disabled={posting || !draft.trim()} className="btn-gold text-sm flex-1 py-2">
            {posting ? "Posting..." : "Post Comment"}
          </button>
        </div>
        {/* Say where the note will land. A note whose anchor is a surprise is
            a note that ends up on the wrong line. */}
        <p className="text-[11px] text-inkMuted mt-2 leading-snug">
          {pinned && lineNumber
            ? <>Pinned to line {lineNumber}. <button type="button" onClick={() => { setPinned(false); setLineNumber(""); }} className="text-gold hover:underline">follow my cursor</button></>
            : caretLine
              ? `Will attach to line ${caretLine}, where your cursor is.`
              : "Put your cursor in the script to attach this to a line."}
        </p>
      </form>
    </div>
  );
}
