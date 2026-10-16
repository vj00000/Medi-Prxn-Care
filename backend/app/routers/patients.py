"""Patient reads, with the joins the portals render."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.clinical import allergy_terms, normalize_slot
from app.database import get_db
from app.models import Patient, PatientDisease
from app.schemas import DiseaseOut, FamilyHistoryOut, PatientOut, ScheduleOut

router = APIRouter(prefix="/patients", tags=["patients"])

# Eager-load the three collections the response needs, to avoid a query per row.
_BASE = select(Patient).options(
    selectinload(Patient.disease_links).selectinload(PatientDisease.disease),
    selectinload(Patient.family_history),
    selectinload(Patient.medication_schedules),
    selectinload(Patient.visits),
)


def _to_out(patient: Patient) -> PatientOut:
    return PatientOut(
        patient_id=patient.patient_id,
        name=patient.name,
        age=patient.age,
        gender=patient.gender,
        phone=patient.phone,
        qr_token=patient.qr_token,
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
        schedules=[
            ScheduleOut(
                id=row.id,
                medicine_name=row.medicine_name,
                dosage=row.dosage,
                timing_slot=normalize_slot(row.timing_slot),
                is_expired=row.is_expired,
                start_date=row.start_date,
                end_date=row.end_date,
            )
            for row in sorted(patient.medication_schedules, key=lambda row: row.id)
        ],
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
