/* When the product is allowed to speak to a writer mid-draft.
 *
 * The logic lives in a pure function precisely so it can be tested this way —
 * the rendering is a few lines of markup, and the part worth getting right is
 * which note fires and when. Most of these tests are about SILENCE, because
 * the failure mode of a feature like this is not being wrong, it is being
 * present too often.
 */
import { describe, it, expect } from "vitest";
import {
  MILESTONES,
  readFacts,
  milestoneFor,
  dismissKey,
} from "./milestones";

const facts = (over = {}) => ({
  pageCount: 0,
  plannedPages: 0,
  progress: null,
  sceneCount: 0,
  majorCount: 0,
  ...over,
});

describe("staying quiet", () => {
  it("says nothing on an empty draft", () => {
    // PenPrompt owns that moment. Two things speaking at once on a blank page
    // is worse than either alone.
    expect(milestoneFor(facts())).toBeNull();
  });

  it("says nothing about page position when no runtime was planned", () => {
    /* A draft that never went through the structure step has no plan, so
       `progress` is null rather than 0. Zero would read as "at the very start"
       and fire the inciting-incident note on every unplanned draft — which is
       most of them, since structure is now requested from inside the editor
       rather than generated on project creation. */
    const f = readFacts({ pageCount: 12, scenes: [], suggestions: null });
    expect(f.progress).toBeNull();
    expect(milestoneFor(f)).toBeNull();
  });

  it("stops speaking once the moment has passed", () => {
    // A midpoint note still on the page at page 80 is not a prompt, it is
    // furniture.
    const atMidpoint = facts({ progress: 0.5 });
    const wellPast = facts({ progress: 0.72 });

    expect(milestoneFor(atMidpoint)?.key).toBe("midpoint-flip");
    expect(milestoneFor(wellPast)).toBeNull();
  });

  it("never speaks twice about the same thing", () => {
    const f = facts({ progress: 0.5 });
    expect(milestoneFor(f, ["midpoint-flip"])).toBeNull();
  });

  it("says nothing about unmarked scenes until there are scenes to mark", () => {
    expect(milestoneFor(facts({ sceneCount: 2 }))).toBeNull();
    expect(milestoneFor(facts({ sceneCount: 3 }))?.key).toBe("scenes-unmarked");
  });

  it("goes quiet once the writer has marked one", () => {
    // The note reports a fact. When the fact stops being true it stops being
    // said — no congratulation, no follow-up.
    expect(
      milestoneFor(facts({ sceneCount: 9, majorCount: 1 })),
    ).toBeNull();
  });
});

describe("what it says", () => {
  it("reports the unmarked scenes rather than asking a question about them", () => {
    /* This is the one note built on measured fact rather than convention: the
       scene rail, the outline's act balance and the storyboard all read
       `scene_type`, so a draft with no major scene is three features reading
       zero. Everything else here asks; this one tells. */
    const m = milestoneFor(facts({ sceneCount: 7 }));
    expect(m.lead({ sceneCount: 7 })).toMatch(/7 scenes/);
    expect(m.cta.action).toBe("corkboard");
  });

  it("prefers the more timely note when two are due", () => {
    // A writer at the midpoint who never marked a scene has both. The midpoint
    // is the perishable one — the unmarked scenes will still be true tomorrow.
    const m = milestoneFor(facts({ sceneCount: 9, progress: 0.5 }));
    expect(m.key).toBe("midpoint-flip");
  });

  it("every page-position note links a lesson that exists", () => {
    /* These ids are the ids in `lessons.py`'s Story track. A typo here is a
       dead link at the exact moment the product finally has a writer's
       attention, and nothing else would catch it. */
    const storyLessons = [
      "want-need",
      "inciting",
      "stakes-of-pursuit",
      "three-acts",
      "midpoint-flip",
      "progress-is-the-trap",
      "antagonist",
      "detonate-where-safe",
      "redefine-victory",
    ];
    for (const m of MILESTONES) {
      if (m.cta.action !== "lesson") continue;
      expect(storyLessons).toContain(m.lesson);
    }
  });

  it("every note has something to say and something to press", () => {
    for (const m of MILESTONES) {
      expect(typeof m.lead).toBe("function");
      expect(m.lead(facts({ sceneCount: 4 }))).toBeTruthy();
      expect(m.body.length).toBeGreaterThan(20);
      expect(m.cta.label).toBeTruthy();
    }
  });

  it("no note asserts a fault it cannot check", () => {
    /* Nothing in this repository can tell a writer their midpoint does not
       flip — CLAUDE.md says so explicitly. These notes may ask, point and
       report; a note that told a writer their script was wrong about
       something unmeasurable would be the product bluffing. */
    for (const m of MILESTONES) {
      if (m.key === "scenes-unmarked") continue;
      const text = `${m.lead(facts())} ${m.body}`;
      expect(text).not.toMatch(/\byour (midpoint|ending|act|structure) (is|does)\b/i);
    }
  });
});

describe("reading the draft's facts", () => {
  it("turns planned minutes into planned pages", () => {
    const f = readFacts({
      pageCount: 45,
      suggestions: { acts: [{ duration_minutes: 30 }, { duration_minutes: 30 }, { duration_minutes: 30 }] },
    });
    expect(f.plannedPages).toBe(90);
    expect(f.progress).toBeCloseTo(0.5);
  });

  it("counts only scenes actually marked major", () => {
    const f = readFacts({
      scenes: [
        { scene_type: "major" },
        { scene_type: "minor" },
        { scene_type: undefined },
      ],
    });
    expect(f.sceneCount).toBe(3);
    expect(f.majorCount).toBe(1);
  });

  it("survives a script with nothing on it yet", () => {
    // Called on every render of the editor, including the first, before
    // anything has loaded.
    const f = readFacts();
    expect(f).toMatchObject({ pageCount: 0, sceneCount: 0, progress: null });
    expect(milestoneFor(f)).toBeNull();
  });
});

describe("dismissals", () => {
  it("are scoped to one script", () => {
    // The same writer opening a different screenplay is at a different point
    // in a different story.
    expect(dismissKey("abc")).not.toBe(dismissKey("def"));
    expect(dismissKey("abc")).toContain("abc");
  });
});
