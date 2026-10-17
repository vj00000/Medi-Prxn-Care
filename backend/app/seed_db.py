"""Seed the database with dummy data so the schema can be verified instantly.

Run inside the container:
    docker compose run --rm api python -m app.seed_db
Or locally (SQLite by default):
    python -m app.seed_db

The script is idempotent: if doctors already exist it skips insertion and just
prints the current row counts.
"""

from datetime import date, timedelta

from sqlalchemy import func, select

from app.database import Base, SessionLocal, engine
from app.models import (
    Disease,
    Doctor,
    FamilyMedicalHistory,
    LabTest,
    MedicationSchedule,
    Medicine,
    Patient,
    PatientDisease,
    PatientDoctorVisit,
    Prescription,
    PrescriptionMedicine,
    PrescriptionStatus,
)

TABLE_MODELS = [
    ("doctors", Doctor),
    ("patients", Patient),
    ("diseases", Disease),
    ("patient_diseases", PatientDisease),
    ("family_medical_history", FamilyMedicalHistory),
    ("patient_doctor_visit", PatientDoctorVisit),
    ("prescriptions", Prescription),
    ("medicines", Medicine),
    ("prescription_medicines", PrescriptionMedicine),
    ("medication_schedules", MedicationSchedule),
    ("lab_tests", LabTest),
]


def print_counts(db) -> None:
    print("Row counts:")
    for table, model in TABLE_MODELS:
        count = db.scalar(select(func.count()).select_from(model))
        print(f"  {table:<24} {count}")


def seed() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.scalar(select(Doctor).limit(1)) is not None:
            print("Database already seeded - skipping insert.")
            print_counts(db)
            return

        # --- core reference data ------------------------------------------- #
        doctors = [
            Doctor(
                name="Dr. Ananya Sharma",
                specialization="Cardiologist",
                contact_number="+91-9876543210",
                gender="female",
            ),
            Doctor(
                name="Dr. Rohan Mehta",
                specialization="Endocrinologist",
                contact_number="+91-9812345678",
                gender="male",
            ),
        ]
        patients = [
            Patient(
                name="Vikram Rao",
                age=45,
                gender="male",
                allergies="Penicillin, Sulfa drugs",
                qr_token="QR-VIKRAM-0001",
                phone="+91-90000-11111",
            ),
            Patient(
                name="Meera Nair",
                age=32,
                gender="female",
                allergies="None reported",
                qr_token="QR-MEERA-0002",
                phone="+91-90000-22222",
            ),
        ]
        medicines = [
            Medicine(name="Paracetamol", brand="Crocin"),
            Medicine(name="Metformin", brand="Glycomet"),
            Medicine(name="Atorvastatin", brand="Lipitor"),
        ]
        diseases = [
            Disease(
                name="Type 2 Diabetes Mellitus",
                is_transmittable=False,
                is_inheritable=True,
            ),
            Disease(name="Influenza", is_transmittable=True, is_inheritable=False),
        ]

        db.add_all([*doctors, *patients, *medicines, *diseases])
        db.flush()  # assign primary keys before wiring relationships

        # --- relational sample that exercises the foreign keys ------------- #
        db.add_all(
            [
                PatientDisease(patient=patients[0], disease=diseases[0]),
                PatientDisease(patient=patients[1], disease=diseases[1]),
                FamilyMedicalHistory(
                    patient=patients[0],
                    relation="Father",
                    condition_name="Type 2 Diabetes Mellitus",
                    additional_notes="Diagnosed at age 50",
                ),
            ]
        )

        lab_test = LabTest(
            test_name="HbA1c",
            report_url="https://reports.example.com/hba1c/0001.pdf",
        )
        db.add(lab_test)
        db.flush()

        prescription = Prescription(
            transcript="Metformin 500mg BD after meals; Atorvastatin 10mg at night",
            case_paper_url="https://reports.example.com/cases/0001.pdf",
            created_on=date.today(),
            status=PrescriptionStatus.review,
            lab_test=lab_test,
        )
        db.add(prescription)
        db.flush()

        db.add_all(
            [
                PatientDoctorVisit(
                    patient=patients[0],
                    doctor=doctors[0],
                    prescription=prescription,
                    visit_date=date.today(),
                ),
                # No prescription attached, but a visit on record, so both
                # seeded patients have a "last visit" to show.
                PatientDoctorVisit(
                    patient=patients[1],
                    doctor=doctors[1],
                    visit_date=date.today() - timedelta(days=1),
                ),
            ]
        )

        db.add_all(
            [
                PrescriptionMedicine(
                    prescription=prescription,
                    medicine=medicines[1],
                    medicine_dosage="500 mg",
                    timings="Twice daily after meals",
                    is_active=True,
                ),
                PrescriptionMedicine(
                    prescription=prescription,
                    medicine=medicines[2],
                    medicine_dosage="10 mg",
                    timings="Once daily at night",
                    is_active=True,
                ),
            ]
        )

        start = date.today()
        end = start + timedelta(days=30)
        db.add_all(
            [
                MedicationSchedule(
                    patient=patients[0],
                    prescription=prescription,
                    medicine_name="Metformin",
                    dosage="500 mg",
                    timing_slot="morning",
                    start_date=start,
                    end_date=end,
                    is_expired=False,
                ),
                MedicationSchedule(
                    patient=patients[0],
                    prescription=prescription,
                    medicine_name="Atorvastatin",
                    dosage="10 mg",
                    timing_slot="night",
                    start_date=start,
                    end_date=end,
                    is_expired=False,
                ),
            ]
        )

        db.commit()
        print("Seed complete.\n")
        print_counts(db)

        # Family groupings and follow-up dates build on the base seed.
        from app.seed_family import seed as seed_family

        seed_family()
    finally:
        db.close()


if __name__ == "__main__":
    seed()
