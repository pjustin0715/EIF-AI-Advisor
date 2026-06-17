"use client";

import { SessionProvider } from "next-auth/react";
import ChatInterface from "@/components/ChatInterface";

export default function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}

export { ChatInterface };
