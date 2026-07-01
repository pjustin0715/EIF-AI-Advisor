import time
from dataclasses import dataclass

from config import get_settings
from services.docs import fetch_doc_metadata, fetch_doc_text
from services.sheets import get_advisors


@dataclass
class CachedPrompt:
    text: str
    revision_id: str
    fetched_at: float


_advisor_cache: dict[str, CachedPrompt] = {}


def get_advisor_prompt(advisor_id: str) -> str:
    settings = get_settings()
    advisors = get_advisors()
    
    # Fallback to first available advisor if ID is invalid
    safe_id = advisor_id if advisor_id in advisors else (list(advisors.keys())[0] if advisors else "")
    if not safe_id:
        return ""
        
    advisor = advisors[safe_id]
    doc_id = advisor.get("doc_id", "")

    if not doc_id:
        return ""

    cached = _advisor_cache.get(safe_id)
    now = time.time()
    ttl = settings.cache_ttl_seconds

    if cached and (now - cached.fetched_at) < ttl:
        return cached.text

    metadata = fetch_doc_metadata(doc_id)
    revision_id = metadata.get("revision_id", "unknown")

    if cached and cached.revision_id == revision_id:
        cached.fetched_at = now
        return cached.text

    text = fetch_doc_text(doc_id)
    if text:
        _advisor_cache[safe_id] = CachedPrompt(
            text=text, revision_id=revision_id, fetched_at=now
        )
        return text

    if cached:
        return cached.text
    return ""


def invalidate_advisor_cache(advisor_id: str | None = None) -> None:
    if advisor_id:
        _advisor_cache.pop(advisor_id, None)
    else:
        _advisor_cache.clear()
