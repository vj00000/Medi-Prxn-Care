"""Add self-reported-prescription columns and backfill (idempotent).

Run inside the container:
    docker compose exec -T api python -m app.migrate_self_rx
"""

from sqlalchemy import text

from app.database import engine


def migrate() -> None:
    with engine.begin() as conn:
        existing = {
            row[0]
            for row in conn.execute(
                text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name = 'prescriptions'"
                )
            )
        }

        if "created_by" not in existing:
            conn.execute(
                text(
                    "ALTER TABLE prescriptions "
                    "ADD COLUMN created_by VARCHAR(20) NOT NULL DEFAULT 'doctor'"
                )
            )
            print("  + prescriptions.created_by")

        if "patient_id" not in existing:
            conn.execute(
                text(
                    "ALTER TABLE prescriptions "
                    "ADD COLUMN patient_id INTEGER "
                    "REFERENCES patients(patient_id) ON DELETE CASCADE"
                )
            )
            print("  + prescriptions.patient_id")

        # Existing doctor prescriptions link to their patient via the visit.
        conn.execute(
            text(
                "UPDATE prescriptions SET patient_id = v.patient_id "
                "FROM patient_doctor_visit v "
                "WHERE v.prescription_id = prescriptions.prescription_id "
                "AND prescriptions.patient_id IS NULL"
            )
        )

    print("Self-prescription migration complete.")


if __name__ == "__main__":
    migrate()
