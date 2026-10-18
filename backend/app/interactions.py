"""Drug-interaction checks, ported from the clinical-agent-mesh project.

The mesh deliberately runs interactions outside the model: it fetches the
``drug_interactions`` section of each drug's OpenFDA label and only reports a
note when that note names another medication the patient is actually taking. A
label warns about whole drug classes, so without that filter every warfarin
label would warn about every drug on earth.

This module is the same idea minus the agent graph. It is deliberately
non-blocking for the caller: network problems yield ``[]`` rather than an
exception, so a dead FDA API never stops a prescription from being saved.
"""

from __future__ import annotations

import json
import re
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

OPENFDA_LABEL_URL = "https://api.fda.gov/drug/label.json"
TIMEOUT_SECONDS = 3.0
# A label section runs on for paragraphs; a banner wants a signal, not a label.
MAX_WARNING_CHARS = 280

_WHITESPACE = re.compile(r"\s+")

# "T. Ambulox", "Tab Esojet" and friends. Prescriptions are often written with
# a tablet prefix that OpenFDA's index does not carry.
_TABLET_PREFIX = re.compile(
    r"^(?:t\.|tab\.?|tablet|caps?\.?|capsule)\s+", re.IGNORECASE
)

# Brand-name medicines used in the demo data. OpenFDA indexes labels under the
# generic name, so these are resolved before the lookup. Kept here rather than
# in a DB migration so the record stays exactly as the doctor wrote it and the
# mapping lives in one editable place. Add brand entries as they turn up.
BRAND_TO_GENERIC = {
    "ambulox": "amlodipine",
    "esojet": "esomeprazole",
    "petril": "clonazepam",
    "petril plus": "clonazepam",
    "alprax": "alprazolam",
}


def resolve_generic(name: str) -> str:
    """A brand/tablet-prefixed name, resolved to the generic OpenFDA indexes under.

    Unknown names pass through unchanged (lowercased), so the lookup still
    attempts them and simply finds nothing when OpenFDA has no label.
    """
    key = _TABLET_PREFIX.sub("", name.strip()).strip().lower()
    return BRAND_TO_GENERIC.get(key, key)


@dataclass(frozen=True)
class InteractionNote:
    label_id: str
    text: str


@dataclass(frozen=True)
class Interaction:
    drugs: tuple[str, str]
    warning: str


def clean_text(value: str) -> str:
    return _WHITESPACE.sub(" ", value).strip()


def _parse_notes(payload: dict) -> list[InteractionNote]:
    """Pull the interaction notes out of a label response, with provenance.

    A label with no ``drug_interactions`` section yields nothing, rather than a
    note claiming there are no interactions. Those are different claims, and
    only the first is provable from the record.
    """
    notes: list[InteractionNote] = []
    for ordinal, record in enumerate(payload.get("results", [])):
        label_id = record.get("id") or f"label-{ordinal}"
        for section in record.get("drug_interactions", []):
            cleaned = clean_text(section)
            if cleaned:
                notes.append(InteractionNote(label_id=label_id, text=cleaned))
    return notes


def fetch_notes(drug: str, *, timeout: float = TIMEOUT_SECONDS) -> list[InteractionNote]:
    """The interaction sections of one drug's labels, or ``[]`` if unreachable."""
    params = {"search": f'openfda.generic_name:"{drug}"', "limit": "1"}
    url = f"{OPENFDA_LABEL_URL}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(url, headers={"User-Agent": "Medi-Prxn-Care/1.0"})

    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
        return []

    return _parse_notes(payload)


def find_interactions(ongoing: list[str], added: list[str]) -> list[Interaction]:
    """Pair newly added medicines against the patient's ongoing ones.

    Not a model call. Each drug's label is fetched and a note becomes an
    interaction only when it names another drug in this set, and at least one
    side of the pair is newly added — the doctor asked for "new medicine vs
    existing medicine", not a re-report of the patient's existing regimen.

    Both directions of a pair are checked because only one of the two labels may
    mention the other. Duplicates collapse on the pair plus the warning text.
    Fetches run in parallel so wall time is bounded by one timeout, not the
    number of drugs.
    """
    display: dict[str, str] = {}
    for raw in [*ongoing, *added]:
        if not isinstance(raw, str) or not raw.strip():
            continue
        generic = resolve_generic(raw)
        display.setdefault(generic, generic.title())

    added_set = {
        resolve_generic(n) for n in added if isinstance(n, str) and n.strip()
    }
    if len(display) < 2 or not added_set:
        return []

    def notes_for(generic: str) -> tuple[str, list[InteractionNote]]:
        return generic, fetch_notes(generic)

    with ThreadPoolExecutor(max_workers=min(8, len(display))) as executor:
        notes_by_drug = dict(executor.map(notes_for, sorted(display)))

    found: list[Interaction] = []
    seen: set[tuple[frozenset[str], str]] = set()

    for drug in sorted(display):
        others = [name for name in display if name != drug]
        for note in notes_by_drug.get(drug, []):
            lowered = note.text.lower()
            for other in others:
                if other not in lowered:
                    continue
                # Skip pairs made up entirely of the pre-existing regimen.
                if drug not in added_set and other not in added_set:
                    continue
                key = (frozenset({drug, other}), note.text)
                if key in seen:
                    continue
                seen.add(key)
                found.append(
                    Interaction(
                        drugs=(display[drug], display[other]),
                        warning=note.text,
                    )
                )

    return found
