from google import genai
from google.genai import types

class Gemini:
    def __init__(self, api_key: str, system_prompt: str | None = None):
        self.system_prompt = system_prompt
        self.client = genai.Client(api_key=api_key)
        self.model_name = "gemini-2.5-flash-lite"

    def chat(self, messages: list[dict], system_prompt: str | None = None) -> str:
        config = None
        effective_prompt = system_prompt or self.system_prompt
        if effective_prompt:
            config = types.GenerateContentConfig(
                system_instruction=effective_prompt
            )
        
        formatted_messages = []
        for msg in messages:
            role = "user" if msg["role"] == "user" else "model"
            formatted_messages.append(
                types.Content(role=role, parts=[types.Part.from_text(text=msg["content"])])
            )

        try:
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=formatted_messages,
                config=config
            )
            return response.text
        except Exception as e:
            return f"Error: {e}"