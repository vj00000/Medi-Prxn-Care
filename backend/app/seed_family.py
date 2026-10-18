"""Seed the Rao family so the patient portal has a household to show.

Idempotent: safe to re-run. Assumes ``app.migrate_columns`` has been run and the
base seed (doctors, patients) already exists.

    docker compose exec -T api python -m app.seed_family
"""

from datetime import date, timedelta

from sqlalchemy import func, select

from app.availability import DEFAULT_WEEKLY_WINDOWS, ensure_default_windows
from app.database import SessionLocal
from app.family_code import qr_token_for, unique_code
from app.models import (
    Doctor,
    Family,
    Medicine,
    MedicationSchedule,
    MedicineStock,
    Patient,
    PatientDoctorVisit,
    Prescription,
    PrescriptionMedicine,
    PrescriptionStatus,
)

FAMILY_NAME = "Rao Family"


def _medicine(db, name: str, brand: str | None = None) -> Medicine:
    found = db.scalar(select(Medicine).where(func.lower(Medicine.name) == name.lower()))
    if found is None:
        found = Medicine(name=name, brand=brand)
        db.add(found)
        db.flush()
    return found


def _add_prescription(db, patient, doctor, lines, *, created_on, checkup, is_private, transcript):
    """`lines` is a list of (medicine, dosage, timings, timing_slot, end_date)."""
    rx = Prescription(
        transcript=transcript,
        created_on=created_on,
        next_checkup_date=checkup,
        is_private=is_private,
        status=PrescriptionStatus.review,
    )
    db.add(rx)
    db.flush()

    for med, dosage, timings, slot, end in lines:
        db.add(
            PrescriptionMedicine(
                prescription_id=rx.prescription_id,
                medicine_id=med.id,
                medicine_dosage=dosage,
                timings=timings,
                is_active=True,
            )
        )
        db.add(
            MedicationSchedule(
                patient_id=patient.patient_id,
                prescription_id=rx.prescription_id,
                medicine_name=med.name,
                dosage=dosage,
                timing_slot=slot,
                start_date=created_on,
                end_date=end,
                is_expired=False,
            )
        )

    db.add(
        PatientDoctorVisit(
            patient_id=patient.patient_id,
            doctor_id=doctor.doctor_id,
            prescription_id=rx.prescription_id,
            visit_date=created_on,
        )
    )
    return rx


def _ensure_member(db, *, family, doctor, name, relation, age, gender, phone, prescriptions):
    member = db.scalar(select(Patient).where(Patient.name == name))
    if member is None:
        member = Patient(
            name=name,
            age=age,
            gender=gender,
            relation=relation,
            family_id=family.family_id,
            phone=phone,
            allergies="None reported",
        )
        db.add(member)
        db.flush()
        print(f"  created {name} ({relation})")
    elif member.family_id != family.family_id or member.relation != relation:
        member.family_id = family.family_id
        member.relation = relation
        print(f"  linked {name} to {FAMILY_NAME} as {relation}")

    # Derived from the family code, so re-seeding keeps the token stable.
    token = qr_token_for(family.code, member.patient_id)
    if member.qr_token != token:
        member.qr_token = token

    already = db.scalar(
        select(Prescription)
        .join(
            PatientDoctorVisit,
            PatientDoctorVisit.prescription_id == Prescription.prescription_id,
        )
        .where(PatientDoctorVisit.patient_id == member.patient_id)
        .limit(1)
    )
    if already is not None:
        return member

    for spec in prescriptions:
        _add_prescription(
            db,
            member,
            doctor,
            spec["lines"],
            created_on=spec["created_on"],
            checkup=spec["checkup"],
            is_private=spec["is_private"],
            transcript=spec["transcript"],
        )
    print(f"  added {len(prescriptions)} prescription(s) for {name}")
    return member


