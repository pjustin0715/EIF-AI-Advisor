import OpenAI from "openai";

// By default, use OpenRouter's auto-router to select the best/cheapest model for the prompt size.
const MODEL = process.env.OPENROUTER_MODEL || "openrouter/auto";

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

export function getOpenRouterClient() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");

  return new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: apiKey,
  });
}

export { MODEL };
