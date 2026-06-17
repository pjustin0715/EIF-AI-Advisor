import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data: chat, error: chatError } = await supabase
    .from("chats")
    .select("*")
    .eq("id", params.id)
    .eq("user_email", user.email)
    .maybeSingle();

  if (chatError || !chat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  const { data: messages } = await supabase
    .from("messages")
    .select("*")
    .eq("chat_id", params.id)
    .order("created_at", { ascending: true });

  return NextResponse.json({ chat, messages: messages || [] });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data: chat } = await supabase
    .from("chats")
    .select("id")
    .eq("id", params.id)
    .eq("user_email", user.email)
    .maybeSingle();

  if (!chat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  await supabase.from("chats").delete().eq("id", params.id);
  return NextResponse.json({ status: "success" });
}
