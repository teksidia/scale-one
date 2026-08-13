# Spec: Cloudflare Deploy & Full Walkthrough

## Source Requirement
- [`./requirements.md`](./requirements.md)
- [`00-skeleton-spike/specification.md`](../00-skeleton-spike/specification.md) — deploy goal and final walkthrough acceptance criterion this ticket implements
- [`architecture.md` → Deployment](../../../architecture.md#deployment)

## Prerequisites

Builds on the Neon/Cloudflare accounts and KV namespace already required by
[00a](../00a-scaffolding-and-schema/specification.md#prerequisites) and
[00b](../00b-accept-invite/specification.md#prerequisites) — no new
*accounts* needed, but this ticket needs additional credentials/config
from those accounts to do a repeatable production deploy:

- **Neon**: the `DATABASE_URL` for whichever database is being deployed
  against (the same Neon project used in development is fine for the
  spike; a separate production project is optional, not required).
- **Cloudflare secret, not a plaintext var**: the Neon connection string is
  set via `wrangler secret put DATABASE_URL` (encrypted at rest) — it must
  not be committed to `wrangler.toml` as a `[vars]` entry.
- **Cloudflare API Token** — only needed if deploying non-interactively
  (script/CI) rather than from a developer's authenticated `wrangler
  login` session. Create one at
  [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
  scoped to: `Workers Scripts:Edit`, `Workers KV Storage:Edit`, and
  `Cloudflare Pages:Edit`.
- The **KV namespace ID** (from [00b](../00b-accept-invite/specification.md#prerequisites))
  bound under the production environment in `wrangler.toml` — reuse the
  same namespace, or bind a separate `production` one; either is fine.

## Overview
This ticket doesn't add features — it takes the app built across
[00a](../00a-scaffolding-and-schema/specification.md)–[00d](../00d-leads-list/specification.md)
and finalizes it for production deployment on Cloudflare, then proves the
spike's entire reason for existing: the full walkthrough works end-to-end
against a real deployed instance, not just `localhost`.

## Data Models
None new. Uses `User`, `Invite`, `Session`, `Lead` as defined in
[00a → Data Models](../00a-scaffolding-and-schema/specification.md#data-models).

## API Contract
No new routes. All four auth routes
([00b](../00b-accept-invite/specification.md#api-contract),
[00c](../00c-login-session-guard-logout/specification.md#api-contract))
and `/api/leads` ([00d](../00d-leads-list/specification.md#api-contract)) are
exercised as-is against the deployed instance. All API routes were moved
under `/api/*` as part of this ticket — see [report.md](./report.md) and
[architecture.md → API Pattern](../../../architecture.md#api-pattern).

## Component / UI Behaviour
No new pages. `AcceptInvitePage`, `LoginPage`, and `LeadsPage`
([00b](../00b-accept-invite/specification.md#component--ui-behaviour),
[00c](../00c-login-session-guard-logout/specification.md#component--ui-behaviour),
[00d](../00d-leads-list/specification.md#component--ui-behaviour)) are
exercised as-is via the deployed frontend URL.

## Business Rules & Constraints

- **Transport**: HTTPS only; Cloudflare enforces this by default for the
  deployed spike — confirmed here, not assumed.
- Neon connection string and any other secrets are configured as Cloudflare
  Worker environment variables/secrets, never committed to the repo.
- The Workers KV namespace used for rate limiting
  ([00b](../00b-accept-invite/specification.md#business-rules--constraints),
  [00c](../00c-login-session-guard-logout/specification.md#business-rules--constraints))
  is bound in the production `wrangler` configuration.
- `VITE_API_URL` (or equivalent) on the deployed frontend points at the
  deployed Worker, per [instructions.md → Key Conventions](../../../instructions.md#key-conventions).

## Edge Cases
- N/A beyond what [00b](../00b-accept-invite/specification.md#edge-cases)–[00d](../00d-leads-list/specification.md#edge-cases)
  already define — this ticket re-exercises those paths against the
  deployed instance rather than introducing new ones.

## Acceptance Criteria

- [x] The full app (Hono API + React SPA) deploys to Cloudflare
      Pages/Workers without manual post-deploy fixes. (True for the deploy
      step itself — `pnpm deploy` is one command. Getting the *app* to that
      state took three production-only bug fixes first; see
      [post-implementation-notes.md](./post-implementation-notes.md).)
- [x] The full walkthrough (accept invite → land on `/leads` → logout →
      login again → land on `/leads`) succeeds against the
      Cloudflare-deployed instance over HTTPS.
- [x] The session cookie set by the deployed instance carries `HttpOnly`,
      `Secure`, and `SameSite=Lax`.
- [x] 11 consecutive failed `POST /api/auth/login` attempts against the
      deployed instance return `429` on the 11th, confirming the Workers
      KV rate-limit binding works in production (not just local dev).

## Out of Scope
- Any new routes, pages, schema, or business logic.
- Docker/self-host deployment — Cloudflare only, per
  [00-skeleton-spike/specification.md → Out of Scope](../00-skeleton-spike/specification.md#out-of-scope).
- CI/CD pipeline automation beyond what's needed to deploy manually/on demand.

## Open Questions
- None beyond what's already carried in
  [00-skeleton-spike/specification.md → Open Questions](../00-skeleton-spike/specification.md#open-questions).

## Notes
- Related: [00-skeleton-spike/specification.md](../00-skeleton-spike/specification.md),
  [00a-scaffolding-and-schema/specification.md](../00a-scaffolding-and-schema/specification.md),
  [architecture.md](../../../architecture.md).

# Change Log

|Date | Change |
| --- | --- |
| 12 August 2026 | First draft, split out of 00-skeleton-spike |
| 12 August 2026 | Added Prerequisites section (production secrets, API token, KV binding) |
