/**
 * Turn a monthly progress report into a Word document.
 *
 * Deliberately a converter for the subset of Markdown these reports use —
 * headings, paragraphs, tables, figures, indented output, and inline bold /
 * italic / code — rather than a transcription. Month 3 has to be able to run
 * the same command, and a hand-built document would drift from the markdown
 * the moment either was edited.
 *
 *   node md2docx.mjs REPORT.md out.docx <repo root> [report.config.json]
 *
 * With a config file it produces the formal submission: title page, contents,
 * list of figures, page numbers, and figure numbers assigned in document order
 * rather than typed into the markdown by hand.
 */
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun, PageBreak,
  Table, TableRow, TableCell, WidthType, ShadingType, AlignmentType,
  TableOfContents, Header, Footer, PageNumber, BorderStyle,
  PositionalTab, PositionalTabAlignment, PositionalTabLeader,
} from "docx";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";

const [, , mdPath, outPath, rootArg, configPath] = process.argv;
const root = rootArg || dirname(mdPath);
const cfg = configPath && existsSync(configPath)
  ? JSON.parse(readFileSync(configPath, "utf8"))
  : null;

const lines = readFileSync(mdPath, "utf8").split(/\r?\n/);

// US Letter, in DXA. The library defaults to A4.
const PAGE = { width: 12240, height: 15840 };
const MARGIN = 1440;
const CONTENT_W = PAGE.width - MARGIN * 2;

/** Inline **bold**, *italic* and `code`. */
function runs(text, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(new TextRun({ ...base, text: text.slice(last, m.index) }));
    const t = m[0];
    if (t.startsWith("**")) out.push(new TextRun({ ...base, text: t.slice(2, -2), bold: true }));
    else if (t.startsWith("`")) out.push(new TextRun({ ...base, text: t.slice(1, -1), font: "Consolas", size: 19 }));
    else out.push(new TextRun({ ...base, text: t.slice(1, -1), italics: true }));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(new TextRun({ ...base, text: text.slice(last) }));
  return out.length ? out : [new TextRun({ ...base, text: "" })];
}

const cells = (row) => row.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

function table(rows) {
  const header = cells(rows[0]);
  const body = rows.slice(2).map(cells);
  const widths = Array(header.length).fill(Math.floor(CONTENT_W / header.length));
  const mkRow = (values, isHeader) =>
    new TableRow({
      tableHeader: isHeader,
      children: values.map((v, i) =>
        new TableCell({
          width: { size: widths[i], type: WidthType.DXA },
          // CLEAR, never SOLID — SOLID renders black.
          shading: isHeader ? { type: ShadingType.CLEAR, fill: "EFEFEF" } : undefined,
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          children: [new Paragraph({ children: runs(v, { size: 19, bold: isHeader }) })],
        })),
    });
  return new Table({
    columnWidths: widths,
    width: { size: CONTENT_W, type: WidthType.DXA },
    rows: [mkRow(header, true), ...body.map((r) => mkRow(r, false))],
  });
}

// ---------------------------------------------------------------- body ----

const body = [];
const figures = [];   // collected so the List of Figures is generated, not typed
let i = 0;

