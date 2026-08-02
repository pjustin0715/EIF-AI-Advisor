const PREFIX = "chat_draft_";
const PENDING_KEY = "chat_draft_pending";

export function getDraft(chatId: string): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(`${PREFIX}${chatId}`) || "";
  } catch {
    return "";
  }
}

export function setDraft(chatId: string, text: string): void {
  if (typeof window === "undefined") return;
  try {
    if (text.trim()) {
      localStorage.setItem(`${PREFIX}${chatId}`, text);
    } else {
      localStorage.removeItem(`${PREFIX}${chatId}`);
    }
  } catch {
    /* storage full or private mode */
  }
}

export function clearDraft(chatId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(`${PREFIX}${chatId}`);
  } catch {
    /* ignore */
  }
}

export function clearDrafts(chatIds: string[]): void {
  chatIds.forEach(clearDraft);
}

export function getPendingDraft(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(PENDING_KEY) || "";
  } catch {
    return "";
  }
}

export function setPendingDraft(text: string): void {
  if (typeof window === "undefined") return;
  try {
    if (text.trim()) {
      localStorage.setItem(PENDING_KEY, text);
    } else {
      localStorage.removeItem(PENDING_KEY);
    }
  } catch {
    /* storage full or private mode */
  }
}

export function clearPendingDraft(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}

export const DEFAULT_CHAT_TITLES = new Set(["new chat", "untitled", ""]);

export function isDefaultChatTitle(title: string | null | undefined): boolean {
  return DEFAULT_CHAT_TITLES.has((title || "").trim().toLowerCase());
}

/** Short sidebar title derived from the first user prompt. */
export function titleFromPrompt(message: string): string {
  const words = message.trim().split(/\s+/).slice(0, 6).join(" ");
  if (!words) return "New Chat";
  return words.length > 40 ? `${words.slice(0, 40)}…` : words;
}
