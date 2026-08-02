import OpenAI from "openai";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openrouter/auto";

function usesOpenRouter(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

// Prefer OpenRouter when configured; otherwise use Gemini.
const MODEL = usesOpenRouter() ? OPENROUTER_MODEL : GEMINI_MODEL;

// To estimate tokens safely for usage limits (fallback)
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// OpenRouter costs vary wildly per model. If using auto, cost is dynamic.
// For now, we return 0 here and can refine tracking via OpenRouter's API limits or usage endpoint later.
export function estimateCost(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  return 0.0;
}

/** Resolve a DB/admin model name to one the active provider accepts. */
export function resolveModel(modelName?: string | null): string {
  const requested = modelName?.trim() || MODEL;
  if (usesOpenRouter()) return requested;
  // Stored OpenRouter ids (e.g. openrouter/auto) are invalid for Gemini.
  if (requested.startsWith("openrouter/") || requested.includes("/")) {
    return GEMINI_MODEL;
  }
  return requested;
}

export function getOpenRouterClient() {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (openRouterKey) {
    return new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: openRouterKey,
    });
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    throw new Error(
      "Neither OPENROUTER_API_KEY nor GEMINI_API_KEY is configured"
    );
  }

  // Gemini OpenAI-compatible endpoint — keeps chat/completions streaming as-is.
  return new OpenAI({
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    apiKey: geminiKey,
  });
}

export { MODEL };
