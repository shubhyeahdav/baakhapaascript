from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
import io

from database import get_frames_by_script
from auth import get_current_user, require_script_access, require_tier
import export_service

router = APIRouter(prefix="/export", tags=["export"])

DOCX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def _download(data: bytes, media_type: str, filename: str) -> StreamingResponse:
    """Serve bytes as a browser download."""
    return StreamingResponse(
        io.BytesIO(data), media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/script/pdf/{script_id}")
def export_pdf(script_id: str, user_id: str = Depends(get_current_user)):
    script = require_script_access(script_id, user_id)
    pdf_bytes = export_service.export_script_pdf(script["content"] or "", "Baakhapaa Script")
    return _download(pdf_bytes, "application/pdf", "script.pdf")


@router.get("/script/word/{script_id}")
def export_word(script_id: str, user_id: str = Depends(get_current_user)):
    # Pricing page sells Word export as a paid feature. Until now this was
    # enforced in the UI only, so a direct GET returned the file to free users.
    require_tier(user_id, "Word export")
    script = require_script_access(script_id, user_id)
    docx_bytes = export_service.export_script_word(script["content"] or "", "Baakhapaa Script")
    return _download(docx_bytes, DOCX_MEDIA_TYPE, "script.docx")


@router.get("/script/fdx/{script_id}")
def export_fdx(script_id: str, user_id: str = Depends(get_current_user)):
    """Final Draft export. Free tier, like PDF: interoperability is not a
    premium feature — a writer who cannot get their work out of the tool
    will not start using it."""
    script = require_script_access(script_id, user_id)
    fdx_bytes = export_service.export_script_fdx(script["content"] or "", "Baakhapaa Script")
    return _download(fdx_bytes, "application/xml", "script.fdx")


@router.get("/package/{script_id}")
def export_package(script_id: str, user_id: str = Depends(get_current_user)):
    require_tier(user_id, "The production package export")
    script = require_script_access(script_id, user_id)
    frames = get_frames_by_script(script_id)
    pdf_bytes = export_service.export_production_package(script["content"] or "", frames, "Baakhapaa Package")
    return _download(pdf_bytes, "application/pdf", "production_package.pdf")
