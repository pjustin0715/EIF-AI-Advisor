"use client";
import {
  LayoutDashboard,
  LogOut,
  MessageCircle,
  MoreVertical,
  PanelLeft,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Share2,
  SlidersHorizontal,
  Trash2,
  User,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import SidebarChatSkeleton from "./SidebarChatSkeleton";
import { ModeToggle } from "./mode-toggle";

interface Chat {
  id: string;
  title: string;
  pinned?: boolean;
}

interface Props {
  chats: Chat[];
  loading?: boolean;
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
  onPin: (id: string) => void;
  onToggleSidebar: () => void;
  userEmail?: string | null;
  profilePicture?: string | null;
  isAdmin?: boolean;
  onAdminDashboard?: () => void;
  onLogout: () => void;
}

export default function Sidebar({
  chats,
  loading = false,
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
  onPin,
  onToggleSidebar,
  userEmail,
  profilePicture,
  isAdmin = false,
  onAdminDashboard,
  onLogout,
}: Props) {
  const selectedCount = selectedIds.size;
  const displayName = userEmail
    ? userEmail.split("@")[0].replace(/[._]/g, " ")
    : "Account";
  const pinnedChats = chats.filter((c) => c.pinned);
  const recentChats = chats.filter((c) => !c.pinned);

  function renderChatItem(chat: Chat) {
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
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                side="right"
                sideOffset={8}
                onKeyDown={(e) => {
                  const key = e.key.toLowerCase();
                  if (key !== "s" && key !== "r" && key !== "d" && key !== "p") return;
                  e.preventDefault();
                  e.currentTarget
                    .querySelector<HTMLElement>(`[data-shortcut="${key}"]`)
                    ?.click();
                }}
              >
                <DropdownMenuItem
                  data-shortcut="p"
                  onSelect={() => onPin(chat.id)}
                >
                  {chat.pinned ? (
                    <PinOff className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                  ) : (
                    <Pin className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                  )}
                  {chat.pinned ? "Unpin" : "Pin"}
                  <span className="dropdown-menu-shortcut">P</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  data-shortcut="s"
                  onSelect={() => onShare(chat.id)}
                >
                  <Share2 className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                  Share
                  <span className="dropdown-menu-shortcut">S</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  data-shortcut="r"
                  onSelect={() => onRename(chat.id)}
                >
                  <Pencil className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                  Rename
                  <span className="dropdown-menu-shortcut">R</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  data-shortcut="d"
                  variant="destructive"
                  onSelect={() => onDelete(chat.id)}
                >
                  <Trash2 className="h-4 w-4 shrink-0" />
                  Delete
                  <span className="dropdown-menu-shortcut">D</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
    );
  }

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
        {loading ? (
          <SidebarChatSkeleton />
        ) : chats.length === 0 ? (
          <p className="sidebar-empty">No chats yet</p>
        ) : (
          <>
            {pinnedChats.length > 0 && (
              <div className="chat-group">
                <h3 className="chat-group-title">Pins</h3>
                {pinnedChats.map(renderChatItem)}
              </div>
            )}
            {recentChats.length > 0 && (
              <div className="chat-group">
                {pinnedChats.length > 0 && (
                  <h3 className="chat-group-title">Recents</h3>
                )}
                {recentChats.map(renderChatItem)}
              </div>
            )}
          </>
        )}
      </div>

      <div className="sidebar-footer">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="sidebar-profile-btn" type="button">
              <span className="sidebar-profile-avatar">
                {profilePicture ? (
                  <img src={profilePicture} alt="" className="avatar-img" />
                ) : (
                  <User className="h-4 w-4" />
                )}
              </span>
              <span className="sidebar-profile-name">{displayName}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" sideOffset={8} className="w-56">
            {isAdmin && (
              <>
                <DropdownMenuItem onSelect={onAdminDashboard}>
                  <LayoutDashboard className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                  Admin Dashboard
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <ModeToggle />
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onLogout}>
              <LogOut className="h-4 w-4 shrink-0" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
