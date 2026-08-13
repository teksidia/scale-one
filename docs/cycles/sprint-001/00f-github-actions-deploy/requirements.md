# Feature: GitHub Actions Deploy

## Overview
[00e](../00e-cloudflare-deploy-and-walkthrough/requirements.md) proved the
manual deploy path: one command (`pnpm deploy`) builds the frontend and
deploys the single Worker (SPA + API) to Cloudflare. This ticket automates
that same path via GitHub Actions, so a push to `main` deploys without
anyone running `wrangler` by hand.

## Requirements
- A GitHub Actions workflow deploys the app on push to `main`, and also
  supports a manual `workflow_dispatch` trigger for on-demand redeploys
  without a new commit — same build/deploy steps 00e already proved
  manually (`pnpm install`, frontend build, `wrangler deploy` from
  `backend/`), not a reimplementation of them.
- The workflow authenticates to Cloudflare via a scoped API token stored as
  a GitHub Actions secret, never committed or logged.
- The workflow fails (and does not deploy) if typecheck fails in either
  package — a broken build should never reach production.
- **Database migrations stay manual, indefinitely** — `pnpm db:migrate` is
  never run by this workflow. Decision, not an open question: an
  unattended schema migration against production on every push/dispatch is
  a bigger blast radius than this ticket should take on, and it would put
  `DATABASE_URL` — a write credential to the production DB — into GitHub
  Secrets, which is a larger exposure than the Cloudflare deploy token
  alone. A deliberate, reviewed local `pnpm db:migrate` run stays the
  process for schema changes.

## Acceptance Criteria
- [ ] Pushing a commit to `main` triggers the workflow, and it completes a
      successful deploy with no manual `wrangler` step.
- [ ] Manually running the workflow via `workflow_dispatch` (no new commit)
      also completes a successful deploy.
- [ ] The Cloudflare API token is stored as a GitHub Actions secret (repo
      or environment scoped); `git log`/workflow YAML contain no secret
      values. `DATABASE_URL` is not a GitHub secret at all — the workflow
      has no path that needs it.
- [ ] A deliberately broken typecheck (either package) fails the workflow
      before the deploy step runs.
- [ ] After a CI-triggered deploy, the deployed instance still passes the
      same walkthrough 00e verified (accept invite → `/leads` → logout →
      login → `/leads`), confirming CI deploys aren't missing a step manual
      deploys had.

## Out of Scope
- Database migrations as part of the workflow — decided against, see
  Requirements.
- Staging/preview environments or per-PR preview deploys.
- Multi-environment `wrangler.toml` config (`[env.staging]` etc.) — out of
  scope for 00e too, and this ticket doesn't reopen that decision.
- Docker/self-host CI/CD — Cloudflare only, per
  [00-skeleton-spike/requirements.md → Out of Scope](../00-skeleton-spike/requirements.md#out-of-scope).
- Rollback automation beyond what `wrangler rollback` already provides
  manually.

## Open Questions
None currently — both open questions from the first draft (migration
automation, trigger scope) are resolved above.

## Notes
- Related: [00e-cloudflare-deploy-and-walkthrough](../00e-cloudflare-deploy-and-walkthrough/requirements.md)
  (manual deploy path this automates), [00e's post-implementation-notes.md](../00e-cloudflare-deploy-and-walkthrough/post-implementation-notes.md)
  (exact commands the workflow needs to mirror), [architecture.md → Deployment](../../../architecture.md#deployment).

# Change Log

|Date | Change |
| --- | --- |
| 13 August 2026 | First draft |
| 13 August 2026 | Resolved both open questions: migrations stay manual indefinitely, added `workflow_dispatch` trigger alongside push-to-main |
