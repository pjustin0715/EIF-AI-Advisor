"use client";

import ChatInterface from "@/components/ChatInterface";

export default function SharedChatPage({
  params,
}: {
  params: { token: string };
}) {
  return <ChatInterface mode="shared" shareToken={params.token} />;
}
