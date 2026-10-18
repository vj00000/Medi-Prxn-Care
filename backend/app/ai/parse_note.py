"""Spoken or typed free text -> structured medicine list, via Gemini.

The patient says what they are taking; the model returns the medicines it
actually heard, never inventing a dosage or frequency the patient did not give.
"""

import json

from app.ai.client import AIBadResponse, get_model
from app.ai.schemas import ExtractedMedicine

PARSE_PROMPT = """
You are a careful clinical assistant. A patient has said (or typed) which
medicines they are taking. Extract ONLY what they actually stated.

Return STRICT JSON with exactly this shape:
{
  "diagnosis": string|null,
  "medicines": [
    {
      "name": string,
      "dosage": string|null,
      "frequency": string|null,
      "timing": string|null,
      "duration": string|null,
      "notes": string|null
    }
  ]
}

Rules:
- NEVER invent a medicine, dosage, frequency or duration. If the patient did
  not say it, use null.
- "diagnosis" = any condition or reason they mentioned, else null.
- "frequency" = how often (once daily / twice daily / TDS).
- "timing" = when to take it (morning / night / after meals).
- "duration" = how long (e.g. "5 days").
- If nothing medicine-like was said, return an empty "medicines" list.
- Return JSON only, with no commentary.
""".strip()


async def parse_note(text: str) -> dict:
    model = get_model()

    response = await model.generate_content_async(
        [PARSE_PROMPT, text],
        generation_config={
            "response_mime_type": "application/json",
            "temperature": 0.1,
        },
    )

    try:
        raw = (response.text or "").strip()
    except ValueError as exc:
        raise AIBadResponse(
            "The model returned no readable text."
        ) from exc

    if not raw:
        raise AIBadResponse("The model returned an empty response.")

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise AIBadResponse(f"The model returned unparseable JSON: {raw[:200]}") from exc

    return {
        "diagnosis": payload.get("diagnosis"),
        "medicines": [
            ExtractedMedicine(**item) for item in payload.get("medicines") or []
        ],
    }
