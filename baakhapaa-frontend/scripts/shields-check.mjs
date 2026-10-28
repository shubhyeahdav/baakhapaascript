/* Does the app work with a content blocker on?
 *
 * Run it: `node scripts/shields-check.mjs [url]`  (default http://localhost:3000)
 *
 * Brave blocks `fonts.googleapis.com` and `fonts.gstatic.com` by default —
 * Shields treats Google Fonts as a fingerprinting vector, so the request is
 * cancelled rather than slowed. uBlock Origin, Pi-hole and most corporate
 * filters do the same. That is a large share of the people this product is
 * for: a developer-adjacent audience on a privacy browser.
 *
 * THE FAILURE THIS CATCHES. index.html loads the font stylesheet with
 * `media="print"` and promotes it on load:
 *
 *     <link rel="stylesheet" href="https://fonts.googleapis.com/..."
 *           media="print" onload="this.media='all'; this.onload=null;" />
 *
 * That is a good trick for not blocking first paint. But when the request is
 * BLOCKED the load event never fires, so `media` stays `print` for ever — and
 * a `media="print"` stylesheet applies to nothing on screen. The page then
 * renders in whatever the fallback stack gives it, permanently, with no error
 * in the console and nothing in the UI to say why.
 *
 * So this loads the app with those two hosts blocked and checks that the app
 * still mounts, still has readable type, and does not sit at a blank screen.
 */
import { chromium } from "playwright";

const URL_UNDER_TEST = process.argv.find((a) => a.startsWith("http")) || "http://localhost:3000";

// What Brave Shields blocks by default that this app requests. Checked against
// Brave's own default lists; the font hosts are the two that matter here.
const BLOCKED = [
  "**://fonts.googleapis.com/**",
  "**://fonts.gstatic.com/**",
  // Demo storyboards come from here, and it is on several filter lists.
  "**://placehold.co/**",
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

let blockedCount = 0;
for (const pattern of BLOCKED) {
  await page.route(pattern, (route) => { blockedCount += 1; return route.abort(); });
}

console.log(`loading ${URL_UNDER_TEST} with the font hosts blocked\n`);
await page.goto(URL_UNDER_TEST, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(1200);

const report = await page.evaluate(() => {
  const root = document.getElementById("root");
  const body = document.body;
  const sheets = [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => ({
    href: l.href.slice(0, 60),
    media: l.media,
  }));
  const probe = document.createElement("span");
  probe.style.cssText = "position:absolute;visibility:hidden;font-family:Mukta,sans-serif";
  probe.textContent = "Baakhapaa";
  body.appendChild(probe);
  const family = getComputedStyle(probe).fontFamily;
  probe.remove();
  return {
    mounted: !!root && root.children.length > 0,
    visibleText: (body.innerText || "").trim().length,
    sheets,
    family,
    // The fonts the page asked for, and whether the browser actually has them.
    haveMukta: document.fonts.check("16px Mukta"),
    haveSpectral: document.fonts.check("16px Spectral"),
    haveCourierPrime: document.fonts.check("16px 'Courier Prime'"),
  };
});

await browser.close();

console.log(`requests blocked        ${blockedCount}`);
console.log(`app mounted             ${report.mounted}`);
console.log(`visible text            ${report.visibleText} characters`);
console.log(`Mukta available         ${report.haveMukta}`);
console.log(`Spectral available      ${report.haveSpectral}`);
console.log(`Courier Prime available ${report.haveCourierPrime}`);
console.log("stylesheet links:");
for (const s of report.sheets) console.log(`  media="${s.media || "all"}"  ${s.href}…`);
if (consoleErrors.length) {
  console.log("\nconsole errors:");
  for (const e of consoleErrors.slice(0, 8)) console.log(`  ${e.slice(0, 160)}`);
}

console.log();
let failed = false;

if (!report.mounted || report.visibleText < 20) {
  console.log("FAIL: the app did not render with the font hosts blocked.");
  failed = true;
}

// The real defect: a stylesheet left at media="print" applies to nothing, so
// the page is permanently unstyled by it and nothing says so.
const stuck = report.sheets.filter(
  (s) => s.media === "print" && s.href.includes("fonts.googleapis.com"),
);
if (stuck.length) {
  console.log("FAIL: the font stylesheet is still media=\"print\" after load.");
  console.log("      Its onload never fired because the request was blocked, so it");
  console.log("      applies to nothing and the page keeps the fallback stack for ever.");
  failed = true;
}

if (failed) process.exit(1);
console.log("OK: the app renders and degrades to the fallback stack when fonts are blocked.");
