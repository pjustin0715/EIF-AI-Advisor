import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  
  // Fetch all turn logs to aggregate costs
  const { data: logs, error } = await supabase
    .from("turn_logs")
    .select("user_email, model, prompt_tokens, completion_tokens, est_cost_usd");
    
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Group stats by user
  const stats: Record<string, any> = {};
  for (const log of logs || []) {
    const email = log.user_email || "Unknown";
    if (!stats[email]) {
      stats[email] = { 
        email, 
        totalCost: 0, 
        totalTokens: 0, 
        models: new Set() 
      };
    }
    stats[email].totalCost += Number(log.est_cost_usd) || 0;
    stats[email].totalTokens += (log.prompt_tokens || 0) + (log.completion_tokens || 0);
    if (log.model) stats[email].models.add(log.model);
  }

  // Format response and sort by highest cost
  const formattedStats = Object.values(stats).map(s => ({
    ...s,
    models: Array.from(s.models)
  })).sort((a, b) => b.totalCost - a.totalCost);

  return NextResponse.json({ stats: formattedStats });
}
