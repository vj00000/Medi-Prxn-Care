"""Request/response models for the API layer."""

from pydantic import BaseModel, Field


class MedicineLine(BaseModel):
    """One medicine line as the doctor confirms it (post-AI-edit)."""

    medicine_id: int | None = None
    name: str | None = None
    dosage: str | None = None
    timings: str | None = None
    timing_slot: str | None = None
    duration_days: int | None = None


class PrescriptionCreate(BaseModel):
    patient_id: int
    doctor_id: int
    transcript: str | None = None
    case_paper_url: str | None = None
    lab_test: str | None = None
    medicines: list[MedicineLine] = Field(default_factory=list)


class MedicineOut(BaseModel):
    medicine_id: int
    name: str
    dosage: str | None = None
    timings: str | None = None
    is_active: bool = True


class PrescriptionOut(BaseModel):
    prescription_id: int
    patient_id: int
    doctor_id: int | None = None
    status: str
    transcript: str | None = None
    case_paper_url: str | None = None
    lab_test: str | None = None
    medicines: list[MedicineOut] = Field(default_factory=list)
    # Non-blocking patient-safety notes (e.g. recorded-allergy conflicts).
    warnings: list[str] = Field(default_factory=list)
