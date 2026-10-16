"""Chat-driven drafting: natural language -> tool calls -> mutated draft.

The model never edits the prescription itself; it can only ask us to run one of
the whitelisted tools in `app.ai.draft`. That keeps the doctor in control.
"""

import google.generativeai as genai

from app.ai.client import get_model
from app.ai.draft import apply_tool
from app.schemas import DraftState

_Schema = genai.protos.Schema
_Type = genai.protos.Type


def _text(description: str) -> genai.protos.Schema:
    return _Schema(type=_Type.STRING, description=description)


def _object(properties: dict, required: list[str]) -> genai.protos.Schema:
    return _Schema(type=_Type.OBJECT, properties=properties, required=required)


SYSTEM_INSTRUCTION = """You are a prescribing assistant for a licensed doctor.

You may ONLY change the prescription by calling the provided tools. Never state a
dosage or medicine that you have not written with a tool call.

Rules:
- Prefer one tool call per medicine the doctor mentions.
- If the doctor says to add something already on the draft, use update_medicine.
- Only fill in what the doctor actually said; do not invent dosages or durations.
- After calling the tools, reply with one short sentence confirming the change.
"""

_ADD_UPDATE_PROPS = {
    "name": _text("Medicine name, e.g. Amoxicillin"),
    "dosage": _text("Dose per intake, e.g. 500 mg"),
    "frequency": _text("How often, e.g. twice daily / TDS"),
    "timing": _text("When to take it, e.g. after meals / at night"),
    "duration_days": _Schema(type=_Type.INTEGER, description="Course length in days"),
}

TOOLS = [
    genai.protos.Tool(
        function_declarations=[
            genai.protos.FunctionDeclaration(
                name="add_medicine",
                description="Add a medicine to the prescription draft.",
                parameters=_object(_ADD_UPDATE_PROPS, ["name"]),
            ),
            genai.protos.FunctionDeclaration(
                name="update_medicine",
                description=(
                    "Change an existing medicine's dosage, frequency, timing or "
                    "duration. Matched by name."
                ),
                parameters=_object(_ADD_UPDATE_PROPS, ["name"]),
            ),
            genai.protos.FunctionDeclaration(
                name="remove_medicine",
                description="Remove a medicine from the prescription draft.",
                parameters=_object({"name": _text("Medicine name to remove")}, ["name"]),
            ),
            genai.protos.FunctionDeclaration(
                name="set_lab_test",
                description="Set the lab test requested for this visit.",
                parameters=_object({"test_name": _text("e.g. HbA1c")}, ["test_name"]),
            ),
            genai.protos.FunctionDeclaration(
                name="set_diagnosis",
                description="Set the working diagnosis.",
                parameters=_object({"diagnosis": _text("Working diagnosis")}, ["diagnosis"]),
            ),
        ]
    )
]


def _render(draft: DraftState) -> str:
    lines: list[str] = []
    if draft.diagnosis:
        lines.append(f"Diagnosis: {draft.diagnosis}")
    if draft.lab_test:
        lines.append(f"Lab test: {draft.lab_test}")
    if draft.medicines:
        lines.append("Medicines:")
        for medicine in draft.medicines:
            detail = " ".join(part for part in (medicine.dosage, medicine.timings) if part)
            lines.append(f"  - {medicine.name} {detail}".rstrip())
    else:
        lines.append("Medicines: (none yet)")
    if draft.transcript:
        lines.append(f"Consultation notes: {draft.transcript}")
    return "\n".join(lines)


async def chat_with_draft(
    draft: DraftState, message: str, history: list
) -> tuple[DraftState, str, list[str]]:
    model = get_model()

    contents: list[dict] = []
    for turn in history:
        contents.append(
            {
                "role": "user" if turn.role == "user" else "model",
                "parts": [{"text": turn.text}],
            }
        )
    contents.append(
        {
            "role": "user",
            "parts": [
                {
                    "text": (
                        f"{SYSTEM_INSTRUCTION}\n\n"
                        f"Current prescription draft:\n{_render(draft)}\n\n"
                        f"Doctor says: {message}"
                    )
                }
            ],
        }
    )

    response = await model.generate_content_async(
        contents,
        tools=TOOLS,
        generation_config={"temperature": 0.1},
    )

    actions: list[str] = []
    reply_parts: list[str] = []

    for candidate in getattr(response, "candidates", []) or []:
        content = getattr(candidate, "content", None)
        for part in getattr(content, "parts", []) or []:
            call = getattr(part, "function_call", None)
            if call and getattr(call, "name", None):
                args = dict(call.args) if call.args else {}
                actions.append(apply_tool(draft, call.name, args))
            text = getattr(part, "text", None)
            if text:
                reply_parts.append(text.strip())

    reply = " ".join(reply_parts).strip()
    if not reply:
        reply = " · ".join(actions) if actions else "I didn't find a change to make."

    return draft, reply, actions
