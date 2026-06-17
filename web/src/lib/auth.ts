import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { getSupabaseAdmin } from "./supabase";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      try {
        const supabase = getSupabaseAdmin();
        const { data } = await supabase
          .from("allowed_users")
          .select("email, is_active")
          .eq("email", user.email)
          .maybeSingle();

        if (!data || data.is_active === false) {
          return "/?error=AccessDenied";
        }
        return true;
      } catch {
        return false;
      }
    },
    async session({ session }) {
      return session;
    },
  },
  pages: {
    signIn: "/",
    error: "/",
  },
  secret: process.env.NEXTAUTH_SECRET,
};
