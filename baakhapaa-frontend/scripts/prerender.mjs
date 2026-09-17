/**
 * Give a crawler something to read.
 *
 * Measured against the deployed site on 17 September 2026, with a plain HTTP
 * GET and no JavaScript:
 *
 *     crawler-visible characters   33
 *     <h1> in the raw HTML          0
 *     canonical / og:title         absent (written by JS after mount)
 *
 * That is not a metadata problem and it is not fixed by metadata. The head
 * tags this product ships are mostly fine — the BODY is empty, because every
 * word on every page is painted by React after load. Google renders JavaScript
 * and gets there eventually; no current AI search crawler does, so ChatGPT,
 * Perplexity and Claude see thirty-three characters, every time.
 *
 * This walks the public routes in a real browser after the build and writes
 * what they actually render to `build/<route>/index.html`. Vercel checks the
 * filesystem before it applies the SPA rewrite, so those files are served
 * directly and the rewrite keeps handling everything else.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *
 *   - It does not touch `build/index.html`. That file is the SPA fallback for
 *     every unmatched path; overwriting it with one route's markup would give
 *     the 404 page the login page's title.
 *   - It does not prerender anything behind ProtectedRoute. Those redirect to
 *     /login for a signed-out visitor, so the captured HTML would be the login
 *     page wearing the wrong URL — and they are `noindex` anyway.
 *
 * The rendered markup is replaced by React on load (`createRoot` clears the
 * container). It exists for readers that never run the script, and as a
 * no-JavaScript fallback for people, which is the same thing seen twice.
 *
 *     node scripts/prerender.mjs          # after `vite build`
 *     node scripts/prerender.mjs --check  # report the numbers, write nothing
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = path.join(ROOT, "build");
const CHECK_ONLY = process.argv.includes("--check");

// documentHead.js builds canonical and og:url from `window.location.origin`,
// which during prerender is this script’s own loopback server. Captured
// as-is, every prerendered page would ship `<link rel="canonical"
// href="http://127.0.0.1:4179/pricing">` — a canonical pointing at a host
// that exists on nobody’s machine but this one. The origin is substituted
// back out below. PRERENDER_ORIGIN lets a preview deployment declare itself.
const SITE_ORIGIN = process.env.PRERENDER_ORIGIN || "https://baakhapaascript.vercel.app";

// Public routes only, and the two legal documents first because they are the
// pages with real prose — the audit noted they are the only ones with
// substantial text and the only ones whose text a crawler cannot see.
const ROUTES = ["/terms", "/privacy", "/pricing", "/login", "/register"];

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".woff2": "font/woff2",
};

/** The built site, served the way Vercel serves it: filesystem, then fallback. */
function serve(port) {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url || "/").split("?")[0]);
    let file = path.join(BUILD, url);
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      const indexed = path.join(file, "index.html");
      file = fs.existsSync(indexed) ? indexed : path.join(BUILD, "index.html");
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

const strip = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

if (!fs.existsSync(path.join(BUILD, "index.html"))) {
  console.error("No build/index.html. Run `vite build` first.");
  process.exit(1);
}

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  // Not a build failure. A deployment without a browser still ships a working
  // SPA — it ships the one this script exists to improve.
  console.error("playwright is not installed; skipping prerender (the SPA still works).");
  process.exit(0);
}

const PORT = 4179;
const server = await serve(PORT);

// The browser BINARY is a separate install from the npm package, and a host
// that has one and not the other is the normal case: `playwright` is in
// devDependencies, so Vercel installs the package and never downloads Chromium.
// A throw here would fail the build and take the deployment with it, to gain a
// crawler optimisation. Skipping costs the optimisation and ships the site.
let browser;
try {
  browser = await chromium.launch();
} catch (e) {
  server.close();
  console.error("No Chromium available, skipping prerender — the SPA still works.");
  console.error(`  (${String(e).slice(0, 140)})`);
  console.error("  To enable it on this host: npx playwright install --with-deps chromium");
  process.exit(0);
}
const page = await browser.newPage({ javaScriptEnabled: true });

const before = strip(fs.readFileSync(path.join(BUILD, "index.html"), "utf8")).length;
const rows = [];

for (const route of ROUTES) {
  await page.goto(`http://127.0.0.1:${PORT}${route}`, { waitUntil: "networkidle" });
  // Every page carries this landmark since the accessibility pass, which makes
  // it a far better readiness signal than a timeout: it means the route's
  // component mounted, not merely that the network went quiet.
  await page.waitForSelector("main#main", { timeout: 15000 });

  const html = (await page.content()).split(`http://127.0.0.1:${PORT}`).join(SITE_ORIGIN);
  const chars = strip(html).length;
  const h1 = (html.match(/<h1[\s>]/gi) || []).length;
  const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || "";

  rows.push({ route, chars, h1, title });

  if (!CHECK_ONLY) {
    const dir = path.join(BUILD, route.replace(/^\//, ""));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), html, "utf8");
  }
}

await browser.close();
server.close();

const pad = (s, n) => String(s).padEnd(n);
console.log("");
console.log(CHECK_ONLY ? "Prerender check (nothing written)" : "Prerendered");
console.log("");
console.log(pad("route", 12) + pad("chars", 8) + pad("h1", 4) + "title");
console.log("-".repeat(72));
for (const r of rows) {
  console.log(pad(r.route, 12) + pad(r.chars, 8) + pad(r.h1, 4) + r.title);
}
console.log("");
console.log(`shell before: ${before} chars  ->  median prerendered: ` +
  rows.map((r) => r.chars).sort((a, b) => a - b)[Math.floor(rows.length / 2)] + " chars");

const empty = rows.filter((r) => r.chars < 200);
if (empty.length) {
  console.error(`\n${empty.length} route(s) still under 200 characters: ` +
    empty.map((r) => r.route).join(", "));
  process.exit(1);
}
