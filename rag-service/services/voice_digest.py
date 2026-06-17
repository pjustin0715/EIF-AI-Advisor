from google import genai
from google.genai import types

from config import get_settings


VOICE_DIGEST_PROMPT = """Summarize the following Eskwelabs DNA document into a compact digest (max ~500 words).
Focus ONLY on:
- Core identity, mission, values
- Communication voice and tone
- Institutional email posture
- Lexicon and terminology guardrails
- Formatting rules

Do NOT include operational details, course content, or advisor-specific instructions.
Output plain text only."""


def generate_voice_digest(dna_text: str) -> str:
    if not dna_text.strip():
        return ""

    settings = get_settings()
    client = genai.Client(api_key=settings.gemini_api_key)

    response = client.models.generate_content(
        model=settings.generation_model,
        contents=f"{VOICE_DIGEST_PROMPT}\n\n---\n\n{dna_text[:50000]}",
        config=types.GenerateContentConfig(temperature=0.2, max_output_tokens=1024),
    )
    return (response.text or "").strip()
