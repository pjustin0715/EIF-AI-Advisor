"use client";

import { ADVISOR_NAMES, getSuggestions } from "@/lib/suggestions";
import SuggestionChips from "./SuggestionChips";

interface Props {
  input: string;
  loading: boolean;
  advisorId: string;
  onAdvisorChange: (id: string) => void;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onSuggestionSelect: (query: string) => void;
}

export default function EmptyChatState({
  input,
  loading,
  advisorId,
  onAdvisorChange,
  onInputChange,
  onSend,
  onSuggestionSelect,
}: Props) {
  const suggestions = getSuggestions(advisorId);
  const advisorName = ADVISOR_NAMES[advisorId] ?? "EIF Advisor";

  return (
    <div className="empty-chat-state">
      <div className="empty-chat-content">
        <h2 className="empty-greeting">How can I help you today?</h2>
        <p className="empty-subtitle">
          Ask about dashboards, SSOT memos, data modeling, and more — grounded in
          Eskwelabs EIF documentation.
        </p>

        <div className="advisor-pills">
          {Object.entries(ADVISOR_NAMES).map(([id, name]) => (
            <button
              key={id}
              className={`advisor-pill ${id === advisorId ? "active" : ""}`}
              onClick={() => onAdvisorChange(id)}
              type="button"
            >
              {name}
            </button>
          ))}
        </div>

        <div className="empty-input-area">
          <input
            type="text"
            placeholder={`Ask the ${advisorName}…`}
            value={input}
            disabled={loading}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && onSend()}
            autoFocus
          />
          <button disabled={loading || !input.trim()} onClick={onSend} type="button">
            <svg viewBox="0 0 24 24">
              <path d="M3 20V4L22 12L3 20ZM5 17L16.85 12L5 7V10.5L11 12L5 13.5V17Z" />
            </svg>
          </button>
        </div>

        <SuggestionChips
          suggestions={suggestions}
          onSelect={onSuggestionSelect}
          disabled={loading}
        />
      </div>
    </div>
  );
}