while (i < lines.length) {
  const line = lines[i];
  if (!line.trim()) { i++; continue; }

  const img = line.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
  if (img) {
    const file = resolve(root, img[2]);
    if (existsSync(file)) {
      // Compact mode is aiming at a page count, and a full-width screenshot
      // costs about a third of a page each.
      const w = cfg?.compact ? 400 : 560;
      const h = Math.round((900 / 1440) * w);
      body.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 240, after: 80 },
        children: [new ImageRun({ type: "png", data: readFileSync(file), transformation: { width: w, height: h } })],
      }));
    }
    i++; continue;
  }

  if (line.trim().startsWith("|")) {
    const rows = [];
    while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(lines[i++]);
    body.push(table(rows));
    body.push(new Paragraph({ text: "", spacing: { after: 200 } }));
    continue;
  }

  // Indented output block
  if (/^ {4}\S/.test(line)) {
    const block = [];
    while (i < lines.length && (/^ {4}/.test(lines[i]) || (!lines[i].trim() && /^ {4}/.test(lines[i + 1] || "")))) {
      block.push(lines[i++].replace(/^ {4}/, ""));
    }
    block.forEach((b) => body.push(new Paragraph({
      shading: { type: ShadingType.CLEAR, fill: "F4F4F4" },
      spacing: { after: 0 },
      children: [new TextRun({ text: b || " ", font: "Consolas", size: 18 })],
    })));
    body.push(new Paragraph({ text: "", spacing: { after: 200 } }));
    continue;
  }

  // Bulleted and numbered lists
  const li = line.match(/^\s*([-*]|\d+\.)\s+(.*)$/);
  if (li) {
    const items = [];
    while (i < lines.length && lines[i].trim()) {
      const m2 = lines[i].match(/^\s*(?:[-*]|\d+\.)\s+(.*)$/);
      if (m2) items.push(m2[1]);
      else if (/^\s{2,}\S/.test(lines[i]) && items.length) items[items.length - 1] += " " + lines[i].trim();
      else break;
      i++;
    }
    const ordered = /^\s*\d+\./.test(li[0]);
    items.forEach((text, n) => body.push(new Paragraph({
      numbering: ordered ? undefined : undefined,
      indent: { left: 520, hanging: 260 },
      spacing: { after: 90, line: 300 },
      children: [
        new TextRun({ text: ordered ? `${n + 1}.  ` : "•  ", size: 22 }),
        ...runs(text, { size: 22 }),
      ],
    })));
    body.push(new Paragraph({ text: "", spacing: { after: 100 } }));
    continue;
  }

  const h = line.match(/^(#{1,3})\s+(.*)$/);
  if (h) {
    // The document title comes from the config in formal mode, so the H1 is
    // dropped rather than repeated on the page after the title page.
    if (h[1].length === 1 && cfg) { i++; continue; }
    const level = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_1, HeadingLevel.HEADING_2][h[1].length - 1];
    body.push(new Paragraph({
      heading: level,
      pageBreakBefore: cfg && !cfg.compact && h[1].length === 2,
      spacing: { before: 320, after: 160 },
      children: runs(h[2]),
    }));
    i++; continue;
  }

  const para = [];
  while (i < lines.length && lines[i].trim() && !/^[|#!]/.test(lines[i])
         && !/^ {4}\S/.test(lines[i]) && !/^\s*(?:[-*]|\d+\.)\s/.test(lines[i])) {
    para.push(lines[i++].trim());
  }
  const text = para.join(" ");

  // Figure captions are renumbered in document order and collected for the
  // list of figures, so moving a figure cannot leave the numbering wrong.
  const cap = text.match(/^\*\*Figure \d+\.\*\*\s*(.*)$/s);
  if (cap) {
    const n = figures.length + 1;
    figures.push(cap[1].split(". ")[0].replace(/\*/g, ""));
    body.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [
        new TextRun({ text: `Figure ${n}. `, bold: true, size: 19 }),
        ...runs(cap[1], { size: 19, italics: true }),
      ],
    }));
    continue;
  }

  body.push(new Paragraph({
    spacing: { after: cfg?.compact ? 120 : 180, line: cfg?.compact ? 276 : 320 },
    alignment: cfg ? AlignmentType.JUSTIFIED : AlignmentType.LEFT,
    children: runs(text, { size: 22 }),
  }));
}

// --------------------------------------------------------- front matter ----

const centred = (text, opts = {}) =>
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: opts.after ?? 120 },
                  children: [new TextRun({ text, ...opts })] });

