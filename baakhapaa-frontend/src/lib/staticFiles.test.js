import fs from "node:fs";
import path from "node:path";

/**
 * The files that are not JavaScript, and the rewrite that used to eat them.
 *
 * `vercel.json` rewrote everything except `/api/` to `index.html`, so
 * `robots.txt`, `sitemap.xml` and `manifest.json` all answered HTTP 200 with
 * the SPA shell and `Content-Type: text/html`. A crawler asking for robots.txt
 * got HTML, which means no directive in it was ever honoured and the sitemap
 * was never read; a browser could not install the app; and a genuine 404 was
 * indistinguishable from a real page.
 *
 * Nothing in the test suite renders a static file or a Vercel config, so this
 * reads both as text — the same approach `contrast-check.mjs` takes to CSS and
 * `test_pattern_schema.py` takes to SQL. It needs no build and no browser.
 */

const ROOT = path.resolve(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const vercel = () => JSON.parse(read("vercel.json"));

const SITE = "https://baakhapaascript.vercel.app";

// Anything served from public/ has to be carved out of the SPA rewrite, or it
// silently becomes HTML again.
const STATIC_FILES = ["robots.txt", "sitemap.xml", "manifest.webmanifest", "icon.svg"];

describe("the files exist at all", () => {
  it.each(STATIC_FILES)("public/%s is present", (file) => {
    expect(fs.existsSync(path.join(ROOT, "public", file))).toBe(true);
  });
});

describe("the SPA rewrite lets them through", () => {
  const source = () => vercel().rewrites[0].source;

  it.each(STATIC_FILES)("%s is excluded from the rewrite", (file) => {
    // The negative lookahead is the whole mechanism. Escaped dots in the
    // pattern, so the check normalises before comparing.
    expect(source().replace(/\\/g, "")).toContain(file);
  });

  it("still sends an unknown path to the router", () => {
    // Without this the 404 page is unreachable: Vercel would answer a genuine
    // 404 instead of handing the path to React Router, which is what renders
    // the page with the <h1>.
    const re = new RegExp("^" + source() + "$");

    expect(re.test("/this-route-does-not-exist")).toBe(true);
    expect(re.test("/dashboard")).toBe(true);
  });

  it("does not send the static files to the router", () => {
    const re = new RegExp("^" + source() + "$");

    for (const file of STATIC_FILES) {
      expect(re.test("/" + file), `${file} is still swallowed by the rewrite`).toBe(false);
    }
  });

  it("does not send hashed assets to the router", () => {
    const re = new RegExp("^" + source() + "$");

    expect(re.test("/assets/index-abc123.js")).toBe(false);
  });
});

describe("the files say the right things", () => {
  it("robots.txt points at the sitemap", () => {
    // A sitemap nothing references is a file nothing reads.
    expect(read("public/robots.txt")).toContain(`Sitemap: ${SITE}/sitemap.xml`);
  });

  it("robots.txt keeps crawlers out of the signed-in product", () => {
    const txt = read("public/robots.txt");

    for (const p of ["/dashboard", "/settings", "/projects/", "/payment/"]) {
      expect(txt, `${p} is crawlable`).toContain(`Disallow: ${p}`);
    }
  });

  it("the sitemap lists only routes a signed-out visitor can read", () => {
    const xml = read("public/sitemap.xml");

    for (const p of ["/", "/pricing", "/register", "/login", "/terms", "/privacy"]) {
      expect(xml, `${p} missing`).toContain(`<loc>${SITE}${p === "/" ? "/" : p}</loc>`);
    }
    // These redirect to /login for anyone without a session.
    for (const p of ["/dashboard", "/settings", "/learn"]) {
      expect(xml, `${p} should not be advertised`).not.toContain(`${SITE}${p}<`);
    }
  });

  it("the manifest is installable, which means it needs an icon", () => {
    // An empty `icons` array parses, validates, and cannot be installed — the
    // exact shape of a fix that looks done and is not.
    const m = JSON.parse(read("public/manifest.webmanifest"));

    expect(m.icons.length).toBeGreaterThan(0);
    expect(m.name).toBeTruthy();
    expect(m.start_url).toBeTruthy();
    expect(m.display).toBe("standalone");
    for (const icon of m.icons) {
      expect(fs.existsSync(path.join(ROOT, "public", icon.src.replace(/^\//, "")))).toBe(true);
    }
  });

  it("the manifest's theme colour matches the one the HTML already declares", () => {
    const m = JSON.parse(read("public/manifest.webmanifest"));
    const html = read("index.html");

    expect(html).toContain(`content="${m.theme_color}"`);
  });
});

describe("index.html", () => {
  it("links the manifest, or nothing reads it", () => {
    expect(read("index.html")).toContain('rel="manifest"');
  });

  it("carries a description for crawlers that do not run the script", () => {
    // Every route overwrites this once React is up. This is what a non-JS
    // crawler sees, and it was absent entirely.
    expect(read("index.html")).toMatch(/<meta name="description" content=".{40,}"/);
  });

  it("does not let the font stylesheet block the first paint", () => {
    // Measured on throttled mobile, the entry bundle did not begin loading
    // until 2,316 ms because this stylesheet sat ahead of it in the critical
    // path, and mobile LCP failed on nine of fourteen routes.
    // Match the STYLESHEET link, not the preconnect hint beside it — both
    // carry the fonts.googleapis.com host, and the preconnect is what a looser
    // pattern finds first.
    const html = read("index.html");
    const outsideNoscript = html.replace(/<noscript>[\s\S]*?<\/noscript>/g, "");
    const fontLink = outsideNoscript.match(/<link\b(?=[^>]*rel="stylesheet")[^>]*fonts\.googleapis\.com[^>]*>/s);

    expect(fontLink, "no font stylesheet link found").toBeTruthy();
    expect(fontLink[0]).toContain('media="print"');
    expect(fontLink[0]).toContain("onload");
  });

  it("still loads the fonts without JavaScript", () => {
    const html = read("index.html");
    const noscript = html.match(/<noscript>[\s\S]*?<\/noscript>/);

    expect(noscript).toBeTruthy();
    expect(noscript[0]).toContain("fonts.googleapis.com");
  });
});

describe("headers", () => {
  it("keeps the four security headers on every response", () => {
    const block = vercel().headers.find((h) => h.source === "/(.*)");
    const keys = block.headers.map((h) => h.key);

    expect(keys).toEqual(
      expect.arrayContaining([
        "X-Content-Type-Options",
        "X-Frame-Options",
        "Referrer-Policy",
        "Permissions-Policy",
      ])
    );
  });

  it("scopes cross-origin reads to the assets that need it", () => {
    // An audit flagged `Access-Control-Allow-Origin: *` on the HTML document.
    // Declaring it explicitly on /assets/* is the half this config controls;
    // the document's own header is added by the platform.
    const assets = vercel().headers.find((h) => h.source === "/assets/(.*)");
    const keys = assets.headers.map((h) => h.key);

    expect(keys).toContain("Access-Control-Allow-Origin");
    expect(keys).toContain("Cache-Control");
  });

  it("serves each static file as its own type, not as HTML", () => {
    const types = {
      "/robots.txt": "text/plain",
      "/sitemap.xml": "application/xml",
      "/manifest.webmanifest": "application/manifest+json",
    };

    for (const [source, expected] of Object.entries(types)) {
      const rule = vercel().headers.find((h) => h.source === source);
      expect(rule, `no Content-Type rule for ${source}`).toBeTruthy();
      expect(rule.headers[0].value).toContain(expected);
    }
  });
});
