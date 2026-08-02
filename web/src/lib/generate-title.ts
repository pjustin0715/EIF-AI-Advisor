import { titleFromPrompt } from "./drafts";
import { getOpenRouterClient, MODEL, resolveModel } from "./llm";

const ADVISOR_LABELS: Record<string, string> = {
  advisor1: "Data Dashboard Advisor",
  advisor2: "SSOT Memo Advisor",
  advisor3: "Data Modeling Advisor",
};

/** Cheap, short-output model when on OpenRouter; otherwise the active default. */
function titleModel(): string {
  if (process.env.OPENROUTER_API_KEY) {
    return (
      process.env.OPENROUTER_TITLE_MODEL ||
      "google/gemini-2.5-flash-lite"
    );
  }
  return resolveModel(MODEL);
}

export async function generateChatTitle(
  userMessage: string,
  assistantReply: string,
  advisorId?: string
): Promise<string> {
  const advisorLabel = ADVISOR_LABELS[advisorId || ""] || "AI Advisor";
  const fallback = titleFromPrompt(userMessage);

  try {
    const openai = getOpenRouterClient();
    const response = await openai.chat.completions.create({
      model: titleModel(),
      temperature: 0.2,
      max_tokens: 24,
      messages: [
        {
          role: "system",
          content:
            `Write a short chat title (3-6 words) summarizing this EIF mentoring exchange. ` +
            `Use both the user's question and the advisor's reply. ` +
            `No quotes, no ending punctuation. Advisor context: ${advisorLabel}.`,
        },
        {
          role: "user",
          content:
            `User question:\n${userMessage.slice(0, 400)}\n\n` +
            `Advisor reply:\n${assistantReply.slice(0, 600)}`,
        },
      ],
    });

    const raw = response.choices[0]?.message?.content?.trim() || "";
    const cleaned = raw
      .replace(/^["'`]+|["'`]+$/g, "")
      .replace(/\s+/g, " ")
      .slice(0, 60);
    return cleaned || fallback;
  } catch (err) {
    console.error("generateChatTitle failed:", err);
    return fallback;
  }
}
