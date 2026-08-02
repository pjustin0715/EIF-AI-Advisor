import re
from typing import Any
from googleapiclient.discovery import build
from config import get_settings
from services.docs import get_google_creds

_sheets_service = None
_advisors_cache = None

def get_sheets_service():
    global _sheets_service
    if _sheets_service:
        return _sheets_service

    creds = get_google_creds()
    if creds:
        _sheets_service = build("sheets", "v4", credentials=creds)
    return _sheets_service

def extract_doc_id(url_or_id: str) -> str:
    if not url_or_id:
        return ""
    # If it's a full URL, extract the ID
    match = re.search(r"/d/([a-zA-Z0-9-_]+)", url_or_id)
    if match:
        return match.group(1)
    # If it doesn't match the URL pattern, assume it's just the ID
    return url_or_id.strip()

def _advisors_from_env() -> dict[str, dict[str, Any]]:
    settings = get_settings()
    advisors: dict[str, dict[str, Any]] = {}
    legacy_names = {
        "advisor1": "Data Dashboard Advisor",
        "advisor2": "SSOT Memo Advisor",
        "advisor3": "Data Modeling Advisor",
    }
    legacy_docs = {
        "advisor1": settings.doc_id_advisor1,
        "advisor2": settings.doc_id_advisor2,
        "advisor3": settings.doc_id_advisor3,
    }
    for slug, doc_id in legacy_docs.items():
        if not doc_id:
            continue
        advisors[slug] = {
            "id": slug,
            "name": legacy_names[slug],
            "is_active": True,
            "doc_id": doc_id,
            "purpose": "",
        }
    return advisors


def get_advisors(force_refresh: bool = False) -> dict[str, dict[str, Any]]:
    global _advisors_cache
    if _advisors_cache is not None and not force_refresh:
        return _advisors_cache

    settings = get_settings()
    spreadsheet_id = settings.spreadsheet_id
    if not spreadsheet_id:
        print("Warning: SPREADSHEET_ID not set. Falling back to DOC_ID_ADVISOR env vars.")
        _advisors_cache = _advisors_from_env()
        return _advisors_cache

    service = get_sheets_service()
    if not service:
        print("Failed to initialize Google Sheets service.")
        _advisors_cache = _advisors_from_env()
        return _advisors_cache

    try:
        # Columns: advisor_name, is_active, prompt, purpose
        result = service.spreadsheets().values().get(
            spreadsheetId=spreadsheet_id,
            range="A:D"
        ).execute()

        rows = result.get('values', [])
        if not rows:
            print("No data found in spreadsheet.")
            _advisors_cache = _advisors_from_env()
            return _advisors_cache

        advisors = {}

        for index, row in enumerate(rows[1:], start=1):
            row += [""] * (4 - len(row))
            name, is_active_str, prompt_link, purpose = row[:4]

            doc_id = extract_doc_id(prompt_link)
            if not doc_id:
                continue

            is_active = is_active_str.strip().lower() == "true"
            slug = f"advisor{index}"

            advisors[slug] = {
                "id": slug,
                "name": name.strip(),
                "is_active": is_active,
                "doc_id": doc_id,
                "purpose": purpose.strip()
            }

        _advisors_cache = advisors if advisors else _advisors_from_env()
        return _advisors_cache

    except Exception as exc:
        print(f"Failed to fetch advisors from Google Sheets: {exc}")
        fallback = _advisors_cache or _advisors_from_env()
        _advisors_cache = fallback
        return fallback


def resolve_advisor_id(advisor_id: str) -> str | None:
    """Map slug, legacy slug, or Google Doc ID to canonical advisor slug."""
    if not advisor_id:
        return None

    advisors = get_advisors()
    if advisor_id in advisors:
        return advisor_id

    for slug, adv in advisors.items():
        if adv.get("doc_id") == advisor_id:
            return slug

    settings = get_settings()
    legacy_doc_ids = {
        "advisor1": settings.doc_id_advisor1,
        "advisor2": settings.doc_id_advisor2,
        "advisor3": settings.doc_id_advisor3,
    }
    legacy_doc = legacy_doc_ids.get(advisor_id, "")
    if legacy_doc:
        for slug, adv in advisors.items():
            if adv.get("doc_id") == legacy_doc:
                return slug

    return None
