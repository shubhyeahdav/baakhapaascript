/* Does the blank-page prompt sit on the paper?
 *
 * Run it: `node scripts/page-layout-check.mjs` — no dev server, no login, no
 * database. That is the point: the backend on this machine writes to
 * production Supabase, so a layout check that needs an account is a layout
 * check nobody runs.
 *
 * WHAT THIS DUPLICATES, AND WHY THAT IS ACCEPTABLE HERE
 * ----------------------------------------------------
 * The markup below is a COPY of ScriptPage's structure, not the component, so
 * it can drift from the real thing. The structural half of this rule is
 * therefore pinned in `ScriptPage.test.jsx` against the real component, where
 * drift is impossible — that test fails if the container ever holds two
 * in-flow children again.
 *
 * What only this file can do is measure. jsdom has no layout engine and
 * vite.config.js sets `css: false`, so the 267px number below cannot be
 * produced by any test in the suite. This is here to show the consequence in
 * pixels; ScriptPage.test.jsx is here to catch the cause.
 *
 *
 * `.screenplay-container` is display:flex / justify-content:center, so its
 * DIRECT CHILDREN are columns in a row. PenPrompt is absolutely positioned
 * across the container and centres itself there. The two only line up while
 * the container has exactly ONE child — a second one shifts the paper and the
 * prompt stays put.
 *
 * No test in the repo can see this: vite.config.js sets css:false for vitest.
 * So it is measured in a real engine, against the real stylesheet, on the real
 * component markup — with no dev server and no login, because the backend on
 * this machine writes to production Supabase.
 */
import { chromium } from "playwright";
import { readFileSync } from "fs";

// Resolved from this file, not from an absolute path and not from the
// working directory. It was hardcoded to a path on one Windows machine,
// so this script passed there and failed on every CI run with ENOENT --
// the layout job has never once executed the check it exists for.
const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8")
  // Strip the Tailwind directives; the handful of utilities the markup needs
  // are declared explicitly below, so what is under test is the real
  // .screenplay-container / .screenplay-page rules.
  .replace(/@tailwind[^;]*;/g, "");

const shell = (children) => `
<style>
*{box-sizing:border-box;margin:0}
${css}
.rel{position:relative}.wfull{width:100%}.mx816{max-width:816px}
.flex{display:flex}.col{flex-direction:column}.minw0{min-width:0}
.abs{position:absolute;left:0;right:0;top:7rem;z-index:10;
     display:flex;justify-content:center;padding:0 1.5rem}
.inner{max-width:28rem;width:100%;text-align:center}
</style>
<div class="screenplay-container" style="height:900px">
  <div class="abs" id="prompt"><div class="inner">Every scene starts by saying where we are and when.</div></div>
  ${children}
</div>`;

// What shipped in 291937b: the note wrapper as a SECOND flex child.
const broken = shell(`
  <div class="rel wfull mx816 flex"><textarea class="screenplay-page" id="page"></textarea></div>
  <div class="wfull mx816" id="note"></div>`);

// The fix: one child, a column holding the page and the note.
const fixed = shell(`
  <div class="wfull mx816 flex col minw0">
    <div class="rel wfull flex"><textarea class="screenplay-page" id="page"></textarea></div>
    <div id="note"></div>
  </div>`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });

async function measure(html, label) {
  await page.setContent(html);
  const r = await page.evaluate(() => {
    const c = (el) => { const b = el.getBoundingClientRect(); return b.left + b.width / 2; };
    return {
      paper: c(document.getElementById("page")),
      prompt: c(document.getElementById("prompt").firstElementChild),
      paperBox: document.getElementById("page").getBoundingClientRect().toJSON(),
      promptBox: document.getElementById("prompt").firstElementChild.getBoundingClientRect().toJSON(),
    };
  });
  const drift = Math.abs(r.paper - r.prompt);
  const spill = Math.max(0, r.paperBox.left - r.promptBox.left)
              + Math.max(0, r.promptBox.right - r.paperBox.right);
  console.log(`${label.padEnd(28)} paper centre ${r.paper.toFixed(0).padStart(5)}  ` +
              `prompt centre ${r.prompt.toFixed(0).padStart(5)}  ` +
              `drift ${drift.toFixed(0).padStart(4)}px  spill ${spill.toFixed(0)}px`);
  return { drift, spill };
}

const b = await measure(broken, "as shipped (2 children)");
const f = await measure(fixed, "fixed (1 child)");
await browser.close();

console.log();
if (b.drift < 20) { console.log("HARNESS INVALID: it did not reproduce the bug"); process.exit(2); }
if (f.drift > 1)  { console.log(`FAIL: still off by ${f.drift.toFixed(0)}px`); process.exit(1); }
console.log(`OK: reproduced the ${b.drift.toFixed(0)}px drift, and the fix removes it.`);
