# Spec: Scaffolding & Schema

## Source Requirement
- [`./requirements.md`](./requirements.md)
- [`00-skeleton-spike/specification.md`](../00-skeleton-spike/specification.md) — proposed layout and full Data Models section this ticket implements
- [`architecture.md` → Data Model](../../../architecture.md#data-model)

## Prerequisites

External accounts that must exist before this ticket can start — nothing
in this repo provisions them:

**Neon** (Postgres):
- A Neon account ([neon.tech](https://neon.tech)) and a Neon project.
- That project's connection string (`DATABASE_URL`), from the Neon console
  — format `postgresql://<user>:<password>@<host>/<dbname>?sslmode=require`.
  Needed locally to run migrations, and later as a Worker secret (see
  [00e's Prerequisites](../00e-cloudflare-deploy-and-walkthrough/specification.md#prerequisites)).
- Recommended: use Neon's HTTP-based serverless driver
  (`@neondatabase/serverless`) rather than a raw TCP driver — Workers can't
  hold long-lived TCP connections, and Neon's driver is built for exactly
  this. (Implementation detail, not a hard requirement of this spec.)

**Cloudflare** (Workers + Pages):
- A Cloudflare account (free tier is sufficient).
- The Wrangler CLI authenticated against it — `wrangler login` for
  interactive/local use. (A scoped API token is only needed for
  non-interactive deploys; see [00e's Prerequisites](../00e-cloudflare-deploy-and-walkthrough/specification.md#prerequisites).)
- The account's **Account ID** (Cloudflare dashboard sidebar), required in
  `wrangler.toml`.Lets implement 
- A `workers.dev` subdomain on the account — provisioned automatically on
  the first `wrangler deploy`, or set explicitly in the dashboard.
- A Cloudflare Pages project for the frontend (`wrangler pages project
  create`, or created via the dashboard).

Whoever picks up this ticket needs these credentials in hand (or the
ability to create them) before the migration and deploy acceptance
criteria below can be exercised.

## Overview
This ticket builds the skeleton the rest of sprint-001's `00-` tickets sit
on: the repo layout, the Drizzle schema, and a minimal deploy to Cloudflare
that proves the `hc` typed-RPC chain works before any real route or page
exists. Nothing here is user-facing.

Layout (unchanged from the original spike spec):
```
/backend
  /src
    /db          — Drizzle schema + migrations
    /routes      — auth.ts, leads.ts (empty/placeholder until 00b–00d)
    /lib         — session.ts, password.ts, rateLimit.ts (added in 00b/00c)
    app.ts       — Hono app, exports type for hc
    index.ts     — Workers entry
/frontend
  /src
    /pages       — AcceptInvitePage, LoginPage, LeadsPage (added in 00b–00d)
    /lib         — api.ts (hc client instance)
    App.tsx      — routing + auth guard (added in 00c)
```

## Data Models

```ts
User {
  id: string            // uuid
  email: string          // unique
  passwordHash: string   // argon2id or PBKDF2 — hashing implementation is 00b's concern
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

Nothing here is nullable beyond what's shown; no soft-delete/obfuscation
fields — out of scope per [architecture.md GDPR](../../../architecture.md#gdpr--deletion).

This is the canonical schema definition for every `00-` ticket — 00b–00e
reference these shapes rather than redefining them.

## API Contract

No business routes in this ticket. A single placeholder route is deployed
purely to validate the deploy + `hc` type pipeline (exact path/shape is an
implementation detail — it is replaced by real routes in 00b–00d, not
additive to them).

- **Purpose**: prove a request reaches the deployed Worker and a typed
  response reaches the deployed frontend through `hc`, with nothing else
  layered on top.

## Component / UI Behaviour

- The Vite app's entry renders something derived from the placeholder
  route's response (e.g. the response payload echoed to the page) — no
  routing, no pages, no styling. `AcceptInvitePage`/`LoginPage`/`LeadsPage`
  don't exist yet.

## Business Rules & Constraints

- API base URL is environment-configured on the frontend (`VITE_API_URL`),
  never hardcoded, per [instructions.md → Key Conventions](../../../instructions.md#key-conventions).
- Neon connection is via Drizzle, using the same connection pattern the
  later tickets' routes will reuse.
- Migrations must be runnable repeatedly against a fresh database without
  manual intervention.

## Edge Cases

- N/A — no business logic exists yet to have edge cases. The only failure
  mode in scope is the migration failing against a fresh database, which
  the acceptance criteria already cover.

## Acceptance Criteria

- [ ] Given a fresh Neon database, running the Drizzle migration creates
      `User`, `Invite`, `Lead`, and `Session` tables without error.
- [ ] Given the deployed Hono Worker, a request over HTTPS returns a
      response.
- [ ] Given the deployed Vite frontend, it calls the deployed Worker via
      `hc` and renders the response with no manual type annotations.
- [ ] Renaming a field on any schema table causes a TypeScript compile
      error anywhere that field is referenced from the frontend.

## Out of Scope

- Auth routes and pages — [00b-accept-invite](../00b-accept-invite/specification.md),
  [00c-login-session-guard-logout](../00c-login-session-guard-logout/specification.md).
- `/leads` route and `LeadsPage` — [00d-leads-list](../00d-leads-list/specification.md).
- Rate limiting, CSRF, password hashing.
- Production wrangler config, secrets, and the full deployed walkthrough —
  [00e-cloudflare-deploy-and-walkthrough](../00e-cloudflare-deploy-and-walkthrough/specification.md).
- Mirrors [00-skeleton-spike/specification.md → Out of Scope](../00-skeleton-spike/specification.md#out-of-scope).

## Open Questions
- None specific to this ticket. The seed-script-vs-raw-insert question from
  the original spike is resolved in [00b-accept-invite](../00b-accept-invite/requirements.md#open-questions).

## Notes
- Related: [00-skeleton-spike/specification.md](../00-skeleton-spike/specification.md),
  [architecture.md](../../../architecture.md).

# Change Log

|Date | Change |
| --- | --- |
| 12 August 2026 | First draft, split out of 00-skeleton-spike |
| 12 August 2026 | Added Prerequisites section (Neon + Cloudflare account requirements) |
