"use client";

import { signIn, signOut, useSession } from "next-auth/react";

export default function LoginOverlay() {
  const { status } = useSession();

  if (status === "authenticated") return null;

  return (
    <div className="login-overlay">
      <div className="login-box">
        <h2>Need help with your track?</h2>
        <p className="subtitle">Your Personal EIF AI Advisor</p>
        <button
          className="google-btn"
          onClick={() => signIn("google")}
          type="button"
        >
          Continue with Google
        </button>
      </div>
    </div>
  );
}

export function LogoutButton() {
  return (
    <button className="logout-btn" onClick={() => signOut()} type="button">
      Logout
    </button>
  );
}
