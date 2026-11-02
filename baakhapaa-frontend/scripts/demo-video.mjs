/**
 * Record real footage of the product, for both demo videos.
 *
 * The cards used to be rendered here too, as stills. They are motion clips
 * now (`demo-motion.mjs`, and the motion-graphics engine for the release
 * note), so this script does one job: drive the running application and
 * record what it does.
 *
 * Footage, not mockups. An investor who has seen a hundred decks has seen a
 * hundred mockups, and the thing worth showing here is that it runs.
 *
 * REFUSES TO RUN AGAINST PRODUCTION. This machine's `.env` holds live
 * Anthropic, OpenAI and Supabase keys, so the default state of a running
 * backend here is the real Postgres and a billed generation call. This script
 * registers nothing but it does type into drafts and save them, which on this
 * machine would land in production. `/health` must report `demo: true`, the
 * same gate `responsive-audit.mjs` and `editor-load-race.mjs` use.
 *
 *   # backend, with demo mode forced through the environment:
 *   SUPABASE_URL=https://your-supabase-placeholder.co DEMO_SEED=true \
 *   ANTHROPIC_API_KEY= OPENAI_API_KEY= python -m uvicorn main:app --port 8000
 *
 *   npm run dev                     # frontend on 3000
 *   node scripts/demo-video.mjs     # then scripts/demo-video-assemble.mjs
 *
 * Playwright writes one video per BrowserContext, so each beat gets its own
 * context and comes out as its own file. That is also what makes the beats
 * re-recordable one at a time: pass an id to redo just that one.
 */
import { chromium } from "playwright";
import { mkdirSync, readFileSync, renameSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = "http://localhost:3000";
const API = "http://127.0.0.1:8000";
const OUT = join(HERE, "..", "..", "docs", "demo-video");
const EMAIL = "test@example.com";
const PASSWORD = "password";

// 16:9. Recorded at this size and upscaled once at assembly, which keeps the
// app's own type large enough to read on a phone without rendering the whole
// walkthrough at 1080p.
const W = 1600;
const H = 900;

const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const wanted = (id) => !only.length || only.includes(id);

mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, "footage"), { recursive: true });

/* ── the production gate ─────────────────────────────────────────────── */
const health = await fetch(`${API}/health`).then((r) => r.json()).catch(() => null);
if (!health) {
  console.error(`No backend on ${API}. Start it in demo mode first — see this file's header.`);
  process.exit(1);
}
if (health.demo !== true || health.ai_provider !== "mock") {
  console.error(
    `REFUSING: /health reports demo=${health.demo} ai_provider=${health.ai_provider}.\n` +
    `This script types into drafts and saves them. Against a live backend that writes to\n` +
    `production Postgres and can bill a generation call. Force demo mode in the backend's\n` +
    `environment (see this file's header) and run it again.`,
  );
  process.exit(1);
}
console.log(`backend: demo=${health.demo} ai=${health.ai_provider} — safe to record\n`);

const NEPALI_DRAFT = readFileSync(join(HERE, "demo", "nepali-draft.txt"), "utf8");

const VIDEO_DRAFT = [
  "## HOOK - 0:15",
  "",
  "Nobody finishes a Nepali web series. Not the writers — the audience.",
  "Episode three is where they stop, and it is the same week every time.",
  "",
  "[ON SCREEN: episode 3]",
  "",
  "## PROMISE - 0:58",
  "",
  "I read forty of them. The drop is not boredom. It is a promise nobody kept.",
  "",
  "## SEGMENT 1 - 3:30",
  "",
  "Every one of them opens by asking a question. Almost none of them answers it",
  "before the audience has to decide whether to come back.",
  "",
  "[B-ROLL: the same three-episode arc, side by side]",
  "",
  "## SEGMENT 2 - 3:30",
  "",
  "The second thing they share is cheaper to fix. The midpoint does not flip.",
  "",
  "## PAYOFF - 2:40",
  "",
  "Move the answer to episode two and the curve changes shape.",
  "",
  "## CTA - 0:28",
  "",
  "Write the answer first. Then decide which episode it lands in.",
].join("\n");

const log = (s) => console.log(`  ${s}`);

const browser = await chromium.launch();

/* ── footage ─────────────────────────────────────────────────────────── */
/**
 * One beat. `fn` drives the page; the video lands under `footage/<id>.webm`.
 *
 * Playwright names the file itself and only flushes it on context.close(), so
 * the rename happens after closing rather than before.
 */
async function beat(id, fn) {
  if (!wanted(id)) return;
  const dir = join(OUT, "footage", `.tmp-${id}`);
  mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    recordVideo: { dir, size: { width: W, height: H } },
  });
  const page = await context.newPage();
  try {
    await fn(page);
  } catch (e) {
    console.error(`  ${id}: ${e.message.split("\n")[0]}`);
  }
  await context.close();
  const made = readdirSync(dir).filter((f) => f.endsWith(".webm"));
  if (!made.length) { console.error(`  ${id}: no video written`); return; }
  const dest = join(OUT, "footage", `${id}.webm`);
  renameSync(join(dir, made[0]), dest);
  log(`${id}.webm`);
}

