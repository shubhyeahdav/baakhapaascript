from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
import io

from database import get_script_by_id, get_frames_by_script
from auth import get_current_user
import export_service

router = APIRouter(prefix="/export", tags=["export"])


@router.get("/script/pdf/{script_id}")
def export_pdf(script_id: str, user_id: str = Depends(get_current_user)):
    script = get_script_by_id(script_id)
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")
    pdf_bytes = export_service.export_script_pdf(script["content"], "Baakhapaa Script")
    return StreamingResponse(
        io.BytesIO(pdf_bytes), media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=script.pdf"},
    )


@router.get("/script/word/{script_id}")
def export_word(script_id: str, user_id: str = Depends(get_current_user)):
    script = get_script_by_id(script_id)
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")
    docx_bytes = export_service.export_script_word(script["content"], "Baakhapaa Script")
    return StreamingResponse(
        io.BytesIO(docx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": "attachment; filename=script.docx"},
    )


@router.get("/package/{script_id}")
def export_package(script_id: str, user_id: str = Depends(get_current_user)):
    script = get_script_by_id(script_id)
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")
    frames = get_frames_by_script(script_id)
    pdf_bytes = export_service.export_production_package(script["content"], frames, "Baakhapaa Package")
    return StreamingResponse(
        io.BytesIO(pdf_bytes), media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=production_package.pdf"},
    )
