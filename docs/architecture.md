# Architecture

Bridge between [Vision](./vision.md) and code. Defines the data model, API patterns, and system constraints for the Technology Consultant Referral Network.

## Stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Frontend | React (Vite) | SPA, calls backend via Hono RPC client (`hc`) |
| Backend | Hono (TypeScript) | Deployable to Cloudflare Workers (primary) or Docker/Node/Bun (self-host) |
| Database | Neon (Serverless Postgres) | Accessed via Drizzle ORM |
| Auth | HTTP-only session cookies, Neon-backed session store | See [Auth](#auth) — confirmed |

## System Overview

```
┌─────────────┐        Hono RPC (hc, typed)        ┌──────────────────┐
│  React SPA  │ ──────────────────────────────────▶ │   Hono API       │
│  (Vite)     │ ◀────────────────────────────────── │  (Workers/Node)  │
└─────────────┘                                      └────────┬─────────┘
                                                                │ Drizzle ORM
                                                                ▼
                                                       ┌──────────────────┐
                                                       │  Neon (Postgres) │
                                                       └──────────────────┘
```

- One deployment = one tenant = one referral pool (see [Decisions](./vision.md#decisions)). No org/tenant ID on any table.
- Domain logic (lead lifecycle, points, availability rules) lives in a layer separate from HTTP handlers, so it's testable without spinning up Hono and reusable if a second transport (e.g. a CLI or cron worker) is ever needed.

## Data Model

Entities inferred from [Vision → Core Features](./vision.md#core-features). Field lists are illustrative, not exhaustive — refined per-feature in `cycles/*/specification.md`.

### User
- `id`, `email`, `name`
- `skillTags: string[]` — doubles as the "role" targeting mechanism for leads (no separate role table)
- `geographicFocus`
- `membershipStatus`: `invited | approved | suspended | revoked`
- `referralPoints: int` — denormalized running total; see [Referral Points](#referral-points)

### Availability
One row per user, or a small append-only history if past availability needs to stay auditable — TBD in spec.
- `userId`
- `isAvailableNow: boolean`
- `duration`: `open-ended | fixed` (+ end date if fixed)
- `futureWindows: { startDate, endDate, definite: boolean }[]`

### Lead
- `id`, `posterId`
- `title`, `clientIndustry`, `estimatedDuration`, `requiredSkills: string[]`, `rateRange`, `exposureLevel`
- `expiryDate` — set by poster at creation
- `targeting`: explicit user IDs and/or skill tags (skill tag = "role")
- `status`: `open | interest | assigned | confirmed | closed` (see [Lead Lifecycle](#lead-lifecycle))
- `assignedUserId` (nullable until Assigned)

### Interest
Join entity: a user expressing interest in a Lead.
- `leadId`, `userId`, `createdAt`

### Invite
- `id`, `invitedEmail`, `invitedBy` (admin `userId`), `status`: `pending | accepted | expired`
- Invite token itself must be cryptographically random, single-use, and expiring — see [Auth](#auth).

### Session
Backs the HTTP-only session cookie — see [Auth](#auth).
- `id` (cryptographically random, ≥128 bits — this is the value stored in the cookie)
- `userId`
- `expiresAt`
- Deleting a row invalidates that session immediately; this is the mechanism behind cheap server-side revocation.

### Referral Points
`+10` to poster / `-10` to assigned taker on confirmation. No initial balance, no floor. Model as an **append-only ledger** (`leadId`, `userId`, `delta`, `createdAt`) rather than mutating a counter directly — keeps the "why does this user have -30" question answerable and keeps `User.referralPoints` a derived/denormalized cache.

## Lead Lifecycle

```
Open ──(interest expressed)──▶ Interest ──(poster picks one)──▶ Assigned ──▶ Confirmed ──▶ Closed
  │                                │                                                          ▲
  └──────────────(expiryDate reached, no assignment)───────────────────────────────────────────┘
```

- Confirmation is **unilateral** — the poster marks Confirmed once they believe the handoff happened. No mutual sign-off, no dispute flow (see [Out of Scope](./vision.md#out-of-scope)).
- Expiry is enforced against `Lead.expiryDate`; a lead past expiry with no assignment transitions to Closed regardless of Interest state. Decide during spec whether this is a scheduled sweep or evaluated lazily on read.
- State transitions belong in the domain layer, not in route handlers — this is the core piece of logic worth unit-testing in isolation.

## API Pattern

- Backend exposes a Hono app; frontend consumes it through the generated `hc` RPC client for end-to-end type safety — no separate OpenAPI/schema sync step.
- Resource-oriented routes grouped by entity: `/users`, `/leads`, `/leads/:id/interest`, `/invites`, etc. Exact contracts belong in per-feature `specification.md` files, not here.
- API base URL is environment-configured on the frontend (`VITE_API_URL`), never hardcoded — see [Key Conventions](./instructions.md#key-conventions).

## Best Practices

Standard code organization, not a style guide — formatting/linting rules belong in ESLint/Prettier config, not here. Goal is readability, testability, and low coupling as the codebase grows past the current skeleton, without introducing structure the project doesn't need yet.

### Backend (Hono)

- Layered by responsibility: `routes/` (HTTP only — parse input, call a domain function, map the result to a response/status code) → `domain/` (business logic: lead lifecycle, points, availability rules — plain functions, no Hono `Context`) → `db/` (Drizzle schema + queries). This is the separation already called out in [System Overview](#system-overview).
- Domain functions take and return plain data, never a Hono `Context`. That's what makes them unit-testable without spinning up Hono, and reusable from a future non-HTTP entrypoint (an expiry sweep cron, a CLI) if one is ever added.
- One module per resource in `routes/` (`leads.ts`, `invites.ts`) and one module per aggregate in `domain/` (`leads.ts`, `points.ts`, `availability.ts`) — cohesion by entity, not by technical layer crammed into one file.
- Drizzle queries live in `db/`, not inlined inside domain functions — keeps SQL/query-shape changes in one place and keeps domain logic testable against a fake data layer if that's ever needed.
- Cross-cutting concerns (session/auth middleware, CORS, error handling) are Hono middleware registered once in `app.ts`, not duplicated per-route.

### Frontend (React)

- Group by feature once the app outgrows the skeleton (`features/leads/`, `features/auth/`, each owning its own components, hooks, and API calls), rather than global `components/`/`hooks/` folders sorted by file type. Keep flat shared folders only for genuinely generic, cross-feature pieces.
- Keep the `hc` client out of components: one API hook per feature (e.g. `useLeads`) wraps the typed client call, so components consume data rather than fetch plumbing.
- Split presentational from data-fetching components where it's cheap: components that just render props stay dumb and reusable; data-fetching/state lives in a parent or hook. Don't force the split on trivial components.
- Read `import.meta.env` only at the app boundary (`lib/api.ts`), never scattered through components — consistent with the existing `VITE_API_URL` convention above.

## Auth

**Confirmed: HTTP-only session cookies over JWT**, backed by a Neon `Session` table rather than Workers KV. Vision.md left this open; resolved and confirmed during the [skeleton spike](./cycles/sprint-001/00-skeleton-spike/requirements.md#security-requirements):

- Single-tenant, invite-only membership model doesn't need JWT's cross-service/stateless portability — there's one backend per deployment.
- Session cookies give cheap server-side revocation (suspend/revoke a member → session dies immediately), which JWT can't do without an extra denylist that reintroduces state anyway.
- **Session store is Neon-backed (via the same Drizzle connection as everything else), not Workers KV.** KV was considered but rejected: it's eventually consistent across edge regions (a revoke can take up to ~60s to propagate globally), which directly undermines the "cheap instant revocation" reason cookies were chosen over JWT in the first place. KV is also Cloudflare-specific, which would make session handling behave differently on the Docker/Node self-host path — a Neon table behaves identically on both.

### Session Handling Requirements
These are binding for every feature that touches auth, not just the initial spike:

- **Session ID**: cryptographically random, ≥128 bits of entropy; never derived from predictable input.
- **Rotation**: a new session ID is issued (and the old one invalidated) on every login, to prevent session fixation.
- **Expiry**: sessions carry both an idle timeout and an absolute timeout (exact values are a per-spec/config decision).
- **Cookie flags**: `HttpOnly`, `Secure`, `SameSite=Lax` at minimum, on every session cookie without exception.
- **CSRF**: state-changing routes require a CSRF token or `SameSite=Strict` where UX allows — `SameSite=Lax` alone is not sufficient.
- **Password storage**: argon2id (bcrypt as fallback if argon2id proves impractical on Workers), salted per-user. No plaintext, no reversible encryption, no fast general-purpose hash alone.
- **Rate limiting**: `/login` and `/accept-invite` are throttled per IP and/or per email.
- **Invite tokens**: cryptographically random, single-use, expiring (see [Invite](#invite)).
- **Account enumeration**: login/accept-invite failures use generic messaging that doesn't confirm whether an email is registered or invited.
- **Transport**: HTTPS enforced on both deployment paths — default on Cloudflare, must be explicit on the Docker/self-host path.

## Deployment

- **Primary path**: Cloudflare Pages/Workers free tier — frictionless, zero-maintenance for community maintainers self-hosting a pool.
- **Secondary path**: standardized Dockerfile for Node/Bun on a VPS, for maintainers who don't want Cloudflare.
- Both paths hit the same Neon Postgres instance; no deployment-specific data model branching.

## GDPR / Deletion

Designed in from the start per [Decisions](./vision.md#decisions): user deletion should obfuscate rather than cascade-delete where referential integrity matters (e.g. a deleted user's historical Leads/Interests/Points ledger entries stay intact but are anonymized). Exact obfuscation strategy (tombstone row vs. nulled PII fields) is a per-entity spec decision.

## Out of Scope

Mirrors [Vision → Out of Scope](./vision.md#out-of-scope): no federation, no cross-node trust/moderation/audit, no multi-tenancy, no dispute resolution flow, no in-platform payments.

## Open Questions

Carried from [Vision → Open Questions](./vision.md#open-questions) — these affect the data model and are unresolved:

- **Notification channels** — in-app only vs. email, for new leads/invites/assignments. Affects whether a `Notification` entity/table exists at all.
- **Currency handling** for `rateRange`, given geographic focus implies an international user base — single currency field with ISO code? Multi-currency with conversion? Needs deciding before the Lead schema is finalized.

## Change Log

|Date | Change |
| --- | --- |
| 25 April 2026 | First draft |
| 11 August 2026 | Initial architecture draft: stack table, system overview, data model, lead lifecycle state machine, API pattern, proposed auth decision, deployment paths, GDPR approach, carried-forward open questions |
| 11 August 2026 | Confirmed Auth decision (session cookies, Neon-backed store over Workers KV) and added binding session-handling security requirements, per the sprint-001 skeleton spike's Security Requirements; added `Session` entity to Data Model |
| 13 August 2026 | Added Best Practices section (frontend/backend code organization: layering, cohesion by feature/entity, testability) |
