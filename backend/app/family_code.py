"""Five-character family codes, and the patient QR tokens built from them.

A code is the family's public identifier: it appears in every member's QR
token, on the dashboard, and gets read aloud at a reception desk. The integer
``families.family_id`` stays the database key — changing its type would ripple
through every foreign key for no benefit — so this code is the human-facing
value layered on top.

The alphabet drops 0/O and 1/I/L because these strings are transcribed by hand.
"""

import secrets

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Family

ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
CODE_LENGTH = 5

# 31^5 is ~28 million combinations; each code is unique per family.
_RETRIES = 50


def generate_code() -> str:
    return "".join(secrets.choice(ALPHABET) for _ in range(CODE_LENGTH))


def unique_code(db: Session) -> str:
    """A code no other family is using.

    Collisions are checked against the database rather than assumed away, so a
    retry loop is the honest way to keep the unique index satisfied.
    """
    for _ in range(_RETRIES):
        code = generate_code()
        if db.scalar(select(Family).where(Family.code == code)) is None:
            return code
    raise RuntimeError("Could not generate a unique family code")


def qr_token_for(code: str, patient_id: int) -> str:
    """``QR-<family code>-<patient number>``, e.g. ``QR-K7M2P-0004``.

    The trailing number is the patient's own id, zero-padded. It is not a
    per-family counter, so it never shifts when a member is removed and old
    printed QR codes keep resolving.
    """
    return f"QR-{code}-{patient_id:04d}"
