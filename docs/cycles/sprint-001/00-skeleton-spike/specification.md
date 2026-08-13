# Spec: Vertical Skeleton Spike

## Source Requirement
- [`./requirements.md`](./requirements.md)
- [`architecture.md` → Auth](../../../architecture.md#auth) (session handling requirements are binding here, not optional hardening)

## Overview
This spec covers the technical "how" for the invite → login → list-leads walkthrough: a minimal Drizzle schema (`User`, `Invite`, `Session`, `Lead`), four Hono routes, and three React screens, wired end-to-end through the `hc` typed client and deployed to Cloudflare. No code exists in this repo yet, so this spec also proposes the minimal file layout needed to build it — later feature specs should follow the same layout rather than re-deciding it.

Proposed layout:
```
/backend
  /src
    /db          — Drizzle schema + migrations
    /routes      — auth.ts, leads.ts
    /lib         — session.ts, password.ts, rateLimit.ts
    app.ts       — Hono app, exports type for hc
    index.ts     — Workers entry
/frontend
  /src
    /pages       — AcceptInvitePage, LoginPage, LeadsPage
    /lib         — api.ts (hc client instance)
    App.tsx      — routing + auth guard
```

## Data Models

```ts
User {
  id: string            // uuid
  email: string          // unique
  passwordHash: string   // argon2id or PBKDF2 — see Open Questions
  createdAt: Date
}

Invite {
  id: string             // uuid
  token: string           // unique, random ≥128 bits, indexed
  email: string
  status: 'pending' | 'accepted' | 'expired'
  expiresAt: Date
  createdAt: Date
}

Session {
  id: string             // random ≥128 bits — this is the cookie value, primary key
  userId: string
  expiresAt: Date         // absolute timeout
  lastSeenAt: Date        // used to enforce idle timeout
  createdAt: Date
}

Lead {
  id: string             // uuid
  title: string
  status: 'open'          // only value used by seed data for this spike
  createdAt: Date
}
```

Nothing here is nullable beyond what's shown; no soft-delete/obfuscation fields — out of scope per [architecture.md GDPR](../../../architecture.md#gdpr--deletion), not needed until a real deletion feature exists.

## API Contract

### `POST /auth/accept-invite`
- **Purpose**: consumes an invite token, sets the user's password, creates the `User` row, and logs them in.
- **Body**: `{ token: string, password: string }`
- **Response**: `200 { user: { id, email } }`, `Set-Cookie: session=<id>; HttpOnly; Secure; SameSite=Lax`
- **Errors**:
  - `400` — token missing, unknown, expired, or already accepted. **Same generic message for all four** (`"Invalid or expired invite"`) — do not distinguish, to avoid leaking which tokens exist.
  - `400` — password fails minimum policy (length ≥ 8; no further complexity rules for the spike).
  - `429` — rate limit exceeded (see [Business Rules](#business-rules--constraints)).

### `POST /auth/login`
- **Purpose**: authenticates an existing user.
- **Body**: `{ email: string, password: string }`
- **Response**: `200 { user: { id, email } }`, `Set-Cookie: session=<id>; ...` (new session, see rotation rule below)
- **Errors**:
  - `401` — wrong password **or** unknown email. **Same generic message** (`"Invalid email or password"`) for both — anti-enumeration.
  - `429` — rate limit exceeded.

### `POST /auth/logout`
- **Purpose**: invalidates the current session.
- **Auth**: session cookie required; a request with no/invalid cookie still returns `204` (idempotent — logging out an already-logged-out client is not an error).
- **Response**: `204`, `Set-Cookie: session=; Max-Age=0` (clears cookie), deletes the `Session` row server-side.
- **CSRF**: requires the double-submit CSRF token issued at login (see [Business Rules](#business-rules--constraints)) as an `X-CSRF-Token` header — this is the one authenticated state-changing route in the spike, and it establishes the pattern every future authenticated mutation must follow.

### `GET /auth/me`
- **Purpose**: lets the frontend determine on load whether a session is active, without guessing from a failed protected call.
- **Response**: `200 { user: { id, email } }` if session valid, else `401`.
- Every call that succeeds extends `Session.lastSeenAt` (sliding idle timeout) — see [Business Rules](#business-rules--constraints).

### `GET /leads`
- **Purpose**: returns the seeded leads list.
- **Auth**: session cookie required.
- **Response**: `200 { items: Lead[] }`
- **Errors**: `401` — no/invalid/expired session.

## Component / UI Behaviour

- **`AcceptInvitePage`** (`/accept-invite/:token`): password + confirm-password form. On submit, `POST /auth/accept-invite`; on success redirect to `/leads`; on `400` show the generic inline error returned by the API verbatim (don't re-word it into something more specific).
- **`LoginPage`** (`/login`): email + password form. On submit, `POST /auth/login`; on success redirect to `/leads`; on `401` show generic inline error.
- **`LeadsPage`** (`/leads`, protected): on mount, calls `leads.$get()` via `hc`. Loading state while pending. Renders a plain list of `title` + `status`. Empty state: "No leads yet" if `items` is empty.
- **Route guard** (`App.tsx`): on app load, calls `GET /auth/me` once to determine session state before rendering any protected route (prevents a flash of protected content that then gets yanked). Any `401` from any subsequent API call (not just `/auth/me`) redirects to `/login` — the guard doesn't re-check on every navigation, it reacts to the API telling it the session died.

## Business Rules & Constraints

Binding per [architecture.md → Session Handling Requirements](../../../architecture.md#session-handling-requirements):

- **Session ID**: `crypto.randomBytes(32)` (or Workers' `crypto.getRandomValues`), base64url-encoded. Never derived from user ID, email, or timestamp.
- **Rotation on login**: login always creates a **new** `Session` row and issues a new cookie — the server never adopts a session ID already present in the request's cookie. If the client happens to hold a still-valid session cookie when it logs in again, that old `Session` row is deleted rather than left dangling.
- **Timeouts** (defaults for this spike — see [Open Questions](#open-questions)): idle timeout 30 minutes (`lastSeenAt` updated on every authenticated request; expired if `now - lastSeenAt > 30min`), absolute timeout 7 days (`expiresAt` fixed at creation, never extended).
- **Cookie**: name `session`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`.
- **CSRF**: a random CSRF token is issued (readable, non-`HttpOnly` cookie or response body — implementation's choice) at login/accept-invite time and must be echoed back as `X-CSRF-Token` on `/auth/logout`. This is the only authenticated mutation in scope; it exists to establish the double-submit pattern, not because logout itself is high-risk.
- **Password hashing**: argon2id via a WASM-based library (no native Node bindings — must run on Workers), salted per user. See [Open Questions](#open-questions) for the fallback if the WASM build proves incompatible with the Workers bundler.
- **Rate limiting**: `/auth/login` and `/auth/accept-invite` limited to 10 attempts per IP per 5 minutes. Implemented via a Workers KV counter with a short TTL — this is a valid use of KV precisely because rate-limit counters tolerate eventual consistency (unlike sessions, where that same property is disqualifying).
- **Invite tokens**: random ≥128 bits, single-use (status flips to `accepted` on consumption; a second attempt with the same token hits the generic `400`), and time-limited (`expiresAt`, default 7 days from creation).
- **Account enumeration**: covered above per-endpoint — always the generic message, always the same shape/timing-insensitive response for valid vs. invalid identifiers where feasible.
- **Transport**: HTTPS only; Cloudflare enforces this by default for the deployed spike.

## Edge Cases

- Invite token doesn't exist, is expired, or was already accepted → all three return the same generic `400`, no distinguishing signal.
- Login with correct email but wrong password, or with an email that was never invited → same generic `401`.
- Session past its idle or absolute timeout → treated identically to no session: `401`, frontend redirects to `/login`.
- No `Lead` rows seeded → `GET /leads` returns `{ items: [] }`; UI shows the empty state, not an error.
- Rate limit exceeded on `/auth/login` or `/auth/accept-invite` → `429` with a `Retry-After` header; frontend shows a generic "too many attempts, try again later" message.
- Missing/malformed token param on `/accept-invite/:token` (e.g. user navigates there directly) → treated as an unknown token, same generic `400` path once submitted.
- `/auth/logout` called with no session cookie, or with a cookie whose session was already deleted → `204`, not an error.

## Acceptance Criteria

- [ ] `POST /auth/accept-invite` with a valid, unused, unexpired token creates a `User` row with an argon2id-hashed password and a `Session` row, and the response sets a cookie matching the flags in [Business Rules](#business-rules--constraints).
- [ ] `POST /auth/accept-invite` with an expired, already-accepted, or nonexistent token all return `400` with the identical error message string.
- [ ] `POST /auth/login` with correct credentials returns `200` and a **new** `Session` row distinct from any prior session for that user.
- [ ] `POST /auth/login` with a wrong password and with an unregistered email both return `401` with the identical error message string.
- [ ] `GET /auth/me` returns `401` with no cookie, and `200 { user }` with a valid one; a successful call updates `Session.lastSeenAt`.
- [ ] `GET /leads` returns `401` with no session, and `200 { items: Lead[] }` with a valid one, typed end-to-end through `hc` with no manual casting in the frontend.
- [ ] `POST /auth/logout` without a valid `X-CSRF-Token` is rejected; with it, the `Session` row is deleted and a subsequent `GET /auth/me` returns `401`.
- [ ] 11 consecutive failed `POST /auth/login` attempts from the same IP within 5 minutes return `429` on the 11th.
- [ ] The full walkthrough (accept invite → land on `/leads` → logout → login again → land on `/leads`) succeeds against the Cloudflare-deployed instance over HTTPS.
- [ ] Renaming `Lead.title` to something else in the Drizzle schema causes a TypeScript compile error in `LeadsPage`, not a silent runtime `undefined`.

## Out of Scope

Mirrors [requirements.md → Out of Scope](./requirements.md#out-of-scope), plus spec-level exclusions:
- Password reset / forgot-password flow.
- Email verification.
- Any admin UI for creating invites — a seed script or direct insert is used for this spike.
- `membershipStatus` (`suspended`/`revoked`) enforcement — the minimal `User` model here has no such field; suspend/revoke is a later feature, not this spike's concern.
- Tuning rate-limit thresholds beyond the fixed default above — no config surface for it yet.
- CSRF protection on `/auth/login` / `/auth/accept-invite` themselves — they're unauthenticated, so there's no existing session to forge; rate limiting is the relevant control there instead.

## Open Questions

- **Argon2id on Workers**: needs a concrete WASM library verified to bundle and run under `wrangler`/Workers before implementation starts (candidate: `hash-wasm`). If that proves impractical, fall back to PBKDF2-SHA256 via the native Web Crypto `crypto.subtle` API (zero extra dependencies, guaranteed Workers-compatible, weaker than argon2id but still acceptable per OWASP for this data sensitivity level). Whoever picks this up should spike the library choice first before writing the rest of `/auth/accept-invite`.
- **Timeout values** (30 min idle / 7 day absolute) are spec defaults, not confirmed product requirements — fine to ship for the spike, but flag before any real feature relies on them.
- Carried from `requirements.md`: whether invite creation needs even a minimal seed script, or a raw SQL insert against Neon is acceptable for this spike (leaning raw insert — simplest thing that proves the walkthrough).

## Notes
- This spec intentionally includes `POST /auth/logout` and `GET /auth/me`, which aren't named in `requirements.md`'s Requirements list — both are the minimum needed to make the login/session-guard behaviour actually testable and usable from a real SPA, not scope creep beyond the spike's intent.
- Related: [requirements.md](./requirements.md), [architecture.md](../../../architecture.md).

# Change Log

|Date | Change |
| --- | --- |
| 11 August 2026 | First draft |
