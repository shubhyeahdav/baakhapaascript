import io
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from docx import Document
from docx.shared import Pt, Inches


def export_script_pdf(script_content: str, title: str = "Untitled") -> bytes:
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4

    c.setFont("Courier-Bold", 16)
    c.drawCentredString(width / 2, height - 100, title)
    c.showPage()

    c.setFont("Courier", 12)
    y = height - 72
    page_num = 1
    for line in script_content.split("\n"):
        if y < 60:
            c.drawRightString(width - 40, 30, str(page_num))
            c.showPage()
            c.setFont("Courier", 12)
            y = height - 72
            page_num += 1
        c.drawString(90, y, line[:90])
        y -= 16
    c.drawRightString(width - 40, 30, str(page_num))
    c.save()
    buffer.seek(0)
    return buffer.read()


def export_script_word(script_content: str, title: str = "Untitled") -> bytes:
    doc = Document()
    heading = doc.add_heading(title, level=1)
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

    c.setFont("Courier-Bold", 18)
    c.drawCentredString(width / 2, height / 2, title)
    c.setFont("Courier", 10)
    c.drawCentredString(width / 2, height / 2 - 30, "Production Package")
    c.showPage()

    c.setFont("Courier", 12)
    y = height - 72
    for line in script_content.split("\n"):
        if y < 60:
            c.showPage()
            c.setFont("Courier", 12)
            y = height - 72
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
