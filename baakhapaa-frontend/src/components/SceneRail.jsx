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

export default function SceneRail({ scenes, activeScene, onSceneClick }) {
  // Hidden on a phone. 256px of index cards beside a 375px screen leaves no
  // page left to write on, and the Corkboard is this same list in a form that
  // suits a small screen far better.
  return (
    <aside className="hidden lg:block w-64 bg-surface border-r border-border overflow-y-auto p-4 shrink-0 animate-fade-up">
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
            <div className="text-[10px] font-mono text-gold mb-1 uppercase tracking-wider">Scene {i + 1}</div>
            <div className="text-ink font-semibold text-sm truncate mb-2">{scene.title}</div>
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
      </aside>
  );
}
