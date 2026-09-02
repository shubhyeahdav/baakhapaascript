import React, { useRef, useState } from "react";

/**
 * Index cards for the whole script, the way Final Draft and Arc Studio do it.
 *
 * The important decision here: **dragging a card moves the scene in the
 * screenplay**. It does not reorder a separate list that then has to be
 * reconciled with the page. The draft is the authority — `scene_sync` derives
 * every row's order from document position — so a corkboard that reordered
 * rows independently would be overwritten by the next save, and a writer would
 * watch their restructure silently undo itself.
 *
 * Runtime comes from `draft_json.minutes` (measured off the page) and falls
 * back to `time_allocation` (what was planned) for a scene that exists only as
 * a structure suggestion. Showing planned-vs-written is the point of the strip
 * at the bottom of each card.
 */

function draftOf(scene) {
  if (!scene?.draft_json) return {};
  try {
    return typeof scene.draft_json === "string" ? JSON.parse(scene.draft_json) : scene.draft_json;
  } catch {
    return {};
  }
}

function mins(n) {
  const v = Number(n) || 0;
  if (v === 0) return "—";
  const m = Math.floor(v);
  const s = Math.round((v - m) * 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function Corkboard({ scenes = [], activeScene, onOpen, onMove, onAdd, adding }) {
  const [dragging, setDragging] = useState(null);
  const [over, setOver] = useState(null);
  // Composing in place rather than through `window.prompt`, which some
  // embedded browsers refuse outright — and which no professional tool would
  // use to ask for a slugline anyway.
  const [composing, setComposing] = useState(false);
  const [heading, setHeading] = useState("INT. LOCATION - DAY");
  const inputRef = useRef(null);

  const submit = () => {
    const value = heading.trim();
    if (!value) return;
    onAdd?.(1, value.toUpperCase());
    setHeading("INT. LOCATION - DAY");
    setComposing(false);
  };

  const commit = (to) => {
    if (dragging !== null && to !== null && dragging !== to) onMove?.(dragging, to);
    setDragging(null);
    setOver(null);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-bgDeep/40">
      {/* Stacked, not side by side. This lives in the left rail now, and at
          that width `justify-between` interleaved the two lines into
          "CORKBOARD — 2 drag a card to move the SCENES scene in the script". */}
      <div className="mb-4">
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-inkMuted">
          Corkboard — {scenes.length} {scenes.length === 1 ? "scene" : "scenes"}
        </div>
        <div className="font-mono text-[10px] text-inkMuted/70 mt-0.5 leading-snug">
          drag a card to move the scene in the script
        </div>
      </div>

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
        {scenes.map((scene, i) => {
          const d = draftOf(scene);
          const written = Number(d.minutes) || 0;
          const planned = Number(scene.time_allocation) || 0;
          return (
            <div
              key={scene.id}
              draggable
              onDragStart={() => setDragging(i)}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(i);
              }}
              onDrop={(e) => {
                e.preventDefault();
                commit(i);
              }}
              onDragEnd={() => commit(over)}
              onClick={() => onOpen?.(i)}
              className={`text-left rounded-xl border p-3.5 cursor-pointer select-none transition ${
                d.removed
                  ? "border-dashed border-borderSoft bg-bgDeep/60 opacity-60"
                  : activeScene === i
                  ? "border-gold/60 bg-goldDim"
                  : "border-borderSoft bg-surface hover:border-gold/30"
              } ${dragging === i ? "opacity-40" : ""} ${
                over === i && dragging !== null && dragging !== i ? "ring-1 ring-gold/60" : ""
              }`}
            >
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-[10px] font-mono text-gold uppercase tracking-wider">
                  Scene {i + 1}
                </span>
                {/* A scene that was written and has since been cut from the
                    draft. The row survives because a storyboard frame points at
                    it, but presenting it as a live scene would be a lie. */}
                {d.removed ? (
                  <span className="text-[9px] font-mono uppercase tracking-wider text-inkMuted/70">
                    cut from script
                  </span>
                ) : d.page ? (
                  <span className="text-[10px] font-mono text-inkMuted" title="Printed page">
                    p.{d.page}
                  </span>
                ) : null}
              </div>

              <div className="text-ink font-semibold text-[13px] leading-snug mb-1.5 line-clamp-2">
                {scene.title}
              </div>

              {/* Production metadata on the card itself. This is what makes an
                  index card useful to anyone but the writer: a 1st AD reading
                  the board needs interior/exterior, time of day and who is in
                  the scene, and all three were already parsed off the page and
                  then shown nowhere. */}
              <div className="flex flex-wrap items-center gap-1.5 mb-2">
                {d.interior !== undefined && d.interior !== null && (
                  <span className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-borderSoft text-inkMuted">
                    {d.interior ? "INT" : "EXT"}
                  </span>
                )}
                {d.time_of_day && (
                  <span className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-borderSoft text-inkMuted">
                    {d.time_of_day}
                  </span>
                )}
                {(d.characters || []).length > 0 && (
                  <span
                    className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-skyDim text-skyAccent"
                    title={(d.characters || []).join(", ")}
                  >
                    {d.characters.length} cast
                  </span>
                )}
              </div>

              <p className="text-[11.5px] text-inkSoft leading-snug mb-3 line-clamp-3 min-h-[3rem]">
                {d.summary || scene.description || (
                  <span className="text-inkMuted italic">Not written yet</span>
                )}
              </p>

              <div className="flex items-center justify-between text-[10px]">
                <span
                  className={`uppercase font-bold tracking-wider px-1.5 py-0.5 rounded ${
                    scene.scene_type === "major"
                      ? "text-skyAccent bg-skyDim"
                      : "text-inkMuted bg-borderSoft"
                  }`}
                >
                  {scene.scene_type}
                </span>
                {/* Written against planned. A scene running well over or under
                    its allocation is the single most useful thing an index card
                    can tell a writer, and it was not being shown anywhere. */}
                <span className="font-mono text-inkMuted">
                  <span className={written > 0 ? "text-ink" : ""}>{mins(written)}</span>
                  {planned > 0 && <span className="text-inkMuted/60"> / {mins(planned)}</span>}
                </span>
              </div>
            </div>
          );
        })}

        {/* Custom scenes: the API has accepted these since the first structure
            commit and nothing ever called it, so the only scenes a writer could
            add were the ones the AI proposed. */}
        {composing ? (
          <div className="rounded-xl border border-gold/40 bg-surface p-3.5 min-h-[9.5rem] flex flex-col justify-center gap-2">
            <label className="font-mono text-[9px] uppercase tracking-wider text-inkMuted">
              Scene heading
            </label>
            <input
              ref={inputRef}
              autoFocus
              value={heading}
              onChange={(e) => setHeading(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
                if (e.key === "Escape") setComposing(false);
              }}
              className="bg-bg border border-border rounded-lg px-2.5 py-1.5 text-[12px] font-mono text-ink outline-none focus:border-gold/50"
            />
            <div className="flex gap-2">
              <button onClick={submit} disabled={!!adding} className="btn-gold text-[11px] py-1 px-3 disabled:opacity-50">
                {adding ? "Adding…" : "Add"}
              </button>
              <button onClick={() => setComposing(false)} className="btn-ghost text-[11px] py-1 px-3">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setComposing(true)}
            disabled={!!adding}
            className="rounded-xl border border-dashed border-border text-inkMuted hover:border-gold/40 hover:text-ink transition p-3.5 min-h-[9.5rem] flex flex-col items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <span className="text-2xl leading-none">+</span>
            <span className="text-[11.5px]">{adding ? "Adding…" : "New scene"}</span>
          </button>
        )}
      </div>
    </div>
  );
}
