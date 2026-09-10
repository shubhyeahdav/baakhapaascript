/**
 * Does opening the editor ever fail for no reason?
 *
 * It did, on roughly a third of opens, and nothing in either test suite could
 * see it. React StrictMode mounts, unmounts and remounts in development, so the
 * editor fires two identical loads for the same script. Two simultaneous
 * requests to one URL, and the loser comes back as a bare network error with no
 * `response` on it — so the editor rendered "Could not load this script." over a
 * script that had loaded perfectly a moment earlier, and `loadError` was never
 * cleared again. Permanent, until a reload that might do the same thing.
 *
 * That is also the exact shape of a dropped request on a flaky connection,
 * which is the connection this product is built for. So the fix is not about
 * StrictMode: a lost request should cost a reload, never the session.
 *
 * Measured here, same build, twenty opens each:
 *
 *     with the `live` guard        0/20
 *     with the guard reverted      7/20
 *
 * A unit test cannot reach this. It is a race between two mounts and a real
 * network stack; jsdom has neither. This script is the regression test, and it
 * is worth running after anything that touches the editor's load effect.
 *
 * Needs both dev servers up. Exits non-zero if any open failed.
 *
 *   node scripts/editor-load-race.mjs        # 20 opens
 *   node scripts/editor-load-race.mjs 50
 */
import { chromium } from "playwright";

const API = "http://localhost:8000", APP = "http://localhost:3000";
const N = Number(process.argv[2] || 20);

// A throwaway account reused across runs, so repeated runs do not each add one.
const EMAIL = "probe-1@example.com", PASSWORD = "Aud1t!Pass!2026";

/**
 * Refuse to write to a real database.
 *
 * This script registers `probe-1@example.com`, creates a project and PUTs a
 * draft. Pointed at a backend holding real Supabase credentials those are real
 * rows in the production project — which is what
 * `baakhapaa-backend/purge_test_accounts.py` exists to clean up after, and how
 * the need for it was found. The backend now reports which mode it booted in,
 * so a script that writes can ask before it does.
 *
 * `--allow-live` is the deliberate override, a flag rather than a prompt so CI
 * never blocks on it. CI never needs it: it has no Supabase keys, so the
 * backend there boots on the local SQLite mock.
 */
if (!process.argv.includes("--allow-live")) {
  let health;
  try {
    health = await (await fetch(`${API}/health`)).json();
  } catch {
    console.error(`Cannot reach ${API}. Start the backend first.`);
    process.exit(1);
  }
  if (health.demo === false) {
    console.error(
      `Refusing to run: ${API} is NOT in demo mode (env=${health.env}, ` +
        `ai_provider=${health.ai_provider}).
` +
        `This script registers an account, creates a project and saves a ` +
        `draft, and they would be written to the real database.
` +
        `Use a demo-mode backend, or pass --allow-live if you mean it.`,
    );
    process.exit(1);
  }
}

const j = async (r) => {
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 160)}`);
  return JSON.parse(t);
};

const login = () => fetch(`${API}/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
}).then(j);

let token;
try {
  ({ token } = await login());
} catch {
  await fetch(`${API}/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Probe", email: EMAIL, password: PASSWORD }),
  });
  ({ token } = await login());
}
const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

// Answer onboarding, or every open redirects to the wizard and measures nothing.
await fetch(`${API}/auth/preferences`, { method: "PUT", headers: H, body: JSON.stringify({
  experience: "first_time", format: "short", language: "Bilingual",
  genre: "Drama", tone: "Emotional", onboarded: true }) });

let projects = await fetch(`${API}/projects/`, { headers: H }).then(j);
if (!projects.length) {
  await fetch(`${API}/projects/`, { method: "POST", headers: H, body: JSON.stringify({
    title: "Load race", genre: "Drama", tone: "Emotional", language: "Bilingual",
    duration_minutes: 15, target_audience: "Youth" }) });
  projects = await fetch(`${API}/projects/`, { headers: H }).then(j);
}
const script = await fetch(`${API}/scripts/project/${projects[0].id}`, { headers: H }).then(j);

// A draft with something in it: an empty page takes a different path through
// the load effect and would not exercise what this is measuring.
await fetch(`${API}/scripts/${script.id}`, { method: "PUT", headers: H, body: JSON.stringify({
  content: "INT. CHIYA PASAL, PATAN - MORNING\n\nSteam rises off the kettle.\n\nSANJANA\nYou said Tuesday." }) });

const browser = await chromium.launch();
let failures = 0;
for (let i = 0; i < N; i++) {
  // A fresh context each time: the race is at mount, and a warm page never
  // remounts.
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true,
  });
  const page = await ctx.newPage();
  await page.addInitScript((t) => window.localStorage.setItem("token", t), token);
  await page.goto(`${APP}/projects/${script.id}/editor`, { waitUntil: "networkidle" })
    .catch(() => {});
  await page.waitForTimeout(1800);
  const text = await page.evaluate(() => document.body.innerText).catch(() => "");
  if (text.includes("Could not load this script")) failures++;
  await ctx.close();
}
await browser.close();

console.log(`${failures}/${N} showed "Could not load this script."`);
process.exit(failures ? 1 : 0);