const signIn = async (page) => {
  await page.goto(`${APP}/login`);
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 20000 });
};

/** Open a project from the dashboard by title. */
const openProject = async (page, titleRe) => {
  await page.goto(`${APP}/dashboard`);
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: titleRe }).first().click();
  await page.waitForTimeout(5000);
};

/**
 * Type, visibly.
 *
 * `fill` is instant, which reads as a cut rather than as writing. This types
 * in chunks: fast enough not to spend the beat, slow enough to look like a
 * person is at the keyboard.
 */
async function typeDraft(page, field, text, chunk = 24, pause = 55) {
  await field.click();
  for (let i = 0; i < text.length; i += chunk) {
    await field.press("End").catch(() => {});
    await page.keyboard.insertText(text.slice(i, i + chunk));
    await page.waitForTimeout(pause);
  }
}

console.log("\nfootage:");

// 2 · Nepali, checked in Nepali. The claim the whole pitch rests on, so the
// footage has to show the findings arriving rather than a panel already open.
await beat("02-linter", async (page) => {
  await signIn(page);
  await openProject(page, /^Open Chiya Pasal/);
  const editor = page.getByLabel("Screenplay");
  await editor.waitFor({ timeout: 20000 });
  await editor.fill("");
  // Typed fast on purpose. The beat's narration is about the FINDINGS, so the
  // typing is throat-clearing -- the first cut of this spent ten of its
  // sixteen seconds watching a draft appear and left under four seconds of
  // the panel the voice was describing.
  await typeDraft(page, editor, NEPALI_DRAFT, 60, 28);
  await page.keyboard.press("Control+s");
  await page.waitForTimeout(2000);
  await page.getByRole("button", { name: /^Craft$/i }).click();
  await page.waitForTimeout(9000);
});

// 3 · Craft retrieved against this draft, by line.
await beat("03-craft", async (page) => {
  await signIn(page);
  await openProject(page, /^Open Chiya Pasal/);
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /Patterns/i }).first().click();
  await page.waitForTimeout(6000);
  await page.mouse.wheel(0, 320);
  await page.waitForTimeout(2500);
});

// 4 · The course.
await beat("04-course", async (page) => {
  await signIn(page);
  await page.goto(`${APP}/learn`);
  await page.waitForTimeout(3500);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(2000);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(2000);
});

// 5 · Long-form video: sections in the document, and the Outline reading them.
await beat("05-video", async (page) => {
  await signIn(page);
  await openProject(page, /^Open Why Nepali web series/);
  const editor = page.getByLabel(/Screenplay|Script|Draft/).first();
  await editor.waitFor({ timeout: 20000 });
  await editor.fill("");
  await typeDraft(page, editor, VIDEO_DRAFT, 40, 40);
  await page.keyboard.press("Control+s");
  await page.waitForTimeout(3000);
  await page.getByRole("tab", { name: "Outline" }).click().catch(() => {});
  await page.waitForTimeout(5000);
});

// 7 · Three gateways on the pricing page. Shown because "Khalti and eSewa" is
// a claim about the market, and the page is the evidence it is built.
await beat("07-pricing", async (page) => {
  await signIn(page);
  await page.goto(`${APP}/pricing`);
  await page.waitForTimeout(3000);
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(2500);
});

// u04 · the keymap, for the release note. Tab in a video script opens a cue
// where Tab in a screenplay would indent to a dialogue column — the clearest
// one-gesture demonstration that the two formats now have separate rules.
await beat("u04-keys", async (page) => {
  await signIn(page);
  await openProject(page, /^Open Why Nepali web series/);
  const editor = page.getByLabel(/Screenplay|Script|Draft/).first();
  await editor.waitFor({ timeout: 20000 });
  await editor.fill("## HOOK - 0:15\n\nNobody finishes a Nepali web series.\n\n");
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.waitForTimeout(1800);
  // Tab, then type into the cue it opened: the caret has to land INSIDE the
  // bracket, which is the part of the behaviour worth filming.
  await page.keyboard.press("Tab");
  await page.waitForTimeout(1400);
  await page.keyboard.insertText("the same three-episode arc");
  await page.waitForTimeout(1800);
  await page.keyboard.press("Control+s");
  await page.waitForTimeout(2500);
});


/* ── the tutorial (TUTORIAL_VIDEO_PLAN.md) ──────────────────────────────── */
/**
 * Typed at a person's pace. The other videos type in chunks because the
 * typing is not the point; here it IS the point — a viewer is watching which
 * key does what — so every key arrives on its own.
 */
const typeSlow = (page, text, delay = 85) => page.keyboard.type(text, { delay });

