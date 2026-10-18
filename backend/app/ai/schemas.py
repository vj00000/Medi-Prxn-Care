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
    symptoms: str | None = None
    lab_tests: list[str] = Field(default_factory=list)
    medicines: list[ExtractedMedicine] = Field(default_factory=list)

    # Observations recorded on the case paper.
    bp: str | None = None
    spo2: str | None = None

    # Everything else the doctor wrote down: diet, exercise, lifestyle,
    # follow-up, precautions — kept as one free-form note rather than forced
    # into fixed buckets.
    advice: str | None = None

    notes: str | None = None
    confidence: float | None = None
