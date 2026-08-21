import React, { useState } from "react";

/**
 * The script as a collapsible act → scene tree.
 *
 * Where the corkboard is for rearranging, this is for reading shape: act
 * balance, where the runtime actually went, and which scenes are still only an
 * outline. It answers "is my second act twice as long as my first" in one look,
 * which is the question the three-act model exists to make askable.
 *
 * Written runtime comes from the page (`draft_json.minutes`); planned runtime
 * from `time_allocation`. Showing both is what makes the act totals honest —
 * an act can be on-plan and badly under-written at the same time.
 */

const ROMAN = { 1: "I", 2: "II", 3: "III", 4: "IV", 5: "V" };

function draftOf(scene) {
  if (!scene?.draft_json) return {};
  try {
    return typeof scene.draft_json === "string" ? JSON.parse(scene.draft_json) : scene.draft_json;
  } catch {
    return {};
  }
}

function clock(n) {
  const v = Number(n) || 0;
  const m = Math.floor(v);
  const s = Math.round((v - m) * 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function OutlineView({ scenes = [], suggestions, activeScene, onOpen, onAdd, adding }) {
  const [collapsed, setCollapsed] = useState({});
  // Which act is currently having a scene added to it, and the slugline being
  // typed. Inline, because `window.prompt` is blocked in some embedded
  // browsers and is the wrong affordance regardless.
  const [composingAct, setComposingAct] = useState(null);
  const [heading, setHeading] = useState("INT. LOCATION - DAY");

  const submit = (act) => {
    const value = heading.trim();
    if (!value) return;
    onAdd?.(act, value.toUpperCase());
    setHeading("INT. LOCATION - DAY");
    setComposingAct(null);
  };

  const sugActs = suggestions?.acts || [];
  const actNumbers = [
    ...new Set([...scenes.map((s) => s.act_number || 1), ...sugActs.map((a) => a.act_number)]),
  ].sort((a, b) => a - b);

  const totalWritten = scenes.reduce((n, s) => n + (Number(draftOf(s).minutes) || 0), 0);

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-bgDeep/40">
      <div className="flex items-baseline justify-between mb-4">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-inkMuted">
          Outline
        </span>
        <span className="font-mono text-[10px] text-inkMuted">
          {clock(totalWritten)} written across {scenes.length}{" "}
          {scenes.length === 1 ? "scene" : "scenes"}
        </span>
      </div>

      <div className="max-w-3xl space-y-3">
        {actNumbers.map((num) => {
          const actScenes = scenes.filter((s) => (s.act_number || 1) === num);
          const sugAct = sugActs.find((a) => a.act_number === num);
          const written = actScenes.reduce((n, s) => n + (Number(draftOf(s).minutes) || 0), 0);
          const planned = sugAct?.duration_minutes || 0;
          // Share of what is actually on the page, not of what was planned —
          // the plan is the thing being checked, so it cannot be the yardstick.
          const share = totalWritten > 0 ? Math.round((written / totalWritten) * 100) : 0;
          const isOpen = !collapsed[num];

          return (
            <div key={num} className="rounded-xl border border-borderSoft bg-surface overflow-hidden">
              <button
                onClick={() => setCollapsed((c) => ({ ...c, [num]: !c[num] }))}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-elevated/40 transition"
              >
                <span className={`text-inkMuted text-[10px] transition-transform ${isOpen ? "rotate-90" : ""}`}>
                  ▶
                </span>
                <span className="font-display text-[15px] text-ink">
                  Act {ROMAN[num] || num}
                  {sugAct?.name ? <span className="text-inkMuted"> · {sugAct.name}</span> : null}
                </span>
                <span className="ml-auto font-mono text-[10.5px] text-inkMuted">
                  {actScenes.length} {actScenes.length === 1 ? "scene" : "scenes"} ·{" "}
                  <span className="text-ink">{clock(written)}</span>
                  {planned > 0 && <span className="text-inkMuted/60"> / {clock(planned)}</span>}
                  <span className="text-gold ml-2">{share}%</span>
                </span>
              </button>

              {/* Act proportion bar — the three-act model is a claim about
                  balance, so it should be visible as one. */}
              <div className="h-[3px] bg-borderSoft">
                <div className="h-full bg-gold/70" style={{ width: `${share}%` }} />
              </div>

              {isOpen && (
                <div className="p-2">
                  {actScenes.length === 0 && (
                    <p className="text-[11.5px] text-inkMuted italic px-3 py-2">
                      Nothing written in this act yet.
                    </p>
                  )}
                  {actScenes.map((scene) => {
                    const d = draftOf(scene);
                    const i = scenes.indexOf(scene);
                    return (
                      <button
                        key={scene.id}
                        onClick={() => onOpen?.(i)}
                        className={`w-full text-left rounded-lg px-3 py-2 flex items-baseline gap-3 transition ${
                          activeScene === i ? "bg-goldDim" : "hover:bg-elevated/50"
                        }`}
                      >
                        <span className="font-mono text-[10px] text-gold shrink-0 w-6">{i + 1}</span>
                        <span className="text-[12.5px] text-ink truncate flex-1 min-w-0">
                          {scene.title}
                        </span>
                        {d.page && (
                          <span className="font-mono text-[10px] text-inkMuted/70 shrink-0">
                            p.{d.page}
                          </span>
                        )}
                        <span className="font-mono text-[10px] text-inkMuted shrink-0 w-12 text-right">
                          {clock(d.minutes)}
                        </span>
                      </button>
                    );
                  })}

                  {composingAct === num ? (
                    <div className="flex items-center gap-2 px-3 py-2">
                      <input
                        autoFocus
                        value={heading}
                        onChange={(e) => setHeading(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") submit(num);
                          if (e.key === "Escape") setComposingAct(null);
                        }}
                        className="flex-1 min-w-0 bg-bg border border-border rounded-lg px-2.5 py-1.5 text-[12px] font-mono text-ink outline-none focus:border-gold/50"
                      />
                      <button
                        onClick={() => submit(num)}
                        disabled={!!adding}
                        className="btn-gold text-[11px] py-1 px-3 disabled:opacity-50"
                      >
                        {adding ? "Adding…" : "Add"}
                      </button>
                      <button onClick={() => setComposingAct(null)} className="btn-ghost text-[11px] py-1 px-3">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setComposingAct(num)}
                      disabled={!!adding}
                      className="w-full text-left rounded-lg px-3 py-2 text-[11.5px] text-inkMuted hover:text-gold transition disabled:opacity-50"
                    >
                      + Add a scene to Act {ROMAN[num] || num}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
