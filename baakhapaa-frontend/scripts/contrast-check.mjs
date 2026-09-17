/**
 * WCAG 1.4.3 contrast, measured rather than eyeballed.
 *
 * No test in this repository can see a colour. `vite.config.js` sets
 * `css: false`, so jsdom never evaluates a stylesheet and every assertion
 * about appearance is an assertion about class NAMES. That is how
 * `.field-label` shipped at 2.60:1 against a 4.5:1 floor — every form label in
 * the product, on the line that tells a writer which field they are typing
 * into — and how `inkMuted` came to pass on the background it was chosen
 * against and fail on the two card surfaces that carry most of the product's
 * secondary text.
 *
 * So this reads the palette as TEXT and does the arithmetic, the same trick
 * `baakhapaa-backend/tests/test_pattern_schema.py` uses on the SQL schema. It
 * needs no browser and no server, which is what lets it run in CI beside
 * `page-layout-check.mjs`.
 *
 * Three passes:
 *
 *   1. every palette token as text on every painted surface
 *   2. every hardcoded `color:` in index.css, against that rule's OWN
 *      background where it declares one — without which `.btn-gold` (dark ink
 *      on gold) and `.screenplay-page` (dark ink on white paper) read as
 *      catastrophic failures when they are in fact the most legible text here
 *   3. every `text-[#hex]/NN` in JSX, which is where the page-theme components
 *      live. An opacity modifier is the easiest way to lose contrast without
 *      changing a colour, and it is invisible in review: `text-[#6B665C]/60`
 *      reads as a colour that passes, and paints one that does not.
 *
 * Pass 3 is deliberately weak: a component can be painted on any surface, so
 * it fails only a colour that clears the floor on NONE of them. That cannot
 * produce a false positive, which is the property that matters for a check
 * that gates CI.
 *
 *     node scripts/contrast-check.mjs          # report, exit 1 on a failure
 *     node scripts/contrast-check.mjs --quiet  # failures only
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// fileURLToPath rather than `new URL(...).pathname`, which yields a leading
// slash before the drive letter on Windows and a path that does not exist.
// This runs on this Windows box and on CI's Linux, so it has to be right on
// both.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rd = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const QUIET = process.argv.includes("--quiet");

// --- WCAG 2.x relative luminance and contrast ratio --------------------------

const srgb = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
const hex = (h) => {
  h = h.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const ratio = (a, b) => {
  const l1 = lum(a), l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};
// An opacity modifier composites against whatever is behind it. Nothing else
// in this file needs alpha, because a token is always painted solid.
const over = (fg, bg, a) => fg.map((v, i) => Math.round(v * a + bg[i] * (1 - a)));

// --- what this product paints on --------------------------------------------
//
// The four dark surfaces plus the screenplay page, which is the one light
// ground in the product and the reason the page-theme components exist at all.

const SURFACES = {
  bg: "#0B0B0A",
  bgDeep: "#080807",
  surface: "#141311",
  elevated: "#191813",
};
const PAPER = "#FAF9F6";
const ALL_GROUNDS = { ...SURFACES, paper: PAPER };

const AA_NORMAL = 4.5;
const AA_LARGE = 3;

/**
 * Colours that are not text and not a meaningful graphic.
 *
 * Listed rather than silently tolerated, and printed on every run, because the
 * failure mode of an exemption list is that it grows quietly until the check
 * means nothing. Each entry needs a reason a reader can disagree with.
 *
 * Matched on file + the literal class, so changing the colour or the opacity
 * re-arms the check rather than inheriting the exemption.
 */
const EXEMPT = [
  {
    files: ["src/components/MilestoneNote.jsx", "src/components/PenPrompt.jsx"],
    match: "#8A6A18/70",
    why: "The Pen's nib, rendered by <ThePen decorative /> — a decorative SVG "
       + "with no accessible name, carrying no information the words beside it "
       + "do not. WCAG 1.4.11 exempts purely decorative graphics, and 1.4.3 is "
       + "about text. If the nib is ever given a label or made to mean "
       + "something on its own, delete this entry.",
  },
];

const css = rd("src/index.css");
const tw = rd("tailwind.config.cjs");

const failures = [];
const exempted = [];
const say = (s = "") => { if (!QUIET) console.log(s); };

// --- 1. tokens on surfaces ---------------------------------------------------

