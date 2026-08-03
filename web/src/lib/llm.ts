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

const RATE_LIMIT_RETRIES = 3;
const RATE_LIMIT_BASE_MS = 2000;

export function isRateLimitError(err: unknown): boolean {
  if (err && typeof err === "object") {
    const e = err as { status?: number; message?: string };
    if (e.status === 429) return true;
    if (typeof e.message === "string" && /429|rate.?limit/i.test(e.message)) {
      return true;
    }
  }
  if (err instanceof Error && /429|rate.?limit/i.test(err.message)) {
    return true;
  }
  return false;
}

export function formatLlmError(err: unknown): string {
  if (isRateLimitError(err)) {
    return "Rate limit reached — wait a moment and try again.";
  }
  if (err instanceof Error) return err.message;
  return "Generation failed";
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      const err = new Error("Aborted");
      err.name = "AbortError";
      reject(err);
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        const err = new Error("Aborted");
        err.name = "AbortError";
        reject(err);
      },
      { once: true }
    );
  });
}

/** Retry LLM calls with exponential backoff when the provider returns 429. */
export async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  opts?: { signal?: AbortSignal; maxRetries?: number }
): Promise<T> {
  const maxRetries = opts?.maxRetries ?? RATE_LIMIT_RETRIES;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (opts?.signal?.aborted) {
      const err = new Error("Aborted");
      err.name = "AbortError";
      throw err;
    }

    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRateLimitError(err) || attempt === maxRetries) {
        throw err;
      }
      await sleep(RATE_LIMIT_BASE_MS * 2 ** attempt, opts?.signal);
    }
  }

  throw lastErr;
}

export { MODEL };
