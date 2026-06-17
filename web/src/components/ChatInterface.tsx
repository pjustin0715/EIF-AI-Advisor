"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { marked } from "marked";
import {
  authHeaders,
  clearAccessToken,
  getAccessToken,
  getProfilePicture,
} from "@/lib/auth-client";
import LoginOverlay, { LogoutButton } from "./LoginOverlay";
import NewChatModal from "./NewChatModal";
import Sidebar from "./Sidebar";

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

const ADVISOR_NAMES: Record<string, string> = {
  advisor1: "Data Dashboard Advisor",
  advisor2: "SSOT Memo Advisor",
  advisor3: "Data Modeling Advisor",
};

export default function ChatInterface() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [advisorName, setAdvisorName] = useState("AI Advisor");
  const [streamingText, setStreamingText] = useState("");
  const [streamingCitations, setStreamingCitations] = useState<string[]>([]);
  const [dnaDocUrl, setDnaDocUrl] = useState<string | null>(null);
  const chatboxRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const activeChatIdRef = useRef<string | null>(null);

  const scrollToBottom = useCallback(() => {
    if (chatboxRef.current) {
      chatboxRef.current.scrollTop = chatboxRef.current.scrollHeight;
    }
  }, []);

  const loadMessages = useCallback(async (chatId: string) => {
    const res = await fetch(`/api/chats/${chatId}`, { headers: authHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    setMessages(data.messages || []);
    const advId = data.chat?.advisor_id;
    setAdvisorName(ADVISOR_NAMES[advId] || "AI Advisor");
  }, []);

  const loadChats = useCallback(async () => {
    const res = await fetch("/api/chats", { headers: authHeaders() });
    if (res.status === 401) {
      clearAccessToken();
      setIsAuthenticated(false);
      return;
    }
    if (res.ok) {
      const data = await res.json();
      setChats(data);
      if (data.length > 0 && !activeChatIdRef.current) {
        setActiveChatId(data[0].id);
      }
    }
  }, []);

  useEffect(() => {
    if (getAccessToken()) {
      setIsAuthenticated(true);
      loadChats();
      fetch("/api/auth/config")
        .then((r) => r.json())
        .then((c) => setDnaDocUrl(c.dna_doc_url ?? null))
        .catch(() => {});
    }
  }, [loadChats]);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
    if (!activeChatId || !isAuthenticated) return;
    loadMessages(activeChatId);
  }, [activeChatId, isAuthenticated, loadMessages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  function handleLogout() {
    setIsAuthenticated(false);
    setActiveChatId(null);
    setChats([]);
    setMessages([]);
  }

  async function handleDeleteChat(id: string) {
    if (!confirm("Delete this chat?")) return;
    await fetch(`/api/chats/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (activeChatId === id) {
      setActiveChatId(null);
      setMessages([]);
    }
    loadChats();
  }

  function stopStreaming() {
    abortRef.current?.abort();
  }

  async function sendMessage() {
    if (!input.trim() || !activeChatId || loading) return;

    const text = input.trim();
    setInput("");
    setLoading(true);
    setStreamingCitations([]);
    setStreamingText("");
    setStreamingDocUrl(null);
    setMessages((prev) => [...prev, { role: "user", content: text }]);

    const abort = new AbortController();
    abortRef.current = abort;

    let assistantText = "";
    let citations: string[] = [];

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ prompt: text, chat_id: activeChatId }),
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
            citations = payload.citations || [];
            setStreamingCitations(citations);
          } else if (payload.type === "token") {
            assistantText += payload.text;
            setStreamingText(assistantText);
          } else if (payload.type === "error") {
            throw new Error(payload.message);
          }
        }
      }

      setStreamingText("");
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        // User stopped — partial text already visible, just clear streaming state
      } else {
        const msg = err instanceof Error ? err.message : "Request failed";
        setMessages((prev) => [...prev, { role: "model", content: `Error: ${msg}` }]);
      }
      setStreamingText("");
    } finally {
      setLoading(false);
      setStreamingCitations([]);
      abortRef.current = null;
      // Reload from DB to get the authoritative saved messages
      if (activeChatIdRef.current) {
        loadMessages(activeChatIdRef.current);
      }
    }
  }

  const profilePicture = getProfilePicture();

  return (
    <div className="app-container">
      {!isAuthenticated && (
        <LoginOverlay
          onLogin={() => {
            setIsAuthenticated(true);
            loadChats();
          }}
        />
      )}
      <NewChatModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(id) => {
          loadChats();
          setActiveChatId(id);
        }}
      />

      {isAuthenticated && (
        <Sidebar
          chats={chats}
          activeChatId={activeChatId}
          onSelect={setActiveChatId}
          onDelete={handleDeleteChat}
          onNewChat={() => setModalOpen(true)}
        />
      )}

      <div className="main-chat">
        <div className="header">
          <div className="header-title">
            <h1>{advisorName}</h1>
          </div>
          {isAuthenticated && <LogoutButton onLogout={handleLogout} />}
        </div>

        <div className="chat-messages" ref={chatboxRef}>
          <div className="chat-messages-inner">
            {!isAuthenticated ? null : !activeChatId ? (
              <div className="empty-chat">Select or create a chat to begin.</div>
            ) : messages.length === 0 ? (
              <div className="message">
                <div className="avatar ai">AI</div>
                <div className="message-content">
                  Hi! How can I assist you today?
                </div>
              </div>
            ) : (
              messages.map((msg, idx) => (
                <div key={idx} className="message">
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
                    {msg.role !== "user" && dnaDocUrl && (
                      <a
                        href={dnaDocUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="doc-link"
                      >
                        View source document →
                      </a>
                    )}
                  </div>
                </div>
              ))
            )}
            {loading && (streamingText || streamingCitations.length > 0) && (
              <div className="message">
                <div className="avatar ai">AI</div>
                <div className="message-content">
                  {streamingText ? (
                    <>
                      <div
                        dangerouslySetInnerHTML={{
                          __html: marked.parse(streamingText),
                        }}
                      />
                      {dnaDocUrl && (
                        <a
                          href={dnaDocUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="doc-link"
                        >
                          View source document →
                        </a>
                      )}
                    </>
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
              <div className="message">
                <div className="avatar ai">AI</div>
                <div className="message-content">
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
              type="text"
              placeholder="Message..."
              value={input}
              disabled={!isAuthenticated || !activeChatId || loading}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            />
            {loading ? (
              <button onClick={stopStreaming} type="button" className="stop-btn">
                <svg viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" />
                </svg>
              </button>
            ) : (
              <button
                disabled={!isAuthenticated || !activeChatId}
                onClick={sendMessage}
                type="button"
              >
                <svg viewBox="0 0 24 24">
                  <path d="M3 20V4L22 12L3 20ZM5 17L16.85 12L5 7V10.5L11 12L5 13.5V17Z" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
