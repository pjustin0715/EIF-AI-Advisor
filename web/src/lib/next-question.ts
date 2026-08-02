export const NEXT_QUESTION_START = "<<<NEXT_QUESTION>>>";
export const NEXT_QUESTION_END = "<<<END_NEXT_QUESTION>>>";

export type ExtractedNextQuestion = {
  body: string;
  question: string | null;
};

/**
 * Split assistant content into display body and optional next-question.
 * During streaming (open marker, no close yet), everything from the start
 * marker onward is hidden and question stays null.
 */
export function extractNextQuestion(content: string): ExtractedNextQuestion {
  if (!content) {
    return { body: "", question: null };
  }

  const startIdx = content.indexOf(NEXT_QUESTION_START);
  if (startIdx === -1) {
    return { body: content, question: null };
  }

  const body = content.slice(0, startIdx).trimEnd();
  const afterStart = content.slice(startIdx + NEXT_QUESTION_START.length);
  const endIdx = afterStart.indexOf(NEXT_QUESTION_END);

  if (endIdx === -1) {
    return { body, question: null };
  }

  const question = afterStart.slice(0, endIdx).trim();
  return {
    body,
    question: question || null,
  };
}

/** Remove next-question marker blocks from content (for history / persistence). */
export function stripNextQuestion(content: string): string {
  return extractNextQuestion(content).body;
}
