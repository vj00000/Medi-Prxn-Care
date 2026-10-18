"""Image -> structured prescription draft, via Gemini's multimodal API.

The model is asked for strict JSON and told explicitly not to invent data;
every field the doctor will see is editable, so the model only ever produces a
draft for human confirmation.
"""

import json

from app.ai.client import AIBadResponse, get_model
from app.ai.schemas import ExtractedMedicine, PrescriptionDraft

EXTRACTION_PROMPT = """
You are a careful clinical assistant. You are shown a photo of a handwritten
or printed prescription / case paper. Extract ONLY what you can actually read.

Return STRICT JSON with exactly this shape:
{
  "patient_name": string|null,
  "patient_age": string|null,
  "diagnosis": string|null,
  "symptoms": string|null,
  "lab_tests": [string],
  "bp": string|null,
  "spo2": string|null,
  "advice": string|null,
  "medicines": [
    {
      "name": string,
      "dosage": string|null,
      "frequency": string|null,
      "timing": string|null,
      "duration": string|null,
      "notes": string|null
    }
  ],
  "notes": string|null,
  "confidence": number
}

Rules:
- NEVER invent a medicine, dosage, reading or advice. If something is not
  written on the paper, use null. Missing values are expected and fine.
- "diagnosis" = the diagnosed condition or disease, e.g. "type 2 diabetes".
- "symptoms" = the symptoms the patient reported, e.g. "fever, body ache".
  Leave null when the paper has no symptoms.
- "bp" = the blood pressure reading exactly as written, e.g. "130/85 mmHg".
- "spo2" = oxygen saturation, e.g. "98%".
- "advice" = ALL general advice written on the paper, gathered into ONE string.
  This includes diet, exercise, lifestyle, follow-up timing, precautions or
  anything else that is not a medicine or a vital. Do not split it into
  categories and do not drop anything for not fitting a category.
  Example: "low salt diet, avoid fried food, 30 min walk daily, review in 2 weeks"
- "frequency" = how often a medicine is taken (once daily / twice daily / TDS).
- "timing" = when to take it (morning / night / after meals).
- "duration" = how long (e.g. "5 days").
- "confidence" is a number between 0 and 1 for the overall extraction quality.
- Return JSON only, with no commentary.
""".strip()


def parse_draft(payload: dict) -> PrescriptionDraft:
    """Build a PrescriptionDraft from the model's parsed JSON payload.

    Split out from the network call so it can be tested without an API key.
    """
    return PrescriptionDraft(
        patient_name=payload.get("patient_name"),
        patient_age=payload.get("patient_age"),
        diagnosis=payload.get("diagnosis"),
        symptoms=payload.get("symptoms"),
        lab_tests=payload.get("lab_tests") or [],
        bp=payload.get("bp"),
        spo2=payload.get("spo2"),
        advice=payload.get("advice"),
        medicines=[
            ExtractedMedicine(**item) for item in payload.get("medicines") or []
        ],
        notes=payload.get("notes"),
        confidence=payload.get("confidence"),
    )


def _response_text(response) -> str:
    """`response.text` raises when the model returned no text part."""
    try:
        return (response.text or "").strip()
    except ValueError as exc:
        raise AIBadResponse(
            "The model returned no readable text (the image may have been blocked)."
        ) from exc


async def extract_prescription_from_image(
    image_bytes: bytes, mime_type: str
) -> PrescriptionDraft:
    model = get_model()
    image_part = {"mime_type": mime_type, "data": image_bytes}

    response = await model.generate_content_async(
        [EXTRACTION_PROMPT, image_part],
        generation_config={
            "response_mime_type": "application/json",
            "temperature": 0.1,
        },
    )

    raw = _response_text(response)
    if not raw:
        raise AIBadResponse("The model returned an empty response.")

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise AIBadResponse(f"The model returned unparseable JSON: {raw[:200]}") from exc

    return parse_draft(payload)
