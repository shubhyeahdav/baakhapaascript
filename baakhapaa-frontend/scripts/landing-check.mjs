/* The landing page, measured in a real browser (Month 4, Day 17).
 *
 *   npm run build && node scripts/landing-check.mjs
 *
 * Needs only the built site — no backend, no account. That is deliberate: `/`
 * is the one page a stranger sees, and it calls no API, so a check of it
 * should not need one either.
 *
 * What no test in the suite can see (jsdom has no layout engine and
 * vite.config.js sets `css: false`):
 *
 *   1. No horizontal scroll at 320, 375, 768 or 1440 px.
 *   2. On a wide screen the two lint flags sit BESIDE the page, not on it.
 *   3. With `prefers-reduced-motion: reduce` the flags are fully visible at
 *      once — the claim is the flags, not their arrival.
 *   4. A crawler that runs no JavaScript reads the claim: the prerendered
 *      HTML carries the h1.
 *   5. First contentful paint on a throttled connection — reported, with a
 *      budget, because this is the page that has to open on mobile data.
 *
 * Exits 1 on any failure.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BUILD = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "build");
const PORT = 4181;
// "Slow 4G" in Chrome DevTools terms. A budget, not a target: it exists so a
// regression is noticed, and the number it reports is the point.
const THROTTLE = { latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 };
const FCP_BUDGET_MS = 3000;

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".json": "application/json", ".woff2": "font/woff2" };

if (!fs.existsSync(path.join(BUILD, "index.html"))) {
  console.error("No build/. Run `npm run build` first.");
  process.exit(1);
}

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || "/").split("?")[0]);
  let file = path.join(BUILD, url);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    const indexed = path.join(file, "index.html");
    file = fs.existsSync(indexed) ? indexed : path.join(BUILD, "app.html");
  }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));
const URL_ = `http://127.0.0.1:${PORT}/`;

const failures = [];
const fail = (msg) => { failures.push(msg); console.log(`  FAIL  ${msg}`); };
const pass = (msg) => console.log(`  ok    ${msg}`);

// 4 — before the browser, because it is a property of the file.
const raw = fs.readFileSync(path.join(BUILD, "index.html"), "utf8");
if (/<h1[^>]*>[^<]*Screenwriting software that reads Nepali/.test(raw)) {
  pass("prerendered index.html carries the h1 a crawler reads");
} else {
  fail("build/index.html has no landing h1 — was prerender skipped?");
}
if (!fs.existsSync(path.join(BUILD, "app.html"))) fail("build/app.html (the SPA fallback) is missing");

const browser = await chromium.launch();

// 1 — no sideways scroll
for (const width of [320, 375, 768, 1440]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(URL_, { waitUntil: "networkidle" });
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  sw > width ? fail(`${width}px: page is ${sw}px wide — horizontal scroll`) : pass(`${width}px: no horizontal scroll`);
  await ctx.close();
}

// 2 + 3 — flags beside the page, visible at once under reduced motion
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(URL_, { waitUntil: "networkidle" });
  const geo = await page.evaluate(() => {
    const paper = document.querySelector(".landing-page").getBoundingClientRect();
    const flags = [...document.querySelectorAll(".landing-flag")].map((el) => ({
      left: el.getBoundingClientRect().left,
      opacity: parseFloat(getComputedStyle(el).opacity),
    }));
    return { paperRight: paper.right, flags };
  });
  geo.flags.every((f) => f.left >= geo.paperRight)
    ? pass("1440px: both flags sit beside the page")
    : fail(`1440px: a flag overlaps the page (paper ends at ${geo.paperRight}px)`);
  geo.flags.every((f) => f.opacity === 1)
    ? pass("reduced motion: flags fully visible immediately")
    : fail(`reduced motion: flag opacity ${geo.flags.map((f) => f.opacity).join(", ")}`);
  await ctx.close();
}

// 5 — first paint on a throttled connection
{
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, ...THROTTLE });
  await page.goto(URL_, { waitUntil: "load" });
  const fcp = await page.evaluate(() =>
    new Promise((resolve) => {
      const hit = performance.getEntriesByName("first-contentful-paint")[0];
      if (hit) return resolve(hit.startTime);
      new PerformanceObserver((list) => resolve(list.getEntries()[0].startTime))
        .observe({ type: "paint", buffered: true });
    }),
  );
  const ms = Math.round(fcp);
  ms <= FCP_BUDGET_MS
    ? pass(`first contentful paint on Slow 4G: ${ms} ms (budget ${FCP_BUDGET_MS})`)
    : fail(`first contentful paint on Slow 4G: ${ms} ms, over the ${FCP_BUDGET_MS} ms budget`);
  await ctx.close();
}

await browser.close();
server.close();

if (failures.length) {
  console.error(`\n${failures.length} landing check(s) failed.`);
  process.exit(1);
}
console.log("\nLanding page: every check passed.");
