import { NextResponse } from "next/server";
import { ADVISORS } from "@/lib/supabase";

export async function GET() {
  return NextResponse.json(ADVISORS);
}
