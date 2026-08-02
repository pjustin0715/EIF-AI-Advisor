"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  0: { transcript: string };
}

interface SpeechRecognitionEventLike extends Event {
  results: SpeechRecognitionResultListLike;
}

interface SpeechRecognitionResultListLike {
  length: number;
  [index: number]: SpeechRecognitionResultLike;
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

interface WindowWithSpeechRecognition extends Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const win = window as WindowWithSpeechRecognition;
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}

function mapSpeechError(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access blocked. Allow mic in your browser settings.";
    case "no-speech":
      return "No speech detected. Try again.";
    case "audio-capture":
      return "No microphone found.";
    case "network":
      return "Voice input failed due to a network error.";
    case "aborted":
      return "";
    default:
      return "Voice input failed. Try again.";
  }
}

function joinBaseAndSpoken(base: string, spoken: string): string {
  const trimmedBase = base.trimEnd();
  const trimmedSpoken = spoken.trim();
  if (!trimmedSpoken) return trimmedBase;
  if (!trimmedBase) return trimmedSpoken;
  return `${trimmedBase} ${trimmedSpoken}`;
}

export interface UseSpeechRecognitionOptions {
  onTranscript: (text: string) => void;
  getBaseText: () => string;
}

export interface UseSpeechRecognitionResult {
  supported: boolean;
  listening: boolean;
  error: string | null;
  start: () => void;
  stop: () => void;
  toggle: () => void;
}

export function useSpeechRecognition({
  onTranscript,
  getBaseText,
}: UseSpeechRecognitionOptions): UseSpeechRecognitionResult {
  const [supported] = useState(() => getSpeechRecognitionCtor() !== null);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const baseTextRef = useRef("");
  const intentionalStopRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);
  const getBaseTextRef = useRef(getBaseText);

  onTranscriptRef.current = onTranscript;
  getBaseTextRef.current = getBaseText;

  const stop = useCallback(() => {
    intentionalStopRef.current = true;
    const active = recognitionRef.current;
    recognitionRef.current = null;
    setListening(false);
    active?.stop();
  }, []);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setError(
        "Voice input isn't supported in this browser. Try Chrome or Edge."
      );
      return;
    }

    if (recognitionRef.current) {
      intentionalStopRef.current = true;
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }

    setError(null);
    intentionalStopRef.current = false;
    baseTextRef.current = getBaseTextRef.current();

    const recognition = new Ctor();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      if (recognitionRef.current !== recognition) return;

      let finalTranscript = "";
      let interimTranscript = "";

      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      const spoken = `${finalTranscript}${interimTranscript}`;
      onTranscriptRef.current(
        joinBaseAndSpoken(baseTextRef.current, spoken)
      );
    };

    recognition.onerror = (event) => {
      if (recognitionRef.current !== recognition) return;

      const message = mapSpeechError(event.error);
      if (message) {
        setError(message);
      }
      intentionalStopRef.current = true;
      recognitionRef.current = null;
      setListening(false);
    };

    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return;

      recognitionRef.current = null;
      setListening(false);
      if (!intentionalStopRef.current) {
        setError(
          "Voice input stopped unexpectedly. Click the mic to try again."
        );
      }
      intentionalStopRef.current = false;
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setListening(true);
    } catch {
      recognitionRef.current = null;
      setError("Could not start voice input. Try again.");
      setListening(false);
    }
  }, [supported]);

  const toggle = useCallback(() => {
    if (!supported) {
      setError(
        "Voice input isn't supported in this browser. Try Chrome or Edge."
      );
      return;
    }
    if (listening) {
      stop();
    } else {
      start();
    }
  }, [listening, start, stop, supported]);

  useEffect(() => {
    return () => {
      intentionalStopRef.current = true;
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  return {
    supported,
    listening,
    error,
    start,
    stop,
    toggle,
  };
}
