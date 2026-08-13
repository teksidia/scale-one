# Feature: Vertical Skeleton Spike

## Overview
Before building features feature-by-feature as vertical slices (schema → domain logic → API → UI), we need one thin vertical spike that proves the whole skeleton wires together: Neon → Drizzle → Hono → `hc` (typed RPC client) → React, deployed to Cloudflare. This is not a real feature — it's scaffolding validation. The chosen walkthrough is **invite → login → list leads**, since it touches auth, the DB layer, a typed API call, and a rendered UI screen with the minimum plausible domain surface.

Full horizontal layering (all schema, then all API, then all UI) produces cleaner-looking intermediate artifacts, but defers discovery of integration problems — auth/session issues, RPC type mismatches, deploy config — until everything is built, which is expensive to unwind. This spike exists to surface those problems now, cheaply, before any real feature work starts.

## Requirements
- A Drizzle schema for `User`, `Invite`, and a minimal `Lead` (id, title, status only — see [Out of Scope](#out-of-scope)) exists and migrates cleanly against a Neon Postgres database.
- An admin (seed script or direct DB insert is acceptable for this spike) can create an `Invite` row for an email address.
- A user holding a valid invite can complete a minimal registration/accept flow that creates their `User` row and establishes a session.
- A registered user can log in; a successful login sets an HTTP-only session cookie per the proposed auth approach in [architecture.md](../../../architecture.md#auth).
- A logged-in session can call a Hono `/leads` route via the generated `hc` client and get a typed response back — no manual type annotations bridging frontend and backend.
- The React (Vite) app renders the list of leads returned from that call on a screen, using the session cookie for auth.
- The full app (Hono API + React SPA) deploys to Cloudflare Pages/Workers and the invite → login → list-leads walkthrough works end-to-end against the deployed instance, not just locally.

## Security Requirements
The spike's auth slice is the template every later feature's auth handling will copy — so even though functional edge-case handling is otherwise out of scope for this spike (see [Out of Scope](#out-of-scope)), these baseline items are not waived. They must be true of the spike's implementation, not deferred as follow-up hardening.

- **Session ID generation** — cryptographically random, ≥128 bits of entropy (e.g. `crypto.randomBytes(32)`), never derived from predictable input (user ID, timestamp, counter).
- **Session storage** — a Neon-backed `Session` table (`id`, `userId`, `expiresAt`), not Workers KV. This resolves the [Open Questions](#open-questions) item below: KV's eventual consistency undermines the instant-revocation property `architecture.md` picked cookies for, and KV doesn't exist on the Docker self-host path.
- **Session expiry & rotation** — sessions carry both an idle timeout and an absolute timeout (exact values TBD in spec, e.g. 30 min idle / 7 day absolute); the session ID is rotated (new ID issued, old one invalidated) on login, to prevent session fixation.
- **Cookie flags** — `HttpOnly`, `Secure`, `SameSite=Lax` at minimum, set on every session cookie without exception.
- **CSRF protection** — state-changing routes (`/login`, `/accept-invite`, and any future POST/PUT/DELETE routes) require a CSRF token or `SameSite=Strict` where UX allows; `SameSite=Lax` alone is not sufficient coverage.
- **Password storage** — passwords hashed with argon2id (or bcrypt if argon2id isn't practical on Workers) with a per-user salt. Plaintext or reversible storage, or a fast general-purpose hash (MD5/SHA256 alone), is not acceptable.
- **Rate limiting** — `/login` and `/accept-invite` are throttled per IP and/or per email to blunt brute-force and invite-token guessing.
- **Invite token security** — invite tokens are cryptographically random (not sequential/guessable), single-use, and expire.
- **Account enumeration** — login and accept-invite failure responses use generic messaging that doesn't reveal whether a given email is registered or invited.
- **Transport** — HTTPS enforced in both deployment paths; Cloudflare does this by default, but it must be explicit (not assumed) for the Docker/self-host path even though that path itself is out of scope for this spike.

## Acceptance Criteria
- [ ] Given a fresh Neon database, running the Drizzle migration creates `User`, `Invite`, `Lead`, and `Session` tables without error.
- [ ] Given an `Invite` row exists for an email, a user completing the accept flow with that email ends up with a `User` row and an active session.
- [ ] Given a registered user submits correct credentials to the login route, the response sets an `HttpOnly`, `Secure`, `SameSite=Lax` session cookie backed by a `Session` row in Neon, and subsequent requests are authenticated by that cookie alone.
- [ ] Given a user logs in twice, the session ID issued on the second login differs from the first (rotation on login).
- [ ] Given no session cookie, a request to `/leads` is rejected (401 or equivalent) — confirms the route is actually gated, not just typed.
- [ ] Given an authenticated session and at least one seeded `Lead` row, calling the `/leads` endpoint through `hc` from the frontend returns a typed array and the UI renders it without runtime type errors.
- [ ] Given a stored `User` row, its password field is a salted argon2id (or bcrypt) hash, never plaintext.
- [ ] Given the app is deployed to Cloudflare (Pages/Workers), performing the same invite → login → list-leads walkthrough against the deployed URL succeeds over HTTPS.
- [ ] Changing a field name in the `Lead` schema causes a TypeScript compile error in the frontend component consuming it (proves the `hc` type-safety chain is real, not incidental).

## Out of Scope
- Full lead lifecycle (Open → Interest → Assigned → Confirmed → Closed) — only enough of the `Lead` shape to list exists here; state transitions are a later feature slice.
- Referral points ledger.
- Availability model.
- Invite delivery via email — a manually created/seeded invite record or token is sufficient for this spike.
- Any UI polish, styling system, or design work beyond an unstyled list rendering.
- Error handling/edge cases beyond the happy path and the one auth-rejection check above.
- GDPR-style deletion/obfuscation.
- Multi-currency / rate range handling.
- Notifications.
- Docker/self-host deployment path — this spike validates Cloudflare only; the Docker path is a separate concern.

## Open Questions
- Session store decided here as Neon-backed (see [Security Requirements](#security-requirements)) — `architecture.md`'s Auth section still says "proposed, not confirmed" and should be updated to match once this requirements doc is accepted.
- Is a manually inserted `Invite` row acceptable as the spike's "invite" step, or does this spike need a minimal admin route to create one? Leaning toward manual/seeded to keep the spike thin — confirm in spec.
- Minimal viable `Lead` field set for the list screen (title + status only, per Requirements above) — confirm nothing else is needed to prove the wiring.

## Notes
- This is folder `00-` (not `01-`) deliberately — it precedes all real feature work in the sprint; every subsequent feature folder builds on the assumption that this skeleton already works.
- Related: [vision.md](../../../vision.md), [architecture.md](../../../architecture.md) — particularly the [System Overview](../../../architecture.md#system-overview) diagram and [Auth](../../../architecture.md#auth) section this spike is validating.
- Next step after this requirements doc is accepted: write `specification.md` in this same folder covering the concrete build order and technical decisions (session store choice, exact route/component shapes) needed to execute the spike.

# Change Log

|Date | Change |
| --- | --- |
| 11 August 2026 | First draft |
| 11 August 2026 | Added Security Requirements section (session ID entropy, Neon-backed session store, expiry/rotation, cookie flags, CSRF, password hashing, rate limiting, invite token security, account enumeration, transport) and corresponding acceptance criteria |
