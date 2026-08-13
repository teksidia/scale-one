import type { AppType } from "@scale-one/backend";
import { hc } from "hono/client";

// Shared with App.tsx's own route matching, so the two stay in sync.
export const ACCEPT_INVITE_PATH = /^\/accept-invite\/?([^/]*)$/;

// Paths that don't require a session — the route guard (App.tsx) shouldn't
// redirect these to /login just because a request from them 401s.
export function isPublicPath(pathname: string): boolean {
  return pathname === "/login" || ACCEPT_INVITE_PATH.test(pathname);
}

// Route guard per 00c's spec: any 401 from any API call (not just
// GET /auth/me) means the session died, so redirect to /login. This is a
// single choke point for that rule rather than every call site checking it.
async function guardedFetch(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);

  if (response.status === 401 && !isPublicPath(window.location.pathname)) {
    window.location.assign("/login");
  }

  return response;
}

export const client = hc<AppType>(import.meta.env.VITE_API_URL, {
  // The API sits on a different origin from the SPA (different port
  // locally, different domain once deployed), so the session cookie needs
  // an explicit opt-in to be sent/stored on cross-origin requests.
  init: { credentials: "include" },
  fetch: guardedFetch,
});

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

// /auth/logout is the one authenticated state-changing route in the spike
// and requires the double-submit CSRF token issued at login (see
// architecture.md's Session Handling Requirements) — read back from the
// non-HttpOnly csrf_token cookie and echoed as a header.
export function logout() {
  return client.api.auth.logout.$post(
    {},
    { headers: { "X-CSRF-Token": readCookie("csrf_token") ?? "" } },
  );
}
