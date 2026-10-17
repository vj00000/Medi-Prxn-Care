"""Request/response models for the API layer."""

from datetime import date

from pydantic import BaseModel, ConfigDict, Field


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
    # `prescriptions` has no timestamp column, so this is derived from the
    # earliest start date among the prescription's medication schedules.
    created: date | None = None
    # True => hidden from other members of the patient's family.
    is_private: bool = False
    # Follow-up appointment the patient should attend.
    next_checkup_date: date | None = None
    medicines: list[MedicineOut] = Field(default_factory=list)
    # Non-blocking patient-safety notes (e.g. recorded-allergy conflicts).
    warnings: list[str] = Field(default_factory=list)


# --------------------------------------------------------------------------- #
# Reference data and patient reads
# --------------------------------------------------------------------------- #
class DoctorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    doctor_id: int
    name: str
    specialization: str | None = None
    contact_number: str | None = None
    gender: str | None = None
    calendly_url: str | None = None


class DiseaseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    is_transmittable: bool = False
    is_inheritable: bool = False


class MedicineCatalogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    brand: str | None = None


class FamilyHistoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    relation: str | None = None
    condition_name: str | None = None
    additional_notes: str | None = None


class ScheduleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    medicine_name: str
    dosage: str | None = None
    timing_slot: str | None = None
    is_expired: bool = False
    start_date: date | None = None
    end_date: date | None = None
    # Used client-side to flag "reorder soon" before the supply runs out.
    prescription_id: int | None = None


class PatientOut(BaseModel):
    patient_id: int
    name: str
    age: int | None = None
    gender: str | None = None
    phone: str | None = None
    qr_token: str | None = None
    family_id: int | None = None
    # Role within the family: self / father / mother / other.
    relation: str | None = None
    allergies: list[str] = Field(default_factory=list)
    diseases: list[DiseaseOut] = Field(default_factory=list)
    # camelCase because that is the name the doctor and patient components read.
    familyHistory: list[FamilyHistoryOut] = Field(default_factory=list)
    schedules: list[ScheduleOut] = Field(default_factory=list)
    # Newest `visit_date` among the patient's visits.
    lastVisit: date | None = None


class FamilyMemberCreate(BaseModel):
    family_id: int
    name: str
    relation: str  # father | mother | other
    age: int | None = None
    gender: str | None = None
    phone: str | None = None
    allergies: str | None = None


class PrivacyUpdate(BaseModel):
    is_private: bool


class CheckupUpdate(BaseModel):
    next_checkup_date: date


# --------------------------------------------------------------------------- #
# Patient-side assistant
# --------------------------------------------------------------------------- #
class PatientChatRequest(BaseModel):
    patient_id: int
    message: str


class PatientChatResponse(BaseModel):
    reply: str
    next_checkup_date: date | None = None
    prescription_id: int | None = None


# --------------------------------------------------------------------------- #
# Chat-driven drafting
# --------------------------------------------------------------------------- #
class DraftState(BaseModel):
    """The in-progress prescription the doctor and the assistant co-edit."""

    transcript: str | None = None
    diagnosis: str | None = None
    lab_test: str | None = None
    medicines: list[MedicineLine] = Field(default_factory=list)


class ChatTurn(BaseModel):
    role: str  # "user" | "assistant"
    text: str


class ChatRequest(BaseModel):
    draft: DraftState = Field(default_factory=DraftState)
    message: str
    history: list[ChatTurn] = Field(default_factory=list)


class ChatResponse(BaseModel):
    draft: DraftState
    reply: str
    # Human-readable summary of what the assistant changed, e.g. "Added Amoxicillin".
    actions: list[str] = Field(default_factory=list)
