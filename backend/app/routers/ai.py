"""AI endpoints: image extraction and chat-driven drafting."""

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from google.api_core import exceptions as google_exceptions
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.chat import chat_with_draft
from app.ai.client import AIBadResponse, AINotConfigured
from app.ai.extract import extract_prescription_from_image
from app.ai.patient_chat import parse_checkup_request
from app.database import get_db
from app.models import Patient, PatientDoctorVisit, Prescription
from app.schemas import (
    ChatRequest,
    ChatResponse,
    PatientChatRequest,
    PatientChatResponse,
)

router = APIRouter(prefix="/ai", tags=["ai"])

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}
MAX_BYTES = 10 * 1024 * 1024


def _as_http_error(exc: Exception) -> HTTPException:
    """Translate an AI-pipeline failure into a meaningful status code."""
    if isinstance(exc, AINotConfigured):
        return HTTPException(status_code=503, detail=str(exc))
    if isinstance(exc, AIBadResponse):
        return HTTPException(status_code=502, detail=str(exc))
    if isinstance(exc, google_exceptions.ResourceExhausted):
        return HTTPException(
            status_code=429,
            detail=(
                "Gemini rate limit reached. The free tier allows only a few "
                "requests per minute — wait a moment and try again."
            ),
        )
    return HTTPException(status_code=502, detail=f"AI request failed: {exc}")


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
    except HTTPException:
        raise
    except Exception as exc:
        raise _as_http_error(exc)

    return {"draft": draft.model_dump()}


@router.post("/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest):
    """Talk to the prescribing assistant; returns the updated draft."""
    try:
        draft, reply, actions = await chat_with_draft(
            payload.draft, payload.message, payload.history
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise _as_http_error(exc)

    return ChatResponse(draft=draft, reply=reply, actions=actions)


@router.post("/patient-chat", response_model=PatientChatResponse)
def patient_chat(payload: PatientChatRequest, db: Session = Depends(get_db)):
    """Let a patient schedule a follow-up in plain language."""
    patient = db.get(Patient, payload.patient_id)
    if patient is None:
        raise HTTPException(
            status_code=404, detail=f"Patient {payload.patient_id} not found"
        )

    target = parse_checkup_request(payload.message)
    if target is None:
        return PatientChatResponse(
            reply=(
                "I can help you book a follow-up. Try: "
                "\u201cbook my checkup in two weeks\u201d."
            )
        )

    rx = db.scalar(
        select(Prescription)
        .join(
            PatientDoctorVisit,
            PatientDoctorVisit.prescription_id == Prescription.prescription_id,
        )
        .where(PatientDoctorVisit.patient_id == payload.patient_id)
        .order_by(Prescription.prescription_id.desc())
        .limit(1)
    )
    if rx is None:
        return PatientChatResponse(
            reply="You have no prescription on record yet, so there is nothing to follow up."
        )

    rx.next_checkup_date = target
    # The request was date-only, so drop any slot left from an earlier booking.
    rx.next_checkup_time = None
    db.commit()
    db.refresh(rx)

    return PatientChatResponse(
        reply=f"Done - your follow-up is set for {target.strftime('%d %b %Y')}.",
        next_checkup_date=target,
        prescription_id=rx.prescription_id,
    )
