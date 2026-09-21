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

/**
 * A chip the card shows in place of a fact it does not have.
 *
 * Until now a missing field simply removed its chip, so a card whose slugline
 * reads `INT. PASAL` and one that reads `INT. PASAL - DAY` differed by a gap —
 * and a gap is not readable as an omission. Worse for the board as a whole:
 * every card was a different height, so the eye could not scan down a column.
 *
 * Written as a question rather than a warning. The board is not a linter; the
 * craft linter exists and is a different surface. `TIME?` says a fact is
 * missing and, because it names the thing in the vocabulary of the slugline,
 * also says where it would go.
 *
 * Quietened by the DASHED BORDER, not by fading the text. `text-inkMuted/70`
 * is the obvious way to make a chip recede and it lands at about 3:1 on this
 * surface, under the 4.5:1 floor for 9px text — and `contrast-check.mjs` reads
 * hex literals, so a Tailwind opacity modifier is invisible to the one check
 * that would have caught it. Full `inkMuted` is 5.12:1.
 */
function Cue({ children, title }) {
  return (
    <span
      title={title}
      className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-dashed border-borderSoft text-inkMuted"
    >
      {children}
    </span>
  );
}

function mins(n) {
  const v = Number(n) || 0;
  if (v === 0) return "—";
  const m = Math.floor(v);
  const s = Math.round((v - m) * 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function Corkboard({ scenes = [], activeScene, onOpen, onMove, onAdd,
                                   adding, onSetSceneType }) {
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
          /* A long-form video section plans in SECONDS, on the section itself,
             because `time_allocation` is one of the three scene fields the
             video parser deliberately leaves null rather than repurposing. The
             planned side of every section card was therefore blank, and a
             section with a stated target read exactly like one without. */
          const planned = Number(scene.time_allocation)
            || (Number(d.target_seconds) ? Number(d.target_seconds) / 60 : 0);
          /* A section is not a scene, and the card has to know which it is
             holding. `section_kind` is the only field that says so, and it
             reaches the client already. Asking a video writer for an INT/EXT
             is asking them to add something the format does not have. */
          const section = d.section_kind || null;
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
                {scene.title || (
                  <span className="text-inkMuted italic font-normal">Untitled scene</span>
                )}
              </div>

              {/* Production metadata on the card itself. This is what makes an
                  index card useful to anyone but the writer: a 1st AD reading
                  the board needs interior/exterior, time of day and who is in
                  the scene, and all three were already parsed off the page and
                  then shown nowhere. */}
              <div className="flex flex-wrap items-center gap-1.5 mb-2">
                {/* A section states its KIND here, which is the closest thing
                    a video has to production metadata and was shown nowhere on
                    the board. It also occupies the row, so a section card is
                    the same height as a scene card beside it. */}
                {section ? (
                  <span className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-goldDim text-gold">
                    {section}
                  </span>
                ) : (
                  <>
                    {d.interior !== undefined && d.interior !== null ? (
                      <span className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-borderSoft text-inkMuted">
                        {d.interior ? "INT" : "EXT"}
                      </span>
                    ) : !d.removed && (
                      <Cue title="This scene's heading does not open with INT. or EXT.">
                        int/ext?
                      </Cue>
                    )}
                    {d.time_of_day ? (
                      <span className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-borderSoft text-inkMuted">
                        {d.time_of_day}
                      </span>
                    ) : !d.removed && (
                      <Cue title="No time of day — the heading ends without ' - DAY', ' - NIGHT' and so on.">
                        time?
                      </Cue>
                    )}
                  </>
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
                {/* The badge is now the control.
                    This said `major` or `minor` and could not be changed —
                    anywhere. A generated structure chose once; a scene the
                    writer typed was created `minor` and stayed that way, so on
                    the blank-page path every script was uniformly minor and the
                    rail's "major" count read zero. The one person who knows
                    which scene is the turning point was the only one who could
                    not say so.

                    A button rather than a select: there are exactly two values
                    and the label already names the current one, so the whole
                    interaction is "press the word to change it". It stops the
                    card's drag from starting, or marking a scene would move
                    it. */}
                {/* A section carries no turning point. `scene_type` is
                    written "minor" for every synced row, section or scene, so
                    a video section rendered a pressable MINOR badge that
                    classified nothing and invited an edit that means nothing.
                    The kind chip above is a section's classification. The
                    empty span keeps `justify-between` holding the runtime
                    against the right edge. */}
                {section ? <span /> : (
                <button
                  type="button"
                  draggable={false}
                  onDragStart={(e) => e.preventDefault()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSetSceneType?.(scene, scene.scene_type === "major" ? "minor" : "major");
                  }}
                  disabled={!onSetSceneType}
                  title={
                    scene.scene_type === "major"
                      ? "A turning point. Press to make it a transition."
                      : "A transition. Press to mark it a turning point."
                  }
                  // `tap`, because this badge became a CONTROL and kept the
                  // size it had as a label: 49x19, under the 24px pointer
                  // floor WCAG 2.2 sets. It sits inside a card whose whole
                  // surface opens the scene, so a thumb that misses it does
                  // not do nothing — it navigates away from the board the
                  // writer is reading. `tap` hangs the missing height off a
                  // pseudo-element so the card's layout does not move.
                  className={`tap uppercase font-bold tracking-wider px-1.5 py-0.5 rounded transition ${
                    scene.scene_type === "major"
                      ? "text-skyAccent bg-skyDim hover:brightness-125"
                      : "text-inkMuted bg-borderSoft hover:text-inkSoft"
                  } ${onSetSceneType ? "cursor-pointer" : "cursor-default"}`}
                >
                  {/* Defaulted, not left blank. `scene_type` is NOT NULL with a
                      default of "minor" in the model, but a row written before
                      that default — or one whose column comes back null —
                      rendered this control with no label at all: a control
                      whose whole job is to name its current value, naming
                      nothing. */}
                  {scene.scene_type || "minor"}
                </button>
                )}
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
