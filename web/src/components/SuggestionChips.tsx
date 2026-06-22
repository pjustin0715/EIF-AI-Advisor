"use client";

import type { Suggestion } from "@/lib/suggestions";

interface Props {
  suggestions: Suggestion[];
  onSelect: (query: string) => void;
  disabled?: boolean;
}

export default function SuggestionChips({ suggestions, onSelect, disabled }: Props) {
  return (
    <div className="suggestion-chips">
      {suggestions.map((s) => (
        <button
          key={s.query}
          className="suggestion-chip"
          disabled={disabled}
          onClick={() => onSelect(s.query)}
          type="button"
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
