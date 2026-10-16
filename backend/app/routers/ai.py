"""AI endpoints: image extraction and chat-driven drafting."""

import json

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.ai.chat import chat_with_draft
from app.ai.client import AINotConfigured
from app.ai.extract import extract_prescription_from_image
from app.schemas import ChatRequest, ChatResponse

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


@router.post("/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest):
    """Talk to the prescribing assistant; returns the updated draft."""
    try:
        draft, reply, actions = await chat_with_draft(
            payload.draft, payload.message, payload.history
        )
    except AINotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    return ChatResponse(draft=draft, reply=reply, actions=actions)
