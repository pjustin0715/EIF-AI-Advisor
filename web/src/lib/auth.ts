import { SignJWT, jwtVerify } from "jose";
import { NextRequest } from "next/server";

const ALGORITHM = "HS256";
const EXPIRE_MINUTES = 30;

function getSecret() {
  const key = process.env.SECRET_KEY || process.env.NEXTAUTH_SECRET;
  if (!key) throw new Error("SECRET_KEY is not configured");
  return new TextEncoder().encode(key);
}

export async function createAccessToken(email: string): Promise<string> {
  const { getSupabaseAdmin } = await import("./supabase");
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from("allowed_users").select("role").eq("email", email).single();
  const role = data?.role || "eif";

  return new SignJWT({ sub: email, role })
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(`${EXPIRE_MINUTES}m`)
    .sign(getSecret());
}

export async function getCurrentUser(
  req: NextRequest
): Promise<{ email: string; role: string } | null> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;

  try {
    const { payload } = await jwtVerify(auth.slice(7), getSecret());
    const email = payload.sub;
    const role = (payload.role as string) || "eif";
    if (!email || typeof email !== "string") return null;
    return { email, role };
  } catch {
    return null;
  }
}
