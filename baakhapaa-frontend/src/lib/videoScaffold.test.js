import {
  essaySpine, courseSpine, spineText, scaffoldFor, clock,
  segmentCount, HOOK_SECONDS, MIN_SEGMENTS, MAX_SEGMENTS,
} from "./videoScaffold";
import { elementOf, ELEMENTS, sectionAt } from "../utils/videoFormat";

/** Headings in a block of scaffold text, as the editor classifies them. */
const headingsIn = (text) =>
  text.split("\n").filter((l) => l.trim() && elementOf(l) === ELEMENTS.HEADING);

/**
 * The spine a long-form project opens with.
 *
 * The arithmetic test is the one that matters: a writer chooses twelve
 * minutes, and if the sections add to 11:58 the Outline reports a drift the
 * writer did not cause, on the first screen they ever see.
 */

describe("the essay targets add up to the runtime chosen", () => {
  // Every runtime the product offers for this format, and the edges either
  // side of the segment-count thresholds.
  for (const minutes of [8, 9, 10, 11, 12, 14, 15, 16, 18, 20, 22, 25]) {
    it(`${minutes} minutes`, () => {
      const total = essaySpine(minutes).reduce((s, r) => s + r.seconds, 0);
      expect(total).toBe(minutes * 60);
    });
  }

  it("holds for a runtime shorter than the hook", () => {
    // Not a real project, but the arithmetic must not go negative.
    const rows = essaySpine(0.1);
    expect(rows.reduce((s, r) => s + r.seconds, 0)).toBe(6);
    expect(rows.every((r) => r.seconds >= 0)).toBe(true);
  });
});

describe("the shape of the essay spine", () => {
  const rows = essaySpine(12);

  it("opens on a hook and closes on a CTA", () => {
    expect(rows[0].kind).toBe("hook");
    expect(rows[rows.length - 1].kind).toBe("cta");
  });

  it("caps the hook in absolute seconds rather than as a share", () => {
    // The window in which a viewer decides to stay is about as long whether
    // the video runs eight minutes or twenty-five; a share would give a
    // 25-minute essay a 45-second hook.
    expect(essaySpine(8)[0].seconds).toBe(HOOK_SECONDS);
    expect(essaySpine(25)[0].seconds).toBe(HOOK_SECONDS);
  });

  it("gives a longer video more segments, within bounds", () => {
    expect(segmentCount(8)).toBeGreaterThanOrEqual(MIN_SEGMENTS);
    expect(segmentCount(25)).toBeLessThanOrEqual(MAX_SEGMENTS);
    expect(segmentCount(25)).toBeGreaterThan(segmentCount(8));
  });

  it("never gives the payoff less time than the CTA", () => {
    // The payoff absorbs the rounding, so this is the assertion that catches
    // a remainder big enough to invert the two.
    for (const m of [8, 12, 18, 25]) {
      const r = essaySpine(m);
      const payoff = r.find((x) => x.kind === "payoff").seconds;
      const cta = r.find((x) => x.kind === "cta").seconds;
      expect(payoff).toBeGreaterThan(cta);
    }
  });
});

describe("the course spine has no durations, ever", () => {
  it("leaves every section without a target", () => {
    expect(courseSpine().every((r) => r.seconds === null)).toBe(true);
  });

  it("has the five course sections in order", () => {
    expect(courseSpine().map((r) => r.kind))
      .toEqual(["objective", "concept", "proof", "exercise", "check"]);
  });

  it("writes no clock into the text", () => {
    // A lesson has no runtime to drift from. A number here would be invented
    // to fill a column.
    expect(spineText(courseSpine())).not.toMatch(/\d:\d\d/);
  });
});

describe("what it writes is what the parser reads", () => {
  // The scaffold's whole value is that the Outline, the Corkboard and the
  // retention shape populate the moment it is inserted. That only holds if
  // every line it writes parses as a heading.
  it("writes essay headings the parser recognises", () => {
    const text = spineText(essaySpine(12));
    expect(headingsIn(text).length).toBe(essaySpine(12).length);
  });

  it("writes course headings the parser recognises", () => {
    const text = spineText(courseSpine());
    expect(headingsIn(text).length).toBe(5);
  });

  it("round-trips a target through the parser", () => {
    // `## HOOK - 0:15` has to come back as 15 seconds, or the Outline shows a
    // target the scaffold never set.
    const text = spineText(essaySpine(12));
    const first = sectionAt(text, 1);
    expect(first.name).toBe("HOOK");
    expect(first.targetSeconds).toBe(HOOK_SECONDS);
  });
});

describe("clock", () => {
  it("formats M:SS", () => {
    expect(clock(15)).toBe("0:15");
    expect(clock(60)).toBe("1:00");
    expect(clock(185)).toBe("3:05");
  });

  it("never emits a negative or a bare second", () => {
    expect(clock(-5)).toBe("0:00");
    expect(clock(5)).toBe("0:05");
  });
});

describe("scaffoldFor", () => {
  it("returns nothing for a screenplay", () => {
    // A screenplay's first scene is a human's invention, and the wizard was
    // deliberately stopped from guessing it.
    for (const format of ["short", "film", "web_series", "short_form", undefined]) {
      expect(scaffoldFor({ format, durationMinutes: 12 })).toBeNull();
    }
  });

  it("returns an essay spine for a long-form project", () => {
    const s = scaffoldFor({ format: "long_form", videoCategory: "essay", durationMinutes: 12 });
    expect(s.mode).toBe("essay");
    expect(s.rows[0].kind).toBe("hook");
  });

  it("returns the course spine for a course project", () => {
    const s = scaffoldFor({ format: "long_form", videoCategory: "course", durationMinutes: 12 });
    expect(s.mode).toBe("course");
    expect(s.rows.every((r) => r.seconds === null)).toBe(true);
  });

  it("ignores the runtime entirely in course mode", () => {
    const a = scaffoldFor({ format: "long_form", videoCategory: "course", durationMinutes: 8 });
    const b = scaffoldFor({ format: "long_form", videoCategory: "course", durationMinutes: 25 });
    expect(a.text).toBe(b.text);
  });
});
