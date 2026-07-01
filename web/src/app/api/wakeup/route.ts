import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const baseUrl = process.env.RAG_SERVICE_URL || "http://localhost:8001";
  try {
    // Simply fetch the health endpoint to wake up the Render service
    // We don't await the text/json so it fails/succeeds quickly
    await fetch(`${baseUrl}/health`, { cache: "no-store", signal: AbortSignal.timeout(3000) }).catch(() => {});
    return NextResponse.json({ status: "pinged" });
  } catch (error) {
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}
