"""Dose tracking: what was taken, and how much stock is left.

A dose is identified by ``(schedule, date)``. The date in that key is what
makes "taken" reset every day — so the next reminder fires when the slot comes
round again — and the unique constraint behind it is what makes "mark taken"
safe to tap twice without drawing down stock twice.
"""

from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import DoseLog, MedicationSchedule, MedicineStock

# Warn at or below this many units.
DEFAULT_LOW_STOCK_THRESHOLD = 7


def stock_for(
    db: Session, patient_id: int, medicine_name: str
) -> MedicineStock | None:
    """The stock row for one patient's medicine, if one has been recorded.

    Returns None rather than inventing a zero row: "unknown supply" and "none
    left" are very different things to show a patient.
    """
    return db.scalar(
        select(MedicineStock).where(
            MedicineStock.patient_id == patient_id,
            MedicineStock.medicine_name == medicine_name,
        )
    )


def taken_on(db: Session, patient_id: int, day: date) -> dict[int, DoseLog]:
    """Dose logs for one patient on one day, keyed by schedule id."""
    rows = db.scalars(
        select(DoseLog).where(
            DoseLog.patient_id == patient_id, DoseLog.dose_date == day
        )
    ).all()
    return {row.schedule_id: row for row in rows}


def is_low(stock: MedicineStock | None) -> bool:
    return stock is not None and stock.units_remaining <= stock.low_stock_threshold


def record_dose(
    db: Session, schedule: MedicationSchedule, day: date
) -> tuple[DoseLog, bool]:
    """Record one dose, returning ``(log, created)``.

    ``created`` is False when this dose was already recorded for that date, so
    a double tap returns the existing row instead of drawing down stock again.
    """
    existing = db.scalar(
        select(DoseLog).where(
            DoseLog.schedule_id == schedule.id, DoseLog.dose_date == day
        )
    )
    if existing is not None:
        return existing, False

    log = DoseLog(
        schedule_id=schedule.id,
        patient_id=schedule.patient_id,
        dose_date=day,
        taken_at=datetime.now(),
    )
    db.add(log)
    db.flush()

    stock = stock_for(db, schedule.patient_id, schedule.medicine_name)
    if stock is not None and stock.units_remaining > 0:
        stock.units_remaining -= 1
        db.flush()

    return log, True


def undo_dose(db: Session, schedule: MedicationSchedule, day: date) -> bool:
    """Remove a recorded dose and give the unit back. False if none was there."""
    existing = db.scalar(
        select(DoseLog).where(
            DoseLog.schedule_id == schedule.id, DoseLog.dose_date == day
        )
    )
    if existing is None:
        return False

    db.delete(existing)
    db.flush()

    stock = stock_for(db, schedule.patient_id, schedule.medicine_name)
    if stock is not None:
        stock.units_remaining += 1
        db.flush()
    return True


def low_stock_rows(db: Session, patient_id: int) -> list[MedicineStock]:
    """Medicines at or below their threshold, most urgent first."""
    rows = db.scalars(
        select(MedicineStock).where(MedicineStock.patient_id == patient_id)
    ).all()
    return sorted(
        (row for row in rows if is_low(row)),
        key=lambda row: (row.units_remaining, row.medicine_name),
    )
