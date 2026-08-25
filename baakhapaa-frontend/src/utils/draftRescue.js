/**
 * A local mirror of the draft the writer is typing.
 *
 * The editor holds the draft in React state and sends it to the server on a
 * timer. Between those two facts sits the failure this exists for: one thrown
 * render unmounts the tree, and everything typed since the last save goes with
 * it. The writer sees a white page and has no way back to their own words.
 *
 * So the draft is mirrored to localStorage as it is typed, and `ErrorBoundary`
 * reads it back out after a crash. This is deliberately not a cache — nothing
 * ever loads from it during normal operation, because a stale local copy
 * silently overwriting a good server copy is a worse bug than the one being
 * fixed here. It is written often and read only after something has gone wrong.
 */
const PREFIX = "baakhapaa:draft:";

const key = (scriptId) => `${PREFIX}${scriptId}`;

/**
 * Mirror `content` for `scriptId`.
 *
 * Never throws. Storage is disabled in some private-browsing modes and full in
 * others, and a rescue copy failing to write must not be the thing that breaks
 * the editor it is protecting.
 */
export function saveRescue(scriptId, content) {
  if (!scriptId || !content) return false;
  try {
    window.localStorage.setItem(
      key(scriptId),
      JSON.stringify({ content, savedAt: Date.now() })
    );
    return true;
  } catch (e) {
    return false;
  }
}

/** The mirrored draft for one script, or null. */
export function readRescue(scriptId) {
  if (!scriptId) return null;
  try {
    const raw = window.localStorage.getItem(key(scriptId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.content !== "string" || !parsed.content) return null;
    return { scriptId: String(scriptId), content: parsed.content, savedAt: parsed.savedAt || 0 };
  } catch (e) {
    return null;
  }
}

/**
 * The most recently mirrored draft, whichever script it belongs to.
 *
 * The boundary catches errors from anywhere in the tree and does not know which
 * script was open — it only knows something died. Most recent is the right
 * guess because it is the one the writer was looking at.
 */
export function readLatestRescue() {
  let best = null;
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (!k || !k.startsWith(PREFIX)) continue;
      const found = readRescue(k.slice(PREFIX.length));
      if (found && (!best || found.savedAt > best.savedAt)) best = found;
    }
  } catch (e) {
    return best;
  }
  return best;
}

/** Drop the mirror once the draft is safely on the server. */
export function clearRescue(scriptId) {
  if (!scriptId) return;
  try {
    window.localStorage.removeItem(key(scriptId));
  } catch (e) {
    /* nothing to do — a stale rescue copy is harmless, it is never auto-loaded */
  }
}
