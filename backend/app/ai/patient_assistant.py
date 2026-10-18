"""Patient-facing assistant: answer questions grounded in the family record.

The model never queries the database itself; we assemble everything the patient
might ask about — their own profile, each family member, current medicines,
stock levels, upcoming appointments and drug interactions — into a single text
record, and the model answers strictly from it. No tool calls, one turn.
"""

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.client import get_model
from app.clinical import allergy_terms
from app.doses import is_low
from app.interactions import MAX_WARNING_CHARS, find_interactions
from app.models import (
    Disease,
    Doctor,
    MedicineStock,
    Patient,
    PatientDisease,
    PatientDoctorVisit,
    Prescription,
)

_SYSTEM = """You are Medi-Prxn-Care's assistant for a patient and their family.

Answer the patient's question using ONLY the FAMILY RECORD below. Never invent
details that are not in the record. Be warm, short and clear. Use a bullet list
when listing medicines or people.

The record contains, for the patient and each family member:
- profile (name, age, gender, relation), conditions, allergies and medicines
- stock levels, including medicines running low or out of stock (these are what
  needs reordering)
- the patient's prescriptions and upcoming follow-up appointments
- known drug interactions among the patient's current medicines

If the answer is not in the record, say you do not have that information.
"""


def _medicine_lines(db: Session, patient: Patient) -> list[str]:
    stocks = {
        row.medicine_name: row
        for row in db.scalars(
            select(MedicineStock).where(MedicineStock.patient_id == patient.patient_id)
        ).all()
    }
    lines: list[str] = []
    for schedule in patient.medication_schedules:
        if schedule.is_expired:
            continue
        detail = " · ".join(
            part for part in (schedule.dosage, schedule.timing_slot) if part
        )
        if schedule.end_date:
            detail = f"{detail} · until {schedule.end_date}".strip(" ·")
        stock = stocks.get(schedule.medicine_name)
        if stock is not None:
            if stock.units_remaining <= 0:
                detail = f"{detail} · OUT OF STOCK".strip(" ·")
            elif is_low(stock):
                detail = f"{detail} · {stock.units_remaining} left (reorder soon)".strip(" ·")
            else:
                detail = f"{detail} · {stock.units_remaining} left".strip(" ·")
        lines.append(f"- {schedule.medicine_name}" + (f" ({detail})" if detail else ""))
    return lines or ["- (none)"]


def _person(db: Session, patient: Patient) -> str:
    lines = [f"Name: {patient.name}", f"Relation: {patient.relation or 'self'}"]
    if patient.age is not None:
        lines.append(f"Age: {patient.age}")
    if patient.gender:
        lines.append(f"Gender: {patient.gender}")
    if patient.phone:
        lines.append(f"Phone: {patient.phone}")

    allergies = allergy_terms(patient)
    lines.append("Allergies: " + (", ".join(allergies) if allergies else "none"))

    diseases = db.scalars(
        select(Disease.name)
        .join(PatientDisease, PatientDisease.disease_id == Disease.id)
        .where(PatientDisease.patient_id == patient.patient_id)
        .order_by(Disease.name)
    ).all()
    lines.append("Conditions: " + (", ".join(diseases) if diseases else "none"))

    lines.append("Medicines:")
    lines.extend(_medicine_lines(db, patient))

    low = [
        row
        for row in db.scalars(
            select(MedicineStock).where(MedicineStock.patient_id == patient.patient_id)
        ).all()
        if is_low(row)
    ]
    if low:
        lines.append("Needs reordering:")
        for row in sorted(low, key=lambda r: (r.units_remaining, r.medicine_name)):
            state = "out of stock" if row.units_remaining <= 0 else f"{row.units_remaining} left"
            lines.append(f"- {row.medicine_name}: {state}")

    return "\n".join(lines)


