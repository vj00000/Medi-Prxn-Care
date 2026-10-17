"""Patient reads, family groupings, and the joins the portals render."""

from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.clinical import allergy_terms, normalize_slot
from app.database import get_db
from app.models import Family, MedicationSchedule, Patient, PatientDisease
from app.schemas import (
    DiseaseOut,
    FamilyHistoryOut,
    FamilyMemberCreate,
    PatientOut,
    ScheduleOut,
)

router = APIRouter(prefix="/patients", tags=["patients"])

# Eager-load everything the response needs, to avoid a query per row.
_BASE = select(Patient).options(
    selectinload(Patient.disease_links).selectinload(PatientDisease.disease),
    selectinload(Patient.family_history),
    selectinload(Patient.medication_schedules).selectinload(
        MedicationSchedule.prescription
    ),
    selectinload(Patient.visits),
)

# Display order inside a family.
_RELATION_ORDER = {"self": 0, "father": 1, "mother": 2}


def _to_out(patient: Patient, viewer_id: int | None = None) -> PatientOut:
    """Serialise a patient.

    ``viewer_id`` is the patient whose portal is doing the looking. Any other
    member's medicines are dropped when the prescription behind them is marked
    private — that is the whole point of the toggle.
    """
    is_owner = viewer_id is None or viewer_id == patient.patient_id

    schedules = []
    for row in sorted(patient.medication_schedules, key=lambda row: row.id):
        if not is_owner and row.prescription is not None and row.prescription.is_private:
            continue
        schedules.append(
            ScheduleOut(
                id=row.id,
                medicine_name=row.medicine_name,
                dosage=row.dosage,
                timing_slot=normalize_slot(row.timing_slot),
                is_expired=row.is_expired,
                start_date=row.start_date,
                end_date=row.end_date,
                prescription_id=row.prescription_id,
            )
        )

    return PatientOut(
        patient_id=patient.patient_id,
        name=patient.name,
        age=patient.age,
        gender=patient.gender,
        phone=patient.phone,
        qr_token=patient.qr_token,
        family_id=patient.family_id,
        relation=patient.relation,
        allergies=allergy_terms(patient),
        diseases=[
            DiseaseOut.model_validate(link.disease)
            for link in sorted(patient.disease_links, key=lambda row: row.id)
            if link.disease is not None
        ],
        familyHistory=[
            FamilyHistoryOut.model_validate(entry)
            for entry in sorted(patient.family_history, key=lambda row: row.id)
        ],
        schedules=schedules,
        lastVisit=max(
            (visit.visit_date for visit in patient.visits if visit.visit_date),
            default=None,
        ),
    )


@router.get("", response_model=list[PatientOut])
def list_patients(db: Session = Depends(get_db)):
    rows = db.scalars(_BASE.order_by(Patient.patient_id)).all()
    return [_to_out(patient) for patient in rows]


@router.get("/{patient_id}", response_model=PatientOut)
def get_patient(patient_id: int, db: Session = Depends(get_db)):
    patient = db.scalar(_BASE.where(Patient.patient_id == patient_id))
    if patient is None:
        raise HTTPException(status_code=404, detail=f"Patient {patient_id} not found")
    return _to_out(patient)


@router.get("/{patient_id}/family", response_model=list[PatientOut])
def get_family(patient_id: int, db: Session = Depends(get_db)):
    """The viewer plus everyone else in their household."""
    viewer = db.scalar(_BASE.where(Patient.patient_id == patient_id))
    if viewer is None:
        raise HTTPException(status_code=404, detail=f"Patient {patient_id} not found")

    if viewer.family_id is None:
        return [_to_out(viewer)]

    members = db.scalars(_BASE.where(Patient.family_id == viewer.family_id)).all()
    members = sorted(
        members,
        key=lambda row: (_RELATION_ORDER.get(row.relation or "", 9), row.patient_id),
    )
    return [_to_out(member, viewer_id=patient_id) for member in members]


@router.post("/family-members", response_model=PatientOut, status_code=201)
def add_family_member(payload: FamilyMemberCreate, db: Session = Depends(get_db)):
    family = db.get(Family, payload.family_id)
    if family is None:
        raise HTTPException(status_code=404, detail=f"Family {payload.family_id} not found")

    relation = payload.relation.strip().lower()
    if relation not in {"father", "mother", "other"}:
        raise HTTPException(
            status_code=422,
            detail="relation must be one of: father, mother, other",
        )

    member = Patient(
        name=payload.name.strip(),
        age=payload.age,
        gender=payload.gender,
        relation=relation,
        phone=payload.phone,
        allergies=payload.allergies or "None reported",
        family_id=family.family_id,
        qr_token=f"QR-{uuid4().hex[:12].upper()}",
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return _to_out(member, viewer_id=member.patient_id)
