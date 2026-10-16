"""AI endpoints."""

import json

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.ai.client import AINotConfigured
from app.ai.extract import extract_prescription_from_image

router = APIRouter(prefix="/ai", tags=["ai"])

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}
MAX_BYTES = 10 * 1024 * 1024


@router.post("/extract")
async def extract_prescription(file: UploadFile = File(...)):
    """Extract a draft prescription (medicines + details) from an image."""
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=415, detail=f"Unsupported image type: {file.content_type}"
        )

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Image too large (max 10 MB)")

    try:
        draft = await extract_prescription_from_image(data, file.content_type)
    except AINotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="AI returned malformed output")

    return {"draft": draft.model_dump()}
