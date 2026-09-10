/**
 * Does any page break on a phone?
 *
 * Two failures, both invisible on a laptop and both measurable:
 *
 *   Horizontal overflow. The page is wider than the screen, so it scrolls
 *   sideways. Sometimes that is a deliberate `overflow-x-auto` on one element
 *   and sometimes it is a layout that does not fit; either way the writer gets
 *   a page that slides under their thumb while they try to read it.
 *
 *   Targets under 24 CSS pixels, the floor WCAG 2.2 sets for a pointer target.
 *   On the editor header that was the difference between pressing Back and
 *   pressing the project title beside it.
 *
 * This exists because the editor header was audited by hand, found to be 817px
 * of controls in a 375px viewport, and fixed — and there were eight more pages
 * nobody had looked at. Checking them one at a time by hand finds today's
 * instance; a script finds the next one too.
 *
 * Run against a dev server that is already up:
 *
 *   node scripts/responsive-audit.mjs                     # all routes, 375px
 *   node scripts/responsive-audit.mjs --width 320
 *   node scripts/responsive-audit.mjs --route /pricing
 *
 * It needs a logged-in session for the protected routes, which it creates
 * itself against the API — a throwaway account, deleted at the end.
 */
import { chromium } from "playwright";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

const WIDTH = Number(arg("width", 375));
const HEIGHT = Number(arg("height", 812));
const APP = arg("app", "http://localhost:3000");
const API = arg("api", "http://localhost:8000");
const ONLY = arg("route", null);

// Every route a writer can reach. `:id` is filled with a project created for
// the run, because an editor with no script is not the editor.
const ROUTES = [
  { path: "/login", auth: false },
  { path: "/register", auth: false },
  { path: "/pricing", auth: false },
  { path: "/terms", auth: false },
  { path: "/onboarding", auth: true },
  { path: "/dashboard", auth: true },
  { path: "/settings", auth: true },
  { path: "/learn", auth: true },
  { path: "/storyboards", auth: true },
  { path: "/exports", auth: true },
  { path: "/projects/new", auth: true },
  { path: "/projects/:id/setup", auth: true },
  { path: "/projects/:id/editor", auth: true },
  { path: "/projects/:id/storyboard", auth: true },
];

/** Runs inside the page. Returns what is wrong, with enough to find it. */
const AUDIT = () => {
  const doc = document.documentElement;
  const viewport = doc.clientWidth;

  const shown = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none";
  };

  // An element wider than the viewport is only a fault if nothing between it
  // and the root is allowed to scroll — otherwise it is a deliberate scroller,
  // like a wide table in its own container.
  const inScroller = (el) => {
    for (let n = el.parentElement; n && n !== doc; n = n.parentElement) {
      const ox = getComputedStyle(n).overflowX;
      if (ox === "auto" || ox === "scroll") return true;
    }
    return false;
  };

  const overflowing = [...document.querySelectorAll("*")]
    .filter(shown)
    .filter((el) => el.getBoundingClientRect().right > viewport + 1)
    .filter((el) => !inScroller(el))
    .slice(0, 8)
    .map((el) => ({
      tag: el.tagName.toLowerCase(),
      cls: (el.className || "").toString().slice(0, 48),
      text: (el.innerText || "").trim().slice(0, 28),
      right: Math.round(el.getBoundingClientRect().right),
    }));

  // The reachable height, not the painted one: a pseudo-element can carry the
  // hit area while the control stays visually small, which is what the editor
  // header does.
  const hitHeight = (el) => {
    const own = el.getBoundingClientRect().height;
    const after = getComputedStyle(el, "::after");
    const extra = after.content !== "none" ? parseFloat(after.height) || 0 : 0;
    return Math.max(own, extra);
  };

  const small = [...document.querySelectorAll('button, a[href], [role="button"], input, select')]
    .filter(shown)
    .filter((el) => hitHeight(el) < 24)
    .slice(0, 8)
    .map((el) => ({
      label: (el.getAttribute("aria-label") || el.innerText || el.value || "")
        .trim().slice(0, 26),
      h: Math.round(hitHeight(el)),
    }));

  return {
    viewport,
    scrollWidth: doc.scrollWidth,
    overflows: doc.scrollWidth > viewport + 1,
    overflowing,
    smallTargets: small,
  };
};

