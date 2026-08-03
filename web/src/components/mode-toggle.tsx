"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";

export function ModeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="mode-toggle-container">
      <span className="mode-toggle-label">Theme</span>
      <div className="mode-toggle-options">
        <button
          className={`mode-toggle-option ${theme === "light" ? "active" : ""}`}
          onClick={() => setTheme("light")}
          title="Light mode"
          type="button"
        >
          <Sun className="h-4 w-4" />
        </button>
        <button
          className={`mode-toggle-option ${theme === "dark" ? "active" : ""}`}
          onClick={() => setTheme("dark")}
          title="Dark mode"
          type="button"
        >
          <Moon className="h-4 w-4" />
        </button>
        <button
          className={`mode-toggle-option ${theme === "system" ? "active" : ""}`}
          onClick={() => setTheme("system")}
          title="System mode"
          type="button"
        >
          <span className="text-xs font-semibold">OS</span>
        </button>
      </div>
    </div>
  );
}
