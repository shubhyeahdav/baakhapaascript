import React from "react";

/**
 * The scene index down the left of the writing page.
 *
 * Hidden in Corkboard and Outline — both are a fuller version of exactly this
 * list, and keeping the rail beside them cost 256px to say the same thing
 * twice. That guard stays with the page, which is the thing that knows what
 * view it is in; this component only knows how to draw the cards.
 *
 * Lifted out of ScriptEditor for a reason worth stating, because not every
 * block in that file was worth lifting: this one reads three values and calls
 * one handler. The AI panel next to it touches eleven pieces of editor state,
 * and pulling that out would have replaced a long file with a long prop list —
 * the same coupling, spread over two files and harder to follow.
 */
/**
 * Written runtime for one scene, as m:ss.
 *
 * `draft_json.minutes` is what the scene actually measures on the page;
 * `time_allocation` is what the structure preview planned for it. The draft
 * wins where both exist — the planned number printed "0m" on every scene of a
 * hand-typed screenplay, because nothing had ever allocated those scenes
 * anything.
 */
/** The draft fields sync writes, whichever shape the database hands them back in. */
function draftOf(scene) {
  try {
    return typeof scene.draft_json === "string"
      ? JSON.parse(scene.draft_json)
      : scene.draft_json || {};
  } catch {
    return {};
  }
}

/** Who speaks or appears in the scene, parsed off the page by `scene_sync`. */
function sceneCast(scene) {
  const cast = draftOf(scene).characters;
  return Array.isArray(cast) ? cast : [];
}

/** The scene's first action line — what the camera sees when it opens. */
function sceneAction(scene) {
  return (draftOf(scene).summary || "").trim();
}

/** Which page it starts on. Derived, so it needs no round trip. */
function scenePage(scene) {
  const line = Number(draftOf(scene).line_number);
  return Number.isFinite(line) ? Math.floor(line / 45) + 1 : 1;
}

function sceneRuntime(scene) {
  let draft = {};
  try {
    draft = typeof scene.draft_json === "string"
      ? JSON.parse(scene.draft_json)
      : scene.draft_json || {};
  } catch {
    draft = {};
  }
  const minutes = Number(draft.minutes) || Number(scene.time_allocation) || 0;
  if (minutes === 0) return "—";
  const whole = Math.floor(minutes);
  return `${whole}:${String(Math.round((minutes - whole) * 60)).padStart(2, "0")}`;
}

const VIEWS = [
  { key: "script", label: "Script", hint: "Write the page" },
  { key: "corkboard", label: "Corkboard", hint: "Move scenes around" },
  { key: "outline", label: "Outline", hint: "Read the shape" },
];

/**
 * Totals, so the column says something even when it holds one card.
 *
 * A screenplay with two scenes left this panel almost entirely empty, which is
 * the state every draft starts in — the moment a writer most needs the column
 * to look like it is doing something.
 */
function Totals({ scenes }) {
  const written = scenes?.length || 0;
  const minutes = (scenes || []).reduce((sum, sc) => {
    let d = {};
    try {
      d = typeof sc.draft_json === "string" ? JSON.parse(sc.draft_json) : sc.draft_json || {};
    } catch { d = {}; }
    return sum + (Number(d.minutes) || Number(sc.time_allocation) || 0);
  }, 0);
  const whole = Math.floor(minutes);
  const runtime = minutes ? `${whole}:${String(Math.round((minutes - whole) * 60)).padStart(2, "0")}` : "—";
  const major = (scenes || []).filter((sc) => sc.scene_type === "major").length;

  return (
    <dl className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[11px] mt-4 pt-3 border-t border-borderSoft">
      <dt className="text-inkMuted">Scenes</dt>
      <dd className="text-ink text-right tabular-nums">{written}</dd>
      <dt className="text-inkMuted">Major beats</dt>
      <dd className="text-ink text-right tabular-nums">{major}</dd>
      <dt className="text-inkMuted">Written runtime</dt>
      <dd className="text-ink text-right tabular-nums font-mono">{runtime}</dd>
    </dl>
  );
}

/**
 * @param view          which of the three readings is open
 * @param onViewChange  switch reading
 */
