"""Chat-driven drafting: natural language -> tool calls -> mutated draft.

The model never edits the prescription itself; it can only ask us to run one of
the whitelisted tools in `app.ai.draft`. That keeps the doctor in control.
"""

import google.generativeai as genai
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.client import get_model
from app.ai.draft import apply_tool
from app.clinical import allergy_terms
from app.models import (
    Disease,
    FamilyMedicalHistory,
    LabTest,
    Patient,
    PatientDisease,
    PatientDoctorVisit,
    Prescription,
)
from app.schemas import DraftState

_Schema = genai.protos.Schema
_Type = genai.protos.Type


def _text(description: str) -> genai.protos.Schema:
    return _Schema(type=_Type.STRING, description=description)


def _object(properties: dict, required: list[str]) -> genai.protos.Schema:
    return _Schema(type=_Type.OBJECT, properties=properties, required=required)


SYSTEM_INSTRUCTION = """You are a prescribing assistant for a licensed doctor.

You may ONLY change the prescription by calling the provided tools. Never state a
dosage or medicine that you have not written with a tool call.

You may also answer questions about the patient's record (diseases, family
history, prescriptions, lab tests) when a PATIENT RECORD is supplied — answer
strictly from that record, never invent.

Rules:
- Prefer one tool call per medicine the doctor mentions.
- If the doctor says to add something already on the draft, use update_medicine.
- Only fill in what the doctor actually said; do not invent dosages or durations.
- After calling the tools, reply with one short sentence confirming the change.
"""

_ADD_UPDATE_PROPS = {
    "name": _text("Medicine name, e.g. Amoxicillin"),
    "dosage": _text("Dose per intake, e.g. 500 mg"),
    "frequency": _text("How often, e.g. twice daily / TDS"),
    "timing": _text("When to take it, e.g. after meals / at night"),
    "duration_days": _Schema(type=_Type.INTEGER, description="Course length in days"),
}

TOOLS = [
    genai.protos.Tool(
        function_declarations=[
            genai.protos.FunctionDeclaration(
                name="add_medicine",
                description="Add a medicine to the prescription draft.",
                parameters=_object(_ADD_UPDATE_PROPS, ["name"]),
            ),
            genai.protos.FunctionDeclaration(
                name="update_medicine",
                description=(
                    "Change an existing medicine's dosage, frequency, timing or "
                    "duration. Matched by name."
                ),
                parameters=_object(_ADD_UPDATE_PROPS, ["name"]),
            ),
            genai.protos.FunctionDeclaration(
                name="remove_medicine",
                description="Remove a medicine from the prescription draft.",
                parameters=_object({"name": _text("Medicine name to remove")}, ["name"]),
            ),
            genai.protos.FunctionDeclaration(
                name="set_lab_test",
                description="Set the lab test requested for this visit.",
                parameters=_object({"test_name": _text("e.g. HbA1c")}, ["test_name"]),
            ),
            genai.protos.FunctionDeclaration(
                name="set_diagnosis",
                description="Set the working diagnosis.",
                parameters=_object({"diagnosis": _text("Working diagnosis")}, ["diagnosis"]),
            ),
        ]
    )
]