const tokens = {};
for (const m of tw.matchAll(/(\w+):\s*["']?(#[0-9a-fA-F]{3,6})["']?/g)) tokens[m[1]] = m[2];
const inks = Object.entries(tokens).filter(([k]) => /^(ink|gold|accent|sky)/i.test(k));

say("");
say("1. palette tokens as normal-size text, on each surface (floor 4.5:1)");
say("");
const head = "  " + "token".padEnd(22) + Object.keys(SURFACES).map((s) => s.padStart(10)).join("");
say(head);
say("  " + "-".repeat(head.length - 2));
for (const [k, v] of inks) {
  const cells = [];
  for (const [sname, s] of Object.entries(SURFACES)) {
    const r = ratio(hex(v), hex(s));
    cells.push((r.toFixed(2) + (r >= AA_NORMAL ? " " : "!")).padStart(10));
    if (r < AA_NORMAL) failures.push(`token ${k} (${v}) on ${sname}: ${r.toFixed(2)}:1, needs ${AA_NORMAL}`);
  }
  say("  " + (k + " " + v).padEnd(22) + cells.join(""));
}
say("");
say("  '!' marks below 4.5:1 — unusable for normal-size body text there.");

// --- 2. hardcoded colours in index.css --------------------------------------

say("");
say("2. hardcoded text colours in index.css, each against its own background");
say("");
for (const m of css.matchAll(/(?:^|\n)\s*\.([\w-]+)\s*\{([^}]*)\}/g)) {
  const body = m[2];
  const cm = body.match(/(?:^|\s|;)color:\s*(#[0-9a-fA-F]{3,6})/);
  if (!cm) continue;
  const fm = body.match(/font-size:\s*([\d.]+)px/);
  const wm = body.match(/font-weight:\s*(\d+)/);
  const bm = body.match(/background(?:-color)?:\s*(#[0-9a-fA-F]{3,6})/);

  const px = fm ? parseFloat(fm[1]) : 14;
  const weight = wm ? +wm[1] : 400;
  const large = px >= 24 || (px >= 18.66 && weight >= 700);
  const need = large ? AA_LARGE : AA_NORMAL;
  const on = bm ? bm[1] : SURFACES.bg;
  const got = ratio(hex(cm[1]), hex(on));
  const ok = got >= need;
  if (!ok) failures.push(`.${m[1]} ${cm[1]} on ${on}: ${got.toFixed(2)}:1, needs ${need}`);
  say(`  ${ok ? "pass" : "FAIL"}  ${("." + m[1]).padEnd(20)} ${cm[1]} on ${on}  ${String(px).padStart(5)}px  ${got.toFixed(2)}:1`);
}

// --- 3. text-[#hex] with an opacity modifier, anywhere in the components -----

say("");
say("3. arbitrary text colours in JSX — failed only when no surface would do");
say("");
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) return walk(p);
  return e.isFile() && e.name.endsWith(".jsx") && !e.name.endsWith(".test.jsx") ? [p] : [];
});

let checked = 0;
for (const file of walk(path.join(ROOT, "src"))) {
  const src = fs.readFileSync(file, "utf8");
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  for (const m of src.matchAll(/text-\[(#[0-9a-fA-F]{3,6})\](?:\/(\d{1,3}))?/g)) {
    const colour = m[1];
    const alpha = m[2] === undefined ? 1 : Math.min(100, +m[2]) / 100;
    checked++;
    let best = 0, bestOn = "";
    for (const [gname, g] of Object.entries(ALL_GROUNDS)) {
      const eff = alpha < 1 ? over(hex(colour), hex(g), alpha) : hex(colour);
      const r = ratio(eff, hex(g));
      if (r > best) { best = r; bestOn = gname; }
    }
    if (best < AA_NORMAL) {
      const label = `${colour}${alpha < 1 ? "/" + m[2] : ""}`;
      const waived = EXEMPT.find((e) => e.files.includes(rel) && e.match === label);
      if (waived) {
        exempted.push(`${rel}  ${label}  ${best.toFixed(2)}:1`);
        continue;
      }
      failures.push(`${rel}: ${label} reaches only ${best.toFixed(2)}:1 (best ground: ${bestOn}), needs ${AA_NORMAL}`);
      say(`  FAIL  ${rel}  ${label}  best ${best.toFixed(2)}:1 on ${bestOn}`);
    }
  }
}
say(`  ${checked} arbitrary colour uses examined.`);
if (exempted.length) {
  say("");
  say("  exempt (not text, not a meaningful graphic — see EXEMPT at the top):");
  for (const e of exempted) say("    " + e);
  for (const e of EXEMPT) say("    why: " + e.why.replace(/\s+/g, " "));
}

// --- verdict -----------------------------------------------------------------

console.log("");
if (failures.length) {
  console.log(`${failures.length} contrast failure(s):`);
  for (const f of failures) console.log("  - " + f);
  console.log("");
  console.log("WCAG 2.2 SC 1.4.3 (AA): 4.5:1 for normal text, 3:1 for large.");
  process.exit(1);
}
console.log("Contrast: every palette colour clears WCAG AA on every surface it is painted on.");
