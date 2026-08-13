# Feature: Leads List

## Overview
Fourth ticket in the [Skeleton Spike](../00-skeleton-spike/requirements.md)
split. Builds on the session guard from
[00c](../00c-login-session-guard-logout/requirements.md): a logged-in user
can view a list of seeded leads, proving the `hc` typed-RPC chain works for
a real authenticated business route, not just the placeholder from
[00a](../00a-scaffolding-and-schema/requirements.md). This is the smallest
and cleanest slice in the spike, and the one that most directly proves the
end-to-end type-safety promise in [vision.md → Decisions](../../../vision.md#decisions).

## Requirements
- A logged-in session can call a `/leads` route via the generated `hc`
  client and get a typed response back — no manual type annotations
  bridging frontend and backend.
- The route is gated: no/invalid/expired session returns `401`.
- The React app renders the list of leads returned from that call on a
  screen, using the session cookie for auth.
- At least one `Lead` row exists to render, via seed/raw insert (mirrors
  [00b's invite-creation approach](../00b-accept-invite/requirements.md#open-questions)
  — no admin UI).

## Acceptance Criteria
- [ ] Given no session cookie, a request to `/leads` is rejected (`401`) —
      confirms the route is actually gated, not just typed.
- [ ] Given an authenticated session and at least one seeded `Lead` row,
      calling the `/leads` endpoint through `hc` from the frontend returns
      a typed array and the UI renders it without runtime type errors.
- [ ] Given no `Lead` rows are seeded, `GET /leads` returns
      `{ items: [] }` and the UI shows an empty state, not an error.
- [ ] Renaming `Lead.title` to something else in the Drizzle schema causes
      a TypeScript compile error in `LeadsPage`, not a silent runtime
      `undefined`.

## Out of Scope
- All auth routes and pages (accept-invite, login, logout, me, route
  guard) — already built in [00b](../00b-accept-invite/requirements.md)
  and [00c](../00c-login-session-guard-logout/requirements.md).
- Full lead lifecycle (Open → Interest → Assigned → Confirmed → Closed) —
  a later sprint feature, per [architecture.md → Lead Lifecycle](../../../architecture.md#lead-lifecycle).
- Any styling beyond an unstyled list.
- Production deploy/secrets and the full walkthrough — [00e](../00e-cloudflare-deploy-and-walkthrough/requirements.md).
- Everything in [00-skeleton-spike → Out of Scope](../00-skeleton-spike/specification.md#out-of-scope).

## Open Questions
- Minimal viable `Lead` field set for the list screen (title + status
  only, per [00-skeleton-spike/requirements.md](../00-skeleton-spike/requirements.md))
  — confirm nothing else is needed to prove the wiring.

## Notes
- Related: [00-skeleton-spike/requirements.md](../00-skeleton-spike/requirements.md),
  [00-skeleton-spike/specification.md](../00-skeleton-spike/specification.md),
  [00c-login-session-guard-logout/specification.md](../00c-login-session-guard-logout/specification.md),
  [architecture.md](../../../architecture.md).

# Change Log

|Date | Change |
| --- | --- |
| 12 August 2026 | First draft, split out of 00-skeleton-spike |
