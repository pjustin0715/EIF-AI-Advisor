"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { PanelLeft } from "lucide-react";
import { marked } from "marked";
import {
  authHeaders,
  clearAccessToken,
  getAccessToken,
  getProfilePicture,
  getTokenPayload,
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
import LoginOverlay from "./LoginOverlay";
import NewChatModal from "./NewChatModal";
import RetrievalPanel from "./RetrievalPanel";
import ChatMessagesSkeleton from "./ChatMessagesSkeleton";
import ChatSkeleton from "./ChatSkeleton";
import Sidebar from "./Sidebar";
import SuggestionChips from "./SuggestionChips";
import SpeechMicButton from "./SpeechMicButton";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import type { TurnLock } from "@/lib/turn-lock";

const POLL_INTERVAL_MS = 2000;

function displayNameFromEmail(email: string | null | undefined): string {
  if (!email) return "User";
  const local = email.split("@")[0] || email;
  return local
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

interface Message {
  id?: string;
  role: "user" | "model" | "assistant";
  content: string;
  author_email?: string | null;
  citations?: RetrievalPayload | string[] | null;
  suggestion?: string | null;
}
interface Chat {
  id: string;
  title: string;
  advisor_id: string;
  pinned?: boolean;
  shared_at?: string | null;
  share_token?: string | null;
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

export default function ChatInterface({
  mode = "owner",
  shareToken,
}: {
  mode?: "owner" | "shared";
  shareToken?: string;
} = {}) {
  const isSharedMode = mode === "shared";
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
  const [shareDialog, setShareDialog] = useState<{
    url: string;
    chatId: string;
    isShared: boolean;
  } | null>(null);
  const [turnLock, setTurnLock] = useState<TurnLock | null>(null);
  const [activeChatMeta, setActiveChatMeta] = useState<{
    shared_at?: string | null;
    share_token?: string | null;
    title?: string;
  } | null>(null);
  const [sharedRoomError, setSharedRoomError] = useState("");
  const [renameTarget, setRenameTarget] = useState<{ id: string; title: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
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
  const showEmptyState =
    !isSharedMode && isAuthenticated && !chatsLoading && chats.length === 0;

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
  const loadSharedRoom = useCallback(async () => {
    if (!shareToken) return;
    setMessagesLoading(true);
    setSharedRoomError("");
    const res = await fetch(`/api/share/${shareToken}`, {
      headers: authHeaders(),
    });
    if (!res.ok) {
      if (res.status === 404) setSharedRoomError("Shared chat not found.");
      else if (res.status === 401) setSharedRoomError("Unauthorized access.");
      else setSharedRoomError("Failed to load shared chat.");
      setMessagesLoading(false);
      return;
    }
    const data = await res.json();
    setActiveChatId(data.chat.id);
    activeChatIdRef.current = data.chat.id;
    setActiveChatMeta({
      shared_at: data.chat.shared_at,
      share_token: data.chat.share_token,
      title: data.chat.title,
    });
    setMessages(data.messages || []);
    setTurnLock(data.turn_lock || null);
    const advId = data.chat?.advisor_id;
    if (advId) setActiveAdvisorId(advId);
    setMessagesLoading(false);
  }, [shareToken]);
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
    setActiveChatMeta({
      shared_at: data.chat?.shared_at ?? null,
      share_token: data.chat?.share_token ?? null,
      title: data.chat?.title,
    });
    setTurnLock(data.turn_lock || null);
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

      if (isSharedMode) {
        loadSharedRoom();
      } else {
        fetch("/api/advisors")
          .then((r) => r.json())
          .then((data) => {
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
      }
    } else {
      setChatsLoading(false);
      if (isSharedMode) setMessagesLoading(false);
    }
  }, [loadChats, loadSharedRoom, isSharedMode]);
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
    if (!activeChatId || !isAuthenticated || isSharedMode) return;
    if (skipLoadRef.current) {
      skipLoadRef.current = false;
      return;
    }
    loadMessages(activeChatId);
  }, [activeChatId, isAuthenticated, isSharedMode, loadMessages]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const shouldPoll =
      isSharedMode ||
      Boolean(activeChatId && activeChatMeta?.shared_at);
    if (!shouldPoll) return;

    const poll = async () => {
      try {
        if (isSharedMode && shareToken) {
          const res = await fetch(`/api/share/${shareToken}`, {
            headers: authHeaders(),
          });
          if (!res.ok) return;
          const data = await res.json();
          setTurnLock(data.turn_lock || null);
          if (!loadingRef.current) {
            setMessages(data.messages || []);
          }
          return;
        }
        if (!activeChatId || !activeChatMeta?.shared_at) return;
        const res = await fetch(`/api/chats/${activeChatId}`, {
          headers: authHeaders(),
        });
        if (!res.ok) return;
        const data = await res.json();
        setTurnLock(data.turn_lock || null);
        setActiveChatMeta({
          shared_at: data.chat?.shared_at ?? null,
          share_token: data.chat?.share_token ?? null,
          title: data.chat?.title,
        });
        if (!loadingRef.current) {
          setMessages(data.messages || []);
          if (data.context_usage) setContextUsage(data.context_usage);
        }
      } catch {
        // ignore transient poll errors
      }
    };

    const id = window.setInterval(poll, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [
    isAuthenticated,
    isSharedMode,
    shareToken,
    activeChatId,
    activeChatMeta?.shared_at,
  ]);
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
    const res = await fetch("/api/share", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ chat_id: id }),
    });
    if (res.ok) {
      const { share_token } = await res.json();
      const url = `${window.location.origin}/share/${share_token}`;
      const sharedAt = new Date().toISOString();
      setShareDialog({ url, chatId: id, isShared: true });
      setActiveChatMeta({
        shared_at: sharedAt,
        share_token,
      });
      setChats((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, shared_at: sharedAt, share_token } : c
        )
      );
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        // Ignore clipboard failures
      }
    }
  }

  async function handleStopSharing() {
    if (!shareDialog) return;
    const res = await fetch("/api/share", {
      method: "DELETE",
      headers: authHeaders(),
      body: JSON.stringify({ chat_id: shareDialog.chatId }),
    });
    if (res.ok) {
      const chatId = shareDialog.chatId;
      setShareDialog(null);
      setActiveChatMeta((prev) =>
        prev ? { ...prev, shared_at: null } : prev
      );
      setChats((prev) =>
        prev.map((c) => (c.id === chatId ? { ...c, shared_at: null } : c))
      );
    }
  }

  async function handleRotateLink() {
    if (!shareDialog) return;
    const res = await fetch("/api/share", {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ chat_id: shareDialog.chatId }),
    });
    if (res.ok) {
      const { share_token } = await res.json();
      const url = `${window.location.origin}/share/${share_token}`;
      setShareDialog((prev) =>
        prev ? { ...prev, url, isShared: true } : prev
      );
      setActiveChatMeta((prev) =>
        prev
          ? {
              ...prev,
              share_token,
              shared_at: prev.shared_at || new Date().toISOString(),
            }
          : prev
      );
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        // Ignore clipboard failures
      }
    }
  }
  async function handlePin(id: string) {
    const chat = chats.find((c) => c.id === id);
    if (!chat) return;
    const pinned = !chat.pinned;
    setChats((prev) =>
      prev
        .map((c) => (c.id === id ? { ...c, pinned } : c))
        .sort((a, b) => Number(b.pinned) - Number(a.pinned))
    );
    await fetch(`/api/chats/${id}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ pinned }),
    });
  }
  function handleRename(id: string) {
    const chat = chats.find((c) => c.id === id);
    setRenameTarget({ id, title: chat?.title || "" });
    setRenameValue(chat?.title || "");
  }

  function startTitleEdit(id: string) {
    const chat = chats.find((c) => c.id === id);
    setTitleDraft(chat?.title || "");
    setEditingTitle(true);
  }

  async function saveTitleEdit(id: string) {
    const newTitle = titleDraft.trim();
    setEditingTitle(false);
    const current = chats.find((c) => c.id === id)?.title || "";
    if (!newTitle || newTitle === current) return;
    const res = await fetch(`/api/chats/${id}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ title: newTitle }),
    });
    if (res.ok) updateChatTitle(id, newTitle);
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

  function steerNextQueued(chatId: string) {
    const list = queuesRef.current[chatId] || [];
    if (list.length === 0) return;
    if (loadingRef.current) {
      discardPartialStream();
      abortRef.current?.abort();
    } else {
      void drainQueue(chatId);
    }
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
    const senderEmail = getTokenPayload()?.sub ?? null;
    setMessages((prev) => [
      ...prev,
      { role: "user", content: text, author_email: senderEmail },
    ]);
    const abort = new AbortController();
    abortRef.current = abort;
    let assistantText = "";
    let assistantRetrieval: RetrievalPayload | null = null;
    let assistantSuggestion: string | null = null;
    const chatBody: Record<string, string> = { prompt: text, chat_id: chatId };
    if (isSharedMode && shareToken) {
      chatBody.share_token = shareToken;
    } else if (activeChatMeta?.shared_at && activeChatMeta?.share_token) {
      chatBody.share_token = activeChatMeta.share_token;
    }
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(chatBody),
        signal: abort.signal,
      });
      if (res.status === 401) {
        handleLogout();
        return;
      }
      if (res.status === 409) {
        const data = await res.json().catch(() => ({}));
        if (data.turn_lock) setTurnLock(data.turn_lock);
        setMessages((prev) => prev.slice(0, -1));
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
    if (remoteTurnActive) return;

    if (loadingRef.current) {
      const chatId =
        activeChatId || streamingChatIdRef.current;
      if (!chatId) return;

      const queueLen = (queuesRef.current[chatId] || []).length;
      if (!text && queueLen > 0) {
        steerNextQueued(chatId);
        return;
      }
      if (!text) return;

      enqueuePrompt(chatId, text);
      if (fromInput) {
        setInput("");
        clearDraft(chatId);
      }
      return;
    }

    if (!text) return;

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
  const userEmail = getTokenPayload()?.sub ?? null;
  const remoteTurnActive =
    Boolean(turnLock?.active && turnLock.by && turnLock.by !== userEmail) &&
    !loading;
  const threadSuggestions = getSuggestions(activeAdvisorId);
  const activeQueue = activeChatId ? queues[activeChatId] || [] : [];
  return (
    <div className="app-container">
      {!isAuthenticated && (
        <LoginOverlay
          onLogin={() => {
            setIsAuthenticated(true);
            setIsAdmin(isAdminUser());
            if (isSharedMode) loadSharedRoom();
            else loadChats();
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
        open={shareDialog !== null}
        onOpenChange={(open) => {
          if (!open) setShareDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share live room</DialogTitle>
            <DialogDescription>
              Anyone with this link can join and chat in this conversation.
            </DialogDescription>
          </DialogHeader>
          {shareDialog && (
            <Input
              readOnly
              value={shareDialog.url}
              onFocus={(e) => e.target.select()}
            />
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleRotateLink()}
            >
              Rotate link
            </Button>
            <Button
              type="button"
              variant="outline"
              className="text-[var(--error)]"
              onClick={() => void handleStopSharing()}
            >
              Stop sharing
            </Button>
            <Button type="button" onClick={() => setShareDialog(null)}>
              Done
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
      {isAuthenticated && sidebarOpen && !isSharedMode && (
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
          onPin={handlePin}
          onToggleSidebar={() => setSidebarOpen(false)}
          userEmail={userEmail}
          profilePicture={profilePicture}
          isAdmin={isAdmin}
          onAdminDashboard={() => (window.location.href = "/admin")}
          onLogout={handleLogout}
        />
      )}
      <div className={`main-chat ${showEmptyState ? "main-chat--empty" : ""}`}>
        <div className="header">
          <div className="header-title">
            {isAuthenticated && !sidebarOpen && !isSharedMode && (
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
            {isSharedMode && activeChatMeta?.title && (
              <h1>{activeChatMeta.title}</h1>
            )}
            {isSharedMode && (
              <span className="shared-room-badge">Live shared room</span>
            )}
            {!isSharedMode && !showEmptyState && activeChatId && (
              editingTitle ? (
                <input
                  autoFocus
                  className="chat-title-input"
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={() => void saveTitleEdit(activeChatId)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void saveTitleEdit(activeChatId);
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      setEditingTitle(false);
                    }
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="chat-title-btn"
                  onClick={() => startTitleEdit(activeChatId)}
                  title="Rename chat"
                >
                  {chats.find((c) => c.id === activeChatId)?.title || "Untitled chat"}
                </button>
              )
            )}
            {showEmptyState && <h1>EIF AI Advisor</h1>}
          </div>
        </div>
        {isSharedMode && sharedRoomError ? (
          <div className="main-chat" style={{ justifyContent: "center", alignItems: "center", color: "var(--error)" }}>
            {sharedRoomError}
          </div>
        ) : chatsLoading && !isSharedMode ? (
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
                  <div className="empty-chat">
                    {isSharedMode ? "Loading shared room…" : "Select or create a chat to begin."}
                  </div>
                ) : messagesLoading ? (
                  <ChatMessagesSkeleton />
                ) : (
                  <>
                    <div className="thread-welcome">
                      <div className="message message--ai">
                        <div className="avatar ai">
                          <img
                            src="/eskwelabs-logo.png"
                            alt="Eskwelabs AI"
                            className="avatar-img"
                          />
                        </div>
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
                              <img
                                src="/eskwelabs-logo.png"
                                alt="Eskwelabs AI"
                                className="avatar-img"
                              />
                            )}
                          </div>
                          <div className="message-content">
                            {msg.role === "user" &&
                              (msg.author_email ||
                                isSharedMode ||
                                activeChatMeta?.shared_at) && (
                                <span className="message-author">
                                  {displayNameFromEmail(msg.author_email)}
                                </span>
                              )}
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
                {remoteTurnActive && (
                  <div className="shared-turn-banner" role="status">
                    {displayNameFromEmail(turnLock?.by)} is in this turn…
                  </div>
                )}
                {loading && (
                  <div className="message message--ai">
                    <div className="avatar ai">
                      <img
                        src="/eskwelabs-logo.png"
                        alt="Eskwelabs AI"
                        className="avatar-img"
                      />
                    </div>
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
                    remoteTurnActive
                      ? "Waiting for current turn…"
                      : loading
                        ? activeQueue.length > 0
                          ? "Press Enter to steer..."
                          : "Queue a follow-up..."
                        : "Message..."
                  }
                  value={input}
                  disabled={
                    !isAuthenticated ||
                    !activeChatId ||
                    messagesLoading ||
                    remoteTurnActive
                  }
                  onChange={(e) => handleInputChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                />
                {activeChatId && !isSharedMode && (
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
                <button
                  className="send-btn"
                  disabled={
                    !isAuthenticated ||
                    !activeChatId ||
                    messagesLoading ||
                    remoteTurnActive ||
                    (!input.trim() && !(loading && activeQueue.length > 0))
                  }
                  onClick={() => sendMessage()}
                  type="button"
                  title={
                    loading
                      ? !input.trim() && activeQueue.length > 0
                        ? "Steer with next queued prompt"
                        : "Add to queue"
                      : "Send message"
                  }
                >
                  <svg viewBox="0 0 24 24">
                    <path d="M3 20V4L22 12L3 20ZM5 17L16.85 12L5 7V10.5L11 12L5 13.5V17Z" />
                  </svg>
                </button>
                {loading && (
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
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
