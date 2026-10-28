/* Walk the product through its interface, as a writer would (Month 4, Day 19).
 *
 *   node scripts/walk.mjs [screenshot-dir]      # app :3000, api :8000
 *
 * Four journeys, UI only — no API shortcuts, because the point is what a
 * person meets: sign up from the landing page; a screenplay from blank page to
 * PDF; a long-form video from scaffold to PDF; a course lesson through the
 * mandatory-section check; a short through the rhythm meter. It RECORDS: every
 * console error, every failed request and every step it could not complete,
 * printed in order at the end. It fixes nothing.
 *
 * Its first run found course mode unreachable from the interface, a caret race
 * that split B-roll cues, a stale "Generate Project Structure" button and a
 * free-plan limit that named a URL as text. Each was fixed with a test first.
 *
 * It WRITES — registers an account and creates projects — so, like
 * responsive-audit.mjs, it refuses unless /health reports demo mode.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const APP = process.env.WALK_APP || "http://localhost:3000";
const API = process.env.WALK_API || "http://localhost:8000";
const out = process.argv[2] || "walk-screens";
mkdirSync(out, { recursive: true });
const health = await fetch(`${API}/health`).then((r) => r.json()).catch(() => null);
if (!health || health.demo !== true) {
  console.error(`Refusing to run: ${API} is not a demo-mode backend (health: ${JSON.stringify(health)}). ` +
    "This walk registers an account and creates projects.");
  process.exit(2);
}
const notes = [];
const note = (walk, what) => { notes.push(`[${walk}] ${what}`); console.log(`  - ${what}`); };

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true });
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") note("console", m.text().replace(/%s/g,"").slice(0, 700)); });
page.on("response", (r) => { if (r.status() >= 400 && !r.url().includes("/auth/me")) note("network", `${r.status()} ${r.request().method()} ${r.url().replace(API, "")}`); });
let shot = 0;
const snap = async (name) => page.screenshot({ path: `${out}/w19-${String(++shot).padStart(2, "0")}-${name}.png` });

async function step(walk, label, fn) {
  try { await fn(); } catch (e) { note(walk, `STUCK at "${label}": ${String(e.message).split("\n")[0].slice(0, 160)}`); await snap(`stuck-${walk}`); return false; }
  return true;
}

// --- sign up as a stranger, from the landing page -------------------------
console.log("walk 0: sign up");
await page.goto(APP + "/", { waitUntil: "networkidle" });
await step("signup", "landing CTA", () => page.getByRole("link", { name: /Start writing — free/ }).first().click());
const email = `walker${Date.now()}@example.com`;
await step("signup", "fill form", async () => {
  await page.getByLabel("Full Name").fill("Sita Walker");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("Walk-through-2026!");
  await page.getByLabel("Confirm Password").fill("Walk-through-2026!");
  await page.locator("button[type=submit]").click();
  await page.waitForURL(/onboarding|dashboard/, { timeout: 15000 });
});
await snap("after-signup");
await step("signup", "skip onboarding", async () => {
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.waitForURL(/dashboard/, { timeout: 10000 });
});

async function newProject(walk, { title, format, extra }) {
  await page.goto(APP + "/projects/new", { waitUntil: "networkidle" });
  await page.getByLabel(/Title/i).first().fill(title);
  await page.getByRole("button", { name: new RegExp(format) }).first().click();
  if (extra) await extra();
  await snap(`${walk}-wizard`);
  await page.getByRole("button", { name: /Create project/ }).click();
  await page.waitForURL(/\/editor/, { timeout: 20000 });
  await page.waitForTimeout(1500);
}
const editor = () => page.getByLabel("Screenplay");

// --- walk 1: screenplay, blank page to export -----------------------------
console.log("walk 1: screenplay");
if (await step("screenplay", "create", () => newProject("screenplay", { title: "Sapana", format: "Short Film" }))) {
  await snap("screenplay-blank");
  await step("screenplay", "type with shortcuts", async () => {
    await editor().click();
    await page.keyboard.type("i");
    await page.keyboard.press("Tab");
    await page.keyboard.type("CHIYA PASAL - DAY");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Sita sets two glasses on the counter. One has no sugar.");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    await page.keyboard.type("SITA");
    await page.keyboard.press("Enter");
    await page.keyboard.type("You never supported me.");
    await page.waitForTimeout(2500);
  });
  await snap("screenplay-typed");
  const text = await editor().inputValue();
  if (!/^INT\./m.test(text)) note("screenplay", `the "i" + Tab shortcut did not produce INT. — page reads: ${JSON.stringify(text.slice(0, 80))}`);
  const dots = await page.locator('[data-testid="page-notes"] button[aria-expanded]').count();
  if (!dots) note("screenplay", "no margin note appeared for an on-the-nose line");
  await step("screenplay", "finalize", async () => {
    await page.getByRole("button", { name: /Finalize & Storyboard/ }).click();
    await page.waitForTimeout(2000);
    await snap("screenplay-review");
    const anyway = page.getByRole("button", { name: /Finalize anyway/ });
    if (await anyway.count()) await anyway.click();
    await page.waitForTimeout(2000);
  });
  await snap("screenplay-after-finalize");
  await step("screenplay", "export PDF", async () => {
    if (!/\/editor/.test(page.url())) await page.goBack();
    await page.waitForTimeout(1000);
    await page.getByRole("button", { name: "Export" }).click();
    const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), page.getByRole("menuitem", { name: /^PDF/ }).click()]);
    note("screenplay", `exported ${dl.suggestedFilename()} (ok)`);
  });
}

// --- walk 2: long-form video, scaffold to export --------------------------
console.log("walk 2: long-form");
if (await step("long-form", "create", () => newProject("longform", { title: "Why nobody finishes", format: "Long-form Video" }))) {
  await snap("longform-blank");
  const scaffold = page.getByRole("button", { name: /scaffold|spine|sections|Use this/i });
  if (await scaffold.count()) {
    await step("long-form", "accept scaffold", () => scaffold.first().click());
  } else note("long-form", "no scaffold offered on the empty page");
  await page.waitForTimeout(800);
  const t1 = await editor().inputValue();
  if (!/## HOOK/.test(t1)) note("long-form", "after the scaffold the page has no ## HOOK");
  await step("long-form", "write narration", async () => {
    await editor().click();
    await page.keyboard.press("Control+End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Nobody finishes a Nepali web series. I watched forty of them.");
    await page.keyboard.press("Tab");
    await page.keyboard.type("forty thumbnails in a grid");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1500);
  });
  const t2 = await editor().inputValue();
  if (!/\[B-ROLL: forty thumbnails in a grid\]\n/.test(t2)) note("long-form", `Tab then Enter did not leave a closed cue: ${JSON.stringify(t2.slice(-80))}`);
  await snap("longform-written");
  await step("long-form", "export PDF", async () => {
    await page.getByRole("button", { name: "Export" }).click();
    const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), page.getByRole("menuitem", { name: /^PDF/ }).click()]);
    note("long-form", `exported ${dl.suggestedFilename()} (ok)`);
  });
}

// --- walk 3: a course lesson through the mandatory-section check ----------
console.log("walk 3: course");
if (await step("course", "create a course project", () => newProject("course", { title: "Sluglines", format: "Long-form Video",
    extra: () => page.getByRole("button", { name: /Course lesson/ }).click() }))) {
  const scaffold = page.getByRole("button", { name: /scaffold|spine|sections|Use this/i });
  const offered = await scaffold.count();
  if (!offered) note("course", "no course scaffold offered on the empty page");
  await step("course", "write a lesson with no EXERCISE", async () => {
    await editor().click();
    await page.keyboard.type("## OBJECTIVE");
    await page.keyboard.press("Enter");
    await page.keyboard.type("By the end you can write a slugline.");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.type("## CONCEPT");
    await page.keyboard.press("Enter");
    await page.keyboard.type("A slugline says where and when.");
    await page.waitForTimeout(2000);
  });
  await step("course", "finalize and read the review", async () => {
    await page.getByRole("button", { name: /Finalize & Storyboard/ }).click();
    await page.waitForTimeout(2000);
    await snap("course-review");
    const body = await page.evaluate(() => document.body.innerText);
    if (!/exercise/i.test(body)) note("course", "the review said nothing about the missing EXERCISE");
    else note("course", "review named the missing exercise (ok)");
  });
}

// --- walk 4: a short through the rhythm meter ------------------------------
console.log("walk 4: short");
// Four formats on a free account is one more than the plan holds. Take the
// free way out the limit message offers: delete a finished project.
await step("short", "free a slot by deleting a finished project", async () => {
  await page.goto(APP + "/dashboard", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Delete Sapana" }).click();
  await page.getByRole("button", { name: /^Delete$/ }).click();
  await page.waitForTimeout(1500);
  if (await page.getByText("Sapana", { exact: true }).count()) throw new Error("Sapana is still listed after Delete");
});
if (await step("short", "create", () => newProject("short", { title: "Chiya Break", format: "Short-form" }))) {
  await step("short", "write", async () => {
    await editor().click();
    await page.keyboard.type("Nepali web series run far too long. The writing is often rather weak. The acting is usually rather poor. The budget is always far too small.");
    await page.waitForTimeout(2600);
  });
  if (!(await page.locator('[data-testid="rhythm-meter"]').count())) note("short", "no rhythm meter on a short-form draft");
  else note("short", `meter: ${(await page.locator('[data-testid="rhythm-meter"]').innerText()).replace(/\s+/g, " ").slice(0, 160)}`);
  await snap("short-meter");
}

await b.close();
console.log("\nNOTES\n" + notes.join("\n"));
const stuck = notes.filter((n) => /STUCK|network|console/.test(n));
if (stuck.length) process.exit(1);
