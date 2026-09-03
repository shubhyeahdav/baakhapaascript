"""Render a monthly progress report to PDF, in the format Month 1 was submitted in.

The Month 1 report was delivered as a six-page US Letter PDF with no title page
and no contents: the title, a subtitle, a one-line byline, then numbered
sections straight away. This reproduces that, so Month 2 and Month 3 arrive in
the same shape rather than each being formatted from scratch.

It reads the same Markdown the Word build reads, so the two cannot drift.

    ./venv/Scripts/python ../docs/md2pdf.py ../MONTH_2_REPORT.md ../docs/out.pdf ..

Figure numbers are assigned in document order rather than taken from the text,
so moving or removing a figure renumbers the rest instead of leaving a caption
that disagrees with its position.
"""
import io
import os
import re
import sys

from reportlab.lib import colors
from reportlab.lib.enums import TA_JUSTIFY, TA_CENTER
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, Image,
    Table, TableStyle, KeepTogether,
)

MARGIN = 0.9 * inch
CONTENT_W = LETTER[0] - MARGIN * 2

INK = colors.HexColor("#1A1A1A")
SOFT = colors.HexColor("#555555")
RULE = colors.HexColor("#D5D5D5")
SHADE = colors.HexColor("#F0F0F0")

S = {
    "title": ParagraphStyle("title", fontName="Helvetica-Bold", fontSize=19,
                            leading=23, textColor=INK, spaceAfter=4),
    "subtitle": ParagraphStyle("subtitle", fontName="Helvetica", fontSize=11,
                               leading=14, textColor=INK, spaceAfter=2),
    "byline": ParagraphStyle("byline", fontName="Helvetica", fontSize=8.5,
                             leading=12, textColor=SOFT, spaceAfter=14),
    "h1": ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=13,
                         leading=16, textColor=INK, spaceBefore=16, spaceAfter=7),
    "h2": ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=10.5,
                         leading=13, textColor=INK, spaceBefore=12, spaceAfter=5),
    "body": ParagraphStyle("body", fontName="Helvetica", fontSize=9.5,
                           leading=13.4, textColor=INK, alignment=TA_JUSTIFY,
                           spaceAfter=7),
    "li": ParagraphStyle("li", fontName="Helvetica", fontSize=9.5, leading=13.4,
                         textColor=INK, leftIndent=14, bulletIndent=2, spaceAfter=4),
    "caption": ParagraphStyle("caption", fontName="Helvetica-Oblique", fontSize=7.6,
                              leading=10.2, textColor=SOFT, spaceBefore=4, spaceAfter=12),
    "mono": ParagraphStyle("mono", fontName="Courier", fontSize=8, leading=11,
                           textColor=INK, spaceAfter=0, leftIndent=6),
    "cell": ParagraphStyle("cell", fontName="Helvetica", fontSize=8.2, leading=11,
                           textColor=INK),
    "cellh": ParagraphStyle("cellh", fontName="Helvetica-Bold", fontSize=8.2,
                            leading=11, textColor=INK),
}


def inline(text):
    """Markdown emphasis to ReportLab's inline markup."""
    text = (text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))
    text = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<i>\1</i>", text)
    text = re.sub(r"`([^`]+)`", r'<font face="Courier" size="8.5">\1</font>', text)
    return text


