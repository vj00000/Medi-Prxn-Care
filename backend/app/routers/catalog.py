"""Reference data the prescribing form picks from."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Disease, Doctor, Medicine
from app.schemas import DiseaseOut, DoctorOut, DoctorUpdate, MedicineCatalogOut

router = APIRouter(tags=["catalog"])


@router.get("/doctors", response_model=list[DoctorOut])
def list_doctors(db: Session = Depends(get_db)):
    return db.scalars(select(Doctor).order_by(Doctor.doctor_id)).all()


@router.patch("/doctors/{doctor_id}", response_model=DoctorOut)
def update_doctor(doctor_id: int, payload: DoctorUpdate, db: Session = Depends(get_db)):
    """Give one doctor their own booking link, or clear it."""
    doctor = db.get(Doctor, doctor_id)
    if doctor is None:
        raise HTTPException(status_code=404, detail=f"Doctor {doctor_id} not found")

    url = (payload.calendly_url or "").strip() or None
    if url and not url.startswith(("https://calendly.com/", "http://calendly.com/")):
        raise HTTPException(
            status_code=422,
            detail="calendly_url must start with https://calendly.com/",
        )

    doctor.calendly_url = url
    db.commit()
    db.refresh(doctor)
    return doctor


@router.get("/medicines", response_model=list[MedicineCatalogOut])
def list_medicines(db: Session = Depends(get_db)):
    return db.scalars(select(Medicine).order_by(Medicine.name)).all()


@router.get("/diseases", response_model=list[DiseaseOut])
def list_diseases(db: Session = Depends(get_db)):
    return db.scalars(select(Disease).order_by(Disease.name)).all()