def _appointments(db: Session, patient_id: int) -> list[str]:
    today = date.today()
    rows = db.scalars(
        select(Prescription)
        .where(
            Prescription.patient_id == patient_id,
            Prescription.next_checkup_date.is_not(None),
        )
        .order_by(Prescription.next_checkup_date)
    ).all()

    lines: list[str] = []
    for rx in rows:
        if rx.next_checkup_date < today:
            continue
        doctor = None
        visit = db.scalar(
            select(PatientDoctorVisit).where(
                PatientDoctorVisit.prescription_id == rx.prescription_id
            )
        )
        if visit and visit.doctor_id:
            doctor = db.get(Doctor, visit.doctor_id)
        when = str(rx.next_checkup_date)
        if rx.next_checkup_time:
            when += f" at {rx.next_checkup_time.strftime('%H:%M')}"
        who = f" with {doctor.name}" if doctor else ""
        lines.append(f"- {when}{who}")
    return lines or ["- (none upcoming)"]


def _prescriptions(db: Session, patient_id: int) -> list[str]:
    rows = db.scalars(
        select(Prescription)
        .where(Prescription.patient_id == patient_id)
        .order_by(Prescription.prescription_id.desc())
    ).all()

    lines: list[str] = []
    for rx in rows:
        medicines = [link.medicine.name for link in rx.medicines if link.medicine]
        status = rx.status.value if hasattr(rx.status, "value") else str(rx.status)
        parts = [status]
        if rx.diagnosis:
            parts.append(f"diagnosis: {rx.diagnosis}")
        if medicines:
            parts.append("medicines: " + ", ".join(medicines))
        if rx.created_by == "patient":
            parts.append("self-reported")
        if rx.next_checkup_date:
            parts.append(f"follow-up: {rx.next_checkup_date}")
        lines.append("- " + " · ".join(parts))
    return lines or ["- (none)"]


def _interactions(db: Session, patient: Patient) -> list[str]:
    active = list(
        dict.fromkeys(
            schedule.medicine_name
            for schedule in patient.medication_schedules
            if not schedule.is_expired and schedule.medicine_name
        )
    )
    if len(active) < 2:
        return ["- (not enough medicines to check)"]

    found = find_interactions([], active)
    if not found:
        return ["- none known"]

    lines: list[str] = []
    for interaction in found:
        a, b = interaction.drugs
        note = interaction.warning
        if len(note) > MAX_WARNING_CHARS:
            note = note[: MAX_WARNING_CHARS - 1].rstrip() + "\u2026"
        lines.append(f"- {a} + {b}: {note}")
    return lines


def _family_record(db: Session, patient_id: int) -> str:
    patient = db.get(Patient, patient_id)
    if patient is None:
        return "(no patient on record)"

    family_code = patient.family.code if patient.family else None
    parts = [f"Family code: {family_code or 'unknown'}"]

    parts.append("\nPATIENT (you):")
    parts.append(_person(db, patient))

    if patient.family_id:
        others = db.scalars(
            select(Patient)
            .where(
                Patient.family_id == patient.family_id,
                Patient.patient_id != patient_id,
            )
            .order_by(Patient.name)
        ).all()
        for other in others:
            parts.append(f"\nFAMILY MEMBER: {other.name}")
            parts.append(_person(db, other))

    parts.append("\nUPCOMING APPOINTMENTS (you):")
    parts.extend(_appointments(db, patient_id))

    parts.append("\nYOUR PRESCRIPTIONS:")
    parts.extend(_prescriptions(db, patient_id))

    parts.append("\nDRUG INTERACTIONS (your current medicines):")
    parts.extend(_interactions(db, patient))

    return "\n".join(parts)


async def answer_patient_question(
    db: Session, patient_id: int, message: str, history: list
) -> str:
    model = get_model()
    context = _family_record(db, patient_id)

    contents: list[dict] = []
    for turn in history:
        contents.append(
            {
                "role": "user" if turn.role == "user" else "model",
                "parts": [{"text": turn.text}],
            }
        )
    prompt = f"{_SYSTEM}\n\nFAMILY RECORD:\n{context}\n\nPatient asks: {message}"
    contents.append({"role": "user", "parts": [{"text": prompt}]})

    response = await model.generate_content_async(
        contents,
        generation_config={"temperature": 0.2},
    )

    try:
        reply = (response.text or "").strip()
    except ValueError:
        reply = ""

    return reply or "I'm sorry, I could not read that response."
