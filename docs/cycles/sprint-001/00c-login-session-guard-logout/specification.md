# Spec: Login, Session Guard & Logout

## Source Requirement
- [`./requirements.md`](./requirements.md)
- [`00-skeleton-spike/specification.md`](../00-skeleton-spike/specification.md) — full login/logout/me contract this ticket implements
- [`architecture.md` → Session Handling Requirements](../../../architecture.md#session-handling-requirements) — binding, not optional hardening

## Prerequisites

No new accounts or provisioning beyond
[00a](../00a-scaffolding-and-schema/specification.md#prerequisites) (Neon +
Cloudflare) and [00b](../00b-accept-invite/specification.md#prerequisites)
(Workers KV namespace, reused here for `/auth/login`'s rate limiting).

## Overview
Implements the login, session-check, and logout legs of the spike's
walkthrough, plus the frontend route guard that ties them together. Builds
on the `User`/`Session` schema from
[00a](../00a-scaffolding-and-schema/specification.md#data-models) and the
`User` rows [00b](../00b-accept-invite/specification.md) creates — this
ticket does not redefine those shapes.

## Data Models
Uses `User` and `Session` exactly as defined in
[00a → Data Models](../00a-scaffolding-and-schema/specification.md#data-models).
No new fields.

## API Contract

### `POST /auth/login`
- **Purpose**: authenticates an existing user.
- **Body**: `{ email: string, password: string }`
- **Response**: `200 { user: { id, email } }`, `Set-Cookie: session=<id>; ...` (new session, see rotation rule below)
- **Errors**:
  - `401` — wrong password **or** unknown email. **Same generic message**
    (`"Invalid email or password"`) for both — anti-enumeration.
  - `429` — rate limit exceeded.

### `POST /auth/logout`
- **Purpose**: invalidates the current session.
- **Auth**: session cookie required; a request with no/invalid cookie
  still returns `204` (idempotent — logging out an already-logged-out
  client is not an error).
- **Response**: `204`, `Set-Cookie: session=; Max-Age=0` (clears cookie),
  deletes the `Session` row server-side.
- **CSRF**: requires the double-submit CSRF token issued at login (see
  [Business Rules](#business-rules--constraints)) as an `X-CSRF-Token`
  header — this is the one authenticated state-changing route in the
  spike, and it establishes the pattern every future authenticated
  mutation must follow.

### `GET /auth/me`
- **Purpose**: lets the frontend determine on load whether a session is
  active, without guessing from a failed protected call.
- **Response**: `200 { user: { id, email } }` if session valid, else `401`.
- Every call that succeeds extends `Session.lastSeenAt` (sliding idle
  timeout) — see [Business Rules](#business-rules--constraints).

## Component / UI Behaviour

- **`LoginPage`** (`/login`): email + password form. On submit,
  `POST /auth/login`; on success redirect to `/leads` (route not built
  until [00d](../00d-leads-list/specification.md) — acceptable for this
  ticket's scope); on `401` show generic inline error.
- **Route guard** (`App.tsx`): on app load, calls `GET /auth/me` once to
  determine session state before rendering any protected route (prevents a
  flash of protected content that then gets yanked). Any `401` from any
  subsequent API call (not just `/auth/me`) redirects to `/login` — the
  guard doesn't re-check on every navigation, it reacts to the API telling
  it the session died.

## Business Rules & Constraints

Binding per [architecture.md → Session Handling Requirements](../../../architecture.md#session-handling-requirements):

- **Rotation on login**: login always creates a **new** `Session` row and
  issues a new cookie — the server never adopts a session ID already
  present in the request's cookie. If the client happens to hold a still-
  valid session cookie when it logs in again, that old `Session` row is
  deleted rather than left dangling.
- **Timeouts** (defaults for this spike — see [Open Questions](#open-questions)):
  idle timeout 30 minutes (`lastSeenAt` updated on every authenticated
  request; expired if `now - lastSeenAt > 30min`), absolute timeout 7 days
  (`expiresAt` fixed at creation, never extended).
- **Cookie**: name `session`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`.
- **CSRF**: a random CSRF token is issued (readable, non-`HttpOnly` cookie
  or response body — implementation's choice) at login time and must be
  echoed back as `X-CSRF-Token` on `/auth/logout`.
- **Rate limiting**: `/auth/login` limited to 10 attempts per IP per 5
  minutes, via the same Workers KV counter pattern as
  [00b's accept-invite rate limiting](../00b-accept-invite/specification.md#business-rules--constraints).
- **Account enumeration**: always the generic message, same shape for
  wrong-password and unknown-email cases.
- **Transport**: HTTPS only (enforced by Cloudflare in [00e](../00e-cloudflare-deploy-and-walkthrough/specification.md);
  this ticket can be built/tested locally without it).

## Edge Cases

- Login with correct email but wrong password, or with an email that was
  never invited → same generic `401`.
- Session past its idle or absolute timeout → treated identically to no
  session: `401`, frontend redirects to `/login`.
- Rate limit exceeded on `/auth/login` → `429` with a `Retry-After` header;
  frontend shows a generic "too many attempts, try again later" message.
- `/auth/logout` called with no session cookie, or with a cookie whose
  session was already deleted → `204`, not an error.

## Acceptance Criteria

- [ ] `POST /auth/login` with correct credentials returns `200` and a
      **new** `Session` row distinct from any prior session for that user.
- [ ] `POST /auth/login` with a wrong password and with an unregistered
      email both return `401` with the identical error message string.
- [ ] `GET /auth/me` returns `401` with no cookie, and `200 { user }` with
      a valid one; a successful call updates `Session.lastSeenAt`.
- [ ] `POST /auth/logout` without a valid `X-CSRF-Token` is rejected; with
      it, the `Session` row is deleted and a subsequent `GET /auth/me`
      returns `401`.
- [ ] 11 consecutive failed `POST /auth/login` attempts from the same IP
      within 5 minutes return `429` on the 11th.
- [ ] Given a user logs in twice, the session ID issued on the second
      login differs from the first (rotation on login).

## Out of Scope

- `POST /auth/accept-invite`, `AcceptInvitePage` — already built in
  [00b](../00b-accept-invite/specification.md).
- `GET /leads`, `LeadsPage` — [00d](../00d-leads-list/specification.md).
- Production deploy, secrets, and the deployed walkthrough — [00e](../00e-cloudflare-deploy-and-walkthrough/specification.md).
- Password reset / forgot-password flow.
- Mirrors [00-skeleton-spike/specification.md → Out of Scope](../00-skeleton-spike/specification.md#out-of-scope).

## Open Questions
- **Timeout values** (30 min idle / 7 day absolute) are spec defaults, not
  confirmed product requirements — fine to ship for the spike, but flag
  before any real feature relies on them.

## Notes
- This ticket intentionally includes `POST /auth/logout` and
  `GET /auth/me`, which aren't named in `00-skeleton-spike/requirements.md`'s
  Requirements list — both are the minimum needed to make login/session-
  guard behaviour actually testable and usable from a real SPA, not scope
  creep beyond the spike's intent (see
  [00-skeleton-spike/specification.md → Notes](../00-skeleton-spike/specification.md#notes)).
- Related: [00-skeleton-spike/specification.md](../00-skeleton-spike/specification.md),
  [00b-accept-invite/specification.md](../00b-accept-invite/specification.md),
  [architecture.md](../../../architecture.md).

# Change Log

|Date | Change |
| --- | --- |
| 12 August 2026 | First draft, split out of 00-skeleton-spike |
| 12 August 2026 | Added Prerequisites section (pointer to 00a/00b — no new accounts) |
