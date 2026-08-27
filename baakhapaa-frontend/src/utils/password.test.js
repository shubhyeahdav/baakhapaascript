/**
 * Client-side password rules.
 *
 * These mirror `models.password_policy_errors` on the server, which is the one
 * that actually enforces anything — this half exists so a writer is told what is
 * wanted before they submit, rather than being corrected afterwards. The two
 * lists drifting apart is the failure mode: a client that accepts a password the
 * server will reject produces a form that looks satisfied and then fails.
 *
 * `passwordRequirementSentence` is the resting state, shown before anything is
 * typed. It is built by slicing the rule list, so adding or removing a rule
 * reshapes the sentence — which is exactly where a stray "and" or a doubled
 * comma creeps in.
 */
import { checkPassword, PASSWORD_RULES, passwordRequirementSentence } from "./password";

describe("the rules themselves", () => {
  it("keeps every rule readable in both forms", () => {
    // `label` is the checklist row, `short` is the phrase used mid-sentence.
    for (const rule of PASSWORD_RULES) {
      expect(rule.key).toBeTruthy();
      expect(rule.label).toBeTruthy();
      expect(rule.short).toBeTruthy();
    }
  });

  it("has a unique key per rule, since keys drive React lists", () => {
    const keys = PASSWORD_RULES.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("checkPassword", () => {
  it("accepts a password that satisfies everything", () => {
    const got = checkPassword("Kathmandu!2026");

    expect(got.valid).toBe(true);
    expect(got.missing).toEqual([]);
    expect(got.met).toBe(got.total);
  });

  it("names only what is still missing", () => {
    // The compact form states the rules once and then lists the gaps, rather
    // than keeping five permanent checklist rows above a two-field form.
    const got = checkPassword("kathmandu");

    expect(got.valid).toBe(false);
    expect(got.missing).toEqual(["an uppercase letter", "a number", "a symbol"]);
  });

  it("counts what passed, which is what the strength bar reads", () => {
    expect(checkPassword("kathmandu").met).toBe(2);   // length, lowercase
    expect(checkPassword("Kathmandu").met).toBe(3);   // + uppercase
    expect(checkPassword("Kathmandu2").met).toBe(4);  // + number
  });

  it("treats an empty password as meeting nothing", () => {
    const got = checkPassword("");

    expect(got.met).toBe(0);
    expect(got.valid).toBe(false);
  });

  it("does not throw on undefined, which is the field's initial value", () => {
    expect(checkPassword(undefined).valid).toBe(false);
    expect(checkPassword(null).met).toBe(0);
  });

  it("counts length in characters, not words", () => {
    expect(checkPassword("Aa1!aaaa").results.find((r) => r.key === "length").passed)
      .toBe(true);
    expect(checkPassword("Aa1!aaa").results.find((r) => r.key === "length").passed)
      .toBe(false);
  });

  it("accepts any non-alphanumeric as the symbol", () => {
    // Writers on a Nepali keyboard layout reach for whatever is nearest; the
    // rule is "not a letter or a digit", not a fixed list of approved symbols.
    for (const symbol of ["!", "@", "#", "-", " ", "।"]) {
      expect(checkPassword(`Kathmandu2026${symbol}`).valid).toBe(true);
    }
  });

  it("returns a result row per rule, in rule order", () => {
    const got = checkPassword("x");

    expect(got.results.map((r) => r.key)).toEqual(PASSWORD_RULES.map((r) => r.key));
  });
});

describe("passwordRequirementSentence", () => {
  it("reads as one sentence rather than a list", () => {
    expect(passwordRequirementSentence())
      .toBe("Use at least 8 characters, including an uppercase letter, a lowercase letter, a number and a symbol.");
  });

  it("ends in a full stop and starts with a capital", () => {
    const sentence = passwordRequirementSentence();

    expect(sentence).toMatch(/^[A-Z]/);
    expect(sentence).toMatch(/\.$/);
  });

  it("mentions every rule it is built from", () => {
    const sentence = passwordRequirementSentence();

    for (const rule of PASSWORD_RULES) {
      expect(sentence).toContain(rule.short);
    }
  });

  it("has no doubled separator where the list joins", () => {
    // The join slices the list, which is where a stray ", and" appears.
    expect(passwordRequirementSentence()).not.toMatch(/,\s*and\b/);
    expect(passwordRequirementSentence()).not.toMatch(/,,/);
  });
});
