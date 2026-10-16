"""Prescription endpoints: create (doctor-confirmed), list, approve."""

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.clinical import allergy_terms, normalize_slot
from app.database import get_db
from app.models import (
    Doctor,
    LabTest,
    Medicine,
    MedicationSchedule,
    Patient,
    PatientDoctorVisit,
    Prescription,
    PrescriptionMedicine,
    PrescriptionStatus,
)
from app.schemas import MedicineLine, MedicineOut, PrescriptionCreate, PrescriptionOut

router = APIRouter(prefix="/prescriptions", tags=["prescriptions"])


def _resolve_medicine(db: Session, line: MedicineLine) -> Medicine | None:
    """Match by id, then by name; create the row if the name is new."""
    if line.medicine_id is not None:
        existing = db.get(Medicine, line.medicine_id)
        if existing is not None:
            return existing

    if not line.name:
        return None

    name = line.name.strip()
    medicine = db.scalar(
        select(Medicine).where(func.lower(Medicine.name) == name.lower())
    )
    if medicine is None:
        medicine = Medicine(name=name)
        db.add(medicine)
        db.flush()
    return medicine


def _to_out(db: Session, rx: Prescription, warnings: list[str] | None = None) -> PrescriptionOut:
    visit = db.scalar(
        select(PatientDoctorVisit).where(
            PatientDoctorVisit.prescription_id == rx.prescription_id
        )
    )
    status = rx.status.value if isinstance(rx.status, PrescriptionStatus) else str(rx.status)

    return PrescriptionOut(
        prescription_id=rx.prescription_id,
        patient_id=visit.patient_id if visit else 0,
        doctor_id=visit.doctor_id if visit else None,
        status=status,
        transcript=rx.transcript,
        case_paper_url=rx.case_paper_url,
        lab_test=rx.lab_test.test_name if rx.lab_test else None,
        created=rx.created_on,
        medicines=[
            MedicineOut(
                medicine_id=link.medicine_id,
                name=link.medicine.name if link.medicine else "",
                dosage=link.medicine_dosage,
                timings=link.timings,
                is_active=link.is_active,
            )
            for link in rx.medicines
        ],
        warnings=warnings or [],
    )


@router.post("", response_model=PrescriptionOut, status_code=201)
def create_prescription(payload: PrescriptionCreate, db: Session = Depends(get_db)):
    """Persist a doctor-confirmed prescription (status starts as `review`)."""
    patient = db.get(Patient, payload.patient_id)
    if patient is None:
        raise HTTPException(status_code=404, detail=f"Patient {payload.patient_id} not found")

    doctor = db.get(Doctor, payload.doctor_id)
    if doctor is None:
        raise HTTPException(status_code=404, detail=f"Doctor {payload.doctor_id} not found")

    rx = Prescription(
        transcript=payload.transcript,
        case_paper_url=payload.case_paper_url,
        created_on=date.today(),
        status=PrescriptionStatus.review,
    )

    if payload.lab_test:
        test_name = payload.lab_test.strip()
        lab_test = db.scalar(
            select(LabTest).where(func.lower(LabTest.test_name) == test_name.lower())
        )
        if lab_test is None:
            lab_test = LabTest(test_name=test_name)
            db.add(lab_test)
            db.flush()
        rx.lab_test_id = lab_test.test_id

    db.add(rx)
    db.flush()

    warnings: list[str] = []
    allergies = allergy_terms(patient)
    start = date.today()

    for line in payload.medicines:
        medicine = _resolve_medicine(db, line)
        if medicine is None:
            continue

        db.add(
            PrescriptionMedicine(
                prescription_id=rx.prescription_id,
                medicine_id=medicine.id,
                medicine_dosage=line.dosage,
                timings=line.timings,
                is_active=True,
            )
        )

        db.add(
            MedicationSchedule(
                patient_id=patient.patient_id,
                prescription_id=rx.prescription_id,
                medicine_name=medicine.name,
                dosage=line.dosage,
                timing_slot=normalize_slot(line.timing_slot),
                start_date=start,
                end_date=start + timedelta(days=line.duration_days)
                if line.duration_days
                else None,
                is_expired=False,
            )
        )

        haystack = f"{medicine.name} {medicine.brand or ''}".lower()
        for term in allergies:
            if term in haystack:
                warnings.append(
                    f"{medicine.name} may conflict with the recorded allergy '{term}'."
                )

    db.add(
        PatientDoctorVisit(
            patient_id=patient.patient_id,
            doctor_id=doctor.doctor_id,
            prescription_id=rx.prescription_id,
            visit_date=start,
        )
    )

    db.commit()
    db.refresh(rx)
    return _to_out(db, rx, warnings)


@router.get("", response_model=list[PrescriptionOut])
def list_prescriptions(
    patient_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    stmt = select(Prescription)
    if patient_id is not None:
        stmt = stmt.join(
            PatientDoctorVisit,
            PatientDoctorVisit.prescription_id == Prescription.prescription_id,
        ).where(PatientDoctorVisit.patient_id == patient_id)

    rows = db.scalars(stmt.order_by(Prescription.prescription_id.desc())).all()
    return [_to_out(db, rx) for rx in rows]


@router.post("/{prescription_id}/approve", response_model=PrescriptionOut)
def approve_prescription(prescription_id: int, db: Session = Depends(get_db)):
    rx = db.get(Prescription, prescription_id)
    if rx is None:
        raise HTTPException(status_code=404, detail=f"Prescription {prescription_id} not found")

    rx.status = PrescriptionStatus.approved
    db.commit()
    db.refresh(rx)
    return _to_out(db, rx)