/** The tutorial's project, opened with an empty page and the caret in it. */
const TUTORIAL_TITLE = "Bus Park";
async function openTutorialPage(page, content = "") {
  await signIn(page);
  await openProject(page, new RegExp(`^Open ${TUTORIAL_TITLE}`));
  const editor = page.getByLabel("Screenplay");
  await editor.waitFor({ timeout: 20000 });
  await editor.fill(content);
  await editor.click();
  await page.keyboard.press("Control+End");
  return editor;
}

// 1 · a new project
await beat("t01-project", async (page) => {
  await signIn(page);
  await page.goto(`${APP}/projects/new`);
  await page.waitForTimeout(1500);
  const title = page.getByLabel(/Project Title/i).or(page.getByPlaceholder(/title/i)).first();
  await title.click();
  await typeSlow(page, TUTORIAL_TITLE, 110);
  await page.waitForTimeout(600);
  await page.getByText("Short Film", { exact: true }).click();
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: /Create project/i }).click();
  await page.waitForTimeout(4500);
});

// 2 · the scene heading: i, Tab, a place, a dash, a time
await beat("t02-heading", async (page) => {
  await openTutorialPage(page);
  await page.waitForTimeout(1200);
  await typeSlow(page, "i", 0);
  await page.waitForTimeout(1300);          // let the suggestion strip be seen
  await page.keyboard.press("Tab");
  await page.waitForTimeout(700);
  await typeSlow(page, "BUS PARK, KALANKI - ");
  await typeSlow(page, "n", 0);
  await page.waitForTimeout(1200);
  await page.keyboard.press("Tab");
  await page.waitForTimeout(1800);
});

// 3 · action, character, dialogue, and back
await beat("t03-dialogue", async (page) => {
  await openTutorialPage(page, "INT. BUS PARK, KALANKI - NIGHT");
  await page.waitForTimeout(900);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
  await typeSlow(page, "Engines idle. SITA waits under the timetable.", 45);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(600);
  await page.keyboard.press("Tab");
  await page.waitForTimeout(800);
  await typeSlow(page, "SITA");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(700);
  await typeSlow(page, "Pokhara jane bus kahile?", 60);
  await page.waitForTimeout(500);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1800);
});

// 4 · Nepali typing: switch to अ, type it as it sounds
await beat("t04-nepali", async (page) => {
  await openTutorialPage(page,
    "INT. BUS PARK, KALANKI - NIGHT\n\nEngines idle. SITA waits under the timetable.\n\n" +
    " ".repeat(22) + "RAM\n" + " ".repeat(10));
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: "अ" }).click();
  await page.waitForTimeout(1200);
  await page.getByLabel("Screenplay").click();
  await page.keyboard.press("Control+End");
  await typeSlow(page, "namaste ", 140);
  await page.waitForTimeout(2600);
  await page.getByRole("button", { name: "A", exact: true }).click();
});

// 5 · the craft check, on a draft that has something to find
await beat("t05-craft", async (page) => {
  await signIn(page);
  await openProject(page, /^Open Chiya Pasal/);
  const editor = page.getByLabel("Screenplay");
  await editor.waitFor({ timeout: 20000 });
  await editor.fill(NEPALI_DRAFT);
  await page.keyboard.press("Control+s");
  await page.waitForTimeout(3500);          // margin dots arrive with the lint
  await page.getByRole("button", { name: /^Craft$/i }).click();
  await page.waitForTimeout(5000);
});

// 6 · Read my page, then the door to everything else
await beat("t06-assist", async (page) => {
  await signIn(page);
  await openProject(page, /^Open Chiya Pasal/);
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /^Assist$/i }).click().catch(() => {});
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Read my page" }).click();
  await page.waitForTimeout(4200);
  await page.getByRole("button", { name: /Ask about something specific/i }).click();
  await page.waitForTimeout(2600);
});

// 7 · Corkboard, then Outline
await beat("t07-views", async (page) => {
  await signIn(page);
  await openProject(page, /^Open Chiya Pasal/);
  await page.waitForTimeout(1200);
  await page.getByRole("tab", { name: "Corkboard" }).click();
  await page.waitForTimeout(3600);
  await page.getByRole("tab", { name: "Outline" }).click();
  await page.waitForTimeout(3600);
});

// 8 · File: the export formats, shown rather than downloaded
await beat("t08-export", async (page) => {
  await signIn(page);
  await openProject(page, /^Open Chiya Pasal/);
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /^File$/ }).click();
  await page.waitForTimeout(1200);
  await page.getByRole("menuitem", { name: /Export PDF/ }).hover();
  await page.waitForTimeout(3600);
  await page.keyboard.press("Escape");
});

// 9 · the course
await beat("t09-learn", async (page) => {
  await signIn(page);
  await page.goto(`${APP}/learn`);
  await page.waitForTimeout(3000);
  await page.mouse.wheel(0, 320);
  await page.waitForTimeout(2600);
});

await browser.close();
console.log("\nnext: node scripts/demo-video-assemble.mjs");

