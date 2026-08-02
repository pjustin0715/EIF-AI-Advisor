"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { PanelLeft } from "lucide-react";
import { marked } from "marked";
import {
  authHeaders,
  clearAccessToken,
  getAccessToken,
  getProfilePicture,
  isAdminUser,
} from "@/lib/auth-client";
import {
  clearDraft,
  clearDrafts,
  clearPendingDraft,
  getDraft,
  getPendingDraft,
  setDraft,
  setPendingDraft,
} from "@/lib/drafts";
import { ADVISOR_NAMES, ADVISOR_GREETINGS, getSuggestions } from "@/lib/suggestions";
import {
  buildContextUsage,
  estimateConversationTokensClient,
  usableContextTokens,
  type ContextUsage,
} from "@/lib/context-window-shared";
import { extractNextQuestion } from "@/lib/next-question";
import {
  normalizeCitations,
  type RetrievalPayload,
  type RetrievalStatusStep,
} from "@/lib/retrieval";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import CopyMessageButton from "./CopyMessageButton";
import EmptyChatState from "./EmptyChatState";
import ContextMeter from "./ContextMeter";
import LoginOverlay, { LogoutButton } from "./LoginOverlay";
import NewChatModal from "./NewChatModal";
import RetrievalPanel from "./RetrievalPanel";
import ChatMessagesSkeleton from "./ChatMessagesSkeleton";
import ChatSkeleton from "./ChatSkeleton";
import Sidebar from "./Sidebar";
import SuggestionChips from "./SuggestionChips";
import SpeechMicButton from "./SpeechMicButton";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
interface Message {
  role: "user" | "model" | "assistant";
  content: string;
  citations?: RetrievalPayload | string[] | null;
  suggestion?: string | null;
}
interface Chat {
  id: string;
  title: string;
  advisor_id: string;
}
interface QueuedPrompt {
  id: string;
  text: string;
}
type PendingDelete =
  | { type: "single"; ids: string[] }
  | { type: "bulk"; ids: string[] }
  | null;

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = "name" in err ? String((err as { name: unknown }).name) : "";
  if (name === "AbortError" || name === "APIUserAbortError") return true;
  if (err instanceof Error && /aborted|abort/i.test(err.message)) return true;
  return false;
}

