import React from "react";
import { render, screen } from "@testing-library/react";

/**
 * The Pen — the guide who teaches the script page during onboarding.
 *
 * A nib rather than a creature, deliberately. Duolingo's owl works because
 * language learning is social and a mascot can be encouraging about it; this is
 * a craft tool for people who take the work seriously, and a cartoon
 * congratulating a screenwriter reads as condescension fast. The nib is the
 * instrument itself, expressive through posture rather than expression.
 *
 * The tests below are about that restraint holding: mood must change the
 * drawing, never add a face, and the flourish must appear only on a pass.
 */

 
import ThePen from "./ThePen";

it("is a labelled image, not decoration", () => {
  // It carries meaning — which mood it is in tracks what the guide just said.
  render(<ThePen mood="pleased" />);

  expect(screen.getByRole("img", { name: /The Pen, pleased/ })).toBeInTheDocument();
});

it("defaults to idle rather than failing on an unknown mood", () => {
  const { container } = render(<ThePen mood="nonsense" />);

  expect(container.querySelector("svg").style.transform).toBe("rotate(0deg)");
});

it("changes posture with mood", () => {
  const { container: thinking } = render(<ThePen mood="thinking" />);
  const { container: nudging } = render(<ThePen mood="nudging" />);

  expect(thinking.querySelector("svg").style.transform).toBe("rotate(-12deg)");
  expect(nudging.querySelector("svg").style.transform).toBe("rotate(10deg)");
});

it("draws the flourish only when pleased", () => {
  // One stroke of ink, and only on a pass. The reward for a correct slugline
  // should look like writing, not like a slot machine.
  const { container: pleased } = render(<ThePen mood="pleased" />);
  const { container: idle } = render(<ThePen mood="idle" />);

  const strokeOf = (c) =>
    Array.from(c.querySelectorAll("path")).find((p) => p.getAttribute("d")?.startsWith("M18 55"));

  expect(strokeOf(pleased).getAttribute("opacity")).toBe("1");
  expect(strokeOf(idle).getAttribute("opacity")).toBe("0");
});

it("takes its colour from the surrounding text, so it works in both themes", () => {
  const { container } = render(<ThePen />);

  const painted = Array.from(container.querySelectorAll("[stroke], [fill]"));
  const literals = painted.filter((el) => {
    const v = `${el.getAttribute("stroke") || ""}${el.getAttribute("fill") || ""}`;
    return v && !v.includes("currentColor") && v !== "none";
  });
  expect(literals).toHaveLength(0);
});

it("scales without distorting", () => {
  const { container } = render(<ThePen size={96} />);
  const svg = container.querySelector("svg");

  expect(svg.getAttribute("viewBox")).toBe("0 0 64 64");
  expect(svg.getAttribute("width")).toBe("96");
  expect(svg.getAttribute("height")).toBe("96");
});

it("fills and strokes the SAME path, so the two cannot disagree", () => {
  /* The bug this replaces: the fill was a pentagon with square lower corners
     (`...L40 40 L24 40 Z`) while the outline was a kite converging to a point.
     The fill spilled outside the stroke along both lower flanks and the mark
     read as a diamond with pale shoulders instead of a nib. Two paths that
     have to agree by hand will eventually not. */
  const { container } = render(<ThePen />);
  const paths = [...container.querySelectorAll("path")];

  const filled = paths.filter((p) => p.getAttribute("fill") === "currentColor");
  const stroked = paths.filter(
    (p) => p.getAttribute("stroke") === "currentColor" && p.getAttribute("stroke-linejoin")
  );

  expect(filled).toHaveLength(1);
  expect(stroked).toHaveLength(1);
  expect(filled[0].getAttribute("d")).toBe(stroked[0].getAttribute("d"));
});

it("is a nib, not a diamond: short shoulder, long taper", () => {
  /* A diamond has its waist in the middle. A nib carries it high, with a long
     taper to the tip -- that ratio is the whole difference between the two
     readings at 44px. */
  const { container } = render(<ThePen />);
  const d = container.querySelector("path[fill='currentColor']").getAttribute("d");

  const ys = [...d.matchAll(/-?\d+(?:\.\d+)?\s+(-?\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  const waist = ys.sort((a, b) => a - b)[1];   // the shoulder corners

  expect(waist - top).toBeLessThan((bottom - waist) * 0.75);
});
