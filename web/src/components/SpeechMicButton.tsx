"use client";

import { Mic, MicOff } from "lucide-react";

interface Props {
  listening: boolean;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "empty";
  title?: string;
}

export default function SpeechMicButton({
  listening,
  onClick,
  disabled = false,
  variant = "default",
  title,
}: Props) {
  const defaultTitle = listening
    ? "Stop voice input"
    : "Start voice input";

  return (
    <button
      type="button"
      className={`mic-btn ${variant === "empty" ? "mic-btn--empty" : ""} ${
        listening ? "mic-btn--listening" : ""
      }`}
      onClick={onClick}
      disabled={disabled}
      title={title ?? defaultTitle}
      aria-label={title ?? defaultTitle}
      aria-pressed={listening}
    >
      {listening ? (
        <MicOff aria-hidden="true" />
      ) : (
        <Mic aria-hidden="true" />
      )}
    </button>
  );
}
