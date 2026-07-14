import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { chat_id } = await req.json();
  if (!chat_id) {
    return NextResponse.json({ error: "Missing chat_id" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  
  // Verify ownership
  const { data: chat } = await supabase
    .from("chats")
    .select("share_token")
    .eq("id", chat_id)
    .eq("user_email", user.email)
    .single();

  if (!chat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  // Update shared_at
  await supabase
    .from("chats")
    .update({ shared_at: new Date().toISOString() })
    .eq("id", chat_id);

  return NextResponse.json({ share_token: chat.share_token });
}
