"use client";
import { MessageCircle, MoreHorizontal, PanelLeft, Plus, SlidersHorizontal, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  onToggleSidebar: () => void;
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
  onToggleSidebar,
}: Props) {
  const selectedCount = selectedIds.size;

  return (
    <div className="sidebar">
      <div className="sidebar-top">
        <span className="sidebar-brand">EIF AI Advisor</span>
        <button
          className="sidebar-toggle-btn"
          onClick={onToggleSidebar}
          title="Hide sidebar"
          type="button"
          aria-label="Hide sidebar"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
      </div>

      <div className="sidebar-new">
        <button className="new-chat-btn" onClick={onNewChat} title="New Chat" type="button">
          <Plus className="h-4 w-4" />
          <span>New</span>
        </button>
      </div>

      <div className={`sidebar-section-header ${selectMode ? "selecting" : ""}`}>
        <div className="sidebar-section-title">
          <h2>Chats</h2>
          {!selectMode && (
            <button
              className="sidebar-icon-btn"
              onClick={onToggleSelectMode}
              title="Select chats"
              type="button"
              aria-label="Select chats"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {selectMode && (
          <div className="select-toolbar">
            <span className="select-count">{selectedCount} selected</span>
            <button className="select-pill" onClick={onSelectAll} type="button">
              Select all
            </button>
            {selectedCount > 0 && (
              <button className="select-pill danger" onClick={onBulkDelete} type="button">
                Delete
              </button>
            )}
            <button
              className="select-pill icon"
              onClick={onToggleSelectMode}
              title="Exit selection"
              type="button"
              aria-label="Exit selection"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

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
                <MessageCircle className="chat-item-icon" />
                <span className="chat-title">{chat.title}</span>
                {!selectMode && (
                  <div
                    className="chat-options-container"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className="delete-btn"
                          type="button"
                          aria-label="Chat options"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" side="bottom">
                        <DropdownMenuItem onSelect={() => onShare(chat.id)}>
                          Share
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onRename(chat.id)}>
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => onDelete(chat.id)}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
