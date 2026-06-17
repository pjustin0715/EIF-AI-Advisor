import { GoogleGenerativeAI } from "@google/generative-ai";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

const RATES: Record<string, { inputPer1k: number; outputPer1k: number }> = {
  "gemini-2.5-flash-lite": { inputPer1k: 0.000075, outputPer1k: 0.0003 },
};

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateCost(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const rate = RATES[model] || RATES["gemini-2.5-flash-lite"];
  return (
    (promptTokens / 1000) * rate.inputPer1k +
    (completionTokens / 1000) * rate.outputPer1k
  );
}

export function getGeminiModel(systemInstruction: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");

  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({
    model: MODEL,
    systemInstruction,
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 2048,
    },
  });
}

export { MODEL };
