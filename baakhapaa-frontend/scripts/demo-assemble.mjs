/**
 * Cut the animated cards, the footage and the narration into one file.
 *
 * THE VOICE IS THE CLOCK. Every segment's length comes from `voice/lines.json`
 * rather than from a number someone chose, so the picture cannot drift off the
 * narration. That is also why there are no crossfades between beats: a
 * crossfade consumes real time at each join and the audio would walk away from
 * the picture a little more at every one. The cards animate themselves in, so
 * the transition is already there.
 *
 * Inside a beat the cut from card to footage is a straight cut, on the voice,
 * which is where a cut belongs anyway.
 *
 *   C:/addeity-video/.venv-tts/Scripts/python.exe scripts/demo/voice.py
 *   node scripts/demo-motion.mjs
 *   node scripts/demo-assemble.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { BEATS } from "./demo/motion.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "docs", "demo-video");
const WORK = join(OUT, ".work");
const FINAL = join(OUT, "baakhapaa-demo.mp4");

const W = 1920, H = 1080, FPS = 30;
// Breath after each narration line. Long enough that two beats do not run
// together, short enough that a pitch does not feel like it is waiting.
const GAP = 0.5;

const ff = (a) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", ...a], { stdio: "inherit" });
const dur = (f) => Number(execFileSync("ffprobe",
  ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString().trim());

const VOICE = JSON.parse(readFileSync(join(OUT, "voice", "lines.json"), "utf8"));

if (existsSync(WORK)) rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

/* ── video: one segment per beat, exactly as long as its line + gap ──── */
const segments = [];
console.log("segments:");

for (const [i, beat] of BEATS.entries()) {
  const line = VOICE[beat.voice];
  const total = line.seconds + GAP;
  const n = String(i).padStart(2, "0");

  const cardSrc = join(OUT, "motion", `${beat.id}.webm`);
  if (!existsSync(cardSrc)) throw new Error(`missing card: ${cardSrc} — run demo-motion.mjs`);

  const cardFor = beat.clip ? beat.hold : total;
  const cardMp4 = join(WORK, `${n}a.mp4`);
  // `tpad` clones the last frame if the recording came up a hair short, which
  // it can by a frame or two. Without it the concat silently shortens and the
  // voice slides forward for the rest of the film.
  ff(["-y", "-i", cardSrc,
      "-vf", `fps=${FPS},scale=${W}:${H},format=yuv420p,` +
             `tpad=stop_mode=clone:stop_duration=2,trim=0:${cardFor.toFixed(3)},setpts=PTS-STARTPTS`,
      "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-an", cardMp4]);
  segments.push(cardMp4);

  if (beat.clip) {
    const clipSrc = join(OUT, "footage", `${beat.clip}.webm`);
    if (!existsSync(clipSrc)) throw new Error(`missing footage: ${clipSrc} — run demo-video.mjs`);
    const clipFor = total - beat.hold;
    const have = dur(clipSrc);
    // `clipFrom` when the beat names the moment, otherwise the END of the
    // recording: the findings arrive after the typing, the patterns after the
    // fetch, the gateways after the scroll, so the first seconds of each of
    // these is the part nobody needs. The tail is a good default and a bad
    // guarantee -- 02-linter opens its Craft panel 13s in, and the tail put
    // three seconds of the wrong panel under a line describing the right one.
    const from = beat.clipFrom !== undefined
      ? Math.min(beat.clipFrom, Math.max(0, have - clipFor))
      : Math.max(0, have - clipFor);
    const clipMp4 = join(WORK, `${n}b.mp4`);
    ff(["-y", "-ss", from.toFixed(3), "-i", clipSrc,
        "-vf", `fps=${FPS},scale=${W}:${H}:flags=lanczos,format=yuv420p,` +
               `tpad=stop_mode=clone:stop_duration=2,trim=0:${clipFor.toFixed(3)},setpts=PTS-STARTPTS`,
        "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-an", clipMp4]);
    segments.push(clipMp4);
    console.log(`  ${beat.id.padEnd(14)} card ${beat.hold.toFixed(1)}s + clip ${clipFor.toFixed(1)}s  (${total.toFixed(1)}s)`);
  } else {
    console.log(`  ${beat.id.padEnd(14)} card ${total.toFixed(1)}s`);
  }
}

const listFile = join(WORK, "list.txt");
writeFileSync(listFile, segments.map((s) => `file '${s.replace(/\\/g, "/")}'`).join("\n"), "utf8");
const silentVideo = join(WORK, "video.mp4");
ff(["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", silentVideo]);

/* ── audio: the same timeline, built from the same numbers ───────────── */
// Each line, then GAP of silence. Built with adelay rather than by concat so
// every line is placed at an absolute offset: a rounding error in one beat
// cannot then push every later beat out of sync.
const inputs = [];
const filters = [];
let at = 0;
BEATS.forEach((beat, i) => {
  inputs.push("-i", join(OUT, "voice", `${beat.voice}.wav`));
  const ms = Math.round(at * 1000);
  filters.push(`[${i}:a]adelay=${ms}|${ms}[a${i}]`);
  at += VOICE[beat.voice].seconds + GAP;
});
const mixed = join(WORK, "voice.wav");
ff(["-y", ...inputs,
    "-filter_complex",
    `${filters.join(";")};${BEATS.map((_, i) => `[a${i}]`).join("")}amix=inputs=${BEATS.length}:normalize=0[a]`,
    "-map", "[a]", mixed]);

console.log(`\ntimeline: ${at.toFixed(1)}s`);

/* ── together ────────────────────────────────────────────────────────── */
ff(["-y", "-i", silentVideo, "-i", mixed,
    "-map", "0:v", "-map", "1:a",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
    "-movflags", "+faststart", "-shortest", FINAL]);

const got = dur(FINAL);
console.log(`\n${FINAL}`);
console.log(`${got.toFixed(1)}s  (narration ${(at - GAP).toFixed(1)}s)`);
rmSync(WORK, { recursive: true, force: true });
