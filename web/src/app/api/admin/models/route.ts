import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data: models, error } = await supabase
    .from("advisor_models")
    .select("*")
    .eq("is_active", true)
    .order("advisor_id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ models });
}

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { advisor_id, model_name } = await req.json();
  if (!advisor_id || !model_name) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // First deactivate all active models for this advisor
  await supabase
    .from("advisor_models")
    .update({ is_active: false })
    .eq("advisor_id", advisor_id);

  // Then insert the new model or set it active if it already exists
  const { error } = await supabase
    .from("advisor_models")
    .upsert(
      { advisor_id, model_name, is_active: true },
      { onConflict: "advisor_id, model_name" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
