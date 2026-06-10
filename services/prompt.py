import os
from services.docs import fetch_doc_text

ADVISORS = {
    "advisor1": {"name": "Data Dashboard Advisor", "doc_id": os.getenv("DOC_ID_ADVISOR1", "")},
    "advisor2": {"name": "SSOT Memo Advisor", "doc_id": os.getenv("DOC_ID_ADVISOR2", "")},
    "advisor3": {"name": "Data Modeling Advisor", "doc_id": os.getenv("DOC_ID_ADVISOR3", "")}
}

def get_advisor_prompt(advisor_id: str) -> str:
    company_dna_id = os.getenv("DOC_ID_COMPANY_DNA")
    dna_text = fetch_doc_text(company_dna_id) if company_dna_id else ""
    
    safe_advisor_id = advisor_id or "advisor1"
    doc_id = ADVISORS.get(safe_advisor_id, {}).get("doc_id")
    if not doc_id:
        env_key = f"DOC_ID_{safe_advisor_id.upper()}"
        doc_id = os.getenv(env_key)
        
    advisor_text = fetch_doc_text(doc_id) if doc_id else ""
    
    if not dna_text and not advisor_text:
        return ""
        
    combined = f"{dna_text}\n\n{advisor_text}".strip()
    return combined
