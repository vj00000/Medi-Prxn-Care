"""Prescription endpoints: create (doctor-confirmed), list, approve."""

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, func, select, text
from sqlalchemy.orm import Session

from app.availability import available_slots
from app.clinical import allergy_terms, normalize_slot
from app.database import get_db
from app.interactions import MAX_WARNING_CHARS, find_interactions
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
from app.schemas import (
    CheckupUpdate,
    DoctorOut,
    InteractionCheckOut,
    InteractionCheckRequest,
    MedicineLine,
    MedicineOut,
    PrescriptionCreate,
    PrescriptionOut,
    PrivacyUpdate,
    SelfPrescriptionCreate,
    SelfPrescriptionUpdate,
)

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


def _to_out(
    db: Session,
    rx: Prescription,
    warnings: list[str] | None = None,
    interaction_note: str | None = None,
) -> PrescriptionOut:
    visit = db.scalar(
        select(PatientDoctorVisit).where(
            PatientDoctorVisit.prescription_id == rx.prescription_id
        )
    )
    status = rx.status.value if isinstance(rx.status, PrescriptionStatus) else str(rx.status)
    doctor = db.get(Doctor, visit.doctor_id) if visit and visit.doctor_id else None

    days_by_medicine: dict[str, int] = {}
    for schedule in rx.medication_schedules:
        if schedule.start_date and schedule.end_date:
            days_by_medicine[schedule.medicine_name] = (
                schedule.end_date - schedule.start_date
            ).days

    return PrescriptionOut(
        prescription_id=rx.prescription_id,
        patient_id=(
            rx.patient_id
            if rx.patient_id is not None
            else (visit.patient_id if visit else 0)
        ),
        created_by=rx.created_by,
        doctor_id=visit.doctor_id if visit else None,
        doctor=DoctorOut.model_validate(doctor) if doctor else None,
        status=status,
        transcript=rx.transcript,
        diagnosis=rx.diagnosis,
        case_paper_url=rx.case_paper_url,
        lab_test=rx.lab_test.test_name if rx.lab_test else None,
        created=rx.created_on,
        is_private=rx.is_private,
        next_checkup_date=rx.next_checkup_date,
        next_checkup_time=rx.next_checkup_time,
        medicines=[
            MedicineOut(
                medicine_id=link.medicine_id,
                name=link.medicine.name if link.medicine else "",
                dosage=link.medicine_dosage,
                timings=link.timings,
                is_active=link.is_active,
                duration_days=days_by_medicine.get(
                    link.medicine.name if link.medicine else "", None
                ),
            )
            for link in rx.medicines
        ],
        warnings=warnings or [],
        interaction_note=interaction_note,
    )


def _interaction_warnings(
    ongoing_names: list[str], added_names: list[str]
) -> tuple[list[str], str | None]:
    """Run the drug-interaction lookup and format warnings plus a summary note.

    Pure (no DB access) so both create and the in-memory check endpoint emit
    identical output.
    """
    try:
        interactions = find_interactions(ongoing_names, added_names)
    except Exception:  # noqa: BLE001 — a lookup failure must not block saving
        interactions = []

    warnings: list[str] = []
    for interaction in interactions:
        a, b = interaction.drugs
        note = interaction.warning
        if len(note) > MAX_WARNING_CHARS:
            note = note[: MAX_WARNING_CHARS - 1].rstrip() + "\u2026"
        warnings.append(f"Possible interaction {a} + {b}: {note}")

    if interactions:
        return warnings, None

    if not ongoing_names:
        note = (
            "No ongoing medicines on record, so there was nothing to check "
            "for interactions."
        )
    elif added_names:
        note = (
            "Checked the new medicines against the patient's "
            f"{len(ongoing_names)} ongoing medicine(s) - no interactions found."
        )
    else:
        note = None
    return warnings, note


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
        diagnosis=payload.diagnosis,
        case_paper_url=payload.case_paper_url,
        next_checkup_date=payload.next_checkup_date,
        next_checkup_time=payload.next_checkup_time,
        created_on=date.today(),
        status=PrescriptionStatus.approved
        if payload.approve
        else PrescriptionStatus.review,
        created_by="doctor",
        patient_id=patient.patient_id,
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

    # What the patient is already taking. Read before the new schedules are
    # flushed below, so the interaction check compares new vs existing only.
    ongoing_names = db.scalars(
        select(MedicationSchedule.medicine_name)
        .where(
            MedicationSchedule.patient_id == patient.patient_id,
            MedicationSchedule.is_expired.is_(False),
        )
        .distinct()
    ).all()

    added_names: list[str] = []

    for line in payload.medicines:
        medicine = _resolve_medicine(db, line)
        if medicine is None:
            continue
        added_names.append(medicine.name)

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

    # Drug interactions between the new medicines and the ongoing regimen.
    # Best-effort: a network hiccup must not stop the prescription being saved.
    interaction_warnings, interaction_note = _interaction_warnings(
        list(ongoing_names), added_names
    )
    warnings.extend(interaction_warnings)

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
    return _to_out(db, rx, warnings, interaction_note)


