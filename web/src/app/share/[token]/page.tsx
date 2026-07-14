import { getSupabaseAdmin } from "@/lib/supabase";
import { marked } from "marked";
import { notFound } from "next/navigation";

export default async function SharedChatPage({ params }: { params: { token: string } }) {
  const supabase = getSupabaseAdmin();
  
  const { data: chat } = await supabase
    .from("chats")
    .select("*")
    .eq("share_token", params.token)
    .single();

  if (!chat || !chat.shared_at) {
    notFound();
  }

  const { data: messages } = await supabase
    .from("messages")
    .select("*")
    .eq("chat_id", chat.id)
    .lte("created_at", chat.shared_at)
    .order("created_at", { ascending: true });

  return (
    <div className="app-container">
      <div className="main-chat">
        <div className="header">
          <div className="header-title" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <h1>{chat.title}</h1>
            <span style={{ fontSize: "0.85rem", color: "#888", backgroundColor: "#333", padding: "2px 8px", borderRadius: "12px" }}>Shared Snapshot</span>
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
                    {msg.role === "user" ? "U" : "AI"}
                  </div>
                  <div className="message-content">
                    <div dangerouslySetInnerHTML={{ __html: marked.parse(msg.content || "") }} />
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
