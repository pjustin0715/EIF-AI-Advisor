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

  const { data: chat } = await supabase
    .from("chats")
    .select("share_token")
    .eq("id", chat_id)
    .eq("user_email", user.email)
    .single();

  if (!chat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  await supabase
    .from("chats")
    .update({ shared_at: new Date().toISOString() })
    .eq("id", chat_id);

  return NextResponse.json({ share_token: chat.share_token });
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { chat_id, rotate } = await req.json();
  if (!chat_id) {
    return NextResponse.json({ error: "Missing chat_id" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: chat } = await supabase
    .from("chats")
    .select("share_token")
    .eq("id", chat_id)
    .eq("user_email", user.email)
    .single();

  if (!chat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {
    shared_at: null,
    turn_locked_by: null,
    turn_locked_until: null,
  };

  if (rotate) {
    updates.share_token = crypto.randomUUID();
  }

  await supabase.from("chats").update(updates).eq("id", chat_id);

  return NextResponse.json({
    status: "revoked",
    share_token: rotate ? updates.share_token : chat.share_token,
  });
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { chat_id } = await req.json();
  if (!chat_id) {
    return NextResponse.json({ error: "Missing chat_id" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: chat } = await supabase
    .from("chats")
    .select("id, shared_at")
    .eq("id", chat_id)
    .eq("user_email", user.email)
    .single();

  if (!chat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  const newToken = crypto.randomUUID();
  const updates: Record<string, unknown> = {
    share_token: newToken,
    turn_locked_by: null,
    turn_locked_until: null,
  };
  if (!chat.shared_at) {
    updates.shared_at = new Date().toISOString();
  }

  await supabase.from("chats").update(updates).eq("id", chat_id);

  return NextResponse.json({ share_token: newToken });
}
