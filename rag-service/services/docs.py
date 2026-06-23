import json
import os
from typing import Any

from google.oauth2 import service_account
from googleapiclient.discovery import build

from config import get_settings
from services.db import get_supabase

DOCS_SCOPES = ["https://www.googleapis.com/auth/documents.readonly"]
_docs_service = None


def get_docs_service():
    global _docs_service
    if _docs_service:
        return _docs_service

    settings = get_settings()
    sa_json = settings.google_service_account_json
    if not sa_json:
        try:
            supabase = get_supabase()
            resp = supabase.table("documents").select("voice_digest").eq("doc_id", "__internal_google_sa_json").limit(1).execute()
            if resp.data and resp.data[0].get("voice_digest"):
                sa_json = resp.data[0]["voice_digest"]
        except Exception as e:
            print(f"Failed to fetch fallback service account from db: {e}")

    if sa_json:
        try:
            creds_info = json.loads(sa_json)
            creds = service_account.Credentials.from_service_account_info(
                creds_info, scopes=DOCS_SCOPES
            )
            _docs_service = build("docs", "v1", credentials=creds)
            return _docs_service
        except Exception as exc:
            print(f"Failed to load service account from env: {exc}")

    if os.path.exists("service_account.json"):
        creds = service_account.Credentials.from_service_account_file(
            "service_account.json", scopes=DOCS_SCOPES
        )
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