/**
 * Refuse to write to a real database.
 *
 * This script registers an account and creates a project to reach the
 * protected routes. Pointed at a backend holding real Supabase credentials it
 * creates real users in the production project — which is exactly what
 * `baakhapaa-backend/purge_test_accounts.py` was written to clean up after,
 * and how that need was discovered. The backend now says which mode it booted
 * in, so a script that writes can ask before it does.
 *
 * `--allow-live` is the deliberate override. It exists because auditing a
 * staging deploy is a real thing to want; it is a flag rather than a prompt so
 * that CI never blocks on it, and CI never needs it.
 */
async function refuseIfLive(api) {
  if (process.argv.includes("--allow-live")) return;
  let health;
  try {
    health = await (await fetch(`${api}/health`)).json();
  } catch {
    console.error(`Cannot reach ${api}. Start the backend first.`);
    process.exit(1);
  }
  if (health.demo === false) {
    console.error(
      `Refusing to run: ${api} is NOT in demo mode (env=${health.env}, ` +
        `ai_provider=${health.ai_provider}).
` +
        `This script registers an account and creates a project, and they ` +
        `would be written to the real database.
` +
        `Use a demo-mode backend, or pass --allow-live if you mean it.`,
    );
    process.exit(1);
  }
}

async function main() {
  await refuseIfLive(API);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 2,
    isMobile: WIDTH < 768,
    hasTouch: WIDTH < 768,
  });
  const page = await ctx.newPage();

  // A throwaway account, so the protected routes render what a writer sees
  // rather than a redirect to /login.
  const email = `audit-${Date.now()}@example.com`;
  const password = "Aud1t!Pass!2026";
  let token = null;
  let projectId = null;

  try {
    await fetch(`${API}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Audit", email, password }),
    });
    const signin = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }).then((r) => r.json());
    token = signin.token;

    // Answer onboarding for the throwaway account. Without this every
    // protected route redirects to /onboarding and the audit measures the
    // same wizard nine times over, reporting nothing about the pages named.
    await fetch(`${API}/auth/preferences`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        experience: "first_time", format: "short", language: "Bilingual",
        genre: "Drama", tone: "Emotional", onboarded: true,
      }),
    });

    const project = await fetch(`${API}/projects/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: "Responsive audit", genre: "Drama", tone: "Emotional",
        language: "Bilingual", duration_minutes: 15, target_audience: "Youth",
      }),
    }).then((r) => r.json());
    projectId = project.id;
  } catch (e) {
    console.error(`Could not sign in against ${API}: ${e.message}`);
    console.error("Protected routes will redirect and report nothing useful.");
  }

  if (token) {
    await page.addInitScript((t) => {
      window.localStorage.setItem("token", t);
    }, token);
  }

  const routes = ROUTES
    .filter((r) => !ONLY || r.path === ONLY)
    .map((r) => ({ ...r, url: r.path.replace(":id", projectId || "none") }));

  console.log(`\nResponsive audit — ${WIDTH}x${HEIGHT}\n${"=".repeat(58)}`);

  let faults = 0;
  for (const route of routes) {
    await page.goto(`${APP}${route.url}`, { waitUntil: "networkidle" })
      .catch(() => {});
    await page.waitForTimeout(600);
    const r = await page.evaluate(AUDIT);

    const problems = [];
    if (r.overflows && r.overflowing.length) {
      problems.push(`scrolls sideways (${r.scrollWidth}px in ${r.viewport}px)`);
    }
    if (r.smallTargets.length) {
      problems.push(`${r.smallTargets.length} targets under 24px`);
    }

    if (!problems.length) {
      console.log(`  ok    ${route.path}`);
      continue;
    }
    faults += 1;
    console.log(`  FAIL  ${route.path} — ${problems.join("; ")}`);
    for (const o of r.overflowing) {
      console.log(`          overflows to ${o.right}px: <${o.tag}> ${o.cls}`);
    }
    for (const t of r.smallTargets) {
      console.log(`          ${t.h}px tall: ${t.label || "(unlabelled)"}`);
    }
  }

  // Clean up after ourselves.
  if (token && projectId) {
    await fetch(`${API}/projects/${projectId}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }

  console.log(`${"=".repeat(58)}`);
  console.log(faults ? `${faults} route(s) with faults` : "every route clean");

  await browser.close();
  process.exit(faults ? 1 : 0);
}

main();
