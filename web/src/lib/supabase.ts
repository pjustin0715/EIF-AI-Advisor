import { createClient } from "@supabase/supabase-js";

export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error("Supabase is not configured");
  }
  return createClient(url, key);
}

export const ADVISORS: Record<string, { name: string }> = {
  advisor1: { name: "Data Dashboard Advisor" },
  advisor2: { name: "SSOT Memo Advisor" },
  advisor3: { name: "Data Modeling Advisor" },
};
