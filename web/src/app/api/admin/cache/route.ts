import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getRagServiceUrl, ragServiceHeaders } from "@/lib/rag-config";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const baseUrl = getRagServiceUrl();

  try {
    const res = await fetch(`${baseUrl}/reindex?force=true`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...ragServiceHeaders(),
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
