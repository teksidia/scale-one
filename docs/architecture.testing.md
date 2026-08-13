# Architecture: Testing

Companion to [`architecture.md`](./architecture.md) — defines the test
pyramid for this stack, which security requirements need a test and at
which layer, and the data/environment strategy the pyramid depends on.
Not a general testing philosophy; tuned to the Hono/Drizzle/Neon/React
split already committed to in `architecture.md`.

## Test Pyramid

### 1. Domain unit tests (base tier)

[`architecture.md` → Best Practices](./architecture.md#best-practices)
already mandates the domain/HTTP split so domain functions are
"unit-testable without spinning up Hono." This tier is what that
separation is for — plain functions in, plain data out, no Hono
`Context`, no DB, no network. Cheapest tier, gates every commit.

Covers:
- **Lead lifecycle** (`domain/leads.ts`): every transition in the
  [Lead Lifecycle](./architecture.md#lead-lifecycle) state machine —
  valid and invalid — plus the expiry-overrides-everything rule.
- **Points ledger** (`domain/points.ts`): `+10`/`-10` on confirmation,
  ledger-not-counter invariants, no double-application on a re-confirm.
- **Availability rules** (`domain/availability.ts`), once built.
- **Password/session/rate-limit math** (`lib/`): hash encode/decode
  round-trip, session ID shape, rate-limit window boundary (Nth attempt
  allowed, N+1th rejected) — pure counter/string logic, no Workers KV
  needed to exercise it.

Tool: **Vitest**.

### 2. Route/integration tests (middle tier)

Route-contract tests against a real Hono app instance and a real
(branched) Neon DB via Drizzle — but no browser, no `wrangler dev`
socket. Hono apps support calling `app.request(path, init, env)`
directly in-process and getting a real `Response` back, which is the
right-sized tool here — lighter than routing API-level checks through a
browser automation tool.

Covers: invalid/expired/reused invite token all returning the identical
message, the concurrent-same-token race on the invite consumption
`UPDATE`, CORS/cookie headers on the response, CSRF rejection on
`/auth/logout`, the `429` + `Retry-After` shape.

Tool: **Vitest**, with `@cloudflare/vitest-pool-workers` for Workers KV
emulation (rate limiting) and a Neon branch for the DB (see
[Test Data & Environment Strategy](#test-data--environment-strategy)).

### 3. E2E/browser tests (top tier, deliberately thin)

Reserved for what only shows up when the whole stack is wired together
for real: frontend build, backend, cookies, CORS, redirects, all
interacting simultaneously. A handful of golden-path walkthroughs, not a
matrix — if a bug can be caught at tier 1 or 2, it should be, since E2E
tests are the slowest to run and the most annoying to debug on failure.

- Accept invite → session cookie set → redirected to `/leads`.
- Login → `/leads` → logout → login again (session rotation visible
  end-to-end).
- Post a lead → express interest → assign → confirm → points ledger
  reflects it.

Tool: **Playwright** (already wired in via `.mcp.json` for interactive
use during development — `@playwright/test` reuses the same tool for the
scripted suite rather than introducing a second framework).

## Security Requirements → Test Matrix

[`architecture.md` → Session Handling Requirements](./architecture.md#session-handling-requirements)
is a binding checklist, not a suggestion — each item needs a test at
*some* tier or it will silently rot as the codebase changes around it.

| Requirement | Tier | Notes |
| --- | --- | --- |
| Session rotation on login | 2 | New `Session` row, old one deleted, distinct ID |
| Cookie flags on every session-issuing response | 2 | `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/` |
| Account-enumeration message parity | 2 | Identical string for login and accept-invite failure modes |
| CSRF double-submit on logout | 2 | Missing/invalid `X-CSRF-Token` rejected |
| Invite single-use under concurrency | 2 | Two concurrent requests, same token — exactly one succeeds |
| Rate limit boundary (accept-invite, login) | 1 (counter math) + 2 (KV-backed) | Nth allowed, N+1th `429` with `Retry-After` |
| Full walkthrough over HTTPS | 3 | Post-[00e](./cycles/sprint-001/00e-cloudflare-deploy-and-walkthrough/specification.md) deploy, against the real Cloudflare instance |

## Explicitly Out of Scope

- Visual regression testing.
- Cross-browser test matrices.
- Load/performance testing.

None of these match the risk profile of a single-tenant community tool
at this stage — revisit if that changes.

## Already Covered Without a Test File

TypeScript + Drizzle + the `hc` typed client already pay for a class of
tests other stacks need to write by hand: renaming a schema field is a
compile error everywhere it's referenced, not a silent runtime
`undefined`. This is called out explicitly in
[00a's Acceptance Criteria](./cycles/sprint-001/00a-scaffolding-and-schema/specification.md#acceptance-criteria)
and doesn't need duplicating as a test.

## Test Data & Environment Strategy

Every tier above tier 1 needs isolated state:

- **Database**: Neon branching — a cheap ephemeral branch per test run,
  or one long-lived branch truncated between runs — rather than
  introducing Docker/local Postgres. Matches the Neon-only stack already
  committed to in [Stack](./architecture.md#stack); avoids a second
  persistence technology existing solely for tests.
- **Workers KV** (rate limiting): local emulation via
  `@cloudflare/vitest-pool-workers` / `wrangler dev`'s local mode — no
  real Cloudflare account needed for tests.
- Manual, one-off DB seeding (raw SQL against the real dev database, as
  used to verify [00b](./cycles/sprint-001/00b-accept-invite/specification.md)
  by hand) is fine for spot-checking during development, but is not a
  substitute for isolated automated test data — don't let it become the
  de facto test strategy by default.

## Notes
- Related: [architecture.md](./architecture.md).

# Change Log

|Date | Change |
| --- | --- |
| 13 August 2026 | First draft — test pyramid, security requirement → test tier matrix, and Neon-branching data strategy, split out into its own file per architecture.md's convention of keeping architecture.md itself concise |
