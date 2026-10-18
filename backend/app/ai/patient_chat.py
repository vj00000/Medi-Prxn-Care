"""Patient-side assistant: turn a natural-language request into a checkup date."""

import json
import re
from datetime import date, timedelta

from app.ai.client import get_model

DEFAULT_CHECKUP_DAYS = 14

_SYSTEM = """You help a patient schedule a follow-up appointment.

Today is {today}.

Read the patient's message and reply with JSON only:
{{"wants_checkup": true or false, "in_days": integer or null}}

Rules:
- Set wants_checkup true only when they ask to book, schedule, fix or move a
  follow-up / checkup / appointment.
- If they give a relative date ("in two weeks", "next week", "tomorrow"),
  convert it to a number of days from today in `in_days`.
- If they ask for a follow-up without any date, leave `in_days` null.
"""

_UNIT_DAYS = {"day": 1, "week": 7, "month": 30}
_NUMBER_WORDS = {
    "a": 1, "one": 1, "two": 2, "three": 3, "four": 4,
    "five": 5, "six": 6, "seven": 7, "eight": 8,
}

_INTENT_WORDS = (
    "checkup", "check-up", "check up", "follow up", "follow-up",
    "appointment", "book", "schedule", "reschedule",
)


def wants_checkup(message: str) -> bool:
    text = message.lower()
    return any(word in text for word in _INTENT_WORDS)


def _relative_days(message: str) -> int | None:
    """Pattern fallback, used when the model is unavailable."""
    text = message.lower()
    if "tomorrow" in text:
        return 1
    if "next week" in text:
        return 7
    if "next month" in text:
        return 30

    match = re.search(r"in\s+(\d+)\s*(day|week|month)s?", text)
    if match:
        return int(match.group(1)) * _UNIT_DAYS[match.group(2)]

    match = re.search(r"in\s+([a-z]+)\s*(day|week|month)s?", text)
    if match and match.group(1) in _NUMBER_WORDS:
        return _NUMBER_WORDS[match.group(1)] * _UNIT_DAYS[match.group(2)]

    return None


def _model_days(message: str, today: date) -> int | None:
    model = get_model()
    prompt = _SYSTEM.format(today=today.isoformat()) + f"\n\nPatient: {message}"
    result = model.generate_content(prompt)
    text = (result.text or "").strip()
    text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.MULTILINE).strip()

    data = json.loads(text)
    if not data.get("wants_checkup"):
        return None
    if data.get("in_days") is None:
        return DEFAULT_CHECKUP_DAYS
    return int(data["in_days"])


def parse_checkup_request(message: str) -> date | None:
    """Return the follow-up date the patient wants, or None.

    Prefers Gemini, but any AI failure (missing key, quota, unparseable JSON)
    falls through to pattern matching so the feature still works offline.
    """
    if not wants_checkup(message):
        return None

    today = date.today()

    try:
        days = _model_days(message, today)
    except Exception:
        days = None

    if days is None:
        days = _relative_days(message)

    if days is None:
        days = DEFAULT_CHECKUP_DAYS

    return today + timedelta(days=max(days, 0))