def seed() -> None:
    today = date.today()
    db = SessionLocal()
    try:
        doctors = db.scalars(select(Doctor).order_by(Doctor.doctor_id)).all()
        if not doctors:
            print("No doctors found - run `python -m app.seed_db` first.")
            return

        # Every doctor needs bookable windows, not just the first one: a doctor
        # with none cannot be booked at all. Existing schedules are left alone.
        for each in doctors:
            if ensure_default_windows(db, each):
                print(
                    f"  {each.name}: default availability -> "
                    f"{len(DEFAULT_WEEKLY_WINDOWS)} window(s)"
                )

        # The remaining steps create prescriptions against the primary doctor.
        doctor = doctors[0]

        family = db.scalar(select(Family).where(Family.name == FAMILY_NAME))
        if family is None:
            family = Family(name=FAMILY_NAME, code=unique_code(db))
            db.add(family)
            db.flush()
            print(f"  created family '{FAMILY_NAME}' ({family.code})")
        elif not family.code:
            family.code = unique_code(db)
            db.flush()
            print(f"  family '{FAMILY_NAME}' -> {family.code}")

        # The signed-in patient. Looked up by name, not QR token: the token is
        # derived from the family code and changes when it is assigned.
        vikram = db.scalar(select(Patient).where(Patient.name == "Vikram Rao"))
        if vikram is not None:
            if vikram.family_id != family.family_id or vikram.relation != "self":
                vikram.family_id = family.family_id
                vikram.relation = "self"
                print("  linked Vikram Rao as self")

            vikram.qr_token = qr_token_for(family.code, vikram.patient_id)

            # Give his own prescription a follow-up date.
            own = db.scalar(
                select(Prescription)
                .join(
                    PatientDoctorVisit,
                    PatientDoctorVisit.prescription_id == Prescription.prescription_id,
                )
                .where(PatientDoctorVisit.patient_id == vikram.patient_id)
                .order_by(Prescription.prescription_id)
                .limit(1)
            )
            if own is not None and own.next_checkup_date is None:
                own.next_checkup_date = today + timedelta(days=14)
                print("  set Vikram's next checkup")

        atorvastatin = _medicine(db, "Atorvastatin", "Lipitor")
        amlodipine = _medicine(db, "Amlodipine", "Amlong")
        metformin = _medicine(db, "Metformin", "Glycomet")
        alprazolam = _medicine(db, "Alprazolam", "Alprax")

        _ensure_member(
            db,
            family=family,
            doctor=doctor,
            name="Suresh Rao",
            relation="father",
            age=68,
            gender="male",
            phone="+91-90000-33333",
            prescriptions=[
                {
                    "transcript": "Hypertension review; continue current medication",
                    "created_on": today - timedelta(days=20),
                    "checkup": today + timedelta(days=3),
                    "is_private": False,
                    "lines": [
                        # Ends in two days -> shows up as "reorder soon".
                        (atorvastatin, "10 mg", "Once at night", "Night", today + timedelta(days=2)),
                        (amlodipine, "5 mg", "Once in the morning", "Morning", today + timedelta(days=25)),
                    ],
                }
            ],
        )

        _ensure_member(
            db,
            family=family,
            doctor=doctor,
            name="Lakshmi Rao",
            relation="mother",
            age=64,
            gender="female",
            phone="+91-90000-44444",
            prescriptions=[
                {
                    "transcript": "Diabetes review; metformin continued",
                    "created_on": today - timedelta(days=12),
                    "checkup": today + timedelta(days=7),
                    "is_private": False,
                    "lines": [
                        (metformin, "500 mg", "Twice daily after meals", "Morning", today + timedelta(days=20)),
                    ],
                },
                {
                    # Private: no other family member may see this one.
                    "transcript": "Sleep and anxiety - confidential",
                    "created_on": today - timedelta(days=5),
                    "checkup": today + timedelta(days=10),
                    "is_private": True,
                    "lines": [
                        (alprazolam, "0.5 mg", "Once at night", "Night", today + timedelta(days=10)),
                    ],
                },
            ],
        )

        # --- demo reorder signals ------------------------------------------ #
        # A few medicines start low / out of stock so the reorder list and the
        # patient assistant have something concrete to point at. Idempotent.
        demo_stock = [
            ("Vikram Rao", "Atorvastatin", 3, 7),
            ("Suresh Rao", "Amlodipine", 0, 7),
            ("Lakshmi Rao", "Metformin", 5, 7),
        ]
        for patient_name, medicine_name, remaining, threshold in demo_stock:
            owner = db.scalar(select(Patient).where(Patient.name == patient_name))
            if owner is None:
                continue
            stock = db.scalar(
                select(MedicineStock).where(
                    MedicineStock.patient_id == owner.patient_id,
                    MedicineStock.medicine_name == medicine_name,
                )
            )
            if stock is None:
                stock = MedicineStock(
                    patient_id=owner.patient_id,
                    medicine_name=medicine_name,
                )
                db.add(stock)
            stock.units_remaining = remaining
            stock.low_stock_threshold = threshold
            print(f"  stock: {patient_name} / {medicine_name} -> {remaining} left")

        db.commit()
        print("\nFamily seeded.")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
