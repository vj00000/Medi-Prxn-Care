"""Gemini client setup.

Kept deliberately small: the API key is read from the environment so the same
code path works inside Docker and for local runs.
"""

import os

import google.generativeai as genai

DEFAULT_MODEL = "gemini-1.5-flash"


class AINotConfigured(RuntimeError):
    """Raised when GEMINI_API_KEY is absent, so callers can return HTTP 503."""


def get_model():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise AINotConfigured(
            "GEMINI_API_KEY is not set. Add it to backend/.env and restart the API."
        )

    genai.configure(api_key=api_key)
    return genai.GenerativeModel(os.getenv("GEMINI_MODEL", DEFAULT_MODEL))
