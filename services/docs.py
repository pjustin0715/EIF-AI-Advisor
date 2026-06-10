import os
import json
from google.oauth2 import service_account
from googleapiclient.discovery import build

DOCS_SCOPES = ['https://www.googleapis.com/auth/documents.readonly']
docs_service = None

def get_docs_service():
    global docs_service
    if docs_service:
        return docs_service
        
    sa_json = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON")
    if sa_json:
        try:
            creds_info = json.loads(sa_json)
            creds = service_account.Credentials.from_service_account_info(
                creds_info, scopes=DOCS_SCOPES)
            docs_service = build('docs', 'v1', credentials=creds)
            return docs_service
        except Exception as e:
            from config import logger
            logger.error(f"Failed to load service account from env: {e}")
            
    if os.path.exists("service_account.json"):
        creds = service_account.Credentials.from_service_account_file(
            "service_account.json", scopes=DOCS_SCOPES)
        docs_service = build('docs', 'v1', credentials=creds)
    return docs_service

def fetch_doc_text(doc_id: str) -> str:
    service = get_docs_service()
    if not service or not doc_id:
        return ""
    try:
        document = service.documents().get(documentId=doc_id).execute()
        text = ""
        for element in document.get('body').get('content'):
            if 'paragraph' in element:
                for p_element in element.get('paragraph').get('elements'):
                    if 'textRun' in p_element:
                        text += p_element.get('textRun').get('content')
        return text.strip()
    except Exception as e:
        from config import logger
        logger.error(f"Failed to fetch doc {doc_id}: {e}")
        return ""
