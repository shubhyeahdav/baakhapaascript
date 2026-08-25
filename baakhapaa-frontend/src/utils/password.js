// Password strength rules shared by the sign-up form.
// A password must satisfy every rule below to be accepted.
//
// `short` is the phrase used when the rules are written as a sentence rather
// than a checklist — the sign-up form states them in one line and then names
// only what is still missing, because five permanent checklist rows cost more
// vertical space than the form they belong to.
export const PASSWORD_RULES = [
  { key: "length", label: "At least 8 characters", short: "8 characters", test: (p) => p.length >= 8 },
  { key: "upper", label: "An uppercase letter (A–Z)", short: "an uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { key: "lower", label: "A lowercase letter (a–z)", short: "a lowercase letter", test: (p) => /[a-z]/.test(p) },
  { key: "number", label: "A number (0–9)", short: "a number", test: (p) => /[0-9]/.test(p) },
  { key: "special", label: "A special character (!@#$…)", short: "a symbol", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

/**
 * Check a password against every rule.
 *
 * Returns the per-rule results plus the two summaries the compact form needs:
 * `missing` (the short phrases still unmet) and `met` (how many passed, which
 * drives the strength bar).
 */
export function checkPassword(password) {
  const results = PASSWORD_RULES.map((r) => ({
    key: r.key,
    label: r.label,
    short: r.short,
    passed: r.test(password || ""),
  }));
  const missing = results.filter((r) => !r.passed).map((r) => r.short);
  return {
    results,
    missing,
    met: results.length - missing.length,
    total: results.length,
    valid: missing.length === 0,
  };
}

/**
 * The rules as one sentence, for the resting state before anything is typed.
 * A new user should be able to read what is wanted without first guessing at
 * it and being corrected.
 */
export function passwordRequirementSentence() {
  const [first, ...rest] = PASSWORD_RULES.map((r) => r.short);
  return `Use at least ${first}, including ${rest.slice(0, -1).join(", ")} and ${rest[rest.length - 1]}.`;
}
