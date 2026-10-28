/**
 * The top of the line the caret sits on, in a textarea, in pixels.
 *
 * Extracted so that `scripts/typewriter-band-check.mjs` can measure the REAL
 * implementation in a real browser rather than a copy of it. jsdom has no
 * layout engine, so nothing in the test suite can check this — and a browser
 * check that duplicates the formula stops testing the thing it is named after
 * the moment either copy changes.
 *
 * WHY MEASURED AND NOT COUNTED. `ScriptPage` counted hard newlines:
 *
 *     value.slice(0, selectionStart).split("\n").length - 1
 *
 * On a screenplay page that is very nearly right. Courier at a measure sized
 * to hold a 61-column line means action rarely wraps, so one newline is one
 * visual line — 0.1 lines of error on a real scene.
 *
 * A video script is wrapped proportional prose: one paragraph is a single
 * newline and five or six visual lines, and the error is cumulative, one
 * line-height per wrap. 6.1 lines out on four paragraphs.
 *
 * The mirror asks the browser where the line is instead of predicting it.
 * `index.css` argues against mirroring the draft, and is right about what it
 * describes — COLOURING text that way means re-solving wrapping, font metrics
 * and scroll sync and keeping them in step for ever. This is one throwaway
 * element read once per caret move, for one number.
 */

/** Styles that decide where text wraps, copied from the real element. */
function mirrorStyle(ta, cs) {
  return "position:absolute;visibility:hidden;white-space:pre-wrap;" +
         "word-wrap:break-word;top:0;left:-9999px;" +
         `width:${ta.clientWidth}px;padding:${cs.padding};font:${cs.font};` +
         `line-height:${cs.lineHeight};letter-spacing:${cs.letterSpacing}`;
}

export function caretLineTop(ta) {
  if (!ta) return 0;
  const cs = getComputedStyle(ta);
  const mirror = document.createElement("div");
  mirror.style.cssText = mirrorStyle(ta, cs);

  // A zero-width marker after the text up to the caret: its offsetTop is the
  // top of the caret's line, whatever the wrapping did to get there.
  const marker = document.createElement("span");
  marker.textContent = "​";
  mirror.append(
    document.createTextNode(ta.value.slice(0, ta.selectionStart || 0)),
    marker,
  );

  // Appended to the textarea's own parent so it inherits the same font
  // context; absolutely positioned off-screen so it never affects layout.
  (ta.parentNode || document.body).appendChild(mirror);
  const top = marker.offsetTop;
  const laidOut = mirror.offsetHeight > 0;
  mirror.remove();
  if (laidOut) return top;

  // Nothing was laid out — a hidden page, or jsdom, which has no layout
  // engine and reports every offset as 0. Fall back to counting newlines:
  // the formula this replaced, right on a screenplay and merely approximate
  // on wrapped prose, which beats pinning the band to the top of the page.
  const line = ta.value.slice(0, ta.selectionStart || 0).split("\n").length - 1;
  return (parseFloat(cs.paddingTop) || 0) + line * (parseFloat(cs.lineHeight) || 25);
}

/**
 * The top of each of several lines (1-based), in one measurement.
 *
 * The margin notes need a position for every flagged line, and building a
 * mirror per line would be one layout per flag on every keystroke. This
 * builds one mirror with a zero-width marker at the start of each requested
 * line and reads them all. Same wrapping, same fonts, same rule as
 * `caretLineTop`: the browser says where the line is.
 *
 * Returns { [lineNumber]: topPx }. Lines past the end of the draft are left
 * out rather than pinned to the last line.
 */
export function lineTops(ta, lineNumbers) {
  const out = {};
  if (!ta || !lineNumbers?.length) return out;
  const wanted = new Set(lineNumbers.filter((n) => Number.isFinite(n) && n >= 1));
  const lines = ta.value.split("\n");
  const cs = getComputedStyle(ta);
  const mirror = document.createElement("div");
  mirror.style.cssText = mirrorStyle(ta, cs);

  const markers = [];
  lines.forEach((text, i) => {
    const n = i + 1;
    if (wanted.has(n)) {
      const m = document.createElement("span");
      m.textContent = "​";
      markers.push([n, m]);
      mirror.appendChild(m);
    }
    mirror.appendChild(document.createTextNode(i < lines.length - 1 ? `${text}\n` : text));
  });

  (ta.parentNode || document.body).appendChild(mirror);
  const laidOut = mirror.offsetHeight > 0;
  markers.forEach(([n, m]) => { out[n] = m.offsetTop; });
  mirror.remove();
  if (laidOut) return out;

  // No layout (jsdom, a hidden page): count lines, as caretLineTop does.
  const pad = parseFloat(cs.paddingTop) || 0;
  const lh = parseFloat(cs.lineHeight) || 25;
  markers.forEach(([n]) => { out[n] = pad + (n - 1) * lh; });
  return out;
}
