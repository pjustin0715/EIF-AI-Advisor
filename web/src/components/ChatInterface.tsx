"use client";



import { useCallback, useEffect, useRef, useState } from "react";

import { marked } from "marked";

import {

  authHeaders,

  clearAccessToken,

  getAccessToken,

  getProfilePicture,

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

import EmptyChatState from "./EmptyChatState";

import ConfirmDialog from "./ConfirmDialog";

import LoginOverlay, { LogoutButton } from "./LoginOverlay";

import NewChatModal from "./NewChatModal";

import Sidebar from "./Sidebar";

import SuggestionChips from "./SuggestionChips";



interface Message {

  role: "user" | "model" | "assistant";

  content: string;

  citations?: string[] | null;

}



interface Chat {

  id: string;

  title: string;

  advisor_id: string;

}

type PendingDelete =
  | { type: "single"; ids: string[] }
  | { type: "bulk"; ids: string[] }
  | null;



export default function ChatInterface() {

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const checkAdminRole = (token: string | null) => {
    if (!token) return false;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.role === "admin";
    } catch {
      return false;
    }
  };

  const [chatsLoading, setChatsLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [chats, setChats] = useState<Chat[]>([]);

  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);

  const [input, setInput] = useState("");

  const [loading, setLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);

  const [advisorName, setAdvisorName] = useState("AI Advisor");

  const [activeAdvisorId, setActiveAdvisorId] = useState("advisor1");

  const [emptyAdvisorId, setEmptyAdvisorId] = useState("advisor1");
  const [advisorMap, setAdvisorMap] = useState<Record<string, { name: string, purpose?: string }>>({});

  const [streamingText, setStreamingText] = useState("");

  const [streamingCitations, setStreamingCitations] = useState<string[]>([]);

  const [selectMode, setSelectMode] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);



  const chatboxRef = useRef<HTMLDivElement>(null);

  const abortRef = useRef<AbortController | null>(null);

  const activeChatIdRef = useRef<string | null>(null);

  const prevChatIdRef = useRef<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const skipLoadRef = useRef(false);



  const showEmptyState = isAuthenticated && !chatsLoading && chats.length === 0;



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

    const advId = data.chat?.advisor_id;

    if (advId) {

      setActiveAdvisorId(advId);

      setAdvisorName(advisorMap[advId]?.name || "AI Advisor");

    }
    setMessagesLoading(false);

  }, []);



  const loadChats = useCallback(async () => {
    setChatsLoading(true);

    const res = await fetch("/api/chats", { headers: authHeaders() });

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
    if (activeAdvisorId && advisorMap[activeAdvisorId]) {
      setAdvisorName(advisorMap[activeAdvisorId].name);
    }
  }, [activeAdvisorId, advisorMap]);

  useEffect(() => {
    const token = getAccessToken();
    if (token) {
      setIsAuthenticated(true);
      setIsAdmin(checkAdminRole(token));
      
      fetch("/api/advisors")
        .then(r => r.json())
        .then(data => setAdvisorMap(data))
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

  }, [messages, scrollToBottom]);



  function handleInputChange(value: string) {

    setInput(value);

    if (activeChatId) {

      setDraft(activeChatId, value);

    } else {

      setPendingDraft(value);

    }

  }



  function handleLogout() {

    setIsAuthenticated(false);

    setActiveChatId(null);

    setChats([]);

    setMessages([]);

    setSelectMode(false);

    setSelectedIds(new Set());

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



  async function deleteChats(ids: string[]) {

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

    clearDrafts(ids);

    if (activeChatId && ids.includes(activeChatId)) {

      setActiveChatId(null);

      setMessages([]);

      setInput(getPendingDraft());

    }

    setSelectMode(false);

    setSelectedIds(new Set());

    loadChats();

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

    setChats((prev) =>

      prev.map((c) => (c.id === chatId ? { ...c, title } : c))

    );

  }



  function stopStreaming() {

    abortRef.current?.abort();

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

    setActiveChatId(chat.id);

    activeChatIdRef.current = chat.id;

    setActiveAdvisorId(advisorId);

    setAdvisorName(advisorMap[advisorId]?.name || "AI Advisor");

    clearPendingDraft();

    await loadChats();

    return chat.id;

  }



  async function sendMessage(overrideText?: string) {

    const text = (overrideText ?? input).trim();

    if (!text || loading) return;



    let chatId = activeChatId;

    if (!chatId) {

      chatId = await createChat(emptyAdvisorId);

      if (!chatId) return;

    }



    setInput("");

    clearDraft(chatId);

    setLoading(true);

    setStreamingCitations([]);

    setStreamingText("");

    setMessages((prev) => [...prev, { role: "user", content: text }]);



    const abort = new AbortController();

    abortRef.current = abort;



    let assistantText = "";
    let assistantCitations: string[] = [];


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



          if (payload.type === "citations") {

            assistantCitations = payload.citations || [];
            setStreamingCitations(assistantCitations);
          } else if (payload.type === "token") {

            assistantText += payload.text;

            setStreamingText(assistantText);

          } else if (payload.type === "title" && payload.title) {

            updateChatTitle(chatId, payload.title);

          } else if (payload.type === "error") {

            throw new Error(payload.message);

          }

        }

      }



      setStreamingText("");
      if (assistantText.trim()) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: assistantText,
            citations: assistantCitations.length ? assistantCitations : null,
          },
        ]);
      }

    } catch (err) {

      if (err instanceof Error && err.name === "AbortError") {

      } else {

        const msg = err instanceof Error ? err.message : "Request failed";

        setMessages((prev) => [...prev, { role: "model", content: `Error: ${msg}` }]);

      }

      setStreamingText("");

    } finally {

      setLoading(false);

      setStreamingCitations([]);

      abortRef.current = null;

      inputRef.current?.focus();

    }

  }



  const profilePicture = getProfilePicture();

  const threadSuggestions = getSuggestions(activeAdvisorId);



  return (

    <div className="app-container">

      {!isAuthenticated && (

        <LoginOverlay

          onLogin={() => {
            const token = getAccessToken();
            setIsAuthenticated(true);
            setIsAdmin(checkAdminRole(token));
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

          setActiveAdvisorId(advisorId);
          setAdvisorName(advisorMap[advisorId]?.name || "AI Advisor");

          setActiveChatId(id);

        }}

      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title={pendingDelete?.type === "bulk" ? "Delete selected chats?" : "Delete chat?"}
        message={
          pendingDelete?.type === "bulk"
            ? `This will permanently delete ${pendingDelete.ids.length} selected chat${pendingDelete.ids.length > 1 ? "s" : ""}.`
            : "This chat and its messages will be permanently deleted."
        }
        confirmLabel="Delete"
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDeleteChats}
      />



      {isAuthenticated && (

        <Sidebar

          chats={chats}

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

        />

      )}



      <div className={`main-chat ${showEmptyState ? "main-chat--empty" : ""}`}>

        <div className="header">

          <div className="header-title">

            <h1>{showEmptyState ? "EIF AI Advisor" : advisorName}</h1>

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



        {(chatsLoading || messagesLoading) ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div className="loading">
              <div className="dot" />
              <div className="dot" />
              <div className="dot" />
            </div>
          </div>
        ) : showEmptyState ? (

          <EmptyChatState

            input={input}

            loading={loading}

            advisorId={emptyAdvisorId}

            onAdvisorChange={setEmptyAdvisorId}

            onInputChange={handleInputChange}

            onSend={() => sendMessage()}

            onSuggestionSelect={(query) => sendMessage(query)}

          />

        ) : (

          <>

            <div className="chat-messages" ref={chatboxRef}>

              <div className="chat-messages-inner">

                {!isAuthenticated ? null : !activeChatId ? (

                  <div className="empty-chat">Select or create a chat to begin.</div>

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

                    {messages.map((msg, idx) => (

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

                        <div

                          dangerouslySetInnerHTML={{

                            __html: marked.parse(msg.content || ""),

                          }}

                        />

                      </div>

                    </div>

                  ))}
                  </>
                )}

                {loading && (streamingText || streamingCitations.length > 0) && (

                  <div className="message message--ai">
                    <div className="avatar ai">AI</div>

                    <div className="message-content message-content--loading">

                      {streamingText ? (

                          <div
                            dangerouslySetInnerHTML={{
                              __html: marked.parse(streamingText),
                            }}
                          />
                      ) : (

                        <div className="loading">

                          <div className="dot" />

                          <div className="dot" />

                          <div className="dot" />

                        </div>

                      )}

                    </div>

                  </div>

                )}

                {loading && !streamingText && streamingCitations.length === 0 && (

                  <div className="message message--ai message--loading">
                    <div className="avatar ai">AI</div>

                    <div className="message-content message-content--loading">

                      <div className="loading">

                        <div className="dot" />

                        <div className="dot" />

                        <div className="dot" />

                      </div>

                    </div>

                  </div>

                )}

              </div>

            </div>



            <div className="input-container">

              <div className="input-area">

                <input

                  ref={inputRef}

                  type="text"

                  placeholder="Message..."

                  value={input}

                  disabled={!isAuthenticated || !activeChatId || loading}

                  onChange={(e) => handleInputChange(e.target.value)}

                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}

                />

                {loading ? (

                  <button onClick={stopStreaming} type="button" className="stop-btn">

                    <svg viewBox="0 0 24 24">

                      <rect x="6" y="6" width="12" height="12" />

                    </svg>

                  </button>

                ) : (

                  <button

                    disabled={!isAuthenticated || !activeChatId || !input.trim()}

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



