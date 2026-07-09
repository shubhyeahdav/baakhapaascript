// Password strength rules shared by the sign-up form.
// A password must satisfy every rule below to be accepted.
export const PASSWORD_RULES = [
  { key: "length", label: "At least 8 characters", test: (p) => p.length >= 8 },
  { key: "upper", label: "An uppercase letter (A–Z)", test: (p) => /[A-Z]/.test(p) },
  { key: "lower", label: "A lowercase letter (a–z)", test: (p) => /[a-z]/.test(p) },
  { key: "number", label: "A number (0–9)", test: (p) => /[0-9]/.test(p) },
  { key: "special", label: "A special character (!@#$…)", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

// Returns { results: [{key,label,passed}], valid } for a given password.
export function checkPassword(password) {
  const results = PASSWORD_RULES.map((r) => ({
    key: r.key,
    label: r.label,
    passed: r.test(password || ""),
  }));
  return { results, valid: results.every((r) => r.passed) };
}
