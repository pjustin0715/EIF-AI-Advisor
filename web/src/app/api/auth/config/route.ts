import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    google_client_id: process.env.GOOGLE_CLIENT_ID || "",
  });
}
