"""Request/response models for the API layer."""

from datetime import date, datetime, time

from pydantic import BaseModel, ConfigDict, Field

from app.ai.schemas import ExtractedMedicine


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
    # Symptoms, working diagnosis, or other clinical detail for this visit.
    diagnosis: str | None = None
    case_paper_url: str | None = None
    lab_test: str | None = None
    medicines: list[MedicineLine] = Field(default_factory=list)
    # True => save straight to `approved` instead of `review`.
    approve: bool = False
    # Optional follow-up the patient should attend.
    next_checkup_date: date | None = None
    next_checkup_time: time | None = None


class InteractionCheckRequest(BaseModel):
    """A draft to safety-check without persisting anything."""

    patient_id: int
    medicines: list[MedicineLine] = Field(default_factory=list)


class SelfPrescriptionCreate(BaseModel):
    """A prescription the patient records for themselves."""

    patient_id: int
    diagnosis: str | None = None
    medicines: list[MedicineLine] = Field(default_factory=list)


class SelfPrescriptionUpdate(BaseModel):
    diagnosis: str | None = None
    medicines: list[MedicineLine] = Field(default_factory=list)


class InteractionCheckOut(BaseModel):
    warnings: list[str] = Field(default_factory=list)
    interaction_note: str | None = None


class MedicineOut(BaseModel):
    medicine_id: int
    name: str
    dosage: str | None = None
    timings: str | None = None
    is_active: bool = True
    # Course length in days, derived from the medicine's schedule end date.
    duration_days: int | None = None


class DoctorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    doctor_id: int
    name: str
    specialization: str | None = None
    contact_number: str | None = None
    gender: str | None = None
    # Length of one consulting slot, in minutes.
    slot_minutes: int = 30


class DoctorCreate(BaseModel):
    """A doctor being onboarded. Defaults give them a bookable schedule."""

    name: str
    specialization: str | None = None
    contact_number: str | None = None
    gender: str | None = None
    slot_minutes: int = 30


class AvailabilityOut(BaseModel):
    """The slots a doctor can still take on one day."""

    doctor_id: int
    date: date
    slot_minutes: int = 30
    slots: list[time] = Field(default_factory=list)


class PrescriptionOut(BaseModel):
    prescription_id: int
    patient_id: int
    # Who authored it: "doctor" or "patient" (self-reported).
    created_by: str = "doctor"
    doctor_id: int | None = None
    # The prescribing doctor, so a reschedule opens the right calendar.
    doctor: DoctorOut | None = None
    status: str
    transcript: str | None = None
    diagnosis: str | None = None
    case_paper_url: str | None = None
    lab_test: str | None = None
    # `prescriptions` has no timestamp column, so this is derived from the
    # earliest start date among the prescription's medication schedules.
    created: date | None = None
    # True => hidden from other members of the patient's family.
    is_private: bool = False
    # Follow-up appointment the patient should attend.
    next_checkup_date: date | None = None
    # Slot on that date; null when only a day was chosen.
    next_checkup_time: time | None = None
    medicines: list[MedicineOut] = Field(default_factory=list)
    # Non-blocking patient-safety notes (e.g. recorded-allergy conflicts).
    warnings: list[str] = Field(default_factory=list)
    # Neutral note about the interaction check (e.g. "nothing to check").
    interaction_note: str | None = None


# --------------------------------------------------------------------------- #
# Reference data and patient reads
# --------------------------------------------------------------------------- #
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
    # Today's dose state, so a reminder can show only what is still due.
    taken_today: bool = False
    taken_at: datetime | None = None
    # Units of this medicine left for this patient.
    units_remaining: int | None = None
    low_stock: bool = False


class DoseTakenOut(BaseModel):
    """Result of marking or unmarking a single dose."""

    schedule_id: int
    dose_date: date
    taken: bool
    # True when the call was a no-op because the dose was already recorded.
    already_taken: bool = False
    units_remaining: int | None = None
    low_stock: bool = False


class LowStockOut(BaseModel):
    """One medicine at or below its reorder threshold."""

    patient_id: int
    medicine_name: str
    units_remaining: int
    low_stock_threshold: int
    # Nothing left at all, so the UI can say "out of stock" rather than "low".
    out_of_stock: bool = False


class PatientOut(BaseModel):
    patient_id: int
    name: str
    age: int | None = None
    gender: str | None = None
    phone: str | None = None
    qr_token: str | None = None
    family_id: int | None = None
    # Five-character public family identifier, used in the QR token.
    family_code: str | None = None
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
    # Optional slot. Omitted or null keeps the appointment date-only.
    next_checkup_time: time | None = None


# --------------------------------------------------------------------------- #
# Auth / onboarding
# --------------------------------------------------------------------------- #
class DoctorSignup(BaseModel):
    name: str
    email: str
    password: str
    specialization: str | None = None
    contact_number: str | None = None
    gender: str | None = None


class DoctorLogin(BaseModel):
    email: str
    password: str


class PatientSignup(BaseModel):
    name: str
    email: str
    password: str
    phone: str | None = None
    age: int | None = None
    gender: str | None = None
    allergies: str | None = None
    # An existing household's 5-character code, or blank to create a new one.
    family_code: str | None = None


class PatientLogin(BaseModel):
    email: str
    password: str


class ParseNoteRequest(BaseModel):
    """Spoken or typed text describing what the patient is taking."""

    text: str


class ParseNoteResponse(BaseModel):
    diagnosis: str | None = None
    medicines: list[ExtractedMedicine] = Field(default_factory=list)


class AuthOut(BaseModel):
    token: str
    role: str  # "doctor" | "patient"
    doctor: DoctorOut | None = None
    patient: PatientOut | None = None


class MeOut(BaseModel):
    role: str
    doctor: DoctorOut | None = None
    patient: PatientOut | None = None


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
    # When set, the assistant can answer questions about this patient's record.
    patient_id: int | None = None


class ChatResponse(BaseModel):
    draft: DraftState
    reply: str
    # Human-readable summary of what the assistant changed, e.g. "Added Amoxicillin".
    actions: list[str] = Field(default_factory=list)


class PatientAssistantRequest(BaseModel):
    patient_id: int
    message: str
    history: list[ChatTurn] = Field(default_factory=list)


class PatientAssistantResponse(BaseModel):
    reply: str
