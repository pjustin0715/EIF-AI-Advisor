import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { visibleMessages, type HistoryMessage } from "@/lib/context-window";
import { citationsForViewer } from "@/lib/retrieval";
import { getSupabaseAdmin } from "@/lib/supabase";
import { buildTurnLock } from "@/lib/turn-lock";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data: chat, error: chatError } = await supabase
    .from("chats")
    .select("*")
    .eq("share_token", params.token)
    .single();

  if (chatError || !chat || !chat.shared_at) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  const { data: messages } = await supabase
    .from("messages")
    .select("*")
    .eq("chat_id", chat.id)
    .order("created_at", { ascending: true });

  const isAdmin = user.role === "admin";
  const safeMessages = visibleMessages(
    (messages || []) as HistoryMessage[]
  ).map((msg) => ({
    ...msg,
    citations: citationsForViewer(
      (msg as { citations?: unknown }).citations,
      isAdmin
    ),
  }));

  const turn_lock = buildTurnLock(
    chat.turn_locked_by as string | null,
    chat.turn_locked_until as string | null
  );

  return NextResponse.json({
    chat: {
      id: chat.id,
      title: chat.title,
      advisor_id: chat.advisor_id,
      shared_at: chat.shared_at,
      share_token: chat.share_token,
      user_email: chat.user_email,
    },
    messages: safeMessages,
    turn_lock,
  });
}
