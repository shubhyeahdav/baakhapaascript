/**
 * Capture the screenshots the monthly progress reports embed.
 *
 * Reports are read by people who will not run the system, so a figure is the
 * only evidence they get. Recapturing by hand meant the Month 1 shots were
 * still in the Month 2 report after the editor had changed underneath them.
 *
 * Requires both servers running (backend on 8000, frontend on 3000) and the
 * demo seed account, which is what DEMO_SEED=true exists for.
 *
 *   node scripts/capture-screenshots.mjs              # every month's set
 *   node scripts/capture-screenshots.mjs --only m4    # this month's only
 *
 * `--only m4` exists because a full run re-captures the Month 2 and 3 figures
 * too, over the files those reports embed -- the overwrite the prefixes were
 * introduced to prevent. Recapture an old month only on purpose.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";

const APP = "http://localhost:3000";
// Month 2 onward is prefixed. The Month 1 report's figures are a historical
// record of a system that no longer looks like this, and the first run of this
// script overwrote four of them.
const OUT = "../docs/screenshots";
// The demo seed account by default. The seed is only created on an EMPTY
// users table, so a local database that already has accounts in it needs
// another: CAPTURE_EMAIL / CAPTURE_PASSWORD name one, onboarded already.
const EMAIL = process.env.CAPTURE_EMAIL || "test@example.com";
const PASSWORD = process.env.CAPTURE_PASSWORD || "password";
const API = "http://localhost:8000";
const ONLY = (process.argv.find((a, i) => process.argv[i - 1] === "--only") || "").toLowerCase();

// A screenplay with enough in it that every panel has something to show. A
// two-line fixture produces figures that prove nothing.
const DRAFT = [
  "INT. CHIYA PASAL, PATAN - MORNING",
  "",
  "Steam rises off the kettle. SANJANA wipes the counter without looking at it.",
  "",
  "SANJANA",
  "Timro result aayo?",
  "",
  "RAAJA",
  "Bholi.",
  "",
  "SANJANA",
  "Bholi bhaneko kahile? Timi hardin bholi bhanchhau.",
  "",
  "EXT. BAGMATI BRIDGE - DUSK",
  "",
  "Raaja waits at the rail, watching the water go under.",
  "",
  "RAAJA",
  "Ma pani aaunchu. Tara aile hoina.",
  "",
  "INT. CALL CENTRE, NAXAL - NIGHT",
  "",
  "Forty people saying the same sentence in different voices.",
  "",
  "SANJANA",
  "Good evening, thank you for calling.",
  "",
].join("\n");

mkdirSync(OUT, { recursive: true });

const shot = async (page, name, note) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  ${name}.png  ${note}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

console.log("capturing:");

await page.goto(`${APP}/login`);
await page.waitForTimeout(1200);
if (ONLY !== "m4") await shot(page, "m2-01-login", "sign-in");

await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL(/dashboard/, { timeout: 15000 });
await page.waitForTimeout(1500);
if (ONLY === "m4") {
  await month4();
  await browser.close();
  console.log("done");
  process.exit(0);
}
await shot(page, "m2-02-dashboard", "projects");

// Open the first project. The card carries aria-label="Open <title>", which
// is a real handle rather than a guess at DOM shape.
await page.getByRole("button", { name: /^Open / }).first().click();
await page.waitForTimeout(5000);
const editor = page.getByLabel("Screenplay");
await editor.waitFor({ timeout: 15000 });
await editor.fill(DRAFT);
await page.keyboard.press("Control+s");
await page.waitForTimeout(4000);
await shot(page, "m2-04-script-editor", "editor, rail and assist panel");

await page.getByRole("tab", { name: "Corkboard" }).click();
await page.waitForTimeout(1200);
await shot(page, "m2-07-corkboard", "scenes beside the page, not over it");

await page.getByRole("tab", { name: "Cast" }).click();
await page.waitForTimeout(3500);
// Expanding a voice is the point of the figure, but a missed click must not
// abort the run and lose the shots after it.
await page.locator("aside button").filter({ hasText: "SANJANA" }).first()
  .click({ timeout: 8000 }).catch(() => console.log("  (cast not expanded)"));
await page.waitForTimeout(1000);
await shot(page, "m2-08-cast", "one voice read end to end");

await page.getByRole("tab", { name: "Script" }).click();
await page.getByRole("button", { name: /^Craft$/i }).click();
await page.waitForTimeout(3500);
await shot(page, "m2-09-craft", "linter, draft statistics and corpus benchmark");

await page.goto(`${APP}/pricing`);
await page.waitForTimeout(1500);
await shot(page, "m2-06-pricing", "tiers");

/* ---- Month 3 ------------------------------------------------------------
   Prefixed, like m2, because a report's figures are a record of the system as
   it was. Overwriting them is how the Month 1 shots ended up in the Month 2
   report after the editor had changed underneath them. */

await page.goto(`${APP}/dashboard`);
await page.waitForTimeout(1200);
await page.getByRole("button", { name: /^Open / }).first().click();
await page.waitForTimeout(5000);

