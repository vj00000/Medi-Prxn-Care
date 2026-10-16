"""Typed shapes for AI-extracted prescription data.

These mirror the fields a doctor needs to confirm, not the DB tables — the
doctor reviews this draft before it becomes a Prescription row.
"""

from pydantic import BaseModel, Field


class ExtractedMedicine(BaseModel):
    name: str
    dosage: str | None = None
    frequency: str | None = None
    timing: str | None = None
    duration: str | None = None
    notes: str | None = None


class PrescriptionDraft(BaseModel):
    patient_name: str | None = None
    patient_age: str | None = None
    diagnosis: str | None = None
    lab_tests: list[str] = Field(default_factory=list)
    medicines: list[ExtractedMedicine] = Field(default_factory=list)

    # Observations recorded on the case paper.
    bp: str | None = None
    spo2: str | None = None

    # Lifestyle advice written on the case paper.
    diet: str | None = None
    exercise: str | None = None

    notes: str | None = None
    confidence: float | None = None
