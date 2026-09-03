/**
 * Turn a monthly progress report into a Word document.
 *
 * Deliberately a converter for the subset of Markdown these reports use —
 * headings, paragraphs, tables, figures, indented code, and inline bold /
 * italic / code — rather than a transcription. Month 3 has to be able to run
 * the same command, and a hand-built document would drift from the markdown
 * the moment either was edited.
 *
 *   node md2docx.mjs ../../..//MONTH_2_REPORT.md out.docx "Repo root"
 */
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle, AlignmentType,
} from "docx";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";

const [, , mdPath, outPath, rootArg] = process.argv;
const root = rootArg || dirname(mdPath);
const lines = readFileSync(mdPath, "utf8").split(/\r?\n/);

// US Letter, in DXA. The default is A4.
const PAGE = { width: 12240, height: 15840 };
const MARGIN = 1440;
const CONTENT_W = PAGE.width - MARGIN * 2;

/** Inline **bold**, *italic* and `code`, as TextRuns. */
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
  const n = header.length;
  const widths = Array(n).fill(Math.floor(CONTENT_W / n));

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

const children = [];
let i = 0;

while (i < lines.length) {
  const line = lines[i];

  if (!line.trim()) { i++; continue; }

  // Figures: ![alt](path)
  const img = line.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
  if (img) {
    const file = resolve(root, img[2]);
    if (existsSync(file)) {
      // 1440x900 captures, scaled to the text column and kept in proportion.
      const w = 570, h = Math.round((900 / 1440) * 570);
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 200, after: 80 },
        children: [new ImageRun({ type: "png", data: readFileSync(file), transformation: { width: w, height: h } })],
      }));
    }
    i++; continue;
  }

  // Tables
  if (line.trim().startsWith("|")) {
    const rows = [];
    while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(lines[i++]);
    children.push(table(rows));
    children.push(new Paragraph({ text: "", spacing: { after: 160 } }));
    continue;
  }

  // Indented block (the eval output)
  if (/^ {4}\S/.test(line)) {
    const block = [];
    while (i < lines.length && (/^ {4}/.test(lines[i]) || !lines[i].trim())) {
      if (!lines[i].trim() && !/^ {4}/.test(lines[i + 1] || "")) break;
      block.push(lines[i++].replace(/^ {4}/, ""));
    }
    block.forEach((b) => children.push(new Paragraph({
      shading: { type: ShadingType.CLEAR, fill: "F4F4F4" },
      spacing: { after: 0 },
      children: [new TextRun({ text: b || " ", font: "Consolas", size: 18 })],
    })));
    children.push(new Paragraph({ text: "", spacing: { after: 160 } }));
    continue;
  }

  const h = line.match(/^(#{1,3})\s+(.*)$/);
  if (h) {
    const level = [HeadingLevel.TITLE, HeadingLevel.HEADING_1, HeadingLevel.HEADING_2][h[1].length - 1];
    children.push(new Paragraph({
      heading: level,
      spacing: { before: h[1].length === 1 ? 0 : 320, after: 140 },
      children: runs(h[2]),
    }));
    i++; continue;
  }

  // A paragraph runs until a blank line. Markdown hard-wraps; Word should not.
  const para = [];
  while (i < lines.length && lines[i].trim() && !/^[|#!]/.test(lines[i]) && !/^ {4}\S/.test(lines[i])) {
    para.push(lines[i++].trim());
  }
  const text = para.join(" ");
  const isCaption = /^\*\*Figure \d+\.\*\*/.test(text);
  children.push(new Paragraph({
    spacing: { after: isCaption ? 260 : 160, line: 300 },
    alignment: isCaption ? AlignmentType.CENTER : AlignmentType.LEFT,
    children: runs(text, isCaption ? { size: 19, italics: true } : { size: 22 }),
  }));
}

const doc = new Document({
  creator: "Baakhapaa",
  title: "Month 2 progress report",
  styles: {
    default: {
      document: { run: { font: "Calibri", size: 22 }, paragraph: { spacing: { line: 300 } } },
      title: { run: { size: 40, bold: true, color: "1A1A1A" } },
      heading1: { run: { size: 30, bold: true, color: "1A1A1A" } },
      heading2: { run: { size: 25, bold: true, color: "333333" } },
    },
  },
  sections: [{
    properties: { page: { size: PAGE, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } },
    children,
  }],
});

writeFileSync(outPath, await Packer.toBuffer(doc));
console.log(`wrote ${outPath}`);
