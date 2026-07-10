import React from "react";

// Three-act structure preview (per the Claude Design mockup): a horizontal
// timeline bar divided into the three acts with their time allocations, and
// the AI-suggested scenes as cards below each act. Nothing here is part of
// the script until the user clicks "Add Scene" — added ones show a check,
// the rest stay as pending suggestions.
export default function StructureTimeline({ structure, addedKeys, onAdd, adding }) {
  const acts = structure?.acts || [];
  if (acts.length === 0) return null;

  const totalMin = acts.reduce((n, a) => n + (a.duration_minutes || 0), 0) || 1;
  const pending = acts.reduce(
    (n, a) => n + (a.scenes || []).filter(
      (s) => !addedKeys.has(`${a.act_number}:${s.title}`)
    ).length, 0
  );

  return (
    <div className="shrink-0 border-b border-border bg-surface/60 px-5 pt-4 pb-5 overflow-y-auto max-h-[45%]">
      <div className="flex items-baseline justify-between mb-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-inkMuted">
          Suggested Structure — {pending} pending
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-inkMuted">
          {totalMin} min total
        </span>
      </div>

      {/* Act timeline bar — widths proportional to duration */}
      <div className="flex w-full h-9 rounded overflow-hidden border border-border mb-4">
        {acts.map((act) => (
          <div
            key={act.act_number}
            style={{ width: `${((act.duration_minutes || 0) / totalMin) * 100}%` }}
            className="flex items-center justify-between px-3 border-r border-border last:border-r-0 bg-elevated/50 min-w-0"
          >
            <span className="text-[11px] font-semibold text-ink truncate">
              Act {act.act_number} · {act.name}
            </span>
            <span className="font-mono text-[10px] text-gold ml-2 shrink-0">
              {act.duration_minutes}m · {act.percentage}%
            </span>
          </div>
        ))}
      </div>

      {/* Scene suggestion cards, grouped under each act */}
      <div className="grid grid-cols-3 gap-4">
        {acts.map((act) => (
          <div key={act.act_number} className="min-w-0">
            {(act.scenes || []).map((scene, idx) => {
              const key = `${act.act_number}:${scene.title}`;
              const isAdded = addedKeys.has(key);
              return (
                <div
                  key={key}
                  className={`rounded-lg border p-3 mb-2 transition ${
                    isAdded
                      ? "border-borderSoft bg-bgDeep/40 opacity-60"
                      : "border-border bg-surface hover:border-gold/40"
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <span className="text-[13px] font-semibold text-ink truncate">
                      {scene.title}
                    </span>
                    <span className="font-mono text-[10px] text-inkMuted shrink-0">
                      {scene.time_allocation}m
                    </span>
                  </div>
                  <p className="text-[11.5px] text-inkSoft leading-snug mb-2 line-clamp-2">
                    {scene.description}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className={`text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded ${
                      scene.scene_type === "major" ? "text-gold bg-goldDim" : "text-inkMuted bg-borderSoft"
                    }`}>
                      {scene.scene_type}
                    </span>
                    {isAdded ? (
                      <span className="text-[11px] text-emerald-400">✓ Added</span>
                    ) : (
                      <button
                        onClick={() => onAdd(scene, act.act_number, idx)}
                        disabled={adding === key}
                        className="text-[11px] font-semibold text-gold border border-gold/30 rounded-full px-2.5 py-0.5 hover:bg-goldDim transition disabled:opacity-50"
                      >
                        {adding === key ? "Adding…" : "+ Add Scene"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
