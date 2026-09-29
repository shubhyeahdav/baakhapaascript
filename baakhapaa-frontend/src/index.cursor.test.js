import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The pen cursor must be held like a pen, and must point where it says.
 *
 * Until 2026-09-29 the nib was drawn at the top-left (`M2 2`) with the barrel
 * trailing down to `19 19`, and the hotspot sat on `2 2`. That is the geometry
 * of an ARROW: held that way a writer is writing with the back end of the pen,
 * and the pixel the browser points at floats above the line of text rather
 * than resting on it.
 *
 * Two properties, both checkable from the stylesheet alone, which matters
 * because nothing else in this repository can see a cursor: `vite.config.js`
 * sets `css: false`, so jsdom renders every component with no stylesheet, and
 * neither Playwright script screenshots the OS pointer.
 */
const CSS = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

/** Every `.cursor-pen` rule in the sheet, one per theme. */
function penRules() {
  return CSS.split("\n").filter((l) => l.includes("cursor: url(") && l.includes("text;"));
}

/** The nib tip — the first point of the first path — and the declared hotspot. */
function geometryOf(rule) {
  const nib = /d='M([\d.]+) ([\d.]+)/.exec(rule);
  const hot = /"\)\s+([\d.]+)\s+([\d.]+),/.exec(rule);
  return {
    nib: nib && { x: Number(nib[1]), y: Number(nib[2]) },
    hotspot: hot && { x: Number(hot[1]), y: Number(hot[2]) },
  };
}

test("there is a pen cursor for each paper theme", () => {
  expect(penRules().length).toBe(2);
});

test("the hotspot is the nib tip, not a corner", () => {
  // If these drift apart, the cursor points somewhere the ink does not land,
  // and clicking puts the caret a few pixels from where the writer aimed.
  for (const rule of penRules()) {
    const { nib, hotspot } = geometryOf(rule);
    expect(nib).not.toBeNull();
    expect(hotspot).not.toBeNull();
    expect(hotspot).toEqual(nib);
  }
});

test("the nib rests on the line rather than floating above it", () => {
  // The SVG is 24x24. A nib in the TOP half is an arrow; a pen held over paper
  // has its point low and its barrel rising away to the right.
  for (const rule of penRules()) {
    const { nib } = geometryOf(rule);
    expect(nib.y).toBeGreaterThan(12);
  }
});

test("the barrel rises to the right of the nib", () => {
  // The stroke is the barrel: it must end up and to the right of where it
  // starts, or the pen is lying the wrong way along the page.
  for (const rule of penRules()) {
    const stroke = /d='M([\d.]+) ([\d.]+) L([\d.]+) ([\d.]+)' stroke/.exec(rule);
    expect(stroke).not.toBeNull();
    const [, x1, y1, x2, y2] = stroke.map(Number);
    expect(x2).toBeGreaterThan(x1);
    expect(y2).toBeLessThan(y1);
  }
});
