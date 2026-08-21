from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
import io
import re

from database import get_frames_by_script, get_scenes_by_script, get_project_by_id
import membership
from auth import get_current_user, require_script_access, require_tier
import export_service

router = APIRouter(prefix="/export", tags=["export"])

DOCX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def _script_title(script: dict) -> str:
    """The project's own title.

    Every export used to be titled "Baakhapaa Script" and download as
    `script.pdf`, whatever the project was called — so a writer with three
    projects got three identically named files with somebody else's name on the
    title page.
    """
    project = get_project_by_id(script.get("project_id")) or {}
    return (project.get("title") or "").strip() or "Untitled Script"


def _filename(title: str, extension: str) -> str:
    """A title safe to put in a Content-Disposition header and on a filesystem."""
    stem = re.sub(r"[^A-Za-z0-9._ -]", "", title).strip().replace(" ", "_")[:60]
    return f"{stem or 'script'}.{extension}"


def _download(data: bytes, media_type: str, filename: str) -> StreamingResponse:
    """Serve bytes as a browser download."""
    return StreamingResponse(
        io.BytesIO(data), media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/script/pdf/{script_id}")
def export_pdf(script_id: str, user_id: str = Depends(get_current_user)):
    # Exports are reads: a viewer is exactly the person who needs the PDF.
    script = require_script_access(script_id, user_id, minimum=membership.VIEWER)
    title = _script_title(script)
    pdf_bytes = export_service.export_script_pdf(script["content"] or "", title)
    return _download(pdf_bytes, "application/pdf", _filename(title, "pdf"))


@router.get("/script/word/{script_id}")
def export_word(script_id: str, user_id: str = Depends(get_current_user)):
    # Pricing page sells Word export as a paid feature. Until now this was
    # enforced in the UI only, so a direct GET returned the file to free users.
    require_tier(user_id, "Word export")
    script = require_script_access(script_id, user_id, minimum=membership.VIEWER)
    title = _script_title(script)
    docx_bytes = export_service.export_script_word(script["content"] or "", title)
    return _download(docx_bytes, DOCX_MEDIA_TYPE, _filename(title, "docx"))


@router.get("/script/fdx/{script_id}")
def export_fdx(script_id: str, user_id: str = Depends(get_current_user)):
    """Final Draft export. Free tier, like PDF: interoperability is not a
    premium feature — a writer who cannot get their work out of the tool
    will not start using it."""
    script = require_script_access(script_id, user_id, minimum=membership.VIEWER)
    title = _script_title(script)
    fdx_bytes = export_service.export_script_fdx(script["content"] or "", title)
    return _download(fdx_bytes, "application/xml", _filename(title, "fdx"))


@router.get("/package/{script_id}")
def export_package(script_id: str, user_id: str = Depends(get_current_user)):
    require_tier(user_id, "The production package export")
    script = require_script_access(script_id, user_id, minimum=membership.VIEWER)
    title = _script_title(script)
    # Scenes travel with the frames: a frame knows its shot type and image, and
    # the scene knows where it is, who is in it and what happens. A shot list
    # needs both.
    pdf_bytes = export_service.export_production_package(
        script["content"] or "",
        get_frames_by_script(script_id),
        title,
        scenes=get_scenes_by_script(script_id),
    )
    return _download(pdf_bytes, "application/pdf", _filename(f"{title} Production Package", "pdf"))
