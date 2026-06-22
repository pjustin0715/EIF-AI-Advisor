"use client";

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
}: Props) {
  const selectedCount = selectedIds.size;

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
                  <button
                    className="delete-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(chat.id);
                    }}
                    type="button"
                    aria-label="Delete chat"
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
