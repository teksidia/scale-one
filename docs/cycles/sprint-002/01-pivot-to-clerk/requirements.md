# Feature: Pivot to Clerk

## Overview
Replace the custom, hand-rolled session-cookie auth system (`backend/src/lib/session.ts`,
`password.ts`, `csrf.ts`, and the `login`/`accept-invite`/`logout`/`me` routes in
`backend/src/routes/auth.ts`) with Clerk-managed authentication. The custom system
works but leaves password reset, email verification, and account/admin management
entirely unbuilt — Clerk provides these out of the box rather than requiring them to
be built in-house.

This ticket integrates Clerk directly; it does not build a provider-agnostic
abstraction layer to support swapping to a different provider later — that was
considered and deliberately deferred (see [Out of Scope](#out-of-scope)).

## Requirements
- Clerk replaces the custom session cookie, password hashing (PBKDF2), and CSRF
  double-submit plumbing for authentication. Backend session verification and
  frontend auth state both move to Clerk.
- **Invite-only signup is preserved.** The existing `invite` table (token, email,
  status, expiresAt) continues to gate who may complete signup: a Clerk sign-up is
  only permitted for an email tied to a pending, unexpired invite. This gating is
  built as a thin layer on top of Clerk's sign-up flow, not inside Clerk itself.
- **Membership lifecycle stays authoritative in our own DB, independent of Clerk
  session validity.** `User.membershipStatus` (`invited | approved | suspended |
  revoked`) must be checked on every protected request. Clerk's default session
  token refresh window (~60s) means a suspended/revoked user's Clerk session can
  remain technically valid for up to that window — every protected route must
  reject `suspended`/`revoked` users regardless of Clerk auth state, not rely on
  Clerk revocation alone. This ~60s worst-case lag is an accepted tradeoff (no
  PII/payment data at stake, and the local `membershipStatus` check closes the gap
  on the user's next request) — no synchronous per-request Clerk check needed.
- Backend auth verification is centralized into a single Hono middleware
  (registered once in `app.ts`) that verifies the Clerk session and loads the
  corresponding local `user` row, replacing the repeated manual `getValidSession`
  calls currently duplicated in `leads.ts` and `auth.ts`.
- Frontend replaces the manual pathname-matching guard and `GET /api/auth/me`
  bootstrap check in `App.tsx` with Clerk's session state.
- The local `user` table gains a column mapping to Clerk's user ID (e.g.
  `clerkUserId`); `passwordHash` and related password-handling code are removed
  once the migration is complete. This is a clean cutover, not a data migration —
  see [Migration approach](#migration-approach) below.
- User lifecycle events from Clerk (account created, account deleted) are synced
  into the local `user` table via a new webhook route, `POST
  /api/webhooks/clerk`, with signatures verified using the `svix` library (per
  Clerk's own docs) — `svix` is Web Crypto-based and runtime-agnostic, so it works
  on Cloudflare Workers without adaptation.
- Both deployment paths ([architecture.md → Deployment](../../../architecture.md#deployment))
  — the Cloudflare Worker path and the Docker/Node self-host path — use identical
  Clerk configuration (same env vars: publishable + secret keys). Clerk's backend
  SDK is expected to work the same on both runtimes with no branching required.

### Migration approach
This project is pre-launch: there is no real user base to preserve. The local
`user` table (and its `passwordHash` column) is reset as part of this migration
rather than migrated — no forced re-verification flow for existing accounts is
needed.

## Acceptance Criteria
- [ ] Given an email with a pending, unexpired invite, when that person completes
      Clerk sign-up with that email, then a local `user` row is created (or linked
      to the Clerk user) with the appropriate `membershipStatus`.
- [ ] Given an email with no invite, or an expired/already-consumed one, when that
      person attempts to sign up via Clerk, then they are not granted access to the
      app.
- [ ] Given a valid Clerk session, when a request hits a protected route, then the
      backend verifies the Clerk session **and** checks local `membershipStatus ==
      approved`, rejecting the request if the user is `suspended` or `revoked` even
      though their Clerk session is still valid.
- [ ] Given an admin suspends or revokes a user, then that user's next request
      after the change is rejected by the local `membershipStatus` check,
      independent of whether their Clerk session token has naturally expired yet.
- [ ] Given a user is removed in Clerk, then the corresponding local `user` row is
      handled per the existing GDPR obfuscation approach
      ([architecture.md → GDPR / Deletion](../../../architecture.md#gdpr--deletion)),
      not left dangling or orphaned.
- [ ] All custom auth code and data made obsolete by this migration —
      `session.ts`, `password.ts`, `csrf.ts`, the `session` table, the
      `passwordHash` column — is removed, not left as dead code.
- [ ] `POST /api/webhooks/clerk` rejects any request whose `svix` signature
      headers don't verify against the webhook signing secret; a verified
      `user.created`/`user.deleted` event updates the local `user` table
      accordingly.
- [ ] The Docker/Node self-host path authenticates via Clerk using the same
      environment variables as the Cloudflare Worker path, with no
      runtime-specific branching in the auth code.

## Out of Scope
- **A provider-agnostic auth abstraction/adapter layer** to make a future switch
  away from Clerk (or support for a self-hosted fallback) easy. Discussed and
  explicitly deferred — this ticket integrates Clerk directly rather than behind a
  generic interface.
- Password reset UI/flow — handled entirely by Clerk's hosted flows.
- Building admin tooling beyond what's needed to keep invite-only gating working
  (e.g. a full admin dashboard for user management) — Clerk's own dashboard covers
  basic user management; anything membership-status-specific (`suspended`/`revoked`)
  stays with the existing admin surface, unchanged by this ticket unless it breaks.

## Open Questions
None outstanding — all four questions raised in the first draft (user migration
approach, webhook route/verification, revocation lag tolerance, deployment-path
parity) were resolved during scoping and are now reflected in
[Requirements](#requirements) and [Acceptance Criteria](#acceptance-criteria)
above.

## Notes
- Related: [architecture.md → Auth](../../../architecture.md#auth),
  [00-skeleton-spike](../../sprint-001/00-skeleton-spike/requirements.md),
  [00b-accept-invite](../../sprint-001/00b-accept-invite/requirements.md),
  [00c-login-session-guard-logout](../../sprint-001/00c-login-session-guard-logout/requirements.md)
  — this ticket replaces the auth system those tickets built.
- **No Clerk account exists yet for this project.** One-time setup, in order,
  before implementation can start (full detail in
  [specification.md → Prerequisites](./specification.md#prerequisites)):
  1. Sign up at [dashboard.clerk.com/sign-up](https://dashboard.clerk.com/sign-up)
     and create an application, enabling **Email address** + **Password** as
     the sign-up/sign-in strategy. Consider a second, separate application
     for production so dev/test and production auth data stay isolated.
  2. **Restrict public sign-up** in the application's Restrictions settings —
     this project's invite-only model depends on Clerk's own hosted sign-up
     never being the thing that creates an account (see
     [Requirements](#requirements) → invite-only signup, above).
  3. Copy the **Publishable key** and **Secret key** from the application's
     API Keys page.
  4. Create the webhook endpoint (**Webhooks → Add Endpoint**) subscribed to
     `user.created` and `user.deleted`, and copy its **Signing Secret**. This
     needs a real HTTPS URL — for local dev before a deploy exists, tunnel
     `wrangler dev` with ngrok or `cloudflared` first.
  5. Set the resulting keys as env vars: `CLERK_SECRET_KEY` and
     `CLERK_WEBHOOK_SIGNING_SECRET` (backend secrets), and
     `VITE_CLERK_PUBLISHABLE_KEY` (frontend, public, `VITE_`-prefixed per the
     existing `VITE_API_URL` convention).
  6. Add dependencies: `@clerk/backend` + `@hono/clerk-auth` + `svix` to the
     backend, `@clerk/clerk-react` to the frontend.

# Change Log

|Date | Change |
| --- | --- |
| 13 August 2026 | First draft |
| 13 August 2026 | Resolved all four open questions: pre-launch clean cutover (no user migration), webhooks via `POST /api/webhooks/clerk` with `svix` verification, ~60s revocation lag accepted as-is, identical Clerk config across both deployment paths |
| 13 August 2026 | Added Clerk account/application setup steps to Notes — no Clerk account exists yet |
