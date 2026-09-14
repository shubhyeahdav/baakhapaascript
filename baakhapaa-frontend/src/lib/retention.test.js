/* The shape of a long-form video.
 *
 * The logic lives in a pure function so it can be tested here; the component is
 * a few lines of markup over the result. Most of what matters is arithmetic
 * (proportions, timecodes, where a mark falls) and restraint — the tests about
 * what it must NOT claim are as load-bearing as the ones about what it draws.
 */
import { describe, it, expect } from "vitest";
import { shape, sectionSeconds, timecode, ATTENTION_MARKS } from "./retention";

const s = (over = {}) => ({
  heading: "HOOK - 0:15",
  section_kind: "hook",
  target_seconds: 15,
  written_seconds: 0,
  ...over,
});

describe("reading a section's length", () => {
  it("prefers what was planned", () => {
    expect(sectionSeconds(s({ target_seconds: 15, written_seconds: 40 }))).toBe(15);
  });

  it("falls back to what was written", () => {
    /* A writer sketching an outline should not have to decide every section's
       length before writing a word — so a section with no target still has to
       take up its share of the bar, or an unplanned draft renders as nothing. */
    expect(sectionSeconds(s({ target_seconds: null, written_seconds: 42 }))).toBe(42);
  });

  it("is zero when there is neither", () => {
    expect(sectionSeconds(s({ target_seconds: null, written_seconds: 0 }))).toBe(0);
  });

  it("survives a malformed row", () => {
    // Reached on every render of the Outline, including before anything loads.
    expect(sectionSeconds(undefined)).toBe(0);
    expect(sectionSeconds({})).toBe(0);
    expect(sectionSeconds({ target_seconds: "banana" })).toBe(0);
  });
});

describe("the bands", () => {
  it("run in document order with each starting where the last ended", () => {
    const { bands } = shape([
      s({ heading: "HOOK", target_seconds: 30 }),
      s({ heading: "SEGMENT", section_kind: "segment", target_seconds: 120 }),
      s({ heading: "PAYOFF", section_kind: "payoff", target_seconds: 60 }),
    ]);

    expect(bands.map((b) => b.heading)).toEqual(["HOOK", "SEGMENT", "PAYOFF"]);
    expect(bands.map((b) => b.startSeconds)).toEqual([0, 30, 150]);
  });

  it("are proportional to the runtime", () => {
    const { bands, total } = shape([
      s({ target_seconds: 60 }),
      s({ target_seconds: 180, section_kind: "segment" }),
    ]);

    expect(total).toBe(240);
    expect(bands[0].share).toBeCloseTo(0.25);
    expect(bands[1].share).toBeCloseTo(0.75);
  });

  it("keeps a very short section visible", () => {
    /* A fifteen-second hook in a twenty-five-minute video is 1% of the bar and
       would render as a hairline nobody can see or hover. The instrument exists
       to show exactly that section. */
    const { bands } = shape([
      s({ target_seconds: 15 }),
      s({ target_seconds: 1485, section_kind: "segment" }),
    ]);

    expect(bands[0].share).toBeGreaterThanOrEqual(0.02);
  });

  it("reports written against planned without judging it", () => {
    // "3:10 written against 3:00 planned" is a fact. "Your segment is too long"
    // is a claim this cannot support — a long segment is wrong in most videos
    // and exactly right in some.
    const { bands } = shape([s({ target_seconds: 180, written_seconds: 190 })]);

    expect(bands[0].overrunSeconds).toBe(10);
  });

  it("claims no overrun when nothing was planned", () => {
    const { bands } = shape([s({ target_seconds: null, written_seconds: 190 })]);

    expect(bands[0].overrunSeconds).toBe(0);
  });
});

describe("the attention marks", () => {
  it("places the absolute ones at a real time, not a proportion", () => {
    /* Thirty seconds is thirty seconds whether the video runs eight minutes or
       twenty-five. Treating it as a fraction would move the steepest drop in
       the video depending on how long the video is, which is backwards. */
    const short = shape([s({ target_seconds: 600, section_kind: "segment" })]);
    const long = shape([s({ target_seconds: 1500, section_kind: "segment" })]);

    const a = short.marks.find((m) => m.key === "opening");
    const b = long.marks.find((m) => m.key === "opening");

    expect(a.atSeconds).toBe(30);
    expect(b.atSeconds).toBe(30);
    expect(b.position).toBeLessThan(a.position);
  });

  it("places the midpoint proportionally, because that is what middle means", () => {
    const { marks } = shape([s({ target_seconds: 600, section_kind: "segment" })]);

    expect(marks.find((m) => m.key === "midpoint").position).toBeCloseTo(0.5);
  });

  it("drops a mark that falls past the end of the video", () => {
    /* A ninety-second piece has no "still here at a minute" moment worth
       drawing at 67% of the bar. Showing it anyway would be the instrument
       inventing a reading. */
    const { marks } = shape([s({ target_seconds: 45, section_kind: "segment" })]);

    expect(marks.map((m) => m.key)).not.toContain("settled");
  });

  it("never asserts a fault", () => {
    /* The rule MilestoneNote already follows, and the reason this is
       trustworthy at all: the curve is a convention, not something this
       repository can measure. Every note describes where viewers generally go.
       None tells a writer their video is wrong. */
    for (const mark of ATTENTION_MARKS) {
      expect(mark.note).toBeTruthy();
      expect(mark.note).not.toMatch(/\byour\b/i);
      expect(mark.note).not.toMatch(/too (long|short|slow)/i);
    }
  });
});

describe("saying nothing when there is nothing to say", () => {
  it("returns an empty shape for no sections", () => {
    expect(shape([])).toEqual({ total: 0, bands: [], marks: [] });
    expect(shape()).toEqual({ total: 0, bands: [], marks: [] });
  });

  it("returns an empty shape when nothing is planned or written", () => {
    // A bar of equal grey blocks would be an invented shape — the instrument
    // showing a reading it does not have.
    expect(shape([s({ target_seconds: null, written_seconds: 0 })]).bands).toEqual([]);
  });

  it("survives rows that are not there", () => {
    expect(shape([null, undefined]).bands).toEqual([]);
  });
});

describe("timecode", () => {
  it("reads in minutes and seconds, because a hook is 15 seconds", () => {
    expect(timecode(15)).toBe("0:15");
    expect(timecode(195)).toBe("3:15");
    expect(timecode(600)).toBe("10:00");
  });

  it("pads the seconds", () => {
    expect(timecode(65)).toBe("1:05");
  });

  it("does not produce a negative clock", () => {
    expect(timecode(-5)).toBe("0:00");
    expect(timecode(undefined)).toBe("0:00");
  });
});
