import json
import os
from typing import Any

from google.oauth2 import service_account
from googleapiclient.discovery import build

from config import get_settings

SCOPES = [
    "https://www.googleapis.com/auth/documents.readonly",
    "https://www.googleapis.com/auth/spreadsheets.readonly"
]
_docs_service = None
_creds = None


def get_google_creds():
    global _creds
    if _creds:
        return _creds

    settings = get_settings()
    sa_json = settings.google_service_account_json
    if sa_json:
        try:
            creds_info = json.loads(sa_json)
            _creds = service_account.Credentials.from_service_account_info(
                creds_info, scopes=SCOPES
            )
            return _creds
        except Exception as exc:
            print(f"Failed to load service account from env: {exc}")

    if os.path.exists("service_account.json"):
        _creds = service_account.Credentials.from_service_account_file(
            "service_account.json", scopes=SCOPES
        )
    return _creds


def get_docs_service():
    global _docs_service
    if _docs_service:
        return _docs_service

    creds = get_google_creds()
    if creds:
        _docs_service = build("docs", "v1", credentials=creds)
    return _docs_service


def fetch_doc_metadata(doc_id: str) -> dict[str, Any]:
    service = get_docs_service()
    if not service or not doc_id:
        return {}
    try:
        document = service.documents().get(documentId=doc_id).execute()
        return {
            "revision_id": document.get("revisionId", ""),
            "title": document.get("title", ""),
        }
    except Exception as exc:
        print(f"Failed to fetch doc metadata {doc_id}: {exc}")
        return {}


def fetch_doc_text(doc_id: str) -> str:
    service = get_docs_service()
    if not service or not doc_id:
        return ""
    try:
        document = service.documents().get(documentId=doc_id).execute()
        text = ""
        for element in document.get("body", {}).get("content", []):
            if "paragraph" in element:
                for p_element in element["paragraph"].get("elements", []):
                    if "textRun" in p_element:
                        text += p_element["textRun"].get("content", "")
        return text.strip()
    except Exception as exc:
        print(f"Failed to fetch doc {doc_id}: {exc}")
        return ""
