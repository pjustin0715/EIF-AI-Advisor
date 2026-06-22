import { GoogleGenerativeAI } from "@google/generative-ai";
import { MODEL } from "./gemini";

const ADVISOR_LABELS: Record<string, string> = {
  advisor1: "Data Dashboard Advisor",
  advisor2: "SSOT Memo Advisor",
  advisor3: "Data Modeling Advisor",
};

export async function generateChatTitle(
  firstMessage: string,
  advisorId?: string
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fallbackTitle(firstMessage);

  const advisorLabel = ADVISOR_LABELS[advisorId || ""] || "AI Advisor";
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: MODEL,
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 24,
    },
  });

  try {
    const result = await model.generateContent(
      `Write a short chat title (3-6 words) summarizing this EIF mentoring question. ` +
        `No quotes, no punctuation at the end. Advisor context: ${advisorLabel}.\n\n` +
        `Question: ${firstMessage.slice(0, 400)}`
    );
    const raw = result.response.text().trim();
    const cleaned = raw
      .replace(/^["'`]+|["'`]+$/g, "")
      .replace(/\s+/g, " ")
      .slice(0, 60);
    return cleaned || fallbackTitle(firstMessage);
  } catch {
    return fallbackTitle(firstMessage);
  }
}

function fallbackTitle(message: string): string {
  const words = message.trim().split(/\s+/).slice(0, 6).join(" ");
  return words.length > 40 ? `${words.slice(0, 40)}…` : words || "New Chat";
}
