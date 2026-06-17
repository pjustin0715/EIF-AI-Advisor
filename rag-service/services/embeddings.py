from google import genai
from google.genai import types

from config import get_settings


class EmbeddingService:
    def __init__(self):
        settings = get_settings()
        self.client = genai.Client(api_key=settings.gemini_api_key)
        self.model = settings.embedding_model
        self.dimensions = settings.embedding_dimensions

    def embed(self, text: str, task_type: str = "RETRIEVAL_DOCUMENT") -> list[float]:
        if not text.strip():
            return [0.0] * self.dimensions

        config = types.EmbedContentConfig(
            task_type=task_type,
            output_dimensionality=self.dimensions,
        )
        response = self.client.models.embed_content(
            model=self.model,
            contents=text,
            config=config,
        )
        values = response.embeddings[0].values
        return list(values)

    def embed_query(self, query: str) -> list[float]:
        return self.embed(query, task_type="RETRIEVAL_QUERY")

    def embed_batch(self, texts: list[str], task_type: str = "RETRIEVAL_DOCUMENT") -> list[list[float]]:
        return [self.embed(text, task_type=task_type) for text in texts]
