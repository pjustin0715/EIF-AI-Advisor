import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const baseUrl = process.env.RAG_SERVICE_URL || "http://localhost:8001";
    const secret = process.env.RAG_SERVICE_SECRET || "";
    
    const res = await fetch(`${baseUrl}/advisors`, {
      headers: secret ? { "X-RAG-Secret": secret } : {}
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
