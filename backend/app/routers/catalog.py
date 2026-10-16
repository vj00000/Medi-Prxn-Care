"""Reference data the prescribing form picks from."""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Disease, Doctor, Medicine
from app.schemas import DiseaseOut, DoctorOut, MedicineCatalogOut

router = APIRouter(tags=["catalog"])


@router.get("/doctors", response_model=list[DoctorOut])
def list_doctors(db: Session = Depends(get_db)):
    return db.scalars(select(Doctor).order_by(Doctor.doctor_id)).all()


@router.get("/medicines", response_model=list[MedicineCatalogOut])
def list_medicines(db: Session = Depends(get_db)):
    return db.scalars(select(Medicine).order_by(Medicine.name)).all()


@router.get("/diseases", response_model=list[DiseaseOut])
def list_diseases(db: Session = Depends(get_db)):
    return db.scalars(select(Disease).order_by(Disease.name)).all()
