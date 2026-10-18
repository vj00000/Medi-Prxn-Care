"""Add onboarding/auth columns to doctors and patients (idempotent).

Run inside the container:
    docker compose exec -T api python -m app.migrate_auth
"""

from sqlalchemy import text

from app.database import engine


def migrate() -> None:
    with engine.begin() as conn:
        for table, column in (
            ("doctors", "email VARCHAR(255)"),
            ("doctors", "password_hash VARCHAR(255)"),
            ("patients", "email VARCHAR(255)"),
            ("patients", "password_hash VARCHAR(255)"),
        ):
            name = column.split(" ")[0]
            exists = conn.execute(
                text(
                    "SELECT 1 FROM information_schema.columns "
                    "WHERE table_name = :t AND column_name = :c"
                ),
                {"t": table, "c": name},
            ).first()
            if not exists:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column}"))
                print(f"  + {table}.{name}")

        conn.execute(
            text("CREATE UNIQUE INDEX IF NOT EXISTS uq_doctors_email ON doctors (email)")
        )
        conn.execute(
            text("CREATE UNIQUE INDEX IF NOT EXISTS uq_patients_email ON patients (email)")
        )
    print("Auth migration complete.")


if __name__ == "__main__":
    migrate()