def build_table(rows):
    cells = lambda r: [c.strip() for c in r.strip().strip("|").split("|")]
    header, body = cells(rows[0]), [cells(r) for r in rows[2:]]
    n = len(header)
    # The first column of the deliverables table is a week number; give the
    # wide prose columns the room instead of splitting evenly.
    if n == 4:
        widths = [0.06, 0.22, 0.48, 0.24]
    elif n == 3:
        widths = [0.44, 0.28, 0.28]
    else:
        widths = [1 / n] * n
    widths = [w * CONTENT_W for w in widths]

    data = [[Paragraph(inline(c), S["cellh"]) for c in header]]
    data += [[Paragraph(inline(c), S["cell"]) for c in r] for r in body]

    t = Table(data, colWidths=widths, hAlign="LEFT", repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), SHADE),
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, RULE),
        ("LINEBELOW", (0, 1), (-1, -2), 0.25, RULE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return t


def render(md_path, out_path, root):
    lines = io.open(md_path, encoding="utf-8").read().split("\n")
    flow = []
    figure_no = 0
    i = 0

    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            continue

        m = re.match(r"^!\[[^\]]*\]\(([^)]+)\)", line)
        if m:
            path = os.path.join(root, m.group(1))
            if os.path.exists(path):
                from reportlab.lib.utils import ImageReader
                iw, ih = ImageReader(path).getSize()
                w = CONTENT_W
                flow.append(Image(path, width=w, height=w * ih / iw))
            i += 1
            continue

        if line.lstrip().startswith("|"):
            rows = []
            while i < len(lines) and lines[i].lstrip().startswith("|"):
                rows.append(lines[i]); i += 1
            flow += [build_table(rows), Spacer(1, 10)]
            continue

        if re.match(r"^ {4}\S", line):
            block = []
            while i < len(lines) and (re.match(r"^ {4}", lines[i]) or
                                      (not lines[i].strip() and
                                       re.match(r"^ {4}", lines[i + 1] if i + 1 < len(lines) else ""))):
                block.append(lines[i][4:]); i += 1
            for b in block:
                flow.append(Paragraph(
                    (b or " ").replace(" ", "&nbsp;").replace("<", "&lt;"), S["mono"]))
            flow.append(Spacer(1, 9))
            continue

        li = re.match(r"^\s*(?:([-*])|(\d+)\.)\s+(.*)$", line)
        if li:
            items = []
            ordered = li.group(2) is not None
            while i < len(lines) and lines[i].strip():
                m2 = re.match(r"^\s*(?:[-*]|\d+\.)\s+(.*)$", lines[i])
                if m2:
                    items.append(m2.group(1))
                elif re.match(r"^\s{2,}\S", lines[i]) and items:
                    items[-1] += " " + lines[i].strip()
                else:
                    break
                i += 1
            for n, it in enumerate(items, 1):
                flow.append(Paragraph(inline(it), S["li"],
                                      bulletText=f"{n}." if ordered else "•"))
            flow.append(Spacer(1, 5))
            continue

        h = re.match(r"^(#{1,3})\s+(.*)$", line)
        if h:
            depth, text = len(h.group(1)), h.group(2)
            if depth == 1:
                flow.append(Paragraph(inline(text), S["title"]))
            else:
                flow.append(Paragraph(inline(text), S["h1" if depth == 2 else "h2"]))
            i += 1
            continue

        para = []
        while (i < len(lines) and lines[i].strip()
               and not re.match(r"^[|#!]", lines[i])
               and not re.match(r"^ {4}\S", lines[i])
               and not re.match(r"^\s*(?:[-*]|\d+\.)\s", lines[i])):
            para.append(lines[i].strip()); i += 1
        text = " ".join(para)

        # The two lines under the title are the subtitle and the byline.
        if len(flow) == 1 and text.startswith("**"):
            parts = text.split("**")
            flow.append(Paragraph(inline(parts[1]), S["subtitle"]))
            rest = "**".join(parts[2:]).strip()
            if rest:
                flow.append(Paragraph(inline(rest), S["byline"]))
            continue

        cap = re.match(r"^\*\*Figure \d+\.\*\*\s*(.*)$", text, re.S)
        if cap:
            nonlocal_no = figure_no = figure_no + 1
            flow.append(Paragraph(
                f"<b>Figure {nonlocal_no}.</b> " + inline(cap.group(1)), S["caption"]))
            continue

        flow.append(Paragraph(inline(text), S["body"]))

    def footer(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(SOFT)
        canvas.drawCentredString(LETTER[0] / 2, MARGIN * 0.55, str(doc.page))
        canvas.restoreState()

    doc = BaseDocTemplate(out_path, pagesize=LETTER,
                          leftMargin=MARGIN, rightMargin=MARGIN,
                          topMargin=MARGIN, bottomMargin=MARGIN,
                          title="Month 2 progress report", author="Baakhapaa")
    frame = Frame(MARGIN, MARGIN, CONTENT_W, LETTER[1] - MARGIN * 2, id="body")
    doc.addPageTemplates([PageTemplate(id="all", frames=[frame], onPage=footer)])
    doc.build(flow)
    return doc.page


if __name__ == "__main__":
    md, out = sys.argv[1], sys.argv[2]
    root = sys.argv[3] if len(sys.argv) > 3 else os.path.dirname(md) or "."
    pages = render(md, out, root)
    print(f"wrote {out} ({pages} pages)")
