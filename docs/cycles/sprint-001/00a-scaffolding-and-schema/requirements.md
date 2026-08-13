# Feature: Scaffolding & Schema

## Overview
This is the first of five tickets splitting the [Skeleton Spike](../00-skeleton-spike/requirements.md)
into buildable slices (see that folder's `specification.md` for the full
original scope and the rationale for the split). This ticket establishes the
repo layout, the Drizzle schema, and a "hello world" deploy to Cloudflare —
proving Neon → Drizzle → Hono → `hc` → React → Cloudflare wiring end-to-end
before any auth or business logic is layered on top in 00b–00e. No user-
facing behaviour exists yet.

## Requirements
- The proposed `/backend` and `/frontend` layout from the skeleton spike spec
  exists in the repo.
- A Drizzle schema defines `User`, `Invite`, `Session`, and `Lead` and
  migrates cleanly against a Neon Postgres database.
- A minimal Hono app exists (`app.ts` exporting its type for `hc`,
  `index.ts` as the Workers entry) and deploys to Cloudflare Workers.
- A minimal Vite React app exists and deploys to Cloudflare Pages.
- The deployed frontend calls the deployed backend through the generated
  `hc` client and renders something derived from the response — proving the
  typed RPC chain works before 00b–00d add real routes and pages to it.

## Acceptance Criteria
- [ ] Given a fresh Neon database, running the Drizzle migration creates
      `User`, `Invite`, `Lead`, and `Session` tables without error.
- [ ] Given the deployed Hono app on Cloudflare Workers, a request to it
      over HTTPS returns a response.
- [ ] Given the deployed Vite frontend on Cloudflare Pages, it calls the
      deployed backend via `hc` and renders the response with no manual
      type annotations bridging frontend and backend.
- [ ] Renaming a field on any schema table causes a TypeScript compile
      error anywhere that field is referenced (proves the schema-to-`hc`
      type chain, ahead of the concrete case built into 00d's acceptance
      criteria).

## Out of Scope
- All auth logic (accept-invite, login, logout, session guard) — 00b/00c.
- The `/leads` route and `LeadsPage` — 00d.
- Rate limiting, CSRF, password hashing — 00b/00c.
- Production-grade wrangler config, secrets, and the full deployed
  walkthrough — 00e (this ticket's deploy is a minimal proof, not the final
  configuration).
- Everything in the original spike's [Out of Scope](../00-skeleton-spike/specification.md#out-of-scope).

## Open Questions
- Carried from the skeleton spike: whether invite creation needs a seed
  script or a raw SQL insert is acceptable — out of this ticket's scope
  (schema just needs to support either), decided in 00b.

## Notes
- Related: [00-skeleton-spike/requirements.md](../00-skeleton-spike/requirements.md),
  [00-skeleton-spike/specification.md](../00-skeleton-spike/specification.md),
  [architecture.md](../../../architecture.md).

# Change Log

|Date | Change |
| --- | --- |
| 12 August 2026 | First draft, split out of 00-skeleton-spike |
