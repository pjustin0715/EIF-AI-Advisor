"use client";

import { ADVISOR_NAMES, getSuggestions } from "@/lib/suggestions";
import SuggestionChips from "./SuggestionChips";
import SpeechMicButton from "./SpeechMicButton";

interface Props {
  input: string;
  loading: boolean;
  advisorId: string;
  advisors: Record<string, { name: string; purpose?: string }>;
  onAdvisorChange: (id: string) => void;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onSuggestionSelect: (query: string) => void;
  speechListening: boolean;
  speechError: string | null;
  onSpeechToggle: () => void;
}

export default function EmptyChatState({
  input,
  loading,
  advisorId,
  advisors,
  onAdvisorChange,
  onInputChange,
  onSend,
  onSuggestionSelect,
  speechListening,
  speechError,
  onSpeechToggle,
}: Props) {
  const suggestions = getSuggestions(advisorId);
  const advisorEntries = Object.entries(advisors);
  const advisorName =
    advisors[advisorId]?.name ?? ADVISOR_NAMES[advisorId] ?? "EIF Advisor";

  return (
    <div className="empty-chat-state">
      <div className="empty-chat-content">
        <h2 className="empty-greeting">How can I help you today?</h2>
        <p className="empty-subtitle">
          Ask about dashboards, SSOT memos, data modeling, and more — grounded in
          Eskwelabs EIF documentation.
        </p>

        <div className="advisor-pills">
          {(advisorEntries.length > 0
            ? advisorEntries
            : Object.entries(ADVISOR_NAMES)
          ).map(([id, nameOrEntry]) => {
            const name =
              typeof nameOrEntry === "string"
                ? nameOrEntry
                : nameOrEntry.name;
            return (
            <button
              key={id}
              className={`advisor-pill ${id === advisorId ? "active" : ""}`}
              onClick={() => onAdvisorChange(id)}
              type="button"
            >
              {name}
            </button>
            );
          })}
        </div>

        {speechError && (
          <p className="speech-error" role="alert">
            {speechError}
          </p>
        )}
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
          <SpeechMicButton
            listening={speechListening}
            onClick={onSpeechToggle}
            disabled={loading}
            variant="empty"
          />
          <button
            className="send-btn"
            disabled={loading || !input.trim()}
            onClick={onSend}
            type="button"
          >
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