export default function SceneRail({
  scenes, activeScene, onSceneClick, view = "script", onViewChange, children,
}) {
  // Hidden on a phone. 256px of index cards beside a 375px screen leaves no
  // page left to write on, and the Corkboard is this same list in a form that
  // suits a small screen far better.
  //
  // Wider when it is carrying a whole reading rather than the index list.
  // Corkboard's grid is auto-fill/minmax(230px), so it collapses to a single
  // column here without being told to.
  // NOT `children ?`. The caller passes two conditional slots, so in Script
  // view `children` is the ARRAY [false, false] — truthy — and the index cards
  // silently vanished behind an empty box. `Children.toArray` drops false and
  // null, which is the question actually being asked: is anything in there.
  const hasReading = React.Children.toArray(children).length > 0;
  return (
    <aside className={`hidden lg:flex flex-col ${hasReading ? "w-80 xl:w-96" : "w-64"}
                       bg-surface border-r border-border overflow-y-auto p-4 shrink-0
                       animate-fade-up transition-[width] duration-200`}>
        {/* The three readings live here rather than in the toolbar.
            They are a statement about what you are looking at, and the left
            column IS what you are looking at — putting them up in the toolbar
            filed them with Import and Export, which are things you DO to a
            script rather than ways of seeing it. It also buys back room in a
            toolbar that had already crushed its own title once. */}
        {/* Sticky. The rail scrolls, and with twenty scenes in it the switcher
            went off the top — so the answer to "where is Corkboard" became
            "scroll back up", which is indistinguishable from it not existing. */}
        <div
          role="tablist"
          aria-label="Workspace view"
          // The wrapper spans the rail's own padding (-mx-4 -mt-4, then put
          // back with px-4 pt-4). Without that, `top-0` pins the control at the
          // container edge while the 16px of padding above it stays
          // transparent — so scrolled cards slid through the gap over the top
          // of the switcher.
          className="sticky top-0 z-20 -mx-4 -mt-4 px-4 pt-4 pb-3 bg-surface mb-1"
        >
          <div className="flex rounded-lg border border-border overflow-hidden">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              role="tab"
              aria-selected={view === v.key}
              title={v.hint}
              onClick={() => onViewChange?.(v.key)}
              className={`flex-1 text-[11px] py-1.5 transition ${
                view === v.key
                  ? "bg-goldDim text-gold"
                  : "text-inkMuted hover:text-ink hover:bg-elevated/50"
              }`}
            >
              {v.label}
            </button>
          ))}
          </div>
        </div>

        {hasReading ? (
          // Corkboard or Outline, rendered here rather than over the page.
          // The screenplay stays visible in the main area at all times, so
          // restructuring happens BESIDE the writing rather than instead of
          // it — the reason to move a card is almost always something you
          // just read on the page.
          <div className="flex-1 min-h-0 flex flex-col -mx-4">{children}</div>
        ) : (
        <>
        <div className="text-[10px] font-bold text-inkMuted uppercase tracking-wider mb-4">Scene Index Cards</div>
        {scenes?.map((scene, i) => (
          <button
            key={scene.id}
            onClick={() => onSceneClick(i)}
            title="Jump to this scene"
            className={`w-full text-left p-3 mb-2 rounded-xl border transition duration-200 ${
              activeScene === i
                ? "border-gold/50 bg-goldDim"
                : "border-borderSoft bg-surface/50 hover:border-gold/30 hover:bg-elevated/40"
            }`}
          >
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <span className="text-[10px] font-mono text-gold uppercase tracking-wider">
                Scene {i + 1}
              </span>
              {/* Where it is, which the page cannot tell you without scrolling
                  to it and counting. */}
              <span className="text-[9.5px] font-mono text-inkMuted">p.{scenePage(scene)}</span>
            </div>
            {/* The heading, smaller and quieter than it was. It IS on the page
                three inches to the right — the card's job is to add what the
                page cannot show you at a glance, not to say the same words
                again in bold. */}
            <div className="text-inkSoft text-[12px] font-mono truncate">{scene.title}</div>
            {/* This is the part worth a card. Who is in it, and the first thing
                the camera sees — the two facts you actually flip through an
                index looking for. */}
            {sceneCast(scene).length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {sceneCast(scene).slice(0, 4).map((name) => (
                  <span key={name} className="text-[9.5px] font-mono text-gold/70
                                              bg-goldDim/40 px-1.5 py-px rounded">
                    {name}
                  </span>
                ))}
              </div>
            )}
            {sceneAction(scene) && (
              <p className="text-[11.5px] text-inkMuted leading-snug mt-1.5 line-clamp-2">
                {sceneAction(scene)}
              </p>
            )}
            <div className="h-2" />
            <div className="flex justify-between items-center text-[10px] uppercase font-bold tracking-wider">
              <span className={scene.scene_type === "major" ? "text-skyAccent bg-skyDim px-2 py-0.5 rounded" : "text-inkMuted bg-borderSoft px-2 py-0.5 rounded"}>
                {scene.scene_type}
              </span>
              {/* Written runtime, measured off the page, falling back to
                  the planned allocation. Reading `time_allocation` alone
                  printed "0m" on every scene of a hand-typed screenplay,
                  because nothing had ever allocated those scenes anything. */}
              <span className="text-inkMuted font-mono normal-case">{sceneRuntime(scene)}</span>
            </div>
          </button>
        ))}
        {!scenes?.length && (
          // Deliberately does not repeat the slugline instruction. The Pen
          // says that on the blank page, where the writer actually is.
          <p className="text-[11.5px] text-inkMuted leading-snug">
            Scenes appear here as you write them.
          </p>
        )}
        <Totals scenes={scenes} />
        </>
        )}
      </aside>
  );
}
