"""Doctor availability: weekly windows turned into bookable slots.

A slot is bookable when it sits inside one of the doctor's windows for that
weekday, is not already taken by another patient, and — for today — has not
already passed.
"""

from datetime import date, datetime, time

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Doctor, DoctorAvailability, PatientDoctorVisit, Prescription

DEFAULT_SLOT_MINUTES = 30


def _minutes_of_day(value: time) -> int:
    return value.hour * 60 + value.minute


def _time_of_day(minutes: int) -> time:
    return time(hour=minutes // 60, minute=minutes % 60)


def _normalise(value: time) -> time:
    return value.replace(second=0, microsecond=0)


def booked_slots(
    db: Session,
    doctor_id: int,
    day: date,
    *,
    exclude_prescription_id: int | None = None,
) -> set[time]:
    """Slots this doctor already has a patient in on `day`."""
    rows = db.execute(
        select(Prescription.prescription_id, Prescription.next_checkup_time)
        .join(
            PatientDoctorVisit,
            PatientDoctorVisit.prescription_id == Prescription.prescription_id,
        )
        .where(
            PatientDoctorVisit.doctor_id == doctor_id,
            Prescription.next_checkup_date == day,
            Prescription.next_checkup_time.is_not(None),
        )
    ).all()

    taken: set[time] = set()
    for prescription_id, slot in rows:
        # Rescheduling must keep the patient's own slot reachable.
        if exclude_prescription_id is not None and prescription_id == exclude_prescription_id:
            continue
        if slot is not None:
            taken.add(_normalise(slot))
    return taken


def available_slots(
    db: Session,
    doctor_id: int,
    day: date,
    *,
    exclude_prescription_id: int | None = None,
    now: datetime | None = None,
) -> list[time]:
    """Bookable slots for one doctor on one day, in ascending order."""
    doctor = db.get(Doctor, doctor_id)
    if doctor is None:
        return []

    windows = db.scalars(
        select(DoctorAvailability).where(
            DoctorAvailability.doctor_id == doctor_id,
            DoctorAvailability.weekday == day.weekday(),
        )
    ).all()
    if not windows:
        return []

    step = doctor.slot_minutes or DEFAULT_SLOT_MINUTES
    taken = booked_slots(
        db, doctor_id, day, exclude_prescription_id=exclude_prescription_id
    )

    moment = now or datetime.now()
    past_cutoff = moment.time() if day == moment.date() else None

    slots: set[time] = set()
    for window in windows:
        start = _minutes_of_day(window.start_time)
        end = _minutes_of_day(window.end_time)
        # A slot has to finish inside the window.
        for minute in range(start, end - step + 1, step):
            slot = _time_of_day(minute)
            if slot in taken:
                continue
            if past_cutoff is not None and slot <= past_cutoff:
                continue
            slots.add(slot)
    return sorted(slots)
