import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  corePlugins: {
    // Preserve existing globals.css layout; only use Tailwind utilities for shadcn UI.
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        border: "var(--sidebar-border)",
        input: "var(--input-border)",
        ring: "var(--primary)",
        background: "var(--bg-color)",
        foreground: "var(--text-main)",
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "#ffffff",
        },
        secondary: {
          DEFAULT: "var(--sidebar-bg)",
          foreground: "var(--text-main)",
        },
        destructive: {
          DEFAULT: "var(--error)",
          foreground: "#ffffff",
        },
        muted: {
          DEFAULT: "var(--sidebar-bg)",
          foreground: "var(--text-muted)",
        },
        accent: {
          DEFAULT: "var(--item-hover)",
          foreground: "var(--text-main)",
        },
        popover: {
          DEFAULT: "var(--bg-color)",
          foreground: "var(--text-main)",
        },
        card: {
          DEFAULT: "var(--bg-color)",
          foreground: "var(--text-main)",
        },
      },
      borderRadius: {
        lg: "0.5rem",
        md: "0.375rem",
        sm: "0.25rem",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [animate],
};

export default config;
