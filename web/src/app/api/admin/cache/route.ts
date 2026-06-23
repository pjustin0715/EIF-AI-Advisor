import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const baseUrl = process.env.RAG_SERVICE_URL || "http://localhost:8001";
  const secret = process.env.RAG_SERVICE_SECRET || "";

  try {
    const res = await fetch(`${baseUrl}/reindex?force=true`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "X-RAG-Secret": secret } : {}),
      },
    });

    if (!res.ok) {
      throw new Error(`RAG service error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