export default function ChatInterface() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [activeAdvisorId, setActiveAdvisorId] = useState("advisor1");
  const [emptyAdvisorId, setEmptyAdvisorId] = useState("advisor1");
  const [advisorMap, setAdvisorMap] = useState<Record<string, { name: string, purpose?: string }>>({});
  const [streamingText, setStreamingText] = useState("");
  const [streamingRetrieval, setStreamingRetrieval] =
    useState<RetrievalPayload | null>(null);
  const [retrievalStatus, setRetrievalStatus] =
    useState<RetrievalStatusStep | null>(null);
  const [retrievalRankingCount, setRetrievalRankingCount] = useState<
    number | null
  >(null);
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);
  const [queues, setQueues] = useState<Record<string, QueuedPrompt[]>>({});
  const [editingQueueId, setEditingQueueId] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ id: string; title: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [contextUsage, setContextUsage] = useState<ContextUsage | null>(null);
  const [contextSummary, setContextSummary] = useState<string | null>(null);
  const [compacting, setCompacting] = useState(false);
  const chatboxRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const activeChatIdRef = useRef<string | null>(null);
  const prevChatIdRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const skipLoadRef = useRef(false);
  const loadingRef = useRef(false);
  const queuesRef = useRef<Record<string, QueuedPrompt[]>>({});
  const streamingChatIdRef = useRef<string | null>(null);
  const showEmptyState = isAuthenticated && !chatsLoading && chats.length === 0;

  function setLoadingFlag(value: boolean) {
    loadingRef.current = value;
    setLoading(value);
  }

  function setQueuesSync(next: Record<string, QueuedPrompt[]>) {
    queuesRef.current = next;
    setQueues(next);
  }

  function enqueuePrompt(chatId: string, text: string) {
    const item: QueuedPrompt = {
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      text,
    };
    setQueuesSync({
      ...queuesRef.current,
      [chatId]: [...(queuesRef.current[chatId] || []), item],
    });
  }

  function clearChatQueue(chatId: string) {
    setQueuesSync({ ...queuesRef.current, [chatId]: [] });
    setEditingQueueId(null);
  }

  function dequeuePrompt(chatId: string): string | null {
    const list = queuesRef.current[chatId] || [];
    if (list.length === 0) return null;
    const [head, ...rest] = list;
    setQueuesSync({ ...queuesRef.current, [chatId]: rest });
    return head.text;
  }

  function removeQueueItem(chatId: string, id: string) {
    setQueuesSync({
      ...queuesRef.current,
      [chatId]: (queuesRef.current[chatId] || []).filter(
        (item) => item.id !== id
      ),
    });
    setEditingQueueId((current) => (current === id ? null : current));
  }

  function updateQueueItem(chatId: string, id: string, text: string) {
    const trimmed = text.trim();
    if (!trimmed) {
      removeQueueItem(chatId, id);
      return;
    }
    setQueuesSync({
      ...queuesRef.current,
      [chatId]: (queuesRef.current[chatId] || []).map((item) =>
        item.id === id ? { ...item, text: trimmed } : item
      ),
    });
  }

  function discardPartialStream() {
    setStreamingText("");
    setStreamingRetrieval(null);
    setRetrievalStatus(null);
    setRetrievalRankingCount(null);
    setPendingQuery(null);
  }
  const scrollToBottom = useCallback(() => {
    if (chatboxRef.current) {
      chatboxRef.current.scrollTop = chatboxRef.current.scrollHeight;
    }
  }, []);
  const loadMessages = useCallback(async (chatId: string) => {
    setMessagesLoading(true);
    const res = await fetch(`/api/chats/${chatId}`, { headers: authHeaders() });
    if (!res.ok) {
      setMessagesLoading(false);
      return;
    }
    const data = await res.json();
    setMessages(data.messages || []);
    setContextSummary(data.chat?.context_summary ?? null);
    if (data.context_usage) {
      setContextUsage(data.context_usage);
    } else {
      setContextUsage(null);
    }
    const advId = data.chat?.advisor_id;
    if (advId) {
      setActiveAdvisorId(advId);
    }
    setMessagesLoading(false);
  }, []);
  const loadChats = useCallback(async () => {
    setChatsLoading(true);
    const res = await fetch("/api/chats", { headers: authHeaders(), cache: "no-store" });
    if (res.status === 401) {
      clearAccessToken();
      setIsAuthenticated(false);
      setChatsLoading(false);
      return;
    }
    if (res.ok) {
      const data = await res.json();
      setChats(data);
      if (data.length > 0 && !activeChatIdRef.current) {
        setActiveChatId(data[0].id);
      }
    }
    setChatsLoading(false);
  }, []);
  useEffect(() => {
    const token = getAccessToken();
    if (token) {
      setIsAuthenticated(true);
      setIsAdmin(isAdminUser());
      
      fetch("/api/advisors")
        .then(r => r.json())
        .then(data => {
          setAdvisorMap(data);
          const first = Object.keys(data)[0];
          if (first) {
            setEmptyAdvisorId((current) =>
              current === "advisor1" && !data[current] ? first : current
            );
          }
        })
        .catch(() => {});
      loadChats();
      fetch("/api/wakeup").catch(() => {});
    } else {
      setChatsLoading(false);
    }
  }, [loadChats]);
  // Restore draft when switching chats
  useEffect(() => {
    const prev = prevChatIdRef.current;
    if (prev && prev !== activeChatId) {
      setDraft(prev, input);
    }
    if (activeChatId) {
      setInput(getDraft(activeChatId));
    } else {
      setInput(getPendingDraft());
    }
    prevChatIdRef.current = activeChatId;
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!activeChatId || !isAuthenticated) return;
    if (skipLoadRef.current) {
      skipLoadRef.current = false;
      return;
    }
    loadMessages(activeChatId);
  }, [activeChatId, isAuthenticated, loadMessages]);
  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingText, scrollToBottom]);
  function handleInputChange(value: string) {
    setInput(value);
    if (activeChatId) {
      setDraft(activeChatId, value);
    } else {
      setPendingDraft(value);
    }
  }

  const {
    listening: speechListening,
    error: speechError,
    stop: stopSpeech,
    toggle: toggleSpeech,
  } = useSpeechRecognition({
    onTranscript: handleInputChange,
    getBaseText: () => input,
  });

  useEffect(() => {
    stopSpeech();
  }, [activeChatId, isAuthenticated, stopSpeech]);
  function handleLogout() {
    abortRef.current?.abort();
    setIsAuthenticated(false);
    setIsAdmin(false);
    setActiveChatId(null);
    setChats([]);
    setMessages([]);
    setContextUsage(null);
    setContextSummary(null);
    setSelectMode(false);
    setSelectedIds(new Set());
    setQueuesSync({});
    setEditingQueueId(null);
    setLoadingFlag(false);
    discardPartialStream();
  }

  async function handleManualCompact() {
    if (!activeChatId || compacting || loading) return;
    setCompacting(true);
    try {
      const res = await fetch(`/api/chats/${activeChatId}/compact`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (res.status === 401) {
        handleLogout();
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Compact failed");
      }
      if (data.context_usage) {
        setContextUsage(data.context_usage);
      }
      if (data.context_summary) {
        setContextSummary(data.context_summary);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Compact failed";
      setMessages((prev) => [
        ...prev,
        { role: "model", content: `Error: ${msg}` },
      ]);
    } finally {
      setCompacting(false);
    }
  }
  function handleSelectChat(id: string) {
    if (selectMode) return;
    setActiveChatId(id);
  }
  function handleToggleSelectMode() {
    setSelectMode((m) => !m);
    setSelectedIds(new Set());
  }
  function handleToggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function handleSelectAll() {
    if (selectedIds.size === chats.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(chats.map((c) => c.id)));
    }
  }
  function deleteChats(ids: string[]) {
    // Optimistic update: remove from UI immediately
    setChats((prev) => prev.filter((c) => !ids.includes(c.id)));
    clearDrafts(ids);
    {
      const next = { ...queuesRef.current };
      for (const id of ids) delete next[id];
      setQueuesSync(next);
    }
    if (activeChatId && ids.includes(activeChatId)) {
      if (streamingChatIdRef.current === activeChatId) {
        abortRef.current?.abort();
      }
      setActiveChatId(null);
      setMessages([]);
      setContextUsage(null);
      setContextSummary(null);
      setInput(getPendingDraft());
    }
    setSelectMode(false);
    setSelectedIds(new Set());

    // Send deletion to backend asynchronously (don't wait for response)
    (async () => {
      try {
        if (ids.length === 1) {
          await fetch(`/api/chats/${ids[0]}`, {
            method: "DELETE",
            headers: authHeaders(),
          });
        } else {
          await fetch("/api/chats/batch", {
            method: "DELETE",
            headers: authHeaders(),
            body: JSON.stringify({ ids }),
          });
        }
      } catch (err) {
        // Silently fail - deletion already removed from UI
        console.error("Failed to delete chats:", err);
      }
    })();
  }
  function handleDeleteChat(id: string) {
    setPendingDelete({ type: "single", ids: [id] });
  }
  function handleBulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setPendingDelete({ type: "bulk", ids });
  }
  async function confirmDeleteChats() {
    if (!pendingDelete) return;
    const ids = pendingDelete.ids;
    setPendingDelete(null);
    await deleteChats(ids);
  }
  function updateChatTitle(chatId: string, title: string) {
    setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, title } : c)));
  }
  async function handleShare(id: string) {
    const res = await fetch("/api/share", { method: "POST", headers: authHeaders(), body: JSON.stringify({ chat_id: id }) });
    if (res.ok) {
      const { share_token } = await res.json();
      const url = `${window.location.origin}/share/${share_token}`;
      setShareUrl(url);
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        // Ignore clipboard failures (e.g. document not focused); the share dialog still shows the URL to copy manually.
      }
    }
  }
  function handleRename(id: string) {
    const chat = chats.find((c) => c.id === id);
    setRenameTarget({ id, title: chat?.title || "" });
    setRenameValue(chat?.title || "");
  }

  async function confirmRename() {
    if (!renameTarget) return;
    const newTitle = renameValue.trim();
    if (!newTitle) return;
    const { id } = renameTarget;
    setRenameTarget(null);
    const res = await fetch(`/api/chats/${id}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ title: newTitle }),
    });
    if (res.ok) updateChatTitle(id, newTitle);
  }
  function stopStreaming() {
    discardPartialStream();
    abortRef.current?.abort();
  }

  function steerWithText(chatId: string, text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    clearChatQueue(chatId);
    if (loadingRef.current) {
      enqueuePrompt(chatId, trimmed);
      discardPartialStream();
      abortRef.current?.abort();
      return;
    }
    void startTurn(chatId, trimmed, { clearInput: false });
  }

  function steerMessage() {
    const text = input.trim();
    if (!text || !loadingRef.current) return;
    const chatId = streamingChatIdRef.current || activeChatId;
    if (!chatId) return;
    setInput("");
    clearDraft(chatId);
    steerWithText(chatId, text);
  }

  function steerQueuedPrompt(chatId: string, id: string) {
    const item = (queuesRef.current[chatId] || []).find((q) => q.id === id);
    if (!item) return;
    steerWithText(chatId, item.text);
  }

  async function createChat(advisorId: string): Promise<string | null> {
    const res = await fetch("/api/chats", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ title: "New Chat", advisor_id: advisorId }),
    });
    if (!res.ok) return null;
    const chat = await res.json();
    skipLoadRef.current = true;
    setMessages([]);
    setContextUsage(null);
    setContextSummary(null);
    setActiveChatId(chat.id);
    activeChatIdRef.current = chat.id;
    setActiveAdvisorId(advisorId);
    clearPendingDraft();
    await loadChats();
    return chat.id;
  }

  async function drainQueue(chatId: string) {
    if (loadingRef.current) return;
    if (activeChatIdRef.current !== chatId) return;
    const next = dequeuePrompt(chatId);
    if (!next) return;
    await startTurn(chatId, next, { clearInput: false });
  }

  async function startTurn(
    chatId: string,
    text: string,
    options?: { clearInput?: boolean }
  ) {
    if (loadingRef.current) return;
    if (options?.clearInput !== false) {
      setInput("");
      clearDraft(chatId);
    }
    setLoadingFlag(true);
    streamingChatIdRef.current = chatId;
    setStreamingRetrieval(null);
    setRetrievalStatus(null);
    setRetrievalRankingCount(null);
    setPendingQuery(text);
    setStreamingText("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    const abort = new AbortController();
    abortRef.current = abort;
    let assistantText = "";
    let assistantRetrieval: RetrievalPayload | null = null;
    let assistantSuggestion: string | null = null;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ prompt: text, chat_id: chatId }),
        signal: abort.signal,
      });
      if (res.status === 401) {
        handleLogout();
        return;
      }
      if (!res.ok || !res.body) {
        throw new Error(await res.text());
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = JSON.parse(line.slice(6));
          if (payload.type === "retrieval_status") {
            const step = payload.step as RetrievalStatusStep;
            setRetrievalStatus(step);
            if (step === "ranking" && typeof payload.count === "number") {
              setRetrievalRankingCount(payload.count);
            }
          } else if (payload.type === "retrieval") {
            assistantRetrieval = normalizeCitations(payload);
            setStreamingRetrieval(assistantRetrieval);
          } else if (payload.type === "citations") {
            assistantRetrieval = normalizeCitations(payload.citations);
            setStreamingRetrieval(assistantRetrieval);
          } else if (payload.type === "context") {
            setContextUsage({
              used: payload.used ?? 0,
              limit: payload.limit ?? usableContextTokens(),
              percent: payload.percent ?? 0,
              compacted: Boolean(payload.compacted),
            });
            if (payload.compacted) {
              setContextSummary((prev) => prev || "compacted");
            }
          } else if (payload.type === "token") {
            assistantText += payload.text;
            setStreamingText(assistantText);
          } else if (payload.type === "suggestion" && payload.question) {
            assistantSuggestion = String(payload.question);
          } else if (payload.type === "title" && payload.title) {
            updateChatTitle(chatId, payload.title);
          } else if (payload.type === "error") {
            throw new Error(payload.message);
          }
        }
      }
      setStreamingText("");
      if (assistantText.trim()) {
        const extracted = extractNextQuestion(assistantText);
        const suggestion =
          assistantSuggestion || extracted.question || null;
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: extracted.body,
            citations: assistantRetrieval,
            suggestion,
          },
        ]);
      }
    } catch (err) {
      if (!isAbortError(err)) {
        const msg = err instanceof Error ? err.message : "Request failed";
        setMessages((prev) => [
          ...prev,
          { role: "model", content: `Error: ${msg}` },
        ]);
      }
      setStreamingText("");
    } finally {
      setLoadingFlag(false);
      setStreamingRetrieval(null);
      setRetrievalStatus(null);
      setRetrievalRankingCount(null);
      setPendingQuery(null);
      streamingChatIdRef.current = null;
      abortRef.current = null;
      inputRef.current?.focus();
      await drainQueue(chatId);
    }
  }

  async function sendMessage(overrideText?: string) {
    const fromInput = overrideText === undefined;
    const text = (overrideText ?? input).trim();
    if (!text) return;

    if (loadingRef.current) {
      const chatId =
        activeChatId || streamingChatIdRef.current;
      if (!chatId) return;
      enqueuePrompt(chatId, text);
      if (fromInput) {
        setInput("");
        clearDraft(chatId);
      }
      return;
    }

    let chatId = activeChatId;
    if (!chatId) {
      chatId = await createChat(emptyAdvisorId);
      if (!chatId) return;
    }
    await startTurn(chatId, text, { clearInput: fromInput });
  }

  useEffect(() => {
    if (!activeChatId || loadingRef.current) return;
    const queued = queuesRef.current[activeChatId];
    if (queued?.length) {
      void drainQueue(activeChatId);
    }
    // Drain stranded queues when returning to a chat while idle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChatId]);
  const profilePicture = getProfilePicture();
  const threadSuggestions = getSuggestions(activeAdvisorId);
  const activeQueue = activeChatId ? queues[activeChatId] || [] : [];
  return (
    <div className="app-container">
      {!isAuthenticated && (
        <LoginOverlay
          onLogin={() => {
            setIsAuthenticated(true);
            setIsAdmin(isAdminUser());
            loadChats();
          }}
        />
      )}
      <NewChatModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(id, advisorId) => {
          loadChats();
          skipLoadRef.current = true;
          setMessages([]);
          setContextUsage(null);
          setContextSummary(null);
          setActiveAdvisorId(advisorId);
          setActiveChatId(id);
        }}
      />
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingDelete?.type === "bulk" ? "Delete selected chats?" : "Delete chat?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.type === "bulk"
                ? `This will permanently delete ${pendingDelete.ids.length} selected chat${pendingDelete.ids.length > 1 ? "s" : ""}.`
                : "This chat and its messages will be permanently deleted."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[var(--error)] hover:bg-[#cf2d3f]"
              onClick={confirmDeleteChats}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={shareUrl !== null}
        onOpenChange={(open) => {
          if (!open) setShareUrl(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link copied</DialogTitle>
            <DialogDescription>
              Your conversation snapshot link has been copied to your clipboard.
            </DialogDescription>
          </DialogHeader>
          {shareUrl && (
            <Input readOnly value={shareUrl} onFocus={(e) => e.target.select()} />
          )}
          <DialogFooter>
            <Button type="button" onClick={() => setShareUrl(null)}>
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename chat</DialogTitle>
            <DialogDescription>Enter a new name for this conversation.</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void confirmRename();
              }
            }}
            placeholder="Chat name"
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void confirmRename()}
              disabled={!renameValue.trim()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {isAuthenticated && sidebarOpen && (
        <Sidebar
          chats={chats}
          loading={chatsLoading}
          activeChatId={activeChatId}
          selectMode={selectMode}
          selectedIds={selectedIds}
          onSelect={handleSelectChat}
          onDelete={handleDeleteChat}
          onNewChat={() => {
            setModalOpen(true);
            fetch("/api/wakeup").catch(() => {});
          }}
          onToggleSelectMode={handleToggleSelectMode}
          onToggleSelect={handleToggleSelect}
          onSelectAll={handleSelectAll}
          onBulkDelete={handleBulkDelete}
          onShare={handleShare}
          onRename={handleRename}
          onToggleSidebar={() => setSidebarOpen(false)}
        />
      )}
      <div className={`main-chat ${showEmptyState ? "main-chat--empty" : ""}`}>
        <div className="header">
          <div className="header-title">
            {isAuthenticated && !sidebarOpen && (
              <button
                className="sidebar-toggle-btn"
                onClick={() => setSidebarOpen(true)}
                title="Show sidebar"
                type="button"
                aria-label="Show sidebar"
              >
                <PanelLeft className="h-4 w-4" />
              </button>
            )}
            {showEmptyState && <h1>EIF AI Advisor</h1>}
          </div>
          {isAuthenticated && (
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              {isAdmin && (
                <button
                  className="logout-btn"
                  onClick={() => window.location.href = '/admin'}
                >
                  Admin Dashboard
                </button>
              )}
              <LogoutButton onLogout={handleLogout} />
            </div>
          )}
        </div>
        {chatsLoading ? (
          <ChatSkeleton />
        ) : showEmptyState ? (
          <EmptyChatState
            input={input}
            loading={loading}
            advisorId={emptyAdvisorId}
            advisors={advisorMap}
            onAdvisorChange={setEmptyAdvisorId}
            onInputChange={handleInputChange}
            onSend={() => sendMessage()}
            onSuggestionSelect={(query) => sendMessage(query)}
            speechListening={speechListening}
            speechError={speechError}
            onSpeechToggle={toggleSpeech}
          />
        ) : (
          <>
            <div className="chat-messages" ref={chatboxRef}>
              <div className="chat-messages-inner">
                {!isAuthenticated ? null : !activeChatId ? (
                  <div className="empty-chat">Select or create a chat to begin.</div>
                ) : messagesLoading ? (
                  <ChatMessagesSkeleton />
                ) : (
                  <>
                    <div className="thread-welcome">
                      <div className="message message--ai">
                        <div className="avatar ai">AI</div>
                        <div className="message-content">
                          <p>{ADVISOR_GREETINGS[activeAdvisorId] || "Hi! How can I assist you today?"}</p>
                          {messages.length === 0 && (
                            <>
                              <p className="thread-welcome-hint">
                                Try one of these questions based on EIF documentation:
                              </p>
                              <SuggestionChips
                                suggestions={threadSuggestions}
                                onSelect={(query) => sendMessage(query)}
                                disabled={loading}
                              />
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    {messages.map((msg, idx) => {
                      const isLatestAi =
                        idx === messages.length - 1 &&
                        msg.role !== "user" &&
                        !!msg.suggestion &&
                        !loading;
                      return (
                        <div
                          key={idx}
                          className={`message ${msg.role === "user" ? "message--user" : "message--ai"}`}
                        >
                          <div className={`avatar ${msg.role === "user" ? "user" : "ai"}`}>
                            {msg.role === "user" ? (
                              profilePicture ? (
                                <img src={profilePicture} alt="User" className="avatar-img" />
                              ) : (
                                "U"
                              )
                            ) : (
                              "AI"
                            )}
                          </div>
                          <div className="message-content">
                            {msg.role !== "user" && (
                              <RetrievalPanel
                                mode="finished"
                                retrieval={normalizeCitations(msg.citations)}
                                isAdmin={isAdmin}
                                query={
                                  messages
                                    .slice(0, idx)
                                    .reverse()
                                    .find((m) => m.role === "user")?.content ||
                                  null
                                }
                              />
                            )}
                            <div
                              dangerouslySetInnerHTML={{
                                __html: marked.parse(
                                  extractNextQuestion(msg.content || "").body
                                ),
                              }}
                            />
                            <CopyMessageButton
                              text={
                                msg.role === "user"
                                  ? msg.content || ""
                                  : extractNextQuestion(msg.content || "").body
                              }
                            />
                            {isLatestAi && msg.suggestion && (
                              <SuggestionChips
                                suggestions={[
                                  {
                                    label: msg.suggestion,
                                    query: msg.suggestion,
                                  },
                                ]}
                                onSelect={(query) => sendMessage(query)}
                                disabled={loading}
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
                {loading && (
                  <div className="message message--ai">
                    <div className="avatar ai">AI</div>
                    <div className="message-content message-content--loading">
                      {streamingText ? (
                        <>
                          {streamingRetrieval && (
                            <RetrievalPanel
                              mode="finished"
                              retrieval={streamingRetrieval}
                              isAdmin={isAdmin}
                              query={pendingQuery}
                            />
                          )}
                          <div
                            dangerouslySetInnerHTML={{
                              __html: marked.parse(
                                extractNextQuestion(streamingText).body
                              ),
                            }}
                          />
                        </>
                      ) : (
                        <RetrievalPanel
                          mode="live"
                          retrieval={streamingRetrieval}
                          statusStep={retrievalStatus || "searching"}
                          rankingCount={retrievalRankingCount}
                          isAdmin={isAdmin}
                          query={pendingQuery}
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="input-container">
              {activeChatId && activeQueue.length > 0 && (
                <div className="prompt-queue" aria-label="Queued prompts">
                  <div className="prompt-queue-header">
                    <span>
                      {activeQueue.length} queued
                    </span>
                    <button
                      type="button"
                      className="prompt-queue-clear"
                      onClick={() => clearChatQueue(activeChatId)}
                    >
                      Clear
                    </button>
                  </div>
                  <ul className="prompt-queue-list">
                    {activeQueue.map((item, index) => (
                      <li key={item.id} className="prompt-queue-item">
                        <span className="prompt-queue-index">{index + 1}</span>
                        {editingQueueId === item.id ? (
                          <input
                            className="prompt-queue-edit"
                            autoFocus
                            defaultValue={item.text}
                            onBlur={(e) => {
                              updateQueueItem(
                                activeChatId,
                                item.id,
                                e.target.value
                              );
                              setEditingQueueId(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                updateQueueItem(
                                  activeChatId,
                                  item.id,
                                  (e.target as HTMLInputElement).value
                                );
                                setEditingQueueId(null);
                              } else if (e.key === "Escape") {
                                setEditingQueueId(null);
                              }
                            }}
                          />
                        ) : (
                          <span className="prompt-queue-text" title={item.text}>
                            {item.text}
                          </span>
                        )}
                        <div className="prompt-queue-actions">
                          <button
                            type="button"
                            className="prompt-queue-action"
                            onClick={() => setEditingQueueId(item.id)}
                            title="Edit prompt"
                            aria-label="Edit prompt"
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            className="prompt-queue-action prompt-queue-steer"
                            onClick={() =>
                              steerQueuedPrompt(activeChatId, item.id)
                            }
                            title="Steer with this prompt now"
                            aria-label="Steer with this prompt now"
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M3 20V4L22 12L3 20ZM5 17L16.85 12L5 7V10.5L11 12L5 13.5V17Z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            className="prompt-queue-action prompt-queue-remove"
                            onClick={() =>
                              removeQueueItem(activeChatId, item.id)
                            }
                            title="Remove from queue"
                            aria-label="Remove from queue"
                          >
                            ×
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {speechError && (
                <p className="speech-error" role="alert">
                  {speechError}
                </p>
              )}
              <div className="input-area">
                <input
                  ref={inputRef}
                  type="text"
                  placeholder={
                    loading ? "Queue a follow-up or steer..." : "Message..."
                  }
                  value={input}
                  disabled={!isAuthenticated || !activeChatId || messagesLoading}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                />
                {activeChatId && (
                  <ContextMeter
                    usage={(() => {
                      const draftTokens = Math.ceil(input.length / 4);
                      if (contextUsage) {
                        return buildContextUsage(
                          contextUsage.used + draftTokens,
                          contextUsage.limit,
                          contextUsage.compacted
                        );
                      }
                      return buildContextUsage(
                        estimateConversationTokensClient(
                          messages,
                          input,
                          contextSummary
                        ),
                        usableContextTokens(),
                        Boolean(contextSummary)
                      );
                    })()}
                    compacting={compacting}
                    canCompact={!loading && !compacting && messages.length >= 2}
                    onCompact={handleManualCompact}
                  />
                )}
                <SpeechMicButton
                  listening={speechListening}
                  onClick={toggleSpeech}
                  disabled={!isAuthenticated || !activeChatId || messagesLoading}
                />
                {loading ? (
                  <>
                    <button
                      onClick={steerMessage}
                      type="button"
                      className="send-btn steer-btn"
                      disabled={!input.trim()}
                      title="Steer: abort and redirect"
                    >
                      Steer
                    </button>
                    <button
                      onClick={() => sendMessage()}
                      type="button"
                      className="send-btn"
                      disabled={!input.trim()}
                      title="Add to queue"
                    >
                      <svg viewBox="0 0 24 24">
                        <path d="M3 20V4L22 12L3 20ZM5 17L16.85 12L5 7V10.5L11 12L5 13.5V17Z" />
                      </svg>
                    </button>
                    <button
                      onClick={stopStreaming}
                      type="button"
                      className="send-btn stop-btn"
                      title="Stop generation"
                    >
                      <svg viewBox="0 0 24 24">
                        <rect x="6" y="6" width="12" height="12" />
                      </svg>
                    </button>
                  </>
                ) : (
                  <button
                    className="send-btn"
                    disabled={!isAuthenticated || !activeChatId || !input.trim() || messagesLoading}
                    onClick={() => sendMessage()}
                    type="button"
                  >
                    <svg viewBox="0 0 24 24">
                      <path d="M3 20V4L22 12L3 20ZM5 17L16.85 12L5 7V10.5L11 12L5 13.5V17Z" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
