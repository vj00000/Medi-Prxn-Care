# Medi-Prxn-Care

Smart Clinical Prescription & Patient Safety Ecosystem — backend.

## Stack

- Python 3.12, FastAPI, SQLAlchemy 2.0, Pydantic
- SQLite (zero-config default) or PostgreSQL (via Docker Compose)

## Layout

```
backend/
├── app/
│   ├── database.py      # engine, SessionLocal, Base, get_db()
│   ├── models.py        # 11 SQLAlchemy models + FKs + relationships
│   ├── seed_db.py       # idempotent demo seeder
│   └── main.py          # FastAPI app (health endpoints)
├── requirements.txt
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## Quick start (Docker)

```bash
cd backend
docker compose up -d
docker compose run --rm api python -m app.seed_db
open http://localhost:8000/docs
```

- API: http://localhost:8000
- Postgres published on host port `5433` (host `5432` was already taken).

## Local run (SQLite, no Docker)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m app.seed_db
uvicorn app.main:app --reload
```

## Status

Health/skeleton only. Business routers (patients, prescriptions, lab tests)
are the next milestone.
