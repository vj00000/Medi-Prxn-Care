"""Draft-mutation tools the prescribing assistant can call.

Deliberately free of any Gemini import so the logic can be exercised directly
(see the tools test) without an API key.

Every argument here arrives from a language model, so it is treated as
untrusted: bad types are coerced or dropped rather than allowed to raise.
"""

from app.schemas import DraftState, MedicineLine


def _clean_days(value) -> int | None:
    """Coerce the model's duration into an int; drop anything non-numeric."""
    if value is None or value == "":
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _join_timings(
    frequency: str | None, timing: str | None, duration_days
) -> str | None:
    parts = [part for part in (frequency, timing) if part]
    if duration_days:
        days = _clean_days(duration_days)
        if days is None:
            # Keep the doctor's wording ("as needed") even though it isn't a count.
            parts.append(str(duration_days))
        else:
            parts.append("1 day" if days == 1 else f"{days} days")
    return " · ".join(parts) or None


def _find(draft: DraftState, name: str | None) -> MedicineLine | None:
    needle = (name or "").strip().lower()
    if not needle:
        return None
    return next(
        (m for m in draft.medicines if (m.name or "").strip().lower() == needle),
        None,
    )


def add_medicine(
    draft: DraftState,
    name: str | None = None,
    dosage: str | None = None,
    frequency: str | None = None,
    timing: str | None = None,
    duration_days=None,
    **_ignored,
) -> str:
    if not name:
        return "No medicine name was given."

    # Adding something already present is treated as an update, so the doctor
    # saying "add Metformin 1000mg" twice doesn't duplicate the line.
    if _find(draft, name) is not None:
        return update_medicine(
            draft,
            name=name,
            dosage=dosage,
            frequency=frequency,
            timing=timing,
            duration_days=duration_days,
        )

    draft.medicines.append(
        MedicineLine(
            name=name.strip(),
            dosage=dosage,
            timings=_join_timings(frequency, timing, duration_days),
            timing_slot=timing,
            duration_days=_clean_days(duration_days),
        )
    )
    return f"Added {name.strip()}"


def update_medicine(
    draft: DraftState,
    name: str | None = None,
    dosage: str | None = None,
    frequency: str | None = None,
    timing: str | None = None,
    duration_days=None,
    **_ignored,
) -> str:
    target = _find(draft, name)
    if target is None:
        return add_medicine(
            draft,
            name=name,
            dosage=dosage,
            frequency=frequency,
            timing=timing,
            duration_days=duration_days,
        )

    if dosage:
        target.dosage = dosage
    if frequency or timing or duration_days:
        target.timings = _join_timings(frequency, timing, duration_days)
    if timing:
        target.timing_slot = timing
    if duration_days:
        target.duration_days = _clean_days(duration_days)
    return f"Updated {target.name}"


def remove_medicine(draft: DraftState, name: str | None = None, **_ignored) -> str:
    target = _find(draft, name)
    if target is None:
        return f"{name} was not on the prescription."
    draft.medicines.remove(target)
    return f"Removed {target.name}"


def set_lab_test(draft: DraftState, test_name: str | None = None, **_ignored) -> str:
    draft.lab_test = test_name
    return f"Set lab test to {test_name}" if test_name else "Cleared the lab test."


def set_diagnosis(draft: DraftState, diagnosis: str | None = None, **_ignored) -> str:
    draft.diagnosis = diagnosis
    return f"Set diagnosis to {diagnosis}" if diagnosis else "Cleared the diagnosis."


def set_transcript(draft: DraftState, transcript: str | None = None, **_ignored) -> str:
    draft.transcript = transcript
    return "Updated the consultation notes."


_TOOLS = {
    "add_medicine": add_medicine,
    "update_medicine": update_medicine,
    "remove_medicine": remove_medicine,
    "set_lab_test": set_lab_test,
    "set_diagnosis": set_diagnosis,
    "set_transcript": set_transcript,
}


def apply_tool(draft: DraftState, name: str, args: dict | None) -> str:
    """Run one tool call against the draft; returns a human-readable action."""
    handler = _TOOLS.get(name)
    if handler is None:
        return f"Unknown tool '{name}'."

    clean = {key: value for key, value in (args or {}).items() if value is not None}
    try:
        return handler(draft, **clean)
    except Exception as exc:  # noqa: BLE001 — model-supplied args are untrusted
        return f"Could not run {name}: {exc}"
