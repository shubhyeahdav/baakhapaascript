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
 *   node scripts/capture-screenshots.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const APP = "http://localhost:3000";
// Month 2 onward is prefixed. The Month 1 report's figures are a historical
// record of a system that no longer looks like this, and the first run of this
// script overwrote four of them.
const OUT = "../docs/screenshots";
const EMAIL = "test@example.com";
const PASSWORD = "password";

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
await shot(page, "m2-01-login", "sign-in");

await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL(/dashboard/, { timeout: 15000 });
await page.waitForTimeout(1500);
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

await browser.close();
console.log("done");
