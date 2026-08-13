# Vision: Technology Consultant Referral Network

## Problem
Independent technology consultants and boutique agencies rely on informal, ad-hoc channels (Slack DMs, email, word of mouth) to share leads and refer work to trusted peers. There's no shared system to track referral status, avoid dropped opportunities, or manage who's available for what — and existing platforms take a commission or centralize control.

## Solution
An open-source, self-hostable referral network platform where consultants can post leads, express interest, claim opportunities, and track referrals through a clear lifecycle — without paying platform fees or relying on a central authority.

## Users
- Independent technology consultants and freelancers (DevOps, Cloud Architecture, Data Engineering, Cybersecurity, etc.)
- Boutique consulting agencies
- Community leaders who want to run a private referral pool for their group

## Core Features

Users can create a simple profile and keep it updated with:

- if they are available now
- how long they are available for (open ended, fixed)
- dates they are available in the future, and if this is definite or tentative

Users can browse available users based on the above, and send them a Lead.

Users can post a Lead and send it to selected users or roles, regardless if they're available

Lead posting: title, client industry, estimated duration, required skills, rate range, exposure level, expiry date (set by the poster at creation)

Lead lifecycle: Open → Interest (one or more members express interest) → Assigned (poster picks one) → Confirmed → Closed. A lead also closes if it hits its poster-set expiry date without being assigned/confirmed.

Invitation-Only: an admin must send an invite to a user

User profiles: skill tags, availability, geographic focus

"Roles" in lead targeting = skill tags. No separate role/group concept — posting to "selected users or roles" means posting to individuals or to everyone holding a given skill tag.

Membership management: invite, approve, suspend, revoke members

Referral point earnt +10 on confirmation of a referral. Taker loses -10. No initial balance. No need to have positive points. Just an indication of who is a giver, who is a taker. Confirmation is unilateral: the poster (who gave the lead) marks it confirmed once they believe the handoff happened — there is no mutual sign-off or dispute flow for now.

Deployment model: single-tenant. Each self-hosted instance serves one community/pool. A second community stands up a second instance rather than sharing one deployment — no multi-tenant/org isolation in the data model.


## Out of Scope (for now)
- Federation / cross-node syndication
- Inter-node trust rules and moderation queues
- Cross-node audit logging
- Multi-tenancy (multiple isolated pools on one deployment) — single-tenant only, see Decisions
- Dispute resolution / mutual sign-off for referral confirmation — confirmation is unilateral by the poster
- In-platform payment or referral-fee processing — any agreed referral fee between consultants is handled off-platform

## Technical Context
- Frontend: React (Vite)
- Backend: Hono (TypeScript), deployable to Cloudflare Workers or Docker/Node/Bun for self-hosting
- Database: Neon (Serverless Postgres) via Drizzle ORM

## Decisions
- Prioritize a frictionless, zero-maintenance deployment path (Cloudflare Pages/Workers free tier) so community maintainers can self-host easily
- Provide a standardized Dockerfile as a secondary deployment path for VPS hosting
- Keep domain logic (referral rules, state machine) decoupled from the HTTP layer for testability
- Maintain end-to-end type safety between backend and frontend via Hono RPC (`hc`)
- Use stateless JWT or HTTP-only session cookies for auth
- Design with GDPR-style deletion/obfuscation in mind from the start

## Open Questions
- Notification channels for new leads/invites/assignments (in-app only vs. email) — not yet decided
- Auth mechanism: JWT vs. HTTP-only session cookies — Decisions currently lists both as options, needs a single choice before/in `architecture.md`
- Currency handling for rate range, given "geographic focus" implies an international user base

## Change Log

|Date | Change |
| --- | --- |
| 25 April 2026 | First draft |
| 11 August 2026 | Clarified lead lifecycle (Open → Interest → Assigned → Confirmed → Closed), poster-set lead expiry, unilateral confirmation model, single-tenant deployment decision, "role" = skill tag, and added Open Questions section |