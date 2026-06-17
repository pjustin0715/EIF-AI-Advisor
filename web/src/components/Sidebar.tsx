"use client";

interface Chat {
  id: string;
  title: string;
}

interface Props {
  chats: Chat[];
  activeChatId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onNewChat: () => void;
}

export default function Sidebar({
  chats,
  activeChatId,
  onSelect,
  onDelete,
  onNewChat,
}: Props) {
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>Chats</h2>
        <button className="new-chat-btn" onClick={onNewChat} title="New Chat" type="button">
          +
        </button>
      </div>
      <div className="chat-list">
        {chats.map((chat) => (
          <div
            key={chat.id}
            className={`chat-item ${chat.id === activeChatId ? "active" : ""}`}
            onClick={() => onSelect(chat.id)}
            onKeyDown={(e) => e.key === "Enter" && onSelect(chat.id)}
            role="button"
            tabIndex={0}
          >
            <span className="chat-title">{chat.title}</span>
            <button
              className="delete-btn"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(chat.id);
              }}
              type="button"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
