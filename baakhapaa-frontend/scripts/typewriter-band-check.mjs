/* Does the focus band sit on the line the caret is actually on?
 *
 * Run it: `node scripts/typewriter-band-check.mjs` — no dev server, no login.
 *
 * Typewriter mode paints a gradient band over the page so the lines being
 * written stay at full strength and the rest falls back toward the paper.
 * `paintBand` positions it from the caret's line number, counted as HARD
 * NEWLINES:
 *
 *     const line = ta.value.slice(0, ta.selectionStart).split("\n").length - 1;
 *     el.style.setProperty("--focus-y", `${padTop + line * lineHeight ...}`);
 *
 * On a screenplay page that is very nearly right. Courier at a measure sized
 * to hold a 61-column line means action lines rarely wrap, so one hard
 * newline is one visual line and the band lands where the caret is.
 *
 * A video script is wrapped proportional prose. A paragraph of narration is
 * one hard newline and four or five visual lines, so the count and the
 * position diverge — and they diverge CUMULATIVELY, by one line-height per
 * wrap, so the band is further out the further down the draft you are. That
 * is the failure this measures.
 *
 * Why here and not in the suite: jsdom has no layout engine and
 * vite.config.js sets `css: false`, so nothing in vitest can see where a line
 * wraps, let alone where a gradient landed.
 */
import { chromium } from "playwright";
import { readFileSync } from "fs";

// The real implementation, injected into the page. A check that keeps its
// own copy of the formula stops testing the thing it is named after the
// moment either copy changes.
const caretLineSrc = readFileSync(new URL("../src/lib/caretLine.js", import.meta.url), "utf8")
  .replace(/^export /gm, "");

const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8")
  .replace(/@tailwind[^;]*;/g, "");

// Narration as it is actually written: a few sentences per paragraph, one
// hard newline between them. Each paragraph wraps to several visual lines.
const PROSE = [
  "Nobody finishes a Nepali web series. Not the writers, the audience. Episode three is where they stop, and it is the same week every time.",
  "I read forty of them looking for what they had in common. The drop is not boredom, and it is not budget either.",
  "Every one of them opens by asking a question, and almost none of them answers it before the audience has to decide whether to come back.",
  "Move the answer to episode two and the shape of the whole thing changes.",
].join("\n\n");

const page_html = (cls) => `
<style>*{box-sizing:border-box;margin:0}${css}
.rel{position:relative}.wfull{width:100%}.mx816{max-width:816px}
.flex{display:flex}.col{flex-direction:column}.minw0{min-width:0}</style>
<div class="screenplay-container" style="height:900px">
  <div class="wfull mx816 flex col minw0">
    <div class="rel wfull flex">
      <textarea class="screenplay-page ${cls}" id="page"></textarea>
    </div>
  </div>
</div>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });

/**
 * Where `paintBand` would put the band, against where the caret really is.
 *
 * The real position is measured with a mirror: a div with the textarea's own
 * metrics, holding the text up to the caret, whose last rendered rect is the
 * caret's line. That is a measurement of the browser's own wrapping rather
 * than a second guess at it.
 */
async function drift(cls, label, text = PROSE) {
  await page.setContent(page_html(cls));
  await page.addScriptTag({ content: `${caretLineSrc}\nwindow.caretLineTop = caretLineTop;` });
  const out = await page.evaluate((text) => {
    const ta = document.getElementById("page");
    ta.value = text;
    const caret = text.length;              // caret at the very end
    ta.selectionStart = ta.selectionEnd = caret;

    const cs = getComputedStyle(ta);
    const lineHeight = parseFloat(cs.lineHeight);
    const padTop = parseFloat(cs.paddingTop);

    // What paintBand computes today.
    const hardLines = text.slice(0, caret).split("\n").length - 1;
    const predicted = padTop + hardLines * lineHeight;

    // What the SHIPPED code computes, injected above as `caretLineTop`.
    const shipped = window.caretLineTop(ta);

    // An independent reading of the same thing: the browser's own range
    // geometry, which knows nothing about either implementation.
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:absolute;visibility:hidden;white-space:pre-wrap;word-wrap:break-word;" +
      `top:0;left:-9999px;width:${ta.clientWidth}px;padding:${cs.padding};` +
      `font:${cs.font};line-height:${cs.lineHeight};letter-spacing:${cs.letterSpacing}`;
    probe.textContent = text;
    document.body.appendChild(probe);
    const range = document.createRange();
    range.setStart(probe.firstChild, caret);
    range.setEnd(probe.firstChild, caret);
    // No padding term: the probe already carries the element's own padding,
    // so its border-box top to the range top IS the offset the band wants.
    // Adding paddingTop again put every reading exactly one top-margin out,
    // which on the screenplay page is 96px and reads as a tidy 4.0 lines.
    const actual = range.getBoundingClientRect().top - probe.getBoundingClientRect().top;
    probe.remove();

    return { predicted, shipped, actual, lineHeight, hardLines };
  }, text);

  const off = Math.abs(out.shipped - out.actual);
  const wasOff = Math.abs(out.predicted - out.actual);
  console.log(`${label.padEnd(22)} caret at ${out.actual.toFixed(0).padStart(4)}px  ` +
              `shipped ${out.shipped.toFixed(0).padStart(4)}px (${(off / out.lineHeight).toFixed(1)} lines out)  ` +
              `counting newlines would be ${(wasOff / out.lineHeight).toFixed(1)} lines out`);
  return { off, wasOff, lineHeight: out.lineHeight };
}

// A real screenplay, where the lines are short and mostly do not wrap. This
// is the content the current implementation was written against, and it is
// the fair test of whether the bug was ever visible there.
const SCREENPLAY = [
  "INT. CHIYA PASAL, PATAN - MORNING",
  "",
  "Steam rises off the kettle.",
  "",
  "SUNITA",
  "Timro result aayo?",
  "",
  "RAAJA",
  "Bholi.",
  "",
  "SUNITA",
  "Bholi bhaneko kahile?",
].join("\n");

const spReal = await drift("", "screenplay (real)", SCREENPLAY);
const sp = await drift("", "screenplay (prose)");
const vp = await drift("video-page", "video page");
await browser.close();

console.log();
// One line-height of slack: the band is a soft gradient and being half a line
// out is invisible. Past a full line it is highlighting the wrong sentence.
const TOLERANCE = 1.0;
let failed = false;
for (const [name, r] of [["screenplay (real)", spReal], ["screenplay (prose)", sp], ["video", vp]]) {
  if (r.off > r.lineHeight * TOLERANCE) {
    console.log(`FAIL: on the ${name} page the focus band is ` +
                `${(r.off / r.lineHeight).toFixed(1)} lines from the caret.`);
    failed = true;
  }
}
if (failed) process.exit(1);
console.log("OK: the focus band sits on the caret's line on both pages.");
