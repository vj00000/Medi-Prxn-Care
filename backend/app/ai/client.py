"""Gemini client setup.

Kept deliberately small: the API key is read from the environment so the same
code path works inside Docker and for local runs.
"""

import os

import google.generativeai as genai

# Model names rotate; override with GEMINI_MODEL if your key serves another.
# List what your key can use:
#   docker compose exec api python -c \
#     "import google.generativeai as g; g.configure(api_key=__import__('os').getenv('GEMINI_API_KEY')); print([m.name for m in g.list_models()])"
DEFAULT_MODEL = "gemini-3.8-flash"


class AIError(RuntimeError):
    """Base class for AI-pipeline failures."""


class AINotConfigured(AIError):
    """GEMINI_API_KEY is absent -> the API answers 503."""


class AIBadResponse(AIError):
    """The model replied with something we could not parse -> 502."""


def get_model():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise AINotConfigured(
            "GEMINI_API_KEY is not set. Add it to backend/.env and restart the API."
        )

    genai.configure(api_key=api_key)
    return genai.GenerativeModel(os.getenv("GEMINI_MODEL") or DEFAULT_MODEL)
