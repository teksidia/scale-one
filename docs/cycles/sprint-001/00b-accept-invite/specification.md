# Spec: Accept Invite

## Source Requirement
- [`./requirements.md`](./requirements.md)
- [`00-skeleton-spike/specification.md`](../00-skeleton-spike/specification.md) — `User`/`Invite`/`Session` shapes, full accept-invite contract this ticket implements
- [`architecture.md` → Session Handling Requirements](../../../architecture.md#session-handling-requirements) — binding, not optional hardening

## Prerequisites

Builds on the Neon/Cloudflare accounts from
[00a's Prerequisites](../00a-scaffolding-and-schema/specification.md#prerequisites)
— no new accounts needed. Additional provisioning for this ticket:

- A **Cloudflare Workers KV namespace** for the rate-limit counter, e.g.
  `wrangler kv namespace create RATE_LIMIT`, with the returned namespace ID
  bound in `wrangler.toml`. One-time setup against the same Cloudflare
  account from 00a; reused as-is by [00c](../00c-login-session-guard-logout/specification.md#business-rules--constraints)
  for `/auth/login`'s rate limiting.

## Overview
Implements the invite-consumption half of the spike's walkthrough: a valid
invite token becomes a `User` row, a hashed password, and an active
`Session`, over `POST /auth/accept-invite`, plus the `AcceptInvitePage` that
drives it. Builds on the `User`/`Invite`/`Session` schema from
[00a](../00a-scaffolding-and-schema/specification.md#data-models) — this
ticket does not redefine those shapes.

## Data Models
Uses `User`, `Invite`, and `Session` exactly as defined in
[00a → Data Models](../00a-scaffolding-and-schema/specification.md#data-models).
No new fields.

## API Contract

### `POST /auth/accept-invite`
- **Purpose**: consumes an invite token, sets the user's password, creates
  the `User` row, and logs them in.
- **Body**: `{ token: string, password: string }`
- **Response**: `200 { user: { id, email } }`, `Set-Cookie: session=<id>; HttpOnly; Secure; SameSite=Lax`
- **Errors**:
  - `400` — token missing, unknown, expired, or already accepted. **Same
    generic message for all four** (`"Invalid or expired invite"`) — do not
    distinguish, to avoid leaking which tokens exist.
  - `400` — password fails minimum policy (length ≥ 8; no further
    complexity rules for the spike).
  - `429` — rate limit exceeded (see [Business Rules](#business-rules--constraints)).

## Component / UI Behaviour

- **`AcceptInvitePage`** (`/accept-invite/:token`): password +
  confirm-password form. On submit, `POST /auth/accept-invite`; on success
  redirect to `/leads` (route not built until [00d](../00d-leads-list/specification.md) —
  redirect target exists but resolves to nothing until then; acceptable for
  this ticket's scope); on `400` show the generic inline error returned by
  the API verbatim (don't re-word it into something more specific).

## Business Rules & Constraints

Binding per [architecture.md → Session Handling Requirements](../../../architecture.md#session-handling-requirements):

- **Session ID**: `crypto.randomBytes(32)` (or Workers' `crypto.getRandomValues`),
  base64url-encoded. Never derived from user ID, email, or timestamp.
- **Cookie**: name `session`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`.
- **Password hashing**: argon2id via a WASM-based library (no native Node
  bindings — must run on Workers), salted per user. See
  [Open Questions](#open-questions) for the PBKDF2 fallback.
- **Rate limiting**: `/auth/accept-invite` limited to 10 attempts per IP per
  5 minutes, via a Workers KV counter with a short TTL — a valid use of KV
  because rate-limit counters tolerate eventual consistency (unlike
  sessions).
- **Invite tokens**: random ≥128 bits, single-use (status flips to
  `accepted` on consumption; a second attempt with the same token hits the
  generic `400`), and time-limited (`expiresAt`, default 7 days from
  creation).
- **Account enumeration**: always the generic message, same shape for all
  invalid-token cases.
- **Transport**: HTTPS only (enforced by Cloudflare in [00e](../00e-cloudflare-deploy-and-walkthrough/specification.md);
  this ticket can be built/tested locally without it).

## Edge Cases

- Invite token doesn't exist, is expired, or was already accepted → all
  three return the same generic `400`, no distinguishing signal.
- Missing/malformed token param on `/accept-invite/:token` (e.g. user
  navigates there directly) → treated as an unknown token, same generic
  `400` path once submitted.
- Rate limit exceeded → `429` with a `Retry-After` header; frontend shows a
  generic "too many attempts, try again later" message.

## Acceptance Criteria

- [ ] `POST /auth/accept-invite` with a valid, unused, unexpired token
      creates a `User` row with an argon2id-hashed (or PBKDF2, per the
      Open Questions fallback) password and a `Session` row, and the
      response sets a cookie matching the flags above.
- [ ] `POST /auth/accept-invite` with an expired, already-accepted, or
      nonexistent token all return `400` with the identical error message
      string.
- [ ] `POST /auth/accept-invite` with a password under 8 characters
      returns `400`.
- [ ] 11 consecutive failed `POST /auth/accept-invite` attempts from the
      same IP within 5 minutes return `429` on the 11th, with a
      `Retry-After` header.
- [ ] A stored `User` row's `passwordHash` is never plaintext or reversibly
      encrypted.

## Out of Scope

- `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `LoginPage`,
  route guard — [00c](../00c-login-session-guard-logout/specification.md).
- `GET /leads`, `LeadsPage` — [00d](../00d-leads-list/specification.md).
- Production deploy, secrets, and the deployed walkthrough — [00e](../00e-cloudflare-deploy-and-walkthrough/specification.md).
- CSRF protection on this route — it's unauthenticated (no existing session
  to forge); rate limiting is the relevant control here instead, per
  [00-skeleton-spike/specification.md → Out of Scope](../00-skeleton-spike/specification.md#out-of-scope).
- Email verification, password reset, admin UI for creating invites.

## Open Questions

- **Argon2id on Workers**: needs a concrete WASM library verified to bundle
  and run under `wrangler`/Workers before the rest of this route is
  written (candidate: `hash-wasm`). If impractical, fall back to
  PBKDF2-SHA256 via `crypto.subtle` (zero extra dependencies, guaranteed
  Workers-compatible, weaker than argon2id but acceptable per OWASP for
  this data sensitivity level). **Spike this first.**
- Is a manually inserted `Invite` row (raw SQL against Neon) acceptable for
  this ticket, or is a minimal seed script needed? Leaning toward raw
  insert — simplest thing that proves the walkthrough; either way, no
  admin UI/route is built.

## Notes
- Related: [00-skeleton-spike/specification.md](../00-skeleton-spike/specification.md),
  [00a-scaffolding-and-schema/specification.md](../00a-scaffolding-and-schema/specification.md),
  [architecture.md](../../../architecture.md).

# Change Log

|Date | Change |
| --- | --- |
| 12 August 2026 | First draft, split out of 00-skeleton-spike |
| 12 August 2026 | Added Prerequisites section (Workers KV namespace) |
