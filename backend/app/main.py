"""FastAPI application entry point."""

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from app.routers import ai as ai_router
from app.routers import prescriptions as prescriptions_router

app = FastAPI(
    title="Smart Clinical Prescription & Patient Safety Ecosystem",
    version="0.1.0",
)

# The Vite dev servers run on 5173/5174; allow them to call this API directly.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ai_router.router)
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