def _add_medicine_lines(
    db: Session, rx: Prescription, patient_id: int, lines: list[MedicineLine]
) -> None:
    """Attach medicine links and reminder schedules to a prescription."""
    start = date.today()
    for line in lines:
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
                patient_id=patient_id,
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


@router.post("/self", response_model=PrescriptionOut, status_code=201)
def create_self_prescription(
    payload: SelfPrescriptionCreate, db: Session = Depends(get_db)
):
    """Record a prescription the patient is taking on their own.

    No doctor is attached, so it starts as `approved` and stays editable by
    the patient who created it.
    """
    patient = db.get(Patient, payload.patient_id)
    if patient is None:
        raise HTTPException(
            status_code=404, detail=f"Patient {payload.patient_id} not found"
        )

    rx = Prescription(
        created_by="patient",
        patient_id=patient.patient_id,
        diagnosis=payload.diagnosis,
        created_on=date.today(),
        status=PrescriptionStatus.approved,
    )
    db.add(rx)
    db.flush()
    _add_medicine_lines(db, rx, patient.patient_id, payload.medicines)

    db.commit()
    db.refresh(rx)
    return _to_out(db, rx)


@router.patch("/{prescription_id}/self", response_model=PrescriptionOut)
def update_self_prescription(
    prescription_id: int,
    payload: SelfPrescriptionUpdate,
    db: Session = Depends(get_db),
):
    """Edit a self-reported prescription; doctor-issued ones are locked."""
    rx = db.get(Prescription, prescription_id)
    if rx is None:
        raise HTTPException(
            status_code=404, detail=f"Prescription {prescription_id} not found"
        )
    if rx.created_by != "patient":
        raise HTTPException(
            status_code=403,
            detail="Only prescriptions you added yourself can be edited.",
        )

    rx.diagnosis = payload.diagnosis

    # Replace the medicine set: drop old links and schedules, then re-add.
    db.execute(
        delete(MedicationSchedule).where(
            MedicationSchedule.prescription_id == rx.prescription_id
        )
    )
    db.execute(
        delete(PrescriptionMedicine).where(
            PrescriptionMedicine.prescription_id == rx.prescription_id
        )
    )
    _add_medicine_lines(db, rx, rx.patient_id, payload.medicines)

    db.commit()
    db.expire(rx)
    return _to_out(db, rx)


