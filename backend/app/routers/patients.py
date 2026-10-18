"""Patient reads, family groupings, and the joins the portals render."""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.clinical import allergy_terms, normalize_slot
from app.database import get_db
from app.doses import (
    is_low,
    low_stock_rows,
    record_dose,
    stock_for,
    taken_on,
    undo_dose,
)
from app.family_code import qr_token_for, unique_code
from app.interactions import MAX_WARNING_CHARS, find_interactions
from app.models import Family, MedicationSchedule, Patient, PatientDisease
from app.schemas import (
    DiseaseOut,
    DoseTakenOut,
    FamilyHistoryOut,
    FamilyMemberCreate,
    InteractionCheckOut,
    LowStockOut,
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
    selectinload(Patient.family),
)

# Display order inside a family.
_RELATION_ORDER = {"self": 0, "father": 1, "mother": 2}


def _to_out(
    patient: Patient, viewer_id: int | None = None, db: Session | None = None
) -> PatientOut:
    """Serialise a patient.

    ``viewer_id`` is the patient whose portal is doing the looking. Any other
    member's medicines are dropped when the prescription behind them is marked
    private — that is the whole point of the toggle.

    ``db`` is optional so callers can skip the dose and stock lookups; when it
    is passed, each schedule carries today's dose state and remaining units.
    """
    is_owner = viewer_id is None or viewer_id == patient.patient_id

    today = date.today()
    doses = taken_on(db, patient.patient_id, today) if db is not None else {}

    schedules = []
    for row in sorted(patient.medication_schedules, key=lambda row: row.id):
        if not is_owner and row.prescription is not None and row.prescription.is_private:
            continue
        log = doses.get(row.id)
        stock = (
            stock_for(db, patient.patient_id, row.medicine_name)
            if db is not None
            else None
        )
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
                taken_today=log is not None,
                taken_at=log.taken_at if log is not None else None,
                units_remaining=stock.units_remaining if stock is not None else None,
                low_stock=is_low(stock),
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
        family_code=patient.family.code if patient.family is not None else None,
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
    return [_to_out(patient, db=db) for patient in rows]


@router.get("/{patient_id}", response_model=PatientOut)
def get_patient(patient_id: int, db: Session = Depends(get_db)):
    patient = db.scalar(_BASE.where(Patient.patient_id == patient_id))
    if patient is None:
        raise HTTPException(status_code=404, detail=f"Patient {patient_id} not found")
    return _to_out(patient, db=db)


@router.get("/{patient_id}/family", response_model=list[PatientOut])
def get_family(patient_id: int, db: Session = Depends(get_db)):
    """The viewer plus everyone else in their household."""
    viewer = db.scalar(_BASE.where(Patient.patient_id == patient_id))
    if viewer is None:
        raise HTTPException(status_code=404, detail=f"Patient {patient_id} not found")

    if viewer.family_id is None:
        return [_to_out(viewer, db=db)]

    members = db.scalars(_BASE.where(Patient.family_id == viewer.family_id)).all()
    members = sorted(
        members,
        key=lambda row: (_RELATION_ORDER.get(row.relation or "", 9), row.patient_id),
    )
    return [_to_out(member, viewer_id=patient_id, db=db) for member in members]


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

    # Older households may predate the code, and the token is built from it.
    if not family.code:
        family.code = unique_code(db)
        db.flush()

    member = Patient(
        name=payload.name.strip(),
        age=payload.age,
        gender=payload.gender,
        relation=relation,
        phone=payload.phone,
        allergies=payload.allergies or "None reported",
        family_id=family.family_id,
    )
    db.add(member)
    # The token includes the patient number, which only exists after the flush.
    db.flush()
    member.qr_token = qr_token_for(family.code, member.patient_id)
    db.commit()
    db.refresh(member)
    return _to_out(member, viewer_id=member.patient_id, db=db)


def _schedule_for(
    db: Session, patient_id: int, schedule_id: int
) -> MedicationSchedule:
    schedule = db.get(MedicationSchedule, schedule_id)
    if schedule is None or schedule.patient_id != patient_id:
        raise HTTPException(
            status_code=404, detail=f"Schedule {schedule_id} not found"
        )
    return schedule


@router.post("/{patient_id}/doses/{schedule_id}/taken", response_model=DoseTakenOut)
def mark_dose_taken(
    patient_id: int,
    schedule_id: int,
    dose_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """Record one dose for the given day, defaulting to today.

    Idempotent by design: a second tap returns the existing record instead of
    creating another, so stock is drawn down exactly once per dose.
    """
    schedule = _schedule_for(db, patient_id, schedule_id)
    day = dose_date or date.today()
    if day > date.today():
        raise HTTPException(
            status_code=422, detail="A dose cannot be recorded ahead of time."
        )

    _log, created = record_dose(db, schedule, day)
    db.commit()

    stock = stock_for(db, patient_id, schedule.medicine_name)
    return DoseTakenOut(
        schedule_id=schedule_id,
        dose_date=day,
        taken=True,
        already_taken=not created,
        units_remaining=stock.units_remaining if stock is not None else None,
        low_stock=is_low(stock),
    )


@router.delete("/{patient_id}/doses/{schedule_id}/taken", response_model=DoseTakenOut)
def unmark_dose_taken(
    patient_id: int,
    schedule_id: int,
    dose_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """Undo a dose, putting the unit back so the count stays honest."""
    schedule = _schedule_for(db, patient_id, schedule_id)
    day = dose_date or date.today()

    undo_dose(db, schedule, day)
    db.commit()

    stock = stock_for(db, patient_id, schedule.medicine_name)
    return DoseTakenOut(
        schedule_id=schedule_id,
        dose_date=day,
        taken=False,
        units_remaining=stock.units_remaining if stock is not None else None,
        low_stock=is_low(stock),
    )


@router.get("/{patient_id}/low-stock", response_model=list[LowStockOut])
def get_low_stock(patient_id: int, db: Session = Depends(get_db)):
    """Medicines about to run out, ready to drop straight into the cart."""
    if db.get(Patient, patient_id) is None:
        raise HTTPException(
            status_code=404, detail=f"Patient {patient_id} not found"
        )

    return [
        LowStockOut(
            patient_id=patient_id,
            medicine_name=row.medicine_name,
            units_remaining=row.units_remaining,
            low_stock_threshold=row.low_stock_threshold,
            out_of_stock=row.units_remaining <= 0,
        )
        for row in low_stock_rows(db, patient_id)
    ]


@router.get("/{patient_id}/interactions", response_model=InteractionCheckOut)
def get_patient_interactions(patient_id: int, db: Session = Depends(get_db)):
    """Known interactions among the patient's own active medicines."""
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(
            status_code=404, detail=f"Patient {patient_id} not found"
        )

    active = db.scalars(
        select(MedicationSchedule.medicine_name)
        .where(
            MedicationSchedule.patient_id == patient_id,
            MedicationSchedule.is_expired.is_(False),
        )
        .distinct()
    ).all()

    interactions = find_interactions([], list(active))
    warnings: list[str] = []
    for interaction in interactions:
        a, b = interaction.drugs
        note = interaction.warning
        if len(note) > MAX_WARNING_CHARS:
            note = note[: MAX_WARNING_CHARS - 1].rstrip() + "\u2026"
        warnings.append(f"Possible interaction {a} + {b}: {note}")

    if not active:
        note = "No active medicines to check."
    elif not warnings:
        note = "No known interactions among your current medicines."
    else:
        note = None

    return InteractionCheckOut(warnings=warnings, interaction_note=note)
