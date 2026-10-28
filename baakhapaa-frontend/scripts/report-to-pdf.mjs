/**
 * Render a monthly progress report to PDF.
 *
 * Reports go to people who will not clone the repository, so the PDF is the
 * artefact — and the Month 3 report carries four screenshots, which is the
 * reason this renders through a browser rather than through a text-to-PDF
 * library. Playwright is already a dependency (capture-screenshots.mjs uses
 * it) and it lays out images, tables and page breaks without being told how.
 *
 * The markdown subset is deliberately the one the reports actually use --
 * headings, tables, images, inline emphasis, code spans, rules -- counted from
 * the file rather than guessed at. A general markdown parser would be a new
 * dependency for features no report contains.
 *
 *   node scripts/report-to-pdf.mjs ../MONTH_3_REPORT.md ../Baakhapaa_Month3_Report.pdf
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";

const [, , SRC, OUT] = process.argv;
if (!SRC || !OUT) {
  console.error("usage: node scripts/report-to-pdf.mjs <input.md> <output.pdf>");
  process.exit(2);
}

const srcPath = resolve(process.cwd(), SRC);
const baseDir = dirname(srcPath);
const md = readFileSync(srcPath, "utf8");
// The footer names the report it is printed on. It was a literal "Month 3
// progress report", so the Month 4 PDF said Month 3 on every page.
const FOOTER_TITLE = ((md.match(/^#\s+(.+)$/m) || [])[1] || "progress report").trim()
  .replace(/[<>&]/g, "");

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* Inline marks, applied after escaping so a literal < in the prose survives.
   Order matters: ** before *, or bold is eaten as two italics. */
const inline = (s) =>
  esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

const cells = (row) => row.split("|").slice(1, -1).map((c) => c.trim());

const lines = md.split(/\r?\n/);
const html = [];
let i = 0;

while (i < lines.length) {
  const line = lines[i];

  // Image on its own line. Resolved to a file: URL so the browser can load it
  // from disk -- a relative src against about:blank resolves to nothing and
  // the figure silently renders as a broken-image box.
  const img = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/.exec(line);
  if (img) {
    // The source path is kept AS WRITTEN. The temp HTML is written beside the
    // markdown, so a relative src resolves exactly as it does in the document.
    html.push(`<img src="${img[2]}" alt="${esc(img[1])}" />`);
    i += 1;
    continue;
  }

  // Table: a header row, a separator, then body rows.
  if (line.startsWith("|") && (lines[i + 1] || "").includes("---")) {
    const raw = [];
    while (i < lines.length && lines[i].startsWith("|")) raw.push(lines[i++]);
    const head = cells(raw[0]);
    const body = raw.slice(2).map(cells);
    // A leading empty header cell is a label column, not a heading — several
    // report tables are two-column key/value with no header text at all.
    const hasHead = head.some((c) => c !== "");
    html.push("<table>");
    if (hasHead) {
      html.push("<thead><tr>" + head.map((c) => `<th>${inline(c)}</th>`).join("") + "</tr></thead>");
    }
    html.push("<tbody>");
    for (const r of body) {
      html.push("<tr>" + r.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>");
    }
    html.push("</tbody></table>");
    continue;
  }

  if (/^###\s+/.test(line)) { html.push(`<h3>${inline(line.slice(4))}</h3>`); i += 1; continue; }
  if (/^##\s+/.test(line))  { html.push(`<h2>${inline(line.slice(3))}</h2>`); i += 1; continue; }
  if (/^#\s+/.test(line))   { html.push(`<h1>${inline(line.slice(2))}</h1>`); i += 1; continue; }
  if (/^---\s*$/.test(line)) { html.push("<hr />"); i += 1; continue; }
  if (line.trim() === "")    { i += 1; continue; }

  // A wrapped paragraph gathered back onto one line, so a hard-wrapped source
  // does not become a paragraph per source line.
  const buf = [line.trim()];
  while (i + 1 < lines.length && lines[i + 1].trim() !== ""
         && !/^(#{1,3}\s|\||---\s*$|!\[)/.test(lines[i + 1])) {
    buf.push(lines[++i].trim());
  }
  html.push(`<p>${inline(buf.join(" "))}</p>`);
  i += 1;
}

const doc = `<!doctype html><html><head><meta charset="utf-8" />
<style>
  @page { size: A4; margin: 18mm 16mm; }
  body { font: 10.5pt/1.55 "Segoe UI", system-ui, sans-serif; color: #1b1b1d; }
  h1 { font-size: 21pt; margin: 0 0 2mm; letter-spacing: -0.2pt; }
  h2 { font-size: 13pt; margin: 9mm 0 2.5mm; padding-bottom: 1.5mm;
       border-bottom: 0.6pt solid #d8d8d8; break-after: avoid; }
  h3 { font-size: 11pt; margin: 6mm 0 2mm; break-after: avoid; }
  p  { margin: 0 0 3mm; }
  strong { font-weight: 600; }
  code { font-family: Consolas, monospace; font-size: 9pt;
         background: #f3f3f3; padding: 0.4mm 1mm; border-radius: 1mm; }
  a { color: #1b1b1d; text-decoration: underline; }
  table { width: 100%; border-collapse: collapse; margin: 0 0 4mm;
          font-size: 9.5pt; break-inside: avoid; }
  th { text-align: left; background: #f3f3f3; font-weight: 600; }
  th, td { border: 0.4pt solid #d8d8d8; padding: 1.6mm 2.2mm; vertical-align: top; }
  /* Figures are the evidence; a screenshot split across a page break is
     evidence of nothing. */
  img { width: 100%; border: 0.4pt solid #d0d0d0; border-radius: 1mm;
        margin: 1mm 0 2mm; break-inside: avoid; }
  hr { border: 0; border-top: 0.6pt solid #d8d8d8; margin: 7mm 0 5mm; }
</style></head><body>${html.join("\n")}</body></html>`;

/* Written to a real file and NAVIGATED to, rather than pushed in with
   setContent. setContent leaves the page on an about:blank origin, and
   Chromium refuses to load file:// subresources from there -- so every figure
   silently failed and the first PDF carried two of four. */
const tmp = resolve(baseDir, ".report-render.html");
writeFileSync(tmp, doc, "utf8");

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(pathToFileURL(tmp).href, { waitUntil: "networkidle" });

/* Wait for every figure to DECODE, not just for the network to go quiet.
   `networkidle` does not reliably account for file:// loads, and the first run
   of this script produced a PDF with two of four screenshots missing -- silently,
   because a figure that fails to load leaves an empty box rather than an error.
   Counting the images back is the only way to know. */
const expected = (doc.match(/<img /g) || []).length;
await page.waitForFunction(
  (n) => {
    const imgs = [...document.images];
    return imgs.length === n && imgs.every((i) => i.complete && i.naturalWidth > 0);
  },
  expected,
  { timeout: 30000 },
);
console.log(`  ${expected} figure(s) loaded`);
await page.pdf({
  path: resolve(process.cwd(), OUT),
  format: "A4",
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: "<div></div>",
  footerTemplate:
    '<div style="width:100%;font:7.5pt sans-serif;color:#8a8a8a;padding:0 16mm;">'
    + `<span style="float:left">Baakhapaa — ${FOOTER_TITLE}</span>`
    + '<span style="float:right">'
    + '<span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
  margin: { top: "18mm", bottom: "16mm", left: "16mm", right: "16mm" },
});
await browser.close();
unlinkSync(tmp);
console.log(`wrote ${OUT}`);
