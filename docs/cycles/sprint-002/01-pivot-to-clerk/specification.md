# Spec: Pivot to Clerk

## Source Requirement
- [`./requirements.md`](./requirements.md)
- [`architecture.md` → Auth](../../../architecture.md#auth) — the session-cookie
  decision this ticket supersedes
- [`architecture.md` → GDPR / Deletion](../../../architecture.md#gdpr--deletion)
  — governs how `user.deleted` webhook events are handled below

## Prerequisites

No Clerk account exists yet for this project — these are the one-time setup
steps, in order, before any of the code changes in this spec can be built or
tested.

### 1. Create a Clerk account and application
1. Sign up at [dashboard.clerk.com/sign-up](https://dashboard.clerk.com/sign-up)
   (or sign in if an account already exists).
2. Create an application (the sign-up flow drops you straight into this form
   for your first app; afterwards it's the **Create application** card on the
   dashboard home).
3. In the sign-up/sign-in configuration step, enable **Email address** and
   **Password** as identifiers/strategies. Other identifiers (phone, social
   login, etc.) aren't needed — the accept-invite flow only ever creates
   email+password accounts server-side.
4. Create a second, separate Clerk application for production if you want
   test and production auth data fully isolated (recommended, mirrors having
   separate Neon databases per environment) — repeat these steps for it, and
   keep its keys separate from the dev/test app's keys throughout the rest of
   this section.

### 2. Restrict public sign-up
This project's design assumes Clerk's own hosted sign-up **never** creates an
account directly — every account is provisioned server-side via
`/api/auth/accept-invite` (see [API Contract](#api-contract)), so invite-only
membership stays enforced. In the Clerk Dashboard, under the application's
**Restrictions** (or **User & Authentication → Restrictions**) settings,
disable public sign-up / set sign-up to restricted. If the frontend never
renders Clerk's `<SignUp/>` component or calls `useSignUp()` (it doesn't,
per this spec), this is a defense-in-depth step, not strictly load-bearing —
but skipping it leaves a live public sign-up endpoint reachable directly
against Clerk's API, outside this app's invite gating.

### 3. Get the API keys
On the application's **API Keys** page in the dashboard:
- Copy the **Publishable key** (`pk_test_...` / `pk_live_...`) — this is
  public, safe to ship in frontend bundle code.
- Copy the **Secret key** (`sk_test_...` / `sk_live_...`) — backend-only,
  never exposed to the frontend.

### 4. Configure the webhook endpoint and get its signing secret
The webhook endpoint (`POST /api/auth/webhooks/clerk`) needs a real,
internet-reachable HTTPS URL — it can't be configured against `localhost`.
1. Deploy the backend once (even with the webhook route stubbed/unbuilt is
   fine for getting a URL) **or**, for local development before a deploy
   exists, expose `wrangler dev` via a tunnel — `ngrok http 8787` (Clerk's
   own docs default) or `cloudflared tunnel --url http://localhost:8787`
   (fits this project's existing Cloudflare-centric stack) — and use the
   resulting forwarding URL instead.
2. In the Clerk Dashboard, go to **Webhooks → Add Endpoint**.
3. Enter the endpoint URL with the route appended, e.g.
   `https://<your-worker>.workers.dev/api/auth/webhooks/clerk` (production)
   or `https://<ngrok-id>.ngrok-free.app/api/auth/webhooks/clerk` (local dev
   tunnel).
4. Subscribe to the **`user.created`** and **`user.deleted`** events only
   (found under the endpoint's event picker, sourced from the **Event
   Catalog** tab on the main Webhooks page if you need to browse first).
5. Save, then open the created endpoint and copy its **Signing Secret**
   (`whsec_...`) — this is `CLERK_WEBHOOK_SIGNING_SECRET` below. Each
   endpoint (dev tunnel vs. production URL) gets its own signing secret, so
   local dev and production will have different values here even if
   everything else matches.
6. Webhook delivery isn't guaranteed instantaneous or exactly-once — the
   idempotent upsert behavior specified in
   [`POST /api/auth/webhooks/clerk`](#post-apiauthwebhooksclerk-new) already
   accounts for this (redelivery), not something to special-case further
   during setup.

### 5. Set environment variables
Backend (secret — never committed):
- `CLERK_SECRET_KEY`
- `CLERK_WEBHOOK_SIGNING_SECRET`

Frontend (public, `VITE_`-prefixed per the existing `VITE_API_URL`
convention):
- `VITE_CLERK_PUBLISHABLE_KEY`

Locally: add the backend two to `backend/.dev.vars` (same file `DATABASE_URL`
already lives in, gitignored) and `VITE_CLERK_PUBLISHABLE_KEY` to
`frontend/.env` (also gitignored, same as `VITE_API_URL`'s local override).

In production: `wrangler secret put CLERK_SECRET_KEY` and `wrangler secret
put CLERK_WEBHOOK_SIGNING_SECRET` against the backend Worker (same pattern as
the existing `DATABASE_URL` secret — see `wrangler.toml`'s comment on it).
`VITE_CLERK_PUBLISHABLE_KEY` is a **build-time** value baked into the static
frontend bundle, so it must be injected the same way `VITE_API_URL` is in
[`.github/workflows/deploy.yml`](../../../../.github/workflows/deploy.yml)
— as a GitHub Actions secret passed through the `env:` block of the "Build
and deploy" step, not a Worker secret (it isn't read at Worker runtime at
all).

### 6. Add dependencies
- `@clerk/backend` and `@hono/clerk-auth` → `backend/package.json`.
- `svix` → `backend/package.json` (webhook signature verification).
- `@clerk/clerk-react` → `frontend/package.json`.

## Overview
Replaces the custom session-cookie auth built in
[00-skeleton-spike](../../sprint-001/00-skeleton-spike/specification.md),
[00b](../../sprint-001/00b-accept-invite/specification.md), and
[00c](../../sprint-001/00c-login-session-guard-logout/specification.md) with
Clerk-managed sessions, while preserving the invite-only signup contract:
`/api/auth/accept-invite` still consumes an `invite` row, but now provisions a
Clerk account instead of hashing a password locally. The local `user` table
becomes a projection of Clerk's user data (kept in sync via webhook) plus the
domain fields Clerk doesn't own (`membershipStatus`, and future fields like
`referralPoints`).

## Data Models

### `user` (changed)
```
User {
  id: uuid
  clerkUserId: string (unique, not null)   // new — replaces passwordHash as the identity link
  email: string (not null, unique)
  membershipStatus: 'invited' | 'approved' | 'suspended' | 'revoked'  // new
  createdAt: timestamp
}
```
- `passwordHash` column is dropped — Clerk owns credentials entirely.
- `membershipStatus` is new (previously undocumented-but-planned in
  [architecture.md's Data Model](../../../architecture.md#user)); this ticket
  introduces the column and enforces it, but does **not** build any
  admin-facing way to change it — see [Out of Scope](#out-of-scope). Until
  that exists, changing `suspended`/`revoked` is a manual DB operation.
- Default on creation (see [Business Rules](#business-rules--constraints) for
  when each applies): `approved` for accounts provisioned through
  `/api/auth/accept-invite`; `invited` for any Clerk user the webhook sees
  that didn't come through that path (defensive default — see
  [Edge Cases](#edge-cases)).

### `session` (removed)
Dropped entirely. Clerk owns session storage/verification; nothing in this
schema needs to model a session.

### `invite` (unchanged)
Same shape as [00a](../../sprint-001/00a-scaffolding-and-schema/specification.md#data-models)
— `id`, `token`, `email`, `status`, `expiresAt`, `createdAt`. Still the
mechanism that gates who may obtain an account.

## API Contract

### `POST /api/auth/accept-invite` (contract changes; route path unchanged)
- **Purpose**: consumes an invite and provisions the corresponding Clerk
  account, then hands the frontend a way to establish a live session
  immediately (no separate login step required right after accepting an
  invite).
- **Body**: `{ token: string, password: string }` (unchanged from today).
- **Behavior**:
  1. Rate-limit check (unchanged — reuses the existing `RATE_LIMIT` KV
     pattern).
  2. Atomically validate + consume the invite exactly as today (single
     `UPDATE ... WHERE status = 'pending' AND expiresAt > now()`).
  3. Call the Clerk Backend API to create the user: `clerkClient.users.createUser({
     emailAddress: [consumedInvite.email], password })`, tagging the new
     Clerk user with `publicMetadata: { invitedViaToken: true }` so the
     webhook handler (below) can tell this account came through the vetted
     path.
  4. Call `clerkClient.signInTokens.createSignInToken({ userId, expiresInSeconds:
     60 })` to mint a short-lived, single-use sign-in token.
  5. Return the token to the frontend. **Do not** create the local `user` row
     here — that happens reactively via the `user.created` webhook (single
     write path, avoids two code paths racing to create the same row).
- **Response**: `200 { signInToken: string }`
- **Errors**:
  - `400` — invalid/expired/already-consumed invite (`GENERIC_INVITE_ERROR`,
    unchanged message).
  - `400` — password under `MIN_PASSWORD_LENGTH` (unchanged).
  - `409` — Clerk already has an account for this email (edge case — surfaced
    as the same generic invite error to the client; see
    [Edge Cases](#edge-cases)).

### `POST /api/auth/webhooks/clerk` (new)
- **Purpose**: sole source of truth for creating/updating local `user` rows
  from Clerk account lifecycle events.
- **Auth**: no session/CSRF — verified instead via `svix` against
  `CLERK_WEBHOOK_SIGNING_SECRET` (checks the `svix-id`, `svix-timestamp`,
  `svix-signature` headers). This route is excluded from the `clerkAuth`
  middleware ([below](#clerkauth-middleware-new)).
- **`user.created`**: upserts a local `user` row keyed on `clerkUserId`
  (idempotent — Clerk/svix may redeliver). `membershipStatus` is `approved`
  if `publicMetadata.invitedViaToken === true`, else `invited` (see
  [Edge Cases](#edge-cases)).
- **`user.deleted`**: anonymizes the local `user` row per
  [architecture.md → GDPR / Deletion](../../../architecture.md#gdpr--deletion)
  — nulls email/PII, keeps the row (Leads/Interests/Points ledger entries
  reference it). Does not delete the row.
- **Response**: `200` on success; `400` on signature verification failure.

### `GET /api/auth/me` (contract changes; route path unchanged)
- **Purpose**: lets the frontend fetch the current user's local profile
  (`membershipStatus` and future domain fields), gated by a valid Clerk
  session.
- **Auth**: via the new `clerkAuth` middleware, not a manually-read cookie.
- **Response**: `200 { user: { id, email, membershipStatus } }` if the Clerk
  session is valid **and** a local `user` row exists with `membershipStatus
  === 'approved'`.
- **Errors**:
  - `401` — no valid Clerk session (mirrors "not authenticated").
  - `403` — valid Clerk session, but local `membershipStatus` is
    `invited`, `suspended`, or `revoked` (distinguishable from `401` so the
    frontend can show "your account isn't approved yet" instead of bouncing
    to `/login`, which would loop).

### Removed
- `POST /api/auth/login` — the frontend authenticates directly against
  Clerk's API via `useSignIn()`; no backend route needed.
- `POST /api/auth/logout` — the frontend calls Clerk's `signOut()` directly;
  no backend route, no CSRF token (nothing server-side to invalidate on our
  side).

## `clerkAuth` middleware (new)
Registered once in `app.ts` on `/api/*`, **excluding**
`/api/auth/webhooks/clerk` (which uses its own Svix verification instead):
- Uses `@hono/clerk-auth`'s `clerkMiddleware()` + `getAuth(c)` to verify the
  Clerk session token (read from the `Authorization: Bearer` header the
  frontend attaches via `getToken()` — see
  [Component / UI Behaviour](#component--ui-behaviour)).
- On a valid Clerk session: loads the local `user` row by `clerkUserId`.
  - No local row yet (webhook hasn't synced, or a `user.created` delivery is
    still pending) → `403`.
  - Row exists but `membershipStatus` isn't `approved` → `403`.
  - Otherwise: `c.set('user', userRow)` for downstream handlers.
- No valid Clerk session → `401`.
- Replaces the repeated manual `getValidSession`/`touchSession` calls
  currently duplicated in `routes/leads.ts` and `routes/auth.ts`'s `/me`
  handler — those become a single `c.get('user')` read.

## Component / UI Behaviour

- **`main.tsx`**: wraps `<App />` in `<ClerkProvider publishableKey={...}>`.
- **`LoginPage`** (`/login`): replaced with Clerk's `useSignIn()` hook behind
  the existing form styling (or Clerk's prebuilt `<SignIn/>` component if
  matching current styling isn't worth the extra code — implementer's call,
  see [Open Questions](#open-questions)).
- **`AcceptInvitePage`**: form still collects `token` + `password` and posts
  to `/api/auth/accept-invite` (contract above). On `200`, calls
  `useSignIn().signIn.create({ strategy: 'ticket', ticket: signInToken })` to
  establish a live Clerk session immediately, then redirects to `/leads` —
  same one-step "accept invite → land in the app" UX as today.
- **`App.tsx` route guard**: replaced with Clerk's `useAuth()`
  (`isLoaded`/`isSignedIn`) instead of the manual pathname-matching +
  `GET /api/auth/me` bootstrap fetch. Once `isSignedIn`, the app still calls
  `GET /api/auth/me` once to fetch `membershipStatus`:
  - `approved` → render `LeadsPage`.
  - `403` (not approved) → render a distinct "pending approval" state, not a
    redirect to `/login` (redirecting would loop, since the user *is* signed
    into Clerk).
- **`lib/api.ts`**: `guardedFetch` attaches `Authorization: Bearer <token>`
  (from Clerk's `getToken()`) to every request instead of relying on an
  ambient cookie. `401` handling (redirect to `/login`) is unchanged; a new
  `403` case is handled per-caller (see `App.tsx` above), not globally,
  since `403` means "authenticated but not approved," not "log in again."

## Business Rules & Constraints

- **No CSRF token/double-submit pattern.** Clerk-authenticated requests carry
  the session token as a `Bearer` header, which — unlike an ambient cookie —
  the browser never attaches automatically to a cross-site request, so CSRF
  doesn't apply the way it did to the old cookie-based `/api/auth/logout`.
  `lib/csrf.ts` and its usages are deleted.
- **`membershipStatus` enforcement lives in one place** (`clerkAuth`
  middleware), not duplicated per-route — this is what the requirements
  ticket's centralization requirement resolves to concretely.
- **Revocation lag**: accepted as up to Clerk's session-token refresh window
  (~60s) per [requirements.md](./requirements.md#requirements) — no
  synchronous per-request Clerk API call is made; the `membershipStatus`
  check against our own DB is what actually enforces suspension/revocation,
  and that check has no lag (it's a normal DB read on every request).
- **Rate limiting**: `/api/auth/accept-invite` keeps its existing per-IP rate
  limit (Clerk account creation still funnels through this route). Login
  rate-limiting is no longer our responsibility — Clerk's hosted sign-in
  handles it.
- **Local `user` row is written only by the webhook handler.**
  `/api/auth/accept-invite` never inserts into `user` directly, avoiding two
  code paths racing to create the same row (see
  [Edge Cases](#edge-cases) for the resulting timing edge case).

## Edge Cases

- **Webhook race**: `/api/auth/accept-invite` returns a `signInToken` before
  the `user.created` webhook necessarily lands. If the frontend's sign-in
  succeeds and `GET /api/auth/me` is called before the webhook has synced,
  `clerkAuth` middleware returns `403` (no local row yet). The frontend
  treats this identically to "not approved yet" and can retry briefly —
  distinct handling here isn't needed since the window is short and the
  existing `403` UI state already covers it.
- **Clerk account created outside `/api/auth/accept-invite`** (e.g. manually
  via the Clerk dashboard, without `publicMetadata.invitedViaToken`): the
  webhook creates a local row with `membershipStatus: 'invited'` — locked
  out of the app until manually approved in the DB. Preserves invite-only
  intent even without dedicated admin tooling.
- **Duplicate webhook delivery**: `user.created`/`user.deleted` handlers
  upsert/idempotently update by `clerkUserId`, tolerating Clerk/svix
  redelivery.
- **Invite valid, but Clerk already has an account for that email** (e.g. a
  previous accept-invite partially failed after consuming the invite but
  before/during Clerk account creation): `clerkClient.users.createUser` fails;
  return the same generic invite error — don't leak that the email already
  exists on Clerk.
- **`user.deleted` for a user with existing Leads/Interests/Points ledger
  rows**: anonymized, not cascade-deleted, per
  [architecture.md → GDPR / Deletion](../../../architecture.md#gdpr--deletion).

## Acceptance Criteria

- [ ] Given a pending, unexpired invite token and a valid password, `POST
      /api/auth/accept-invite` returns `200 { signInToken }`, consumes the
      invite (status → `accepted`), and creates a Clerk account for that
      email — but does **not** create a local `user` row synchronously.
- [ ] Given the `signInToken` from the above, exchanging it via
      `useSignIn().signIn.create({ strategy: 'ticket', ... })` establishes a
      live Clerk session without a further login step.
- [ ] Given a verified `user.created` webhook payload with
      `publicMetadata.invitedViaToken === true`, a local `user` row is
      created with `membershipStatus: 'approved'`.
- [ ] Given a verified `user.created` webhook payload without that metadata,
      the local row is created with `membershipStatus: 'invited'`.
- [ ] Given an unverified/invalid-signature request to `POST
      /api/auth/webhooks/clerk`, the request is rejected with `400` and no
      local data changes.
- [ ] Given a valid Clerk session but no matching local `user` row (or one
      with `membershipStatus` not `approved`), any `/api/*` route protected
      by `clerkAuth` returns `403`, not `200`.
- [ ] Given no Clerk session at all, any `/api/*` route protected by
      `clerkAuth` returns `401`.
- [ ] Given a `user.deleted` webhook event, the corresponding local `user`
      row's PII is nulled/anonymized and the row is **not** deleted.
- [ ] `session.ts`, `password.ts`, `csrf.ts`, the `session` table, and the
      `passwordHash` column no longer exist in the codebase/schema after this
      ticket lands.

## Out of Scope

- Admin API/UI for changing `membershipStatus` (approve/suspend/revoke) —
  changing it is a manual DB operation until a future ticket builds this.
  Mirrors [requirements.md → Out of Scope](./requirements.md#out-of-scope).
- Any data migration for existing accounts — pre-launch, per
  [requirements.md → Migration approach](./requirements.md#migration-approach);
  the local `user` table is reset, not migrated.
- A provider-agnostic auth abstraction layer — explicitly deferred, per
  [requirements.md](./requirements.md#out-of-scope).
- Password reset UI/flow — entirely Clerk's hosted flow, no custom page.
- Clerk Organizations or any multi-tenant Clerk feature — this project is
  single-tenant per [architecture.md](../../../architecture.md#system-overview).
- Changes to `LeadsPage` or any non-auth route/page.

## Open Questions

- **Prebuilt `<SignIn/>` vs. custom form via `useSignIn()`** for `LoginPage`
  — a styling/cosmetic choice, not a contract question; left to the
  implementer, doesn't affect any acceptance criterion above.
- **`@hono/clerk-auth` vs. hand-rolled `@clerk/backend` `verifyToken` calls**
  for the `clerkAuth` middleware — `@hono/clerk-auth` is the standard/
  maintained integration and is assumed above, but if it proves incompatible
  with the Workers runtime at implementation time, falling back to
  `@clerk/backend` directly satisfies the same contract (this spec doesn't
  depend on which).

## Notes
- Related: [requirements.md](./requirements.md),
  [architecture.md](../../../architecture.md),
  [00-skeleton-spike/specification.md](../../sprint-001/00-skeleton-spike/specification.md),
  [00b-accept-invite/specification.md](../../sprint-001/00b-accept-invite/specification.md),
  [00c-login-session-guard-logout/specification.md](../../sprint-001/00c-login-session-guard-logout/specification.md)
  — this spec replaces the contracts those established.

# Change Log

|Date | Change |
| --- | --- |
| 13 August 2026 | First draft |
| 13 August 2026 | Expanded Prerequisites into full Clerk account/application setup steps (sign-up, restricting public sign-up, API keys, webhook endpoint + signing secret, env vars, dependencies) — no Clerk account existed yet |
