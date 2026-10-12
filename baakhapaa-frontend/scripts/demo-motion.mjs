/**
 * Record the animated cards, each for exactly as long as its narration needs.
 *
 * Playwright records a page at wall-clock time, so a CSS keyframe and a
 * counting number come out as motion. That is the whole reason the cards are
 * HTML rather than stills with an ffmpeg zoom on them: a number that counts
 * from 16 to 90 is the argument of that beat, and a pan over a static "90%"
 * is not the same claim.
 *
 *   C:/addeity-video/.venv-tts/Scripts/python.exe scripts/demo/voice.py
 *   node scripts/demo-motion.mjs
 *   node scripts/demo-assemble.mjs
 *
 * Reads `voice/lines.json`, so the voice is the clock. A beat that also cuts
 * to footage holds its card for `hold` seconds and leaves the rest of the
 * line to the clip.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync, existsSync, renameSync, readdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { motionHtml } from "./demo/motion.js";
import { pickComposition } from "./demo/compositions.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "docs", "demo-video");
const CARDS = join(OUT, "motion");

const W = 1920, H = 1080;
// Recording starts a shade before the page settles, and the last frame of a
// webm is worth having spare when the assembler crossfades into it.
const TAIL = 0.35;

const linesPath = join(OUT, "voice", "lines.json");
if (!existsSync(linesPath)) {
  console.error(`No ${linesPath}.\nRun:  C:/addeity-video/.venv-tts/Scripts/python.exe scripts/demo/voice.py`);
  process.exit(1);
}
const VOICE = JSON.parse(readFileSync(linesPath, "utf8"));

mkdirSync(CARDS, { recursive: true });

const COMP = pickComposition(process.argv.slice(2));
const BEATS = COMP.beats;
const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const wanted = (id) => !only.length || only.includes(id);

const browser = await chromium.launch();
console.log(`animated cards (${COMP.name}):`);

for (const beat of BEATS) {
  if (!wanted(beat.id)) continue;

  const line = VOICE[beat.voice];
  if (!line) throw new Error(`no narration recorded for ${beat.voice}`);
  // A beat that cuts to footage shows its card for `hold`; one that does not
  // holds for the whole line.
  const seconds = (beat.hold ?? line.seconds) + TAIL;

  const html = join(CARDS, `${beat.id}.html`);
  writeFileSync(html, motionHtml(beat), "utf8");

  const dir = join(CARDS, `.tmp-${beat.id}`);
  mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    recordVideo: { dir, size: { width: W, height: H } },
    // The animations are time-based, so a throttled or reduced-motion
    // preference would record a still. Say plainly that motion is wanted.
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  await page.goto(`file:///${html.replace(/\\/g, "/")}`);
  // Fonts before motion: a card that starts animating in the fallback face
  // and reflows mid-rise looks broken rather than designed.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(seconds * 1000);
  await context.close();

  const made = readdirSync(dir).filter((f) => f.endsWith(".webm"));
  if (!made.length) { console.error(`  ${beat.id}: no video written`); continue; }
  renameSync(join(dir, made[0]), join(CARDS, `${beat.id}.webm`));
  rmSync(dir, { recursive: true, force: true });

  const note = beat.hold ? `card ${beat.hold}s of ${line.seconds}s line` : `${line.seconds}s`;
  console.log(`  ${beat.id.padEnd(14)} ${note}`);
}

await browser.close();
console.log("\nnext: node scripts/demo-assemble.mjs");
