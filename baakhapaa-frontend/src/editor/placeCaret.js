/**
 * Put the caret where a keymap edit wants it — NOW, and again next frame only
 * if nothing has been typed since.
 *
 * The keymaps used to place the caret in a requestAnimationFrame. Found in the
 * Month 4, Day 19 walk: Tab opens `[B-ROLL: ]` with the caret meant to land
 * inside it, and a writer who typed straight away put their first letter
 * AFTER the `]` — "[B-ROLL: orty thumbnails]f" — because the frame had not
 * come round yet. The broken cue then defeated Enter-closes-cue as well.
 *
 * `replaceRange` edits through `execCommand("insertText")`, which updates the
 * textarea synchronously, so the caret can be placed at once. The frame-late
 * placement survives only as a fallback for the path that re-renders through
 * React instead — and it is guarded: if the text changed in between, the
 * writer has typed, and moving the caret back would put their next letter in
 * the middle of the word they just wrote.
 */
export function placeCaret(ta, pos, after) {
  if (!ta) return;
  ta.setSelectionRange(pos, pos);
  const snapshot = ta.value;
  requestAnimationFrame(() => {
    if (ta.value === snapshot) ta.setSelectionRange(pos, pos);
    if (after) after();
  });
}
