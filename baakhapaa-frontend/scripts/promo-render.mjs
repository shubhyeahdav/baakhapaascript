/**
 * Render the promo film to MP4, one frame at a time.
 *
 * `scripts/promo/film.html` draws every frame from a single number, the time,
 * through `window.seek(t)`. This steps that clock at a fixed rate and
 * screenshots each frame, so the video is frame-accurate however slow the
 * machine is — wall-clock recording (demo-motion.mjs) drops frames under load,
 * which is the problem PROMO_MOTION.md names Remotion as the fix for. This is
 * the same idea without the dependency.
 *
 *   node scripts/promo-render.mjs                     # docs/promo/baakhapaa-promo-en.mp4
 *   node scripts/promo-render.mjs --stills 3,15,25    # PNG stills only, to check a frame
 *   node scripts/promo-render.mjs --fps 24 --scale 0.5
 *
 * Needs ffmpeg on PATH and network access for Google Fonts (the film's
 * typefaces are the product's own: Spectral, Mukta, Courier Prime).
 */
import { chromium } from "playwright";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const FILM = join(HERE, "promo", "film.html");
const OUT_DIR = join(HERE, "..", "..", "docs", "promo");

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const FPS = Number(opt("fps", 30));
const SCALE = Number(opt("scale", 1));
const STILLS = opt("stills", null);
const OUT = opt("out", join(OUT_DIR, "baakhapaa-promo-en.mp4"));

mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: SCALE,
  reducedMotion: "no-preference",
});
await page.goto(`${pathToFileURL(FILM).href}#render`, { waitUntil: "networkidle" });
// Fonts before the first frame: a frame drawn in the fallback face and the
// next in Spectral reads as a glitch, not a cut.
await page.evaluate(() => document.fonts.ready);
const families = await page.evaluate(() =>
  ["Spectral", "Mukta", "Courier Prime"].map((f) => [f, document.fonts.check(`20px "${f}"`)]),
);
const missing = families.filter(([, ok]) => !ok).map(([f]) => f);
if (missing.length) {
  console.error(`fonts did not load: ${missing.join(", ")} — the film would render in a fallback face.`);
  process.exit(1);
}
const DURATION = await page.evaluate(() => window.DURATION);

if (STILLS) {
  for (const s of STILLS.split(",").map(Number)) {
    await page.evaluate((t) => window.seek(t), s);
    const path = join(OUT_DIR, `still-${String(s).replace(".", "_")}.png`);
    await page.screenshot({ path });
    console.log(`  ${path}`);
  }
  await browser.close();
  process.exit(0);
}

const frames = join(OUT_DIR, ".frames");
if (existsSync(frames)) rmSync(frames, { recursive: true });
mkdirSync(frames, { recursive: true });

const total = Math.round(DURATION * FPS);
const started = Date.now();
for (let f = 0; f <= total; f += 1) {
  await page.evaluate((t) => window.seek(t), f / FPS);
  await page.screenshot({ path: join(frames, `${String(f).padStart(5, "0")}.jpg`), type: "jpeg", quality: 92 });
  if (f % (FPS * 5) === 0) {
    const s = ((Date.now() - started) / 1000).toFixed(0);
    console.log(`  frame ${f}/${total}  (${s}s)`);
  }
}
// The poster: the frame a muted autoplay-refused player shows, and what
// prefers-reduced-motion gets instead of the film.
await page.evaluate(() => window.seek(26));
await page.screenshot({ path: join(OUT_DIR, "baakhapaa-promo-en-poster.jpg"), type: "jpeg", quality: 90 });
await browser.close();

// No audio track: the film is made to be read with the sound off, and a
// silent track still costs bytes on mobile data.
const ff = spawnSync(
  "ffmpeg",
  [
    "-y", "-loglevel", "error",
    "-framerate", String(FPS), "-i", join(frames, "%05d.jpg"),
    "-c:v", "libx264", "-preset", "slow", "-crf", "21",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    ...(SCALE !== 1 ? ["-vf", `scale=${Math.round(1920 * SCALE)}:-2`] : []),
    OUT,
  ],
  { stdio: "inherit" },
);
if (ff.status !== 0) process.exit(ff.status || 1);
rmSync(frames, { recursive: true });
console.log(`wrote ${OUT}`);
