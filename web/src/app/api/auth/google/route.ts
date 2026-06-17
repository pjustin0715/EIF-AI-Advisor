import { OAuth2Client } from "google-auth-library";
import { NextRequest, NextResponse } from "next/server";
import { createAccessToken } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const { credential } = await req.json();
  const clientId = process.env.GOOGLE_CLIENT_ID;

  if (!credential || !clientId) {
    return NextResponse.json({ detail: "Invalid request" }, { status: 400 });
  }

  try {
    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: clientId,
    });
    const payload = ticket.getPayload();
    const email = payload?.email;
    const picture = payload?.picture;

    if (!email) {
      return NextResponse.json({ detail: "Email not found in token" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("allowed_users")
      .select("email, is_active")
      .eq("email", email)
      .maybeSingle();

    if (!data || data.is_active === false) {
      return NextResponse.json(
        { detail: "Please sign in with your EIF Google account" },
        { status: 403 }
      );
    }

    const access_token = await createAccessToken(email);
    return NextResponse.json({
      access_token,
      token_type: "bearer",
      picture,
    });
  } catch {
    return NextResponse.json({ detail: "Invalid Google token" }, { status: 401 });
  }
}
