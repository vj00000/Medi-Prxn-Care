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

## Deploy to Google Cloud Run

The backend is packaged as a Cloud Run-compatible container. Install the
[Google Cloud CLI](https://cloud.google.com/sdk/docs/install), authenticate,
select a project with billing enabled, and run these commands from the
repository root:

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com

gcloud run deploy smart-rx-api \
	--source backend \
	--region YOUR_REGION \
	--allow-unauthenticated \
	--set-env-vars DATABASE_URL=sqlite:///tmp/smart_rx.db
```

This SQLite deployment is suitable for a demo only: Cloud Run storage is
ephemeral. For persistent data, create a PostgreSQL Cloud SQL instance and set
`DATABASE_URL` to a Cloud SQL Unix-socket URL, for example:

```bash
gcloud sql instances create smart-rx-db --database-version=POSTGRES_17 \
	--cpu=1 --memory=3840MiB --region=YOUR_REGION
gcloud sql databases create smartrx --instance=smart-rx-db
gcloud sql users create smartrx --instance=smart-rx-db --password='REPLACE_ME'

gcloud run deploy smart-rx-api \
	--source backend \
	--region YOUR_REGION \
	--allow-unauthenticated \
	--add-cloudsql-instances YOUR_PROJECT_ID:YOUR_REGION:smart-rx-db \
	--set-env-vars 'DATABASE_URL=postgresql+psycopg2://smartrx:REPLACE_ME@/smartrx?host=/cloudsql/YOUR_PROJECT_ID:YOUR_REGION:smart-rx-db'
```

After deployment, use the URL printed by `gcloud run deploy` and verify
`/health` and `/health/db`. Run `python -m app.seed_db` from a one-off trusted
administrative environment to initialize demo data; do not expose database
credentials in shell history for a production deployment.

## Deploy to Render (free tier)

The repository includes `render.yaml` for a free Render web service. Create a
Render account, connect the GitHub repository, and select **New + -> Blueprint**.
Render will detect the file, build `backend/Dockerfile`, and deploy the API.

The free service sleeps when inactive, and the SQLite database is temporary.
Use a hosted PostgreSQL database and set `DATABASE_URL` in Render for persistent
data. Verify the deployed URL with `/health` and `/health/db`.

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
