"""Reference data the prescribing form picks from."""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.availability import (
    DEFAULT_SLOT_MINUTES,
    available_slots,
    ensure_default_windows,
)
from app.database import get_db
from app.models import Disease, Doctor, Medicine
from app.schemas import (
    AvailabilityOut,
    DiseaseOut,
    DoctorCreate,
    DoctorOut,
    MedicineCatalogOut,
)

router = APIRouter(tags=["catalog"])


@router.get("/doctors", response_model=list[DoctorOut])
def list_doctors(db: Session = Depends(get_db)):
    return db.scalars(select(Doctor).order_by(Doctor.doctor_id)).all()


@router.post("/doctors", response_model=DoctorOut, status_code=201)
def create_doctor(payload: DoctorCreate, db: Session = Depends(get_db)):
    """Onboard a doctor and make them bookable straight away.

    Windows are provisioned in the same transaction, so a newly created doctor
    never sits in the database with an empty schedule.
    """
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="A doctor needs a name.")

    doctor = Doctor(
        name=name,
        specialization=payload.specialization,
        contact_number=payload.contact_number,
        gender=payload.gender,
        slot_minutes=payload.slot_minutes or DEFAULT_SLOT_MINUTES,
    )
    db.add(doctor)
    db.flush()  # needs doctor_id before the windows can reference it

    ensure_default_windows(db, doctor)
    db.commit()
    db.refresh(doctor)
    return doctor


@router.get("/doctors/{doctor_id}/availability", response_model=AvailabilityOut)
def doctor_availability(
    doctor_id: int,
    day: date = Query(..., alias="date", description="ISO date, e.g. 2026-11-02"),
    exclude: int | None = Query(
        None, description="Prescription to treat as free (rescheduling itself)"
    ),
    db: Session = Depends(get_db),
):
    """Slots the doctor can still take on one day, excluding booked and past."""
    doctor = db.get(Doctor, doctor_id)
    if doctor is None:
        raise HTTPException(status_code=404, detail=f"Doctor {doctor_id} not found")

    return AvailabilityOut(
        doctor_id=doctor_id,
        date=day,
        slot_minutes=doctor.slot_minutes or 30,
        slots=available_slots(
            db, doctor_id, day, exclude_prescription_id=exclude
        ),
    )


@router.get("/medicines", response_model=list[MedicineCatalogOut])
def list_medicines(db: Session = Depends(get_db)):
    return db.scalars(select(Medicine).order_by(Medicine.name)).all()


@router.get("/diseases", response_model=list[DiseaseOut])
def list_diseases(db: Session = Depends(get_db)):
    return db.scalars(select(Disease).order_by(Disease.name)).all()
