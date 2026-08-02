"use client";

import { useEffect, useState } from "react";
import { marked } from "marked";
import CopyMessageButton from "@/components/CopyMessageButton";
import LoginOverlay from "@/components/LoginOverlay";
import RetrievalPanel from "@/components/RetrievalPanel";
import {
  authHeaders,
  getAccessToken,
  isAdminUser,
} from "@/lib/auth-client";
import { extractNextQuestion } from "@/lib/next-question";
import { normalizeCitations } from "@/lib/retrieval";

export default function SharedChatPage({ params }: { params: { token: string } }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [chat, setChat] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = getAccessToken();
    if (token) {
      setIsAuthenticated(true);
      setIsAdmin(isAdminUser());
      fetchChat();
    } else {
      setLoading(false);
    }
  }, []);

  const fetchChat = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/share/${params.token}`, {
        headers: authHeaders(),
      });
      if (!res.ok) {
        if (res.status === 404) setError("Shared chat not found.");
        else if (res.status === 401) setError("Unauthorized access.");
        else setError("Failed to load shared chat.");
        return;
      }
      const data = await res.json();
      setChat(data.chat);
      setMessages(data.messages);
    } catch (err) {
      setError("An error occurred while fetching the shared chat.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = () => {
    setIsAuthenticated(true);
    setIsAdmin(isAdminUser());
    fetchChat();
  };

  if (!isAuthenticated) {
    return <LoginOverlay onLogin={handleLogin} />;
  }

  if (loading) {
    return (
      <div className="app-container">
        <div className="main-chat" style={{ justifyContent: "center", alignItems: "center" }}>
          Loading shared chat...
        </div>
      </div>
    );
  }

  if (error || !chat) {
    return (
      <div className="app-container">
        <div className="main-chat" style={{ justifyContent: "center", alignItems: "center", color: "var(--error)" }}>
          {error || "Shared chat not found."}
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <div className="main-chat">
        <div className="header">
          <div className="header-title" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <h1>{chat.title}</h1>
            <span style={{ fontSize: "0.85rem", color: "#888", backgroundColor: "#333", padding: "4px 8px", borderRadius: "12px" }}>Shared Snapshot</span>
          </div>
        </div>
        <div className="chat-messages">
          <div className="chat-messages-inner">
            {(!messages || messages.length === 0) ? (
              <div className="empty-chat">No messages in this snapshot.</div>
            ) : (
              messages.map((msg: any, idx: number) => (
                <div key={idx} className={`message ${msg.role === "user" ? "message--user" : "message--ai"}`}>
                  <div className={`avatar ${msg.role === "user" ? "user" : "ai"}`}>
                    {msg.role === "user" ? (
                      "U"
                    ) : (
                      <img
                        src="/eskwelabs-logo.png"
                        alt="Eskwelabs AI"
                        className="avatar-img"
                      />
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
                            .find((m: { role?: string }) => m.role === "user")
                            ?.content || null
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
                    {msg.role !== "user" && (
                      <CopyMessageButton
                        text={extractNextQuestion(msg.content || "").body}
                      />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
