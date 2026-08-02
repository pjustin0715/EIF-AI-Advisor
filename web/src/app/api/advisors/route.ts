import { NextResponse } from "next/server";
import { getRagServiceUrl, ragServiceHeaders } from "@/lib/rag-config";

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const baseUrl = getRagServiceUrl();
    
    const res = await fetch(`${baseUrl}/advisors`, {
      headers: ragServiceHeaders(),
      cache: 'no-store'
    });
    
    if (!res.ok) {
      throw new Error("Failed to fetch advisors");
    }
    
    const data = await res.json();
    
    // Transform from array to object for the frontend
    const advisorsMap: Record<string, { name: string, purpose?: string }> = {};
    for (const adv of data.advisors) {
      advisorsMap[adv.id] = { name: adv.name, purpose: adv.purpose };
    }
    
    return NextResponse.json(advisorsMap);
  } catch (e) {
    console.error("Advisors GET error:", e);
    // Fallback so it doesn't break
    return NextResponse.json({ advisor1: { name: "AI Advisor" } });
  }
}
