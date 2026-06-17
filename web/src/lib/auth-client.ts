const TOKEN_KEY = "access_token";
const PICTURE_KEY = "profile_picture";

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setAccessToken(token: string, picture?: string) {
  localStorage.setItem(TOKEN_KEY, token);
  if (picture) localStorage.setItem(PICTURE_KEY, picture);
}

export function clearAccessToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(PICTURE_KEY);
}

export function getProfilePicture(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(PICTURE_KEY);
}

export function authHeaders(): HeadersInit {
  const token = getAccessToken();
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}
