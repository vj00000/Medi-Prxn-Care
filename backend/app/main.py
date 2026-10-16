"""FastAPI application entry point."""

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from app.routers import ai as ai_router
from app.routers import catalog as catalog_router
from app.routers import patients as patients_router
from app.routers import prescriptions as prescriptions_router

app = FastAPI(
    title="Smart Clinical Prescription & Patient Safety Ecosystem",
    version="0.1.0",
)

# Vite takes the next free port when 5173/5174 are occupied, so allow any
# localhost port rather than pinning a list that goes stale.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ai_router.router)
app.include_router(catalog_router.router)
app.include_router(patients_router.router)
app.include_router(prescriptions_router.router)


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
