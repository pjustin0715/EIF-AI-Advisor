"use client";
import { useState } from "react";

interface Chat {
  id: string;
  title: string;
}

interface Props {
  chats: Chat[];
  activeChatId: string | null;
  selectMode: boolean;
  selectedIds: Set<string>;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onNewChat: () => void;
  onToggleSelectMode: () => void;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onBulkDelete: () => void;
  onShare: (id: string) => void;
  onRename: (id: string) => void;
}

export default function Sidebar({
  chats,
  activeChatId,
  selectMode,
  selectedIds,
  onSelect,
  onDelete,
  onNewChat,
  onToggleSelectMode,
  onToggleSelect,
  onSelectAll,
  onBulkDelete,
  onShare,
  onRename,
}: Props) {
  const selectedCount = selectedIds.size;
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);


  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>Chats</h2>
        <div className="sidebar-actions">
          {!selectMode && (
            <button
              className="select-mode-btn"
              onClick={onToggleSelectMode}
              title="Select chats"
              type="button"
            >
              Select
            </button>
          )}
          {!selectMode && (
            <button className="new-chat-btn" onClick={onNewChat} title="New Chat" type="button">
              +
            </button>
          )}
        </div>
      </div>

      {selectMode && (
        <div className="select-toolbar">
          <button className="toolbar-btn" onClick={onSelectAll} type="button">
            {selectedCount === chats.length ? "Deselect all" : "Select all"}
          </button>
          <button
            className="toolbar-btn danger"
            disabled={selectedCount === 0}
            onClick={onBulkDelete}
            type="button"
          >
            Delete{selectedCount > 0 ? ` (${selectedCount})` : ""}
          </button>
          <button className="toolbar-btn" onClick={onToggleSelectMode} type="button">
            Cancel
          </button>
        </div>
      )}

      <div className="chat-list">
        {chats.length === 0 ? (
          <p className="sidebar-empty">No chats yet</p>
        ) : (
          chats.map((chat) => {
            const isSelected = selectedIds.has(chat.id);
            return (
              <div
                key={chat.id}
                className={`chat-item ${!selectMode && chat.id === activeChatId ? "active" : ""} ${selectMode && isSelected ? "selected" : ""}`}
                onClick={() => {
                  if (selectMode) {
                    onToggleSelect(chat.id);
                  } else {
                    onSelect(chat.id);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    selectMode ? onToggleSelect(chat.id) : onSelect(chat.id);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                {selectMode && (
                  <input
                    type="checkbox"
                    className="chat-checkbox"
                    checked={isSelected}
                    onChange={() => onToggleSelect(chat.id)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Select ${chat.title}`}
                  />
                )}
                <span className="chat-title">{chat.title}</span>
                {!selectMode && (
                  <div className="chat-options-container" style={{ position: "relative" }}>
                    <button
                      className="options-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenDropdownId(openDropdownId === chat.id ? null : chat.id);
                      }}
                      type="button"
                      aria-label="Chat options"
                    >
                      ...
                    </button>
                    {openDropdownId === chat.id && (
                      <div className="dropdown-menu" style={{ position: "absolute", right: 0, top: "100%", background: "#222", border: "1px solid #444", borderRadius: 4, zIndex: 10, padding: 4 }}>
                        <button
                          style={{ display: "block", width: "100%", textAlign: "left", padding: "4px 8px", background: "none", border: "none", color: "white", cursor: "pointer" }}
                          onClick={(e) => { e.stopPropagation(); setOpenDropdownId(null); onShare(chat.id); }}
                        >
                          Share
                        </button>
                        <button
                          style={{ display: "block", width: "100%", textAlign: "left", padding: "4px 8px", background: "none", border: "none", color: "white", cursor: "pointer" }}
                          onClick={(e) => { e.stopPropagation(); setOpenDropdownId(null); onRename(chat.id); }}
                        >
                          Rename
                        </button>
                        <button
                          style={{ display: "block", width: "100%", textAlign: "left", padding: "4px 8px", background: "none", border: "none", color: "#ff4444", cursor: "pointer" }}
                          onClick={(e) => { e.stopPropagation(); setOpenDropdownId(null); onDelete(chat.id); }}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
