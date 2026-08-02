import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { visibleMessages, type HistoryMessage } from "@/lib/context-window";
import { getSupabaseAdmin } from "@/lib/supabase";

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
    .lte("created_at", chat.shared_at)
    .order("created_at", { ascending: true });

  return NextResponse.json({
    chat,
    messages: visibleMessages((messages || []) as HistoryMessage[]),
  });
}
