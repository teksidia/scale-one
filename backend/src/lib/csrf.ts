import { toBase64Url } from "./encoding";

// Double-submit cookie pattern: the token is set as a readable (non-
// HttpOnly) cookie at login, and the frontend echoes it back as the
// X-CSRF-Token header on state-changing requests. No server-side storage
// needed — the check is just "do the cookie and header match" (see
// routes/auth.ts's /logout handler).
export const CSRF_COOKIE_NAME = "csrf_token";

const CSRF_TOKEN_BYTES = 32;

export function generateCsrfToken(): string {
  const bytes = new Uint8Array(CSRF_TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}
