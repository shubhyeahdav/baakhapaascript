/**
 * The in-editor guides.
 *
 * These exist because the product's own proposal argued that Final Draft and
 * Celtx "give the creator a blank page" and that this one would guide the writer
 * through every decision — and then shipped a blank page with a line of
 * formatting jargon on it.
 *
 * What makes a guide teaching rather than reading is `check`: a step completes
 * when the thing it asked for is actually on the page, not when the writer
 * presses Next. So the checks are the part worth testing, and the thing they
 * must not do is claim credit for work nobody did — a check that passes on an
 * empty draft turns the whole run into a Next button with extra steps.
 *
 * The checks are deliberately shallow, a regex over the draft rather than a
 * parse. `screenplay.py` and the craft linter own the real analysis on the
 * server, and duplicating it here would give the product two definitions of what
 * a slugline is.
 */
import { GUIDE_GROUPS, GUIDES, guideProgress } from "./guides";

const everyStep = GUIDES.flatMap((g) => g.steps.map((s) => ({ guide: g, step: s })));
const checkableSteps = everyStep.filter(({ step }) => step.check);

describe("the guide list", () => {
  it("has guides", () => {
    expect(GUIDES.length).toBeGreaterThan(0);
  });

  it("gives every guide a unique id, since ids address them", () => {
    const ids = GUIDES.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every guide a title, blurb, group and a run of steps", () => {
    for (const g of GUIDES) {
      expect(g.title).toBeTruthy();
      expect(g.blurb).toBeTruthy();
      expect(g.group).toBeTruthy();
      expect(g.steps.length).toBeGreaterThan(0);
    }
  });

  it("puts every guide in a group the UI knows how to render", () => {
    // A guide in an unlisted group renders nowhere at all.
    for (const g of GUIDES) {
      expect(GUIDE_GROUPS).toContain(g.group);
    }
  });

  it("estimates a time for each, so a writer can decide to start one", () => {
    for (const g of GUIDES) {
      expect(typeof g.minutes).toBe("number");
      expect(g.minutes).toBeGreaterThan(0);
    }
  });

  it("gives every step a title and a body", () => {
    for (const { step } of everyStep) {
      expect(step.title).toBeTruthy();
      expect(step.body).toBeTruthy();
    }
  });

  it("has at least one guide that checks the page rather than only reading", () => {
    expect(checkableSteps.length).toBeGreaterThan(0);
  });
});

describe("the checks", () => {
  it("claims nothing on an empty draft", () => {
    // The property that keeps this teaching. A check that passes on an empty
    // page turns the guide into a Next button with extra steps.
    for (const { guide, step } of checkableSteps) {
      expect(step.check(""), `${guide.id} / ${step.title} passed on an empty draft`)
        .toBe(false);
    }
  });

  it("claims nothing on whitespace", () => {
    for (const { guide, step } of checkableSteps) {
      expect(step.check("\n\n   \n"), `${guide.id} / ${step.title}`).toBe(false);
    }
  });

  it("is only ever called with a string, and `guideProgress` is what guarantees it", () => {
    // The checks themselves are regexes over `text` and are not null-safe —
    // `step.check(undefined)` throws. That is fine, and worth writing down
    // rather than hardening away: the single caller normalises with
    // `s.check(text || "")`, so the contract lives there. A second caller that
    // skipped the normalisation would be the bug, not the check.
    // Some of them handle it and some do not, which is the point: the safety is
    // not a property of the checks and must not be relied on as one.
    const unsafe = checkableSteps.filter(({ step }) => {
      try { step.check(undefined); return false; } catch { return true; }
    });
    expect(unsafe.length).toBeGreaterThan(0);

    for (const guide of GUIDES) {
      expect(() => guideProgress(guide, undefined)).not.toThrow();
      expect(() => guideProgress(guide, null)).not.toThrow();
    }
  });

  it("returns a boolean rather than a truthy match object", () => {
    // `guideProgress` counts these, so a regex match array would count as done
    // and `null` would not — subtle, and it only shows up as a wrong number.
    const draft = "INT. CHIYA PASAL - DAY\n\nShe counts the till.\n\nMIRA\nAaunus.\n";
    for (const { step } of checkableSteps) {
      expect(typeof step.check(draft)).toBe("boolean");
    }
  });

  it("recognises a scene written the way the guide teaches it", () => {
    // Not every check should pass on this — some ask for later things — but a
    // properly formatted scene has to satisfy at least one.
    const draft = [
      "INT. CHIYA PASAL - DAY",
      "",
      "MIRA counts the till. Her father watches from the doorway.",
      "",
      "MIRA",
      "Aaja pani dherai bhayena.",
      "",
      "He says nothing. He picks up the cloth and starts wiping a clean table.",
      "",
    ].join("\n");

    const passing = checkableSteps.filter(({ step }) => step.check(draft));
    expect(passing.length).toBeGreaterThan(0);
  });
});

describe("guideProgress", () => {
  const withChecks = GUIDES.find((g) => g.steps.some((s) => s.check));
  const withoutChecks = GUIDES.find((g) => !g.steps.some((s) => s.check));

  it("reports nothing for a guide that checks nothing", () => {
    // A read-only guide has no progress to report, and a 0/0 bar would read as
    // a task the writer had failed rather than one with nothing to do.
    if (!withoutChecks) return;
    expect(guideProgress(withoutChecks, "anything")).toBeNull();
  });

  it("counts only the checkable steps", () => {
    const got = guideProgress(withChecks, "");

    expect(got.total).toBe(withChecks.steps.filter((s) => s.check).length);
    expect(got.total).toBeLessThanOrEqual(withChecks.steps.length);
  });

  it("starts at nothing done on an empty draft", () => {
    expect(guideProgress(withChecks, "").done).toBe(0);
  });

  it("treats a missing draft as an empty one", () => {
    expect(guideProgress(withChecks, undefined).done).toBe(0);
    expect(guideProgress(withChecks, null).done).toBe(0);
  });

  it("never reports more done than there are steps", () => {
    const draft = [
      "INT. CHIYA PASAL - DAY",
      "",
      "MIRA counts the till.",
      "",
      "MIRA",
      "Aaja pani dherai bhayena.",
      "",
      "EXT. PATAN DURBAR SQUARE - NIGHT",
      "",
      "She walks without looking back.",
    ].join("\n");

    for (const guide of GUIDES) {
      const p = guideProgress(guide, draft);
      if (!p) continue;
      expect(p.done).toBeLessThanOrEqual(p.total);
      expect(p.done).toBeGreaterThanOrEqual(0);
    }
  });
});
