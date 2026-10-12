"""Database engine, session factory, and declarative base.

Configuration is read from the ``DATABASE_URL`` environment variable. It
defaults to a local SQLite file so the project runs with zero setup; point it
at PostgreSQL (``postgresql+psycopg2://user:pass@host:5432/db``) to switch.
"""

import os

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./smart_rx.db")

# SQLite needs this flag because FastAPI serves requests from a thread pool.
_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    DATABASE_URL,
    echo=False,
    future=True,
    pool_pre_ping=True,
    connect_args=_connect_args,
)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Declarative base shared by every ORM model."""


def get_db():
    """FastAPI dependency: yield a session and always close it afterwards."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
