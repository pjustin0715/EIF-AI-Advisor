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

def get_advisors(force_refresh: bool = False) -> dict[str, dict[str, Any]]:
    global _advisors_cache
    if _advisors_cache is not None and not force_refresh:
        return _advisors_cache

    settings = get_settings()
    spreadsheet_id = settings.spreadsheet_id
    if not spreadsheet_id:
        print("Warning: SPREADSHEET_ID not set. Using empty advisors list.")
        return {}

    service = get_sheets_service()
    if not service:
        print("Failed to initialize Google Sheets service.")
        return {}

    try:
        # Assuming the sheet is the first one, or named "Sheet1". Using generic range "A:D"
        # Columns: advisor_name, is_active, prompt, purpose
        result = service.spreadsheets().values().get(
            spreadsheetId=spreadsheet_id,
            range="A:D"
        ).execute()

        rows = result.get('values', [])
        if not rows:
            print("No data found in spreadsheet.")
            return {}

        # Skip header row
        headers = rows[0]
        advisors = {}

        for row in rows[1:]:
            # Pad row if it has empty trailing columns
            row += [""] * (4 - len(row))
            name, is_active_str, prompt_link, purpose = row[:4]

            doc_id = extract_doc_id(prompt_link)
            if not doc_id:
                continue

            is_active = is_active_str.strip().lower() == "true"

            # Use doc_id as the unique key!
            advisors[doc_id] = {
                "id": doc_id,
                "name": name.strip(),
                "is_active": is_active,
                "doc_id": doc_id,
                "purpose": purpose.strip()
            }

        _advisors_cache = advisors
        return advisors

    except Exception as exc:
        print(f"Failed to fetch advisors from Google Sheets: {exc}")
        return _advisors_cache or {}