// The gate added this month. The demo account is on a paid tier, so what it
// meets is the first-draft prompt rather than the paywall -- which is the
// whole point of `lockReason`.
// NOT anchored: a locked tab reads "Generate ✦", so /^Generate$/ never matches
// and the catch below would swallow the miss silently.
await page.getByRole("button", { name: /Generate/i }).first().click();
await page.waitForTimeout(1500);
await shot(page, "m3-01-first-draft-gate", "AI opens on a finished draft, not a blank page");

// Diagnosis-first retrieval: the patterns are anchored to lines in THIS draft
// rather than answering a typed complaint.
await page.getByRole("button", { name: /Patterns/i }).first().click();
await page.waitForTimeout(4000);
await shot(page, "m3-02-patterns-diagnosed", "craft found in the draft, by line");

// The free, deterministic half of the product: linter, draft statistics,
// corpus benchmark and the coverage report. No AI call anywhere in this view.
await page.getByRole("button", { name: /^Craft$/i }).click();
await page.waitForTimeout(3500);
await shot(page, "m3-03-craft-free", "linter, statistics and benchmark -- zero AI cost");

// The course. Nineteen lessons, free on every tier, graded by the linter
// rather than by a Next button.
await page.goto(`${APP}/learn`);
await page.waitForTimeout(2500);
await shot(page, "m3-04-course", "two tracks, graded by the craft linter");

await month4();

await browser.close();
console.log("done");

/* ---- Month 4 ------------------------------------------------------------
   The page a stranger sees, feedback on the page itself, the short-form
   instruments, the video rail with no invented pages, and the course in
   Nepali. Projects are made through the API so each figure starts from a
   known draft; the screens themselves are the real UI. */
async function month4() {
  const token = await page.evaluate(() => localStorage.getItem("token"));
  const api = async (method, path, body) => {
    const r = await fetch(API + path, { method, body: body ? JSON.stringify(body) : undefined,
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${await r.text()}`);
    return r.json();
  };
  const project = async (body, draft) => {
    const p = await api("POST", "/projects/", { genre: "Drama", tone: "Wry", language: "English",
      duration_minutes: 10, target_audience: "Youth", ...body });
    const sc = await api("GET", `/scripts/project/${p.id}`);
    await api("PUT", `/scripts/${sc.id}`, { content: draft });
    return sc.id;
  };
  const open = async (scriptId) => {
    await page.goto(`${APP}/projects/${scriptId}/editor`);
    await page.getByLabel("Screenplay").waitFor({ timeout: 15000 });
    await page.waitForTimeout(3000);
  };

  // Signed out: `/` sends a signed-in writer to their projects.
  const stranger = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await stranger.goto(`${APP}/`, { waitUntil: "networkidle" });
  await stranger.waitForTimeout(3500);
  await shot(stranger, "m4-01-landing", "the page a stranger sees, with the linter's real output");
  await stranger.goto(`${APP}/tour`, { waitUntil: "networkidle" });
  await stranger.getByRole("button", { name: "Rewritten" }).click();
  await stranger.waitForTimeout(1500);
  await stranger.evaluate(() => window.scrollTo(0, 300));
  await shot(stranger, "m4-02-tour-rewrite", "the same scene rewritten: zero notes, held to the linter by a test");
  await stranger.close();

  const nepali = await readFile(new URL("./demo/nepali-draft.txt", import.meta.url), "utf8");
  await open(await project({ title: "Sapana", language: "Nepali" }, nepali));
  await page.locator('[data-testid="page-notes"] button[aria-expanded]').nth(2).click()
    .catch(() => console.log("  (no margin note to open)"));
  await page.waitForTimeout(600);
  await shot(page, "m4-03-margin-notes", "the linter's notes beside the lines they are about");

  await open(await project({ title: "Chiya Break", format: "short_form", duration_seconds: 45,
    hook_type: "question", short_form_category: "storytime" },
  "Why does nobody finish a Nepali web series?\nI watched forty of them.\n\nThe writing is often quite weak. The acting is often quite poor. The budget is always far too small.\n"));
  await shot(page, "m4-04-rhythm-meter", "rhythm, the flattest run by line, and the rehook observation");

  await open(await project({ title: "Why nobody finishes", format: "long_form", video_category: "essay" },
    "## HOOK - 0:15\nNobody finishes a Nepali web series.\n\n## PROMISE - 0:45\nBy the end you will know why.\n\n## PROOF - 3:00\n[ON SCREEN: 40 series]\nI watched forty of them.\n"));
  await shot(page, "m4-05-video-rail", "sections show their kind and written against target, never a page");

  await page.evaluate(() => localStorage.setItem("baakhapaa:lang", "ne"));
  await page.goto(`${APP}/learn`);
  await page.waitForTimeout(2500);
  await shot(page, "m4-06-course-nepali", "the course in Nepali, module headers and grader included");
  await page.evaluate(() => localStorage.setItem("baakhapaa:lang", "en"));
}
