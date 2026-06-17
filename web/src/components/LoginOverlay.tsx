"use client";

import { useEffect, useRef, useState } from "react";
import { clearAccessToken, setAccessToken } from "@/lib/auth-client";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: Record<string, string>
          ) => void;
        };
      };
    };
  }
}

interface Props {
  onLogin: () => void;
}

export default function LoginOverlay({ onLogin }: Props) {
  const [error, setError] = useState("");
  const buttonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function initGoogle() {
      try {
        const res = await fetch("/api/auth/config");
        const config = await res.json();
        if (!config.google_client_id || !window.google || !buttonRef.current) {
          setError("Google Client ID not configured.");
          return;
        }

        window.google.accounts.id.initialize({
          client_id: config.google_client_id,
          callback: async (response) => {
            setError("");
            try {
              const authRes = await fetch("/api/auth/google", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ credential: response.credential }),
              });
              if (authRes.ok) {
                const data = await authRes.json();
                setAccessToken(data.access_token, data.picture);
                onLogin();
              } else {
                const err = await authRes.json();
                setError(err.detail || "Login failed");
              }
            } catch {
              setError("Network error connecting to server.");
            }
          },
        });

        buttonRef.current.innerHTML = "";
        window.google.accounts.id.renderButton(buttonRef.current, {
          theme: "filled_black",
          size: "large",
          shape: "pill",
          text: "continue_with",
        });
      } catch {
        setError("Failed to reach server.");
      }
    }

    if (window.google) {
      initGoogle();
    } else {
      const interval = setInterval(() => {
        if (window.google) {
          clearInterval(interval);
          initGoogle();
        }
      }, 100);
      return () => clearInterval(interval);
    }
  }, [onLogin]);

  return (
    <div className="login-overlay">
      <div className="login-box">
        <h2>Need help with your track?</h2>
        <p className="subtitle">Your Personal EIF AI Advisor</p>
        {error && <div className="login-error">{error}</div>}
        <div ref={buttonRef} className="google-button-container" />
      </div>
    </div>
  );
}

export function LogoutButton({ onLogout }: { onLogout: () => void }) {
  return (
    <button
      className="logout-btn"
      onClick={() => {
        clearAccessToken();
        onLogout();
      }}
      type="button"
    >
      Logout
    </button>
  );
}
