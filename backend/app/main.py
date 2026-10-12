"""FastAPI application entry point (skeleton).

Only health/database smoke endpoints are defined for now; the business routers
(patients, prescriptions, lab tests, etc.) are the next milestone.
"""

from fastapi import Depends, FastAPI
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db

app = FastAPI(
    title="Smart Clinical Prescription & Patient Safety Ecosystem",
    version="0.1.0",
)


@app.get("/", tags=["health"])
def root():
    return {"status": "ok", "service": "smart-rx-backend"}


@app.get("/health", tags=["health"])
def health():
    return {"status": "healthy"}


@app.get("/health/db", tags=["health"])
def health_db(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "healthy", "database": "reachable"}