const front = [];
if (cfg && cfg.compact) {
  // A short report does not get a page to itself for a title and another for a
  // three-line contents. The block sits at the top of page one instead, which
  // is what a five-page document actually looks like.
  front.push(
    centred(cfg.title, { size: 40, bold: true, after: 40 }),
    centred(cfg.subtitle, { size: 22, italics: true, after: 200 }),
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 60 },
      border: { top: { style: BorderStyle.SINGLE, size: 6, color: "999999", space: 6 },
                bottom: { style: BorderStyle.SINGLE, size: 6, color: "999999", space: 6 } },
      children: [new TextRun({ text: cfg.documentType.toUpperCase(), size: 21, bold: true, characterSpacing: 30 })],
    }),
    centred(`${cfg.period}  ·  Reference: ${cfg.reference}`, { size: 18, color: "555555", after: 200 }),
    centred([cfg.author, cfg.rollNumber].filter(Boolean).join("  ·  "), { size: 19, bold: true, after: 40 }),
    centred([cfg.programme, cfg.institution].filter(Boolean).join(", "), { size: 18, color: "555555", after: 40 }),
    centred(cfg.date, { size: 18, color: "555555", after: 320 }),
  );
  front.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 120, after: 120 },
                             children: [new TextRun("Contents")] }));
  front.push(new TableOfContents("Contents", { hyperlink: true, headingStyleRange: "1-2" }));
  front.push(new Paragraph({ children: [new PageBreak()] }));
} else if (cfg) {
  front.push(
    new Paragraph({ text: "", spacing: { after: 1400 } }),
    centred(cfg.title, { size: 56, bold: true, after: 60 }),
    centred(cfg.subtitle, { size: 26, italics: true, after: 700 }),
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 60 },
      border: { top: { style: BorderStyle.SINGLE, size: 6, color: "999999", space: 8 } },
      children: [new TextRun({ text: cfg.documentType.toUpperCase(), size: 24, bold: true, characterSpacing: 40 })],
    }),
    centred(`${cfg.period}  ·  Reference: ${cfg.reference}`, { size: 20, color: "555555", after: 1200 }),
    centred(cfg.author, { size: 24, bold: true, after: 60 }),
  );
  if (cfg.rollNumber) front.push(centred(cfg.rollNumber, { size: 20, color: "555555", after: 60 }));
  if (cfg.programme) front.push(centred(cfg.programme, { size: 20, after: 40 }));
  if (cfg.institution) front.push(centred(cfg.institution, { size: 20, after: 400 }));
  if (cfg.supervisor) front.push(centred(`Supervisor: ${cfg.supervisor}`, { size: 20, after: 60 }));
  if (cfg.submittedTo) front.push(centred(`Submitted to: ${cfg.submittedTo}`, { size: 20, after: 60 }));
  front.push(centred(cfg.date, { size: 20, color: "555555" }));
  front.push(new Paragraph({ children: [new PageBreak()] }));

  front.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { after: 200 },
                             children: [new TextRun("Contents")] }));
  front.push(new TableOfContents("Contents", { hyperlink: true, headingStyleRange: "1-2" }));
  front.push(new Paragraph({ children: [new PageBreak()] }));

  front.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { after: 200 },
                             children: [new TextRun("List of figures")] }));
  figures.forEach((f, n) => front.push(new Paragraph({
    spacing: { after: 100 },
    children: [new TextRun({ text: `Figure ${n + 1}.  ${f}`, size: 21 })],
  })));
  front.push(new Paragraph({ children: [new PageBreak()] }));
}

// --------------------------------------------------------------- output ----

const doc = new Document({
  creator: cfg?.author || "Baakhapaa",
  title: cfg ? `${cfg.documentType} — ${cfg.title}` : "Progress report",
  styles: {
    default: {
      document: { run: { font: "Calibri", size: 22 }, paragraph: { spacing: { line: 320 } } },
      heading1: { run: { size: 30, bold: true, color: "1A1A1A" }, paragraph: { spacing: { before: 320, after: 160 } } },
      heading2: { run: { size: 25, bold: true, color: "333333" }, paragraph: { spacing: { before: 280, after: 140 } } },
    },
  },
  sections: [{
    properties: { page: { size: PAGE, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } },
    headers: cfg ? { default: new Header({ children: [new Paragraph({
      alignment: AlignmentType.RIGHT, spacing: { after: 0 },
      children: [new TextRun({ text: `${cfg.title} — ${cfg.documentType}`, size: 17, color: "777777" })],
    })] }) } : undefined,
    footers: cfg ? { default: new Footer({ children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "777777" })],
    })] }) } : undefined,
    children: [...front, ...body],
  }],
});

writeFileSync(outPath, await Packer.toBuffer(doc));
console.log(`wrote ${outPath}${cfg ? "  (formal: title page, contents, list of figures)" : ""}`);
