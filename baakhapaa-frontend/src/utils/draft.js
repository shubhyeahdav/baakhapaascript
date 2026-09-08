/**
 * Two readings of the draft that both the page and its owner need.
 *
 * They lived in `ScriptEditor.jsx` until the page was extracted, at which point
 * they were being called from two files. Neither belongs to either one: the
 * status line counts words, the autosave counts words; the page derives scenes
 * as you type, the loader derives them on open.
 */
/** Words in a draft, counting the screenplay as a reader would rather than as a
 *  tokeniser would: runs of non-whitespace, so "INT." is one word and an em
 *  dash between two words is not a third. */
export function countWords(text) {
  const trimmed = (text || "").trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export function scenesFromDraft(text, existing = []) {
  const headings = (text || "").split("\n")
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /^\s*(INT\.|EXT\.|INT\/EXT\.|I\/E\.)\s+.+/i.test(line));
  if (!headings.length) return existing;

  const byTitle = new Map(existing.map((scene) => [
    String(scene.title || "").trim().toUpperCase(), scene,
  ]));
  return headings.map(({ line, index }, sceneIndex) => {
    const title = line.trim().toUpperCase();
    const previous = byTitle.get(title) || existing[sceneIndex];
    let previousDraft = {};
    try {
      previousDraft = typeof previous?.draft_json === "string"
        ? JSON.parse(previous.draft_json)
        : previous?.draft_json || {};
    } catch {}
    const titleIsDerived = previous && previous.title === previousDraft.heading;
    return {
      ...(previous || {}),
      id: previous?.id || `draft-scene-${sceneIndex}-${title}`,
      title: !previous || titleIsDerived ? title : previous.title,
      scene_type: previous?.scene_type || "minor",
      draft_json: {
        ...(typeof previous?.draft_json === "object" ? previous.draft_json : {}),
        line_number: index,
      },
    };
  });
}
