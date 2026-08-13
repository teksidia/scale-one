# Feature: Accept Invite

## Overview
Second ticket in the [Skeleton Spike](../00-skeleton-spike/requirements.md)
split (see [00a](../00a-scaffolding-and-schema/requirements.md) for the
schema/deploy foundation this builds on). This is the first real vertical
slice: a user holding a valid, unused, unexpired invite token sets a
password and ends up with a `User` row and an active session. It's also
where the riskiest technical unknown in the whole spike gets resolved —
whether argon2id can run on Cloudflare Workers via a WASM library.

## Requirements
- Before writing the route, spike whether `hash-wasm` (or an equivalent
  WASM argon2id library) bundles and runs under `wrangler`/Workers. If it
  doesn't, fall back to PBKDF2-SHA256 via the native Web Crypto
  `crypto.subtle` API.
- An admin can create an `Invite` row for an email address (seed script or
  direct DB insert — this ticket decides which, see Open Questions).
- A user holding a valid invite can submit a password and complete
  registration: their `User` row is created with a hashed password, the
  invite is marked consumed, and a `Session` row + cookie are issued.
- Invalid invite tokens (unknown, expired, already-accepted) and weak
  passwords are rejected with the generic, non-distinguishing error
  required by [architecture.md → Auth](../../../architecture.md#session-handling-requirements).
- `/auth/accept-invite` is rate-limited per [architecture.md's binding
  session-handling requirements](../../../architecture.md#session-handling-requirements).

## Acceptance Criteria
- [ ] Given an `Invite` row exists for an email, a user completing the
      accept flow with the matching token and a valid password ends up
      with a `User` row (argon2id- or PBKDF2-hashed password) and an
      active `Session` row.
- [ ] `POST /auth/accept-invite` with a valid, unused, unexpired token
      creates a `User` row and a `Session` row, and the response sets a
      cookie matching the flags in [architecture.md](../../../architecture.md#session-handling-requirements).
- [ ] `POST /auth/accept-invite` with an expired, already-accepted, or
      nonexistent token all return `400` with the identical error message
      string.
- [ ] A stored `User` row's password field is a salted argon2id (or
      PBKDF2, if the WASM spike fails) hash, never plaintext.
- [ ] 11 consecutive `POST /auth/accept-invite` attempts from the same IP
      within 5 minutes return `429` on the 11th.

## Out of Scope
- Login, logout, `/auth/me`, and the route guard — [00c](../00c-login-session-guard-logout/requirements.md).
- The `/leads` route and `LeadsPage` — [00d](../00d-leads-list/requirements.md).
- Production deploy/secrets and the full walkthrough — [00e](../00e-cloudflare-deploy-and-walkthrough/requirements.md).
- Email delivery of invites — manual/seeded token only.
- Everything in [00-skeleton-spike → Out of Scope](../00-skeleton-spike/specification.md#out-of-scope).

## Open Questions
- Is a manually inserted `Invite` row acceptable as this ticket's "create
  an invite" step, or does it need a minimal seed script? Leaning toward a
  raw insert/seed script (not an admin route/UI) — confirm in spec.
- Argon2id-on-Workers viability (`hash-wasm` vs PBKDF2 fallback) — must be
  resolved by spiking before the rest of the route is written; see
  [00-skeleton-spike/specification.md → Open Questions](../00-skeleton-spike/specification.md#open-questions).

## Notes
- Related: [00-skeleton-spike/requirements.md](../00-skeleton-spike/requirements.md),
  [00-skeleton-spike/specification.md](../00-skeleton-spike/specification.md),
  [architecture.md](../../../architecture.md).

# Change Log

|Date | Change |
| --- | --- |
| 12 August 2026 | First draft, split out of 00-skeleton-spike |
