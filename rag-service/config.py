import os
from functools import lru_cache

from dotenv import load_dotenv
from pydantic_settings import BaseSettings

load_dotenv(override=True)


class Settings(BaseSettings):
    gemini_api_key: str = ""
    supabase_url: str = ""
    supabase_key: str = ""
    google_service_account_json: str = ""

    doc_id_company_dna: str = "13cMCqZc_c-TrTo0k9t1BxrdjYwxNk_n9FP-Eax-Wj9k"
    doc_id_advisor1: str = "1xcnZwd30_WxBWf5nfBLORhKMvRm1MmP1jPUqviTKM_o"
    doc_id_advisor2: str = "1uCi5IrVG6ETHD_LSKRdMism9QDT-XRHGlaYjvokTwXM"
    doc_id_advisor3: str = "1wtF_xLiTHo7xUPx7tKAqV1i8NQ8b2VXRV_-aqdxaWBI"

    embedding_model: str = "gemini-embedding-001"
    embedding_dimensions: int = 768
    generation_model: str = "gemini-2.5-flash-lite"

    cache_ttl_seconds: int = 300
    retrieval_top_k: int = 5
    min_similarity: float = 0.35
    chunk_target_tokens: int = 400
    chunk_overlap_tokens: int = 50

    rag_service_secret: str = ""

    model_config = {"env_file": ".env", "extra": "ignore"}


@lru_cache
def get_settings() -> Settings:
    return Settings()


ADVISORS = {
    "advisor1": {
        "name": "Data Dashboard Advisor",
        "doc_id_env": "doc_id_advisor1",
    },
    "advisor2": {
        "name": "SSOT Memo Advisor",
        "doc_id_env": "doc_id_advisor2",
    },
    "advisor3": {
        "name": "Data Modeling Advisor",
        "doc_id_env": "doc_id_advisor3",
    },
}
