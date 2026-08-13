# Feature: Cloudflare Deploy & Full Walkthrough

## Overview
Final ticket in the [Skeleton Spike](../00-skeleton-spike/requirements.md)
split, depending on [00a](../00a-scaffolding-and-schema/requirements.md)
through [00d](../00d-leads-list/requirements.md) all being built. Where
00a proved the deploy *pipeline* with a placeholder route, this ticket
finalizes production configuration for the full app and proves the
complete invite → login → list-leads → logout → login walkthrough against
the deployed instance over HTTPS — the spike's actual purpose.

## Requirements
- The full Hono API and React SPA deploy to Cloudflare Pages/Workers with
  production configuration: Neon connection string, Workers KV namespace
  binding for rate limiting, and any other secrets as environment
  variables/secrets (not hardcoded).
- HTTPS is confirmed on the deployed instance (Cloudflare default) and all
  session cookie flags (`HttpOnly`, `Secure`, `SameSite=Lax`) are verified
  in the deployed environment, not just locally.
- The full walkthrough — accept invite → land on `/leads` → logout → login
  again → land on `/leads` — succeeds against the deployed instance.

## Acceptance Criteria
- [x] The full app (Hono API + React SPA) deploys to Cloudflare
      Pages/Workers. (One Worker, not split Pages/Workers — see
      [specification.md](./specification.md) and
      [post-implementation-notes.md](./post-implementation-notes.md).)
- [x] The full walkthrough (accept invite → land on `/leads` → logout →
      login again → land on `/leads`) succeeds against the
      Cloudflare-deployed instance over HTTPS.
- [x] Performing the walkthrough against the deployed URL confirms the
      session cookie carries `HttpOnly`, `Secure`, and `SameSite=Lax` in
      the deployed environment.
- [x] Rate limiting (10 attempts / 5 min) is confirmed working against the
      deployed instance's Workers KV binding, not just a local mock.

## Out of Scope
- Any new routes, pages, or business logic — this ticket only configures
  and validates deployment of what [00a](../00a-scaffolding-and-schema/requirements.md)–[00d](../00d-leads-list/requirements.md)
  already built.
- Docker/self-host deployment path — Cloudflare only, per
  [00-skeleton-spike/requirements.md → Out of Scope](../00-skeleton-spike/requirements.md#out-of-scope).
- CI/CD automation beyond a manual/documented deploy step, unless already
  trivial to add.

## Open Questions
- None beyond what's already carried in
  [00-skeleton-spike/specification.md → Open Questions](../00-skeleton-spike/specification.md#open-questions).

## Notes
- Related: [00-skeleton-spike/requirements.md](../00-skeleton-spike/requirements.md),
  [00-skeleton-spike/specification.md](../00-skeleton-spike/specification.md),
  [architecture.md](../../../architecture.md).

# Change Log

|Date | Change |
| --- | --- |
| 12 August 2026 | First draft, split out of 00-skeleton-spike |
