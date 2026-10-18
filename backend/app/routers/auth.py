"""Onboarding and sign-in for doctors and patients.

Doctors sign up with their professional details. Patients sign up with email,
phone and either join an existing household (by its 5-character family code)
or start a new household with a freshly generated code.
"""

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.availability import ensure_default_windows
from app.database import get_db
from app.family_code import qr_token_for, unique_code
from app.models import Doctor, Family, Patient
from app.routers.patients import _to_out
from app.schemas import (
    AuthOut,
    DoctorLogin,
    DoctorSignup,
    MeOut,
    PatientLogin,
    PatientSignup,
)
from app.security import hash_password, make_token, read_token, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


def _email(value: str) -> str:
    email = (value or "").strip().lower()
    if "@" not in email or "." not in email:
        raise HTTPException(status_code=422, detail="Enter a valid email address.")
    return email


def _password(value: str) -> None:
    if len(value or "") < 6:
        raise HTTPException(
            status_code=422, detail="Password must be at least 6 characters."
        )


@router.post("/doctor/signup", response_model=AuthOut, status_code=201)
def doctor_signup(payload: DoctorSignup, db: Session = Depends(get_db)):
    email = _email(payload.email)
    _password(payload.password)

    if db.scalar(select(Doctor).where(Doctor.email == email)) is not None:
        raise HTTPException(
            status_code=409, detail="A doctor with this email already exists."
        )

    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="A doctor needs a name.")

    doctor = Doctor(
        name=name,
        email=email,
        password_hash=hash_password(payload.password),
        specialization=payload.specialization,
        contact_number=payload.contact_number,
        gender=payload.gender,
        slot_minutes=30,
    )
    db.add(doctor)
    db.flush()
    ensure_default_windows(db, doctor)
    db.commit()
    db.refresh(doctor)
    return AuthOut(
        token=make_token("doctor", doctor.doctor_id),
        role="doctor",
        doctor=doctor,
    )


@router.post("/doctor/login", response_model=AuthOut)
def doctor_login(payload: DoctorLogin, db: Session = Depends(get_db)):
    email = _email(payload.email)
    doctor = db.scalar(select(Doctor).where(Doctor.email == email))
    if doctor is None or not verify_password(
        payload.password, doctor.password_hash or ""
    ):
        raise HTTPException(status_code=401, detail="Incorrect email or password.")
    return AuthOut(
        token=make_token("doctor", doctor.doctor_id),
        role="doctor",
        doctor=doctor,
    )


@router.post("/patient/signup", response_model=AuthOut, status_code=201)
def patient_signup(payload: PatientSignup, db: Session = Depends(get_db)):
    email = _email(payload.email)
    _password(payload.password)

    if db.scalar(select(Patient).where(Patient.email == email)) is not None:
        raise HTTPException(
            status_code=409, detail="A patient with this email already exists."
        )

    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="A patient needs a name.")

    # Join an existing household by its 5-character code, or start a new one.
    code = (payload.family_code or "").strip().upper()
    family = db.scalar(select(Family).where(Family.code == code)) if code else None
    if code and family is None:
        raise HTTPException(status_code=404, detail="No family found with that code.")

    if family is None:
        family = Family(name=f"{name}'s family", code=unique_code(db))
        db.add(family)
        db.flush()
        relation = "self"
    else:
        relation = "other"

    patient = Patient(
        name=name,
        email=email,
        password_hash=hash_password(payload.password),
        phone=payload.phone,
        age=payload.age,
        gender=payload.gender,
        allergies=payload.allergies or "None reported",
        family_id=family.family_id,
        relation=relation,
    )
    db.add(patient)
    db.flush()
    patient.qr_token = qr_token_for(family.code, patient.patient_id)
    db.commit()
    db.refresh(patient)
    return AuthOut(
        token=make_token("patient", patient.patient_id),
        role="patient",
        patient=_to_out(patient, viewer_id=patient.patient_id, db=db),
    )


@router.post("/patient/login", response_model=AuthOut)
def patient_login(payload: PatientLogin, db: Session = Depends(get_db)):
    email = _email(payload.email)
    patient = db.scalar(select(Patient).where(Patient.email == email))
    if patient is None or not verify_password(
        payload.password, patient.password_hash or ""
    ):
        raise HTTPException(status_code=401, detail="Incorrect email or password.")
    return AuthOut(
        token=make_token("patient", patient.patient_id),
        role="patient",
        patient=_to_out(patient, viewer_id=patient.patient_id, db=db),
    )


def _current(db: Session, authorization: str | None) -> tuple[str, int]:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Not signed in.")
    data = read_token(authorization.split(" ", 1)[1].strip())
    if data is None:
        raise HTTPException(
            status_code=401, detail="Session expired. Please sign in again."
        )
    return data["role"], int(data["id"])


@router.get("/me", response_model=MeOut)
def me(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    """Return the signed-in doctor or patient for a bearer token."""
    role, user_id = _current(db, authorization)
    if role == "doctor":
        doctor = db.get(Doctor, user_id)
        if doctor is None:
            raise HTTPException(status_code=401, detail="Doctor not found.")
        return MeOut(role="doctor", doctor=doctor)
    patient = db.scalar(select(Patient).where(Patient.patient_id == user_id))
    if patient is None:
        raise HTTPException(status_code=401, detail="Patient not found.")
    return MeOut(
        role="patient",
        patient=_to_out(patient, viewer_id=user_id, db=db),
    )
