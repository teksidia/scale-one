# Spec: Leads List

## Source Requirement
- [`./requirements.md`](./requirements.md)
- [`00-skeleton-spike/specification.md`](../00-skeleton-spike/specification.md) — full `/leads` contract and `LeadsPage` behaviour this ticket implements
- [`00c-login-session-guard-logout/specification.md`](../00c-login-session-guard-logout/specification.md) — session guard this route and page rely on

## Prerequisites

No new accounts or provisioning beyond
[00a](../00a-scaffolding-and-schema/specification.md#prerequisites) (Neon +
Cloudflare). This ticket adds no new external dependency.

## Overview
Implements the final leg of the spike's walkthrough: a logged-in user sees
the seeded leads list. Builds on the `Lead` schema from
[00a](../00a-scaffolding-and-schema/specification.md#data-models) and the
session/guard machinery from
[00c](../00c-login-session-guard-logout/specification.md) — this ticket
does not redefine either.

## Data Models
Uses `Lead` exactly as defined in
[00a → Data Models](../00a-scaffolding-and-schema/specification.md#data-models).
No new fields.

## API Contract

### `GET /leads`
- **Purpose**: returns the seeded leads list.
- **Auth**: session cookie required.
- **Response**: `200 { items: Lead[] }`
- **Errors**: `401` — no/invalid/expired session.

## Component / UI Behaviour

- **`LeadsPage`** (`/leads`, protected): on mount, calls `leads.$get()` via
  `hc`. Loading state while pending. Renders a plain list of `title` +
  `status`. Empty state: "No leads yet" if `items` is empty.
- Protected by the route guard built in
  [00c](../00c-login-session-guard-logout/specification.md#component--ui-behaviour) —
  this ticket adds the page the guard renders, not the guard itself.

## Business Rules & Constraints

- No new business rules beyond what [00a](../00a-scaffolding-and-schema/specification.md)
  and [00c](../00c-login-session-guard-logout/specification.md) already
  establish (auth gating, cookie-based session, `VITE_API_URL` convention).

## Edge Cases

- No `Lead` rows seeded → `GET /leads` returns `{ items: [] }`; UI shows
  the empty state, not an error.
- No/expired session calling `GET /leads` → `401`, frontend's route guard
  (built in 00c) redirects to `/login`.

## Acceptance Criteria

- [ ] `GET /leads` returns `401` with no session, and `200 { items: Lead[] }`
      with a valid one, typed end-to-end through `hc` with no manual
      casting in the frontend.
- [ ] Given an authenticated session and at least one seeded `Lead` row,
      `LeadsPage` renders the list without runtime type errors.
- [ ] Given no `Lead` rows exist, `LeadsPage` shows "No leads yet".
- [ ] Renaming `Lead.title` to something else in the Drizzle schema causes
      a TypeScript compile error in `LeadsPage`, not a silent runtime
      `undefined`.

## Out of Scope

- Accept-invite, login, logout, `/auth/me`, route guard — already built in
  [00b](../00b-accept-invite/specification.md) and
  [00c](../00c-login-session-guard-logout/specification.md).
- Full lead lifecycle, referral points, availability — later sprint
  features per [architecture.md](../../../architecture.md#data-model).
- Production deploy, secrets, and the deployed walkthrough — [00e](../00e-cloudflare-deploy-and-walkthrough/specification.md).
- Any UI polish or styling system beyond an unstyled list.
- Mirrors [00-skeleton-spike/specification.md → Out of Scope](../00-skeleton-spike/specification.md#out-of-scope).

## Open Questions
- Minimal viable `Lead` field set for the list screen (title + status
  only) — confirm nothing else is needed to prove the wiring, per
  [00-skeleton-spike/specification.md → Open Questions](../00-skeleton-spike/specification.md#open-questions).

## Notes
- Related: [00-skeleton-spike/specification.md](../00-skeleton-spike/specification.md),
  [00a-scaffolding-and-schema/specification.md](../00a-scaffolding-and-schema/specification.md),
  [00c-login-session-guard-logout/specification.md](../00c-login-session-guard-logout/specification.md),
  [architecture.md](../../../architecture.md).

# Change Log

|Date | Change |
| --- | --- |
| 12 August 2026 | First draft, split out of 00-skeleton-spike |
| 12 August 2026 | Added Prerequisites section (pointer to 00a — no new accounts) |
