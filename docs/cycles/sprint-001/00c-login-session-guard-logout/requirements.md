# Feature: Login, Session Guard & Logout

## Overview
Third ticket in the [Skeleton Spike](../00-skeleton-spike/requirements.md)
split. Builds on the `User`/`Session` rows [00b](../00b-accept-invite/requirements.md)
creates: a registered user can log in (with session rotation), the frontend
can tell on load whether a session is active, and a logged-in user can log
out. This ticket also establishes the CSRF double-submit pattern every
future authenticated mutation must follow.

## Requirements
- A registered user can log in with email + password; a successful login
  always issues a **new** session (rotation), never adopts a session ID
  already present on the request.
- The frontend can determine on load whether a session is active via
  `GET /auth/me`, without guessing from a failed protected call.
- A logged-in user can log out, invalidating their session server-side;
  logout requires a CSRF token to be echoed back.
- Sessions expire on both an idle timeout (sliding, updated on every
  authenticated request) and an absolute timeout (fixed at creation).
- `/auth/login` is rate-limited per [architecture.md](../../../architecture.md#session-handling-requirements).
- The frontend route guard (`App.tsx`) checks session state once on load
  and reacts to any subsequent `401` by redirecting to `/login`.

## Acceptance Criteria
- [ ] Given a registered user submits correct credentials to the login
      route, the response sets an `HttpOnly`, `Secure`, `SameSite=Lax`
      session cookie backed by a `Session` row, and subsequent requests
      are authenticated by that cookie alone.
- [ ] Given a user logs in twice, the session ID issued on the second
      login differs from the first, and the first `Session` row is
      deleted if it was still valid.
- [ ] `POST /auth/login` with a wrong password and with an unregistered
      email both return `401` with the identical error message string.
- [ ] `GET /auth/me` returns `401` with no cookie, and `200 { user }` with
      a valid one; a successful call updates `Session.lastSeenAt`.
- [ ] `POST /auth/logout` without a valid `X-CSRF-Token` is rejected; with
      it, the `Session` row is deleted and a subsequent `GET /auth/me`
      returns `401`.
- [ ] `POST /auth/logout` called with no session cookie, or with a cookie
      whose session was already deleted, returns `204`, not an error.
- [ ] 11 consecutive failed `POST /auth/login` attempts from the same IP
      within 5 minutes return `429` on the 11th.
- [ ] A session past its idle or absolute timeout is treated identically
      to no session: `401` from any protected route.

## Out of Scope
- `POST /auth/accept-invite` and `AcceptInvitePage` — [00b](../00b-accept-invite/requirements.md)
  (already built; this ticket only adds login on top).
- The `/leads` route and `LeadsPage` — [00d](../00d-leads-list/requirements.md).
  The route guard built here protects it, but this ticket doesn't build it.
- Production deploy/secrets and the full walkthrough — [00e](../00e-cloudflare-deploy-and-walkthrough/requirements.md).
- Password reset / forgot-password.
- Everything in [00-skeleton-spike → Out of Scope](../00-skeleton-spike/specification.md#out-of-scope).

## Open Questions
- Timeout values (30 min idle / 7 day absolute) are spec defaults, not
  confirmed product requirements — fine to ship for the spike, flag before
  any real feature relies on them. See
  [00-skeleton-spike/specification.md → Open Questions](../00-skeleton-spike/specification.md#open-questions).

## Notes
- Related: [00-skeleton-spike/requirements.md](../00-skeleton-spike/requirements.md),
  [00-skeleton-spike/specification.md](../00-skeleton-spike/specification.md),
  [00b-accept-invite/specification.md](../00b-accept-invite/specification.md),
  [architecture.md](../../../architecture.md).

# Change Log

|Date | Change |
| --- | --- |
| 12 August 2026 | First draft, split out of 00-skeleton-spike |
