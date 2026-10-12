/**
 * Cut the recorded beats into one file.
 *
 * ffmpeg does the editing. Remotion is not in this repository and adding a
 * second video toolchain to render nine cards and five screen recordings
 * would be a lot of dependency for a straight cut.
 *
 * Three things this does that matter to how it reads:
 *
 *   SPEED. The footage is a real person's pace -- typing a Nepali scene takes
 *   as long as it takes. Each beat carries a `speed` chosen so the action is
 *   still legible but the video stays near one hundred seconds, which is
 *   roughly as long as a demo holds a room.
 *
 *   CROSSFADES, not cuts. A hard cut from a near-black card to a near-black
 *   app screenshot reads as a glitch. `xfade` is chained across every segment,
 *   with each offset accumulated from the running total.
 *
 *   NO AUDIO. Every point is on screen, which is also the rule the product's
 *   own marketing follows: most of this will be watched muted.
 *
 *   node scripts/demo-video-assemble.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CARDS } from "./demo/cards.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "docs", "demo-video");
const WORK = join(OUT, ".work");
const FINAL = join(OUT, "baakhapaa-demo.mp4");

const W = 1920, H = 1080, FPS = 30;
const XFADE = 0.5;            // seconds of overlap between segments

/**
 * The cut. `card` plays a still for its own duration; `clip` plays footage,
 * sped up and trimmed to `hold`.
 *
 * The alternation is deliberate: a claim, then the product doing the thing the
 * claim describes. An investor should never have to take a card's word for it.
 */
const SEQUENCE = [
  { card: "01-gap" },
  { card: "02-linter" },
  { clip: "02-linter", speed: 1.35, hold: 12.5 },
  { card: "03-craft" },
  { clip: "03-craft", speed: 2.0, hold: 10 },
  { card: "04-course" },
  { clip: "04-course", speed: 1.45, hold: 8 },
  { card: "05-video" },
  { clip: "05-video", speed: 1.4, hold: 12 },
  { card: "06-moat" },
  { card: "07-economics" },
  { clip: "07-pricing", speed: 1.3, hold: 7 },
  { card: "08-standing" },
  { card: "09-end" },
];

const ff = (args) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args], { stdio: "inherit" });
const secondsOf = (f) =>
  Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration",
    "-of", "csv=p=0", f]).toString().trim());

if (existsSync(WORK)) rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

/* ── normalise every segment to one format ───────────────────────────── */
// Mixing a 1600x900 webm and a 1920x1080 png in one filter graph without
// doing this first is how you get a concat that silently drops frames.
const parts = [];
console.log("normalising:");

for (const [i, step] of SEQUENCE.entries()) {
  const dest = join(WORK, `${String(i).padStart(2, "0")}.mp4`);

  if (step.card) {
    const meta = CARDS.find((c) => c.id === step.card);
    if (!meta) throw new Error(`no card named ${step.card}`);
    const src = join(OUT, "cards", `${step.card}.png`);
    // A still at 30fps for its own duration. `fade` on both ends so a card
    // arrives rather than appearing.
    ff(["-y", "-loop", "1", "-t", String(meta.seconds), "-i", src,
        "-vf", `scale=${W}:${H},fps=${FPS},format=yuv420p,` +
               `fade=t=in:st=0:d=0.45,fade=t=out:st=${(meta.seconds - 0.45).toFixed(2)}:d=0.45`,
        "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-an", dest]);
    parts.push({ file: dest, seconds: meta.seconds, label: `card ${step.card}` });
    console.log(`  card  ${step.card}  ${meta.seconds}s`);
  } else {
    const src = join(OUT, "footage", `${step.clip}.webm`);
    if (!existsSync(src)) throw new Error(`missing footage: ${src} — run demo-video.mjs first`);
    const raw = secondsOf(src);
    const sped = raw / step.speed;
    const hold = Math.min(step.hold, sped);
    // setpts before trim, so `hold` is measured in OUTPUT seconds.
    ff(["-y", "-i", src,
        "-vf", `setpts=${(1 / step.speed).toFixed(4)}*PTS,scale=${W}:${H}:flags=lanczos,` +
               `fps=${FPS},format=yuv420p,trim=0:${hold.toFixed(2)},setpts=PTS-STARTPTS`,
        "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-an", dest]);
    parts.push({ file: dest, seconds: hold, label: `clip ${step.clip}` });
    console.log(`  clip  ${step.clip}  ${raw.toFixed(1)}s -> ${hold.toFixed(1)}s at ${step.speed}x`);
  }
}

/* ── chain the crossfades ────────────────────────────────────────────── */
// Each xfade consumes XFADE seconds of overlap, so the running offset is the
// total so far minus one overlap per transition already applied.
const inputs = parts.flatMap((p) => ["-i", p.file]);
let filter = "";
let cursor = "[0:v]";
let elapsed = parts[0].seconds;

for (let i = 1; i < parts.length; i++) {
  const offset = elapsed - XFADE;
  const out = i === parts.length - 1 ? "[v]" : `[x${i}]`;
  filter += `${cursor}[${i}:v]xfade=transition=fade:duration=${XFADE}:offset=${offset.toFixed(3)}${out};`;
  cursor = out;
  elapsed = offset + XFADE + parts[i].seconds - XFADE;
}
filter = filter.replace(/;$/, "");

console.log(`\nassembling ${parts.length} segments, ~${elapsed.toFixed(1)}s`);
ff(["-y", ...inputs, "-filter_complex", filter, "-map", "[v]",
    "-c:v", "libx264", "-preset", "slow", "-crf", "18",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", FINAL]);

const got = secondsOf(FINAL);
console.log(`\n${FINAL}`);
console.log(`${got.toFixed(1)}s`);
rmSync(WORK, { recursive: true, force: true });
