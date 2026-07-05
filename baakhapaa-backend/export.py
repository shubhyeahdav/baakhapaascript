from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
import io

from database import get_frames_by_script
from auth import get_current_user, require_script_access
import export_service

router = APIRouter(prefix="/export", tags=["export"])


@router.get("/script/pdf/{script_id}")
def export_pdf(script_id: str, user_id: str = Depends(get_current_user)):
    script = require_script_access(script_id, user_id)
    pdf_bytes = export_service.export_script_pdf(script["content"] or "", "Baakhapaa Script")
    return StreamingResponse(
        io.BytesIO(pdf_bytes), media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=script.pdf"},
    )


@router.get("/script/word/{script_id}")
def export_word(script_id: str, user_id: str = Depends(get_current_user)):
    script = require_script_access(script_id, user_id)
    docx_bytes = export_service.export_script_word(script["content"] or "", "Baakhapaa Script")
    return StreamingResponse(
        io.BytesIO(docx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": "attachment; filename=script.docx"},
    )


@router.get("/package/{script_id}")
def export_package(script_id: str, user_id: str = Depends(get_current_user)):
    script = require_script_access(script_id, user_id)
    frames = get_frames_by_script(script_id)
    pdf_bytes = export_service.export_production_package(script["content"] or "", frames, "Baakhapaa Package")
    return StreamingResponse(
        io.BytesIO(pdf_bytes), media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=production_package.pdf"},
    )