@router.post("/interactions", response_model=InteractionCheckOut)
def check_interactions(
    payload: InteractionCheckRequest, db: Session = Depends(get_db)
):
    """Safety-check a draft in memory: allergy clashes + drug interactions."""
    patient = db.get(Patient, payload.patient_id)
    if patient is None:
        raise HTTPException(
            status_code=404, detail=f"Patient {payload.patient_id} not found"
        )

    warnings: list[str] = []
    allergies = allergy_terms(patient)
    added_names: list[str] = []
    seen: set[str] = set()

    for line in payload.medicines:
        name = (line.name or "").strip()
        key = name.lower()
        if not name or key in seen:
            continue
        seen.add(key)
        added_names.append(name)

        medicine = db.scalar(
            select(Medicine).where(func.lower(Medicine.name) == name.lower())
        )
        haystack = f"{name} {medicine.brand if medicine else ''}".lower()
        for term in allergies:
            if term in haystack:
                warnings.append(
                    f"{name} may conflict with the recorded allergy '{term}'."
                )

    ongoing_names = db.scalars(
        select(MedicationSchedule.medicine_name)
        .where(
            MedicationSchedule.patient_id == patient.patient_id,
            MedicationSchedule.is_expired.is_(False),
        )
        .distinct()
    ).all()

    interaction_warnings, interaction_note = _interaction_warnings(
        list(ongoing_names), added_names
    )
    return InteractionCheckOut(
        warnings=[*warnings, *interaction_warnings],
        interaction_note=interaction_note,
    )


@router.get("", response_model=list[PrescriptionOut])
def list_prescriptions(
    patient_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    stmt = select(Prescription)
    if patient_id is not None:
        stmt = stmt.where(Prescription.patient_id == patient_id)

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


@router.patch("/{prescription_id}/privacy", response_model=PrescriptionOut)
def set_privacy(
    prescription_id: int, payload: PrivacyUpdate, db: Session = Depends(get_db)
):
    """Hide or show a prescription for the rest of the patient's family."""
    rx = db.get(Prescription, prescription_id)
    if rx is None:
        raise HTTPException(
            status_code=404, detail=f"Prescription {prescription_id} not found"
        )

    rx.is_private = payload.is_private
    db.commit()
    db.refresh(rx)
    return _to_out(db, rx)


@router.post("/{prescription_id}/checkup", response_model=PrescriptionOut)
def set_checkup(
    prescription_id: int, payload: CheckupUpdate, db: Session = Depends(get_db)
):
    """Record the follow-up slot the patient picked from the doctor's schedule."""
    rx = db.get(Prescription, prescription_id)
    if rx is None:
        raise HTTPException(
            status_code=404, detail=f"Prescription {prescription_id} not found"
        )

    if payload.next_checkup_date < date.today():
        raise HTTPException(
            status_code=422, detail="A follow-up cannot be booked in the past."
        )

    # A slot is only accepted if the doctor is genuinely free at that time.
    if payload.next_checkup_time is not None:
        visit = db.scalar(
            select(PatientDoctorVisit).where(
                PatientDoctorVisit.prescription_id == rx.prescription_id
            )
        )
        if visit is None or visit.doctor_id is None:
            raise HTTPException(
                status_code=409,
                detail="This prescription has no doctor attached, so no slots exist.",
            )

        chosen = payload.next_checkup_time.replace(second=0, microsecond=0)
        doctor = db.get(Doctor, visit.doctor_id)
        if doctor is None:
            raise HTTPException(status_code=409, detail="This prescription has no doctor.")

        # Serialize bookings per doctor per day. Without this, two requests can
        # both read the slot as free before either commits, and both would be
        # accepted. The lock is held until this transaction commits below.
        db.execute(
            text("SELECT pg_advisory_xact_lock(:doctor_id, :day_key)"),
            {
                "doctor_id": doctor.doctor_id,
                "day_key": payload.next_checkup_date.toordinal(),
            },
        )

        slots = available_slots(
            db,
            doctor.doctor_id,
            payload.next_checkup_date,
            exclude_prescription_id=rx.prescription_id,
        )
        if chosen not in slots:
            name = doctor.name or "This doctor"
            when = payload.next_checkup_date.strftime("%d %b %Y")
            if not slots:
                detail = f"{name} has no free slots on {when}."
            else:
                offered = ", ".join(slot.strftime("%H:%M") for slot in slots[:6])
                detail = (
                    f"{chosen.strftime('%H:%M')} is not free with {name} on {when}. "
                    f"Available: {offered}."
                )
            raise HTTPException(status_code=409, detail=detail)

    rx.next_checkup_date = payload.next_checkup_date
    rx.next_checkup_time = payload.next_checkup_time
    db.commit()
    db.refresh(rx)
    return _to_out(db, rx)
