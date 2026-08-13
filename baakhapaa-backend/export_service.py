import io
import os
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from docx import Document
from docx.shared import Pt

# ---------------------------------------------------------------------------
# Devanagari support
#
# ReportLab's built-in Courier has no Devanagari glyphs, so Nepali dialogue
# rendered with it comes out as blank boxes. We register a Unicode TTF instead
# and fall back to Courier only if none is found.
#
# For deployment, bundle Noto Sans Devanagari (SIL Open Font License, so it is
# redistributable) at assets/NotoSansDevanagari-Regular.ttf. The Windows path
# below is a local-development convenience only — Nirmala UI is a Microsoft
# font and must not be shipped.
# ---------------------------------------------------------------------------
_ASSETS = os.path.join(os.path.dirname(__file__), "assets")

# (path, subfont_index) — .ttc collections need an index; .ttf files ignore it.
_FONT_CANDIDATES = [
    (os.path.join(_ASSETS, "NotoSansDevanagari-Regular.ttf"), None),
    (os.path.join(_ASSETS, "NotoSansDevanagari.ttf"), None),
    ("/usr/share/fonts/truetype/noto/NotoSansDevanagari-Regular.ttf", None),
    (r"C:\Windows\Fonts\Nirmala.ttc", 0),  # local dev only — not redistributable
]

_BOLD_CANDIDATES = [
    (os.path.join(_ASSETS, "NotoSansDevanagari-Bold.ttf"), None),
    ("/usr/share/fonts/truetype/noto/NotoSansDevanagari-Bold.ttf", None),
    (r"C:\Windows\Fonts\NirmalaB.ttf", None),
]


def _try_register(name: str, path: str, subfont) -> bool:
    if not os.path.exists(path):
        return False
    try:
        if subfont is None:
            pdfmetrics.registerFont(TTFont(name, path))
        else:
            pdfmetrics.registerFont(TTFont(name, path, subfontIndex=subfont))
        return True
    except Exception:
        return False


def _register_devanagari_font():
    """Register a Devanagari-capable font. Returns (body_font, bold_font)."""
    body, bold = "Courier", "Courier-Bold"

    for path, subfont in _FONT_CANDIDATES:
        if _try_register("BaakhapaaScript", path, subfont):
            body = "BaakhapaaScript"
            break

    if body == "Courier":
        print(
            "WARNING: no Devanagari font found — PDF export will render Nepali "
            "text as blank boxes. Add NotoSansDevanagari-Regular.ttf to "
            "baakhapaa-backend/assets/."
        )
        return body, bold

    for path, subfont in _BOLD_CANDIDATES:
        if _try_register("BaakhapaaScript-Bold", path, subfont):
            bold = "BaakhapaaScript-Bold"
            break
    if bold == "Courier-Bold":
        bold = body  # better an unbolded Devanagari heading than a missing glyph

    return body, bold


BODY_FONT, BOLD_FONT = _register_devanagari_font()
DEVANAGARI_READY = BODY_FONT != "Courier"


def _has_devanagari(text: str) -> bool:
    return any("ऀ" <= ch <= "ॿ" for ch in text)


def _font_for(line: str) -> str:
    """Courier for Latin lines, the Unicode font only where it's needed.

    Screenplay format depends on a monospaced page, and the available
    Devanagari faces are proportional. Switching per line keeps English
    action and sluglines correctly monospaced while still rendering Nepali
    dialogue instead of blank boxes.
    """
    return BODY_FONT if (DEVANAGARI_READY and _has_devanagari(line)) else "Courier"


def export_script_pdf(script_content: str, title: str = "Untitled") -> bytes:
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4

    c.setFont(BOLD_FONT if _has_devanagari(title) else "Courier-Bold", 16)
    c.drawCentredString(width / 2, height - 100, title)
    c.showPage()

    y = height - 72
    page_num = 1
    for line in script_content.split("\n"):
        if y < 60:
            c.drawRightString(width - 40, 30, str(page_num))
            c.showPage()
            y = height - 72
            page_num += 1
        c.setFont(_font_for(line), 12)
        c.drawString(90, y, line[:90])
        y -= 16
    c.drawRightString(width - 40, 30, str(page_num))
    c.save()
    buffer.seek(0)
    return buffer.read()


_FDX_TYPE = {
    "scene_heading": "Scene Heading",
    "action": "Action",
    "character": "Character",
    "parenthetical": "Parenthetical",
    "dialogue": "Dialogue",
    "transition": "Transition",
}


def export_script_fdx(script_content: str, title: str = "Untitled") -> bytes:
    """Final Draft (.fdx) export.

    The format every other screenwriting tool reads and writes. Without it a
    writer cannot hand the script to anyone working in Final Draft, Celtx, or
    Arc Studio without retyping it — PDF and Word are both read-only as far as
    screenplay structure is concerned.

    .fdx is plain XML: a flat list of typed paragraphs. The element types come
    straight from the parser, which is why this is short.
    """
    import xml.etree.ElementTree as ET

    import screenplay

    doc = ET.Element("FinalDraft", {
        "DocumentType": "Script", "Template": "No", "Version": "5",
    })
    content = ET.SubElement(doc, "Content")

    for el in screenplay.parse(script_content):
        para = ET.SubElement(content, "Paragraph", {"Type": _FDX_TYPE[el.type]})
        ET.SubElement(para, "Text").text = el.text

    title_page = ET.SubElement(doc, "TitlePage")
    tp_content = ET.SubElement(title_page, "Content")
    para = ET.SubElement(tp_content, "Paragraph", {"Alignment": "Center"})
    ET.SubElement(para, "Text").text = title

    return b'<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' + ET.tostring(
        doc, encoding="utf-8"
    )


def export_script_word(script_content: str, title: str = "Untitled") -> bytes:
    doc = Document()
    doc.add_heading(title, level=1)
    for line in script_content.split("\n"):
        p = doc.add_paragraph(line)
        p.style.font.name = "Courier New"
        p.style.font.size = Pt(12)
    buffer = io.BytesIO()
    doc.save(buffer)
    buffer.seek(0)
    return buffer.read()


def export_production_package(script_content: str, frames: list, title: str = "Untitled") -> bytes:
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4

    c.setFont(BOLD_FONT if _has_devanagari(title) else "Courier-Bold", 18)
    c.drawCentredString(width / 2, height / 2, title)
    c.setFont("Courier", 10)
    c.drawCentredString(width / 2, height / 2 - 30, "Production Package")
    c.showPage()

    y = height - 72
    for line in script_content.split("\n"):
        if y < 60:
            c.showPage()
            y = height - 72
        c.setFont(_font_for(line), 12)
        c.drawString(90, y, line[:90])
        y -= 16
    c.showPage()

    c.setFont("Courier-Bold", 14)
    c.drawString(72, height - 72, "SHOT LIST")
    c.setFont("Courier", 10)
    y = height - 110
    for i, frame in enumerate(frames):
        if y < 60:
            c.showPage()
            y = height - 72
        c.drawString(72, y, f"Scene {i+1} | {frame.get('shot_type', 'N/A')}")
        y -= 20
    c.save()
    buffer.seek(0)
    return buffer.read()
