"""Image -> structured prescription draft, via Gemini's multimodal API.

The model is asked for strict JSON and told explicitly not to invent data;
every field the doctor will see is editable, so the model only ever produces a
draft for human confirmation.
"""

import json

from app.ai.client import get_model
from app.ai.schemas import ExtractedMedicine, PrescriptionDraft

EXTRACTION_PROMPT = """
You are a careful clinical assistant. You are shown a photo of a handwritten
or printed prescription / case paper. Extract ONLY what you can actually read.

Return STRICT JSON with exactly this shape:
{
  "patient_name": string|null,
  "patient_age": string|null,
  "diagnosis": string|null,
  "lab_tests": [string],
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
- NEVER invent a medicine, dosage or duration. If a field is unreadable, use null.
- "frequency" = how often (once daily / twice daily / TDS).
- "timing" = when to take it (morning / night / after meals).
- "duration" = how long (e.g. "5 days").
- "confidence" is a number between 0 and 1 for the overall extraction quality.
- Return JSON only, with no commentary.
""".strip()


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

    payload = json.loads(response.text)

    return PrescriptionDraft(
        patient_name=payload.get("patient_name"),
        patient_age=payload.get("patient_age"),
        diagnosis=payload.get("diagnosis"),
        lab_tests=payload.get("lab_tests") or [],
        medicines=[
            ExtractedMedicine(**item) for item in payload.get("medicines") or []
        ],
        notes=payload.get("notes"),
        confidence=payload.get("confidence"),
    )
