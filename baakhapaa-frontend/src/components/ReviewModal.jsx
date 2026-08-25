import React from "react";

/**
 * What the review found, before finalizing.
 *
 * Reports, never blocks. A writer is allowed to finalize a script a tool
 * disagrees with — the job here is to make sure they do it knowing what was
 * found, not to hold the door shut. That is why both buttons are live and
 * neither is styled as the wrong answer.
 *
 * Lifted out of ScriptEditor, which had grown past 1,600 lines: a modal that
 * renders a fixed list from one prop has no business living inside the
 * component that owns the caret, the autosave and the AI panel.
 */
export default function ReviewModal({ review, onKeepWriting, onFinalizeAnyway }) {
  if (!review) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6">
      <div className="bg-surface border border-borderSoft rounded-2xl shadow-card max-w-lg w-full max-h-[80vh] flex flex-col">
        <div className="p-5 border-b border-borderSoft">
          <p className="font-mono text-[10px] uppercase tracking-wider text-gold mb-1.5">
            Script review
          </p>
          <h2 className="font-display text-xl text-ink">
            {review.counts?.high > 0
              ? "Worth a look before you finalize"
              : "A few things to consider"}
          </h2>
          <p className="text-[12px] text-inkMuted mt-1.5 leading-snug">
            Timing, character names and act balance. These are checks, not
            rules — finalize anyway if you disagree.
          </p>
        </div>

        <div className="p-5 overflow-y-auto space-y-3 flex-1">
          {(review.findings || []).map((f, i) => (
            <div key={`${f.rule}-${i}`} className="flex gap-3">
              <span
                className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                  f.severity === "high" ? "bg-red-400"
                    : f.severity === "medium" ? "bg-amber-400" : "bg-sky-400"
                }`}
              />
              <div>
                <p className="text-[13px] text-ink leading-snug">{f.message}</p>
                {f.detail && (
                  <p className="text-[11.5px] text-inkMuted leading-snug mt-1">{f.detail}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="p-5 border-t border-borderSoft flex gap-2">
          <button onClick={onKeepWriting} className="btn-ghost text-xs py-2 px-4 flex-1">
            Keep writing
          </button>
          <button onClick={onFinalizeAnyway} className="btn-gold text-xs py-2 px-4 flex-1">
            Finalize anyway
          </button>
        </div>
      </div>
    </div>
  );
}
