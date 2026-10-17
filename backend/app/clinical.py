"""Clinical helpers shared by more than one router."""

from app.models import Patient

# Values of `Patient.allergies` that mean "nothing on record".
NO_ALLERGY = {"none", "none reported", "nil", "n/a", "na"}


def allergy_terms(patient: Patient) -> list[str]:
    """`Patient.allergies` is a comma-separated string, not a list."""
    raw = patient.allergies or ""
    terms = [term.strip().lower() for term in raw.split(",") if term.strip()]
    return [term for term in terms if term not in NO_ALLERGY]


def normalize_slot(value: str | None) -> str | None:
    """Standardise a timing slot to Title Case.

    The seed writes "morning"/"night" while the prescribing form sends
    "Morning"/"Night", so without this a patient's medication list shows a mix
    of the two spellings.
    """
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    return f"{cleaned[:1].upper()}{cleaned[1:].lower()}"
