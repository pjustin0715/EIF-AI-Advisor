/** Deployed RAG service on Render (default for local web dev). */
export const DEPLOYED_RAG_URL = "https://eif-rag-service.onrender.com";

export function getRagServiceUrl(): string {
  return process.env.RAG_SERVICE_URL || DEPLOYED_RAG_URL;
}

export function getRagServiceSecret(): string {
  return process.env.RAG_SERVICE_SECRET || "";
}

export function ragServiceHeaders(): Record<string, string> {
  const secret = getRagServiceSecret();
  return secret ? { "X-RAG-Secret": secret } : {};
}
