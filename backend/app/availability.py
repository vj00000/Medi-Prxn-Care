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

# The schedule every doctor starts with: two sessions on weekdays and Saturday
# mornings, Sunday closed. Used at onboarding and backfilled for any doctor who
# has no windows yet.
DEFAULT_WEEKLY_WINDOWS = [
    *[(weekday, time(9, 0), time(13, 0)) for weekday in range(5)],
    *[(weekday, time(15, 0), time(18, 0)) for weekday in range(5)],
    (5, time(9, 0), time(12, 0)),
]


def ensure_default_windows(db: Session, doctor: Doctor) -> bool:
    """Give a doctor the standard weekly schedule if they have none.

    Idempotent and non-destructive: a doctor with even one window defined is
    left completely alone, so a customised schedule is never overwritten.
    Returns True when windows were created.
    """
    existing = db.scalar(
        select(DoctorAvailability).where(
            DoctorAvailability.doctor_id == doctor.doctor_id
        )
    )
    if existing is not None:
        return False

    if not doctor.slot_minutes:
        doctor.slot_minutes = DEFAULT_SLOT_MINUTES

    for weekday, start, end in DEFAULT_WEEKLY_WINDOWS:
        db.add(
            DoctorAvailability(
                doctor_id=doctor.doctor_id,
                weekday=weekday,
                start_time=start,
                end_time=end,
            )
        )
    db.flush()
    return True


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
