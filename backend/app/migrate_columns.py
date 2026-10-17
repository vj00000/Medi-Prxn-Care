"""Add columns and tables introduced after the first schema revision.

``Base.metadata.create_all`` only creates missing *tables* — it never adds a
missing *column* to an existing one — so a database created before these
fields existed needs an explicit migration. Every statement is idempotent, so
running this more than once is safe:

    docker compose exec -T api python -m app.migrate_columns

Run this before ``python -m app.seed_family``.
"""

from sqlalchemy import text

from app.database import SessionLocal

# Created before the ALTERs below, which reference it.
CREATE_TABLES = [
    """
    CREATE TABLE IF NOT EXISTS families (
        family_id SERIAL PRIMARY KEY,
        name      VARCHAR(100) NOT NULL
    )
    """,
    # Weekly consulting windows, used to generate the slots a patient may book.
    """
    CREATE TABLE IF NOT EXISTS doctor_availability (
        availability_id SERIAL PRIMARY KEY,
        doctor_id       INTEGER NOT NULL REFERENCES doctors(doctor_id) ON DELETE CASCADE,
        weekday         INTEGER NOT NULL,
        start_time      TIME NOT NULL,
        end_time        TIME NOT NULL
    )
    """,
]

ADD_COLUMNS = [
    # First revision: contact number, visit dates, prescription dates.
    "ALTER TABLE patients ADD COLUMN IF NOT EXISTS phone VARCHAR(20)",
    "ALTER TABLE patient_doctor_visit ADD COLUMN IF NOT EXISTS visit_date DATE",
    "ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS created_on DATE",
    # Second revision: families, per-prescription privacy, checkups, Calendly.
    "ALTER TABLE patients ADD COLUMN IF NOT EXISTS family_id INTEGER "
    "REFERENCES families(family_id) ON DELETE SET NULL",
    "ALTER TABLE patients ADD COLUMN IF NOT EXISTS relation VARCHAR(20)",
    "ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS next_checkup_date DATE",
    "ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS next_checkup_time TIME",
    "ALTER TABLE doctors ADD COLUMN IF NOT EXISTS calendly_url VARCHAR(255)",
    "ALTER TABLE doctors ADD COLUMN IF NOT EXISTS slot_minutes INTEGER NOT NULL DEFAULT 30",
]

# A prescription's date is recoverable: its medication schedules were created
# on the same day and carry a start date.
BACKFILL_PRESCRIPTION_DATES = """
UPDATE prescriptions p
   SET created_on = s.first_start
  FROM (
        SELECT prescription_id, MIN(start_date) AS first_start
          FROM medication_schedules
         WHERE prescription_id IS NOT NULL
         GROUP BY prescription_id
       ) s
 WHERE s.prescription_id = p.prescription_id
   AND p.created_on IS NULL
"""

# Oldest reliable signal first: the linked prescription's date, else the
# patient's earliest-to-latest schedule.
BACKFILL_VISIT_DATES = """
UPDATE patient_doctor_visit v
   SET visit_date = COALESCE(
         (SELECT p.created_on
            FROM prescriptions p
           WHERE p.prescription_id = v.prescription_id),
         (SELECT MAX(s.start_date)
            FROM medication_schedules s
           WHERE s.patient_id = v.patient_id)
       )
 WHERE v.visit_date IS NULL
"""

# Demo contact numbers for the two seeded patients; there is no source to
# derive these from, so they match `seed_db.py` verbatim.
DEMO_PHONES = {
    "QR-VIKRAM-0001": "+91-90000-11111",
    "QR-MEERA-0002": "+91-90000-22222",
}


def migrate() -> None:
    db = SessionLocal()
    try:
        for statement in CREATE_TABLES:
            db.execute(text(statement))
        db.commit()
        print("Tables present.")

        for statement in ADD_COLUMNS:
            db.execute(text(statement))
        db.commit()
        print("Columns present.")

        for statement, label in (
            (BACKFILL_PRESCRIPTION_DATES, "prescriptions.created_on"),
            (BACKFILL_VISIT_DATES, "patient_doctor_visit.visit_date"),
        ):
            result = db.execute(text(statement))
            db.commit()
            print(f"  backfilled {label}: {result.rowcount} row(s)")

        for token, phone in DEMO_PHONES.items():
            result = db.execute(
                text(
                    "UPDATE patients SET phone = :phone "
                    "WHERE qr_token = :token AND phone IS NULL"
                ),
                {"phone": phone, "token": token},
            )
            db.commit()
            if result.rowcount:
                print(f"  demo phone set for {token}")

        rows = db.execute(
            text(
                "SELECT p.patient_id, p.name, p.phone, p.relation, p.family_id, "
                "       MAX(v.visit_date) AS last_visit "
                "FROM patients p "
                "LEFT JOIN patient_doctor_visit v ON v.patient_id = p.patient_id "
                "GROUP BY p.patient_id, p.name, p.phone, p.relation, p.family_id "
                "ORDER BY p.patient_id"
            )
        ).all()
        print("\nResult:")
        for patient_id, name, phone, relation, family_id, last_visit in rows:
            print(
                f"  #{patient_id} {name:<14} relation={relation or '-':<8} "
                f"family={family_id or '-':<4} phone={phone or '-':<18} "
                f"last_visit={last_visit or '-'}"
            )
    finally:
        db.close()


if __name__ == "__main__":
    migrate()