def _patient_record(db: Session, patient_id: int) -> str:
    """A compact text summary of one patient's record for the assistant."""
    patient = db.get(Patient, patient_id)
    if patient is None:
        return ""

    lines = [
        f"Name: {patient.name}",
        f"Age: {patient.age}",
        f"Gender: {patient.gender}",
    ]

    allergies = allergy_terms(patient)
    if allergies:
        lines.append("Allergies: " + ", ".join(allergies))

    diseases = db.scalars(
        select(Disease.name)
        .join(PatientDisease, PatientDisease.disease_id == Disease.id)
        .where(PatientDisease.patient_id == patient_id)
        .order_by(Disease.name)
    ).all()
    lines.append("Diseases: " + (", ".join(diseases) if diseases else "(none)"))

    family = db.scalars(
        select(FamilyMedicalHistory).where(
            FamilyMedicalHistory.patient_id == patient_id
        )
    ).all()
    if family:
        lines.append("Family history:")
        for entry in family:
            detail = f" ({entry.additional_notes})" if entry.additional_notes else ""
            lines.append(f"  - {entry.relation}: {entry.condition_name}{detail}")

    prescriptions = db.scalars(
        select(Prescription)
        .join(
            PatientDoctorVisit,
            PatientDoctorVisit.prescription_id == Prescription.prescription_id,
        )
        .where(PatientDoctorVisit.patient_id == patient_id)
        .order_by(Prescription.prescription_id.desc())
    ).all()

    if prescriptions:
        lines.append("Prescriptions:")
        for rx in prescriptions:
            medicines = []
            for link in rx.medicines:
                name = link.medicine.name if link.medicine else "?"
                medicines.append(
                    " ".join(part for part in (name, link.medicine_dosage) if part)
                )
            lab = db.get(LabTest, rx.lab_test_id) if rx.lab_test_id else None
            parts = [rx.status.value]
            if rx.diagnosis:
                parts.append(f"diagnosis: {rx.diagnosis}")
            if medicines:
                parts.append("medicines: " + ", ".join(medicines))
            if lab:
                parts.append(f"lab test: {lab.test_name}")
            if rx.next_checkup_date:
                parts.append(f"next checkup: {rx.next_checkup_date}")
            lines.append(f"  - {rx.created_on} · " + " · ".join(parts))
    else:
        lines.append("Prescriptions: (none)")

    return "\n".join(lines)


def _render(draft: DraftState) -> str:
    lines: list[str] = []
    if draft.diagnosis:
        lines.append(f"Diagnosis: {draft.diagnosis}")
    if draft.lab_test:
        lines.append(f"Lab test: {draft.lab_test}")
    if draft.medicines:
        lines.append("Medicines:")
        for medicine in draft.medicines:
            detail = " ".join(part for part in (medicine.dosage, medicine.timings) if part)
            lines.append(f"  - {medicine.name} {detail}".rstrip())
    else:
        lines.append("Medicines: (none yet)")
    if draft.transcript:
        lines.append(f"Consultation notes: {draft.transcript}")
    return "\n".join(lines)


async def chat_with_draft(
    draft: DraftState,
    message: str,
    history: list,
    *,
    db: Session | None = None,
    patient_id: int | None = None,
) -> tuple[DraftState, str, list[str]]:
    model = get_model()

    contents: list[dict] = []
    for turn in history:
        contents.append(
            {
                "role": "user" if turn.role == "user" else "model",
                "parts": [{"text": turn.text}],
            }
        )
    prompt = SYSTEM_INSTRUCTION
    if db is not None and patient_id is not None:
        record = _patient_record(db, patient_id)
        if record:
            prompt += (
                f"\n\nPATIENT RECORD:\n{record}\n\n"
                "Answer questions about this patient's diseases, family history, "
                "prescriptions and lab tests from the record above."
            )
    prompt += (
        f"\n\nCurrent prescription draft:\n{_render(draft)}\n\n"
        f"Doctor says: {message}"
    )

    contents.append({"role": "user", "parts": [{"text": prompt}]})

    response = await model.generate_content_async(
        contents,
        tools=TOOLS,
        generation_config={"temperature": 0.1},
    )

    actions: list[str] = []
    reply_parts: list[str] = []

    for candidate in getattr(response, "candidates", []) or []:
        content = getattr(candidate, "content", None)
        for part in getattr(content, "parts", []) or []:
            call = getattr(part, "function_call", None)
            if call and getattr(call, "name", None):
                args = dict(call.args) if call.args else {}
                actions.append(apply_tool(draft, call.name, args))
            text = getattr(part, "text", None)
            if text:
                reply_parts.append(text.strip())

    reply = " ".join(reply_parts).strip()
    if not reply:
        reply = " · ".join(actions) if actions else "I didn't find a change to make."

    return draft, reply, actions
