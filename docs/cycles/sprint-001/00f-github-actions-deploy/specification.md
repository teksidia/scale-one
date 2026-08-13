# Spec: GitHub Actions Deploy

## Source Requirement
- [`./requirements.md`](./requirements.md)
- [00e-cloudflare-deploy-and-walkthrough/specification.md](../00e-cloudflare-deploy-and-walkthrough/specification.md)
  and [00e's post-implementation-notes.md](../00e-cloudflare-deploy-and-walkthrough/post-implementation-notes.md)
  — exact manual commands this workflow mirrors.
- [`architecture.md` → Deployment](../../../architecture.md#deployment)

## Prerequisites (human, before this can run)

These are one-time account/repo setup steps — nothing in the workflow YAML
can do them, since they require access to the Cloudflare dashboard and the
GitHub repo's secret store.

1. **Create a scoped Cloudflare API Token** at
   [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens):
   - Use the built-in **"Edit Cloudflare Workers"** template — it covers
     Workers Scripts, Workers KV Storage, and Workers Static Assets (all
     `wrangler deploy` needs for this single-Worker setup).
   - Scope it to the account used by `backend/wrangler.toml`
     (`account_id = 0984ae3f01b5b32b3994c1724104b0db`), not "All accounts."
   - This is a **new** token, separate from any personal token a developer
     uses for local `wrangler deploy` — CI credentials shouldn't be a
     human's personal token.
2. **Add it as a GitHub Actions secret**: repo → Settings → Secrets and
   variables → Actions → New repository secret →
   name it `CLOUDFLARE_API_TOKEN`, paste the token value.
   - Repository-scoped is sufficient (matches requirements.md — no
     environment gating requested). If a GitHub Environment is added later
     for approval gates, move the secret there instead.
3. **Do not add `DATABASE_URL` as a GitHub secret.** It already lives in
   Cloudflare (`wrangler secret put DATABASE_URL`, set up in
   [00e](../00e-cloudflare-deploy-and-walkthrough/specification.md#prerequisites)) and
   the workflow never touches it — per requirements.md, migrations stay a
   manual local step indefinitely. This is a verification item, not a
   setup action: confirm the repo's secret list contains only
   `CLOUDFLARE_API_TOKEN`.
4. No new Cloudflare resources needed — the workflow reuses the existing
   `RATE_LIMIT` KV namespace and Worker already bound in
   `backend/wrangler.toml`.

## Overview
Adds `.github/workflows/deploy.yml`, a GitHub Actions workflow that runs
the same three commands a human ran by hand in 00e — install, build, deploy
— on push to `main` and on manual `workflow_dispatch`. It adds one thing
00e's manual path didn't have: an explicit typecheck gate in both packages
that fails the workflow (and skips deploy) before `wrangler deploy` runs.
No application code changes.

## Data Models
None — CI/CD only.

## API Contract
None — CI/CD only.

## Component / UI Behaviour
None — CI/CD only.

## Workflow Definition

`.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch: {}

concurrency:
  group: deploy-production
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 'lts/*'
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile

      - name: Typecheck backend
        run: pnpm --filter @scale-one/backend typecheck

      - name: Typecheck frontend
        run: pnpm --filter @scale-one/frontend typecheck

      - name: Build and deploy
        run: pnpm deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

Notes on choices baked into this file:

- **Two explicit typecheck steps, before build/deploy.** `pnpm deploy`
  (root script) is `build:frontend && backend deploy`; the frontend
  `build` script already runs `tsc --noEmit` internally, so a frontend
  type error would fail the chain on its own. The **backend** package has
  no such built-in gate — `wrangler deploy` bundles via esbuild, which
  transpiles but does not type-check, so a backend type error would
  otherwise deploy silently broken code. The explicit `typecheck` steps
  make both packages fail identically and fail *before* any deploy
  side-effect, matching the acceptance criterion literally ("fails …
  before the deploy step runs") rather than relying on frontend's
  incidental behavior.
- **`concurrency` group with `cancel-in-progress: false`.** A push and a
  manual dispatch landing close together should queue, not race two
  `wrangler deploy` calls against the same Worker or cancel one mid-deploy.
- **`--frozen-lockfile`** so CI never silently resolves different versions
  than what's committed in `pnpm-lock.yaml`.
- **No `CLOUDFLARE_ACCOUNT_ID` secret needed** — `account_id` is already a
  plaintext value in `backend/wrangler.toml`, not a secret.
- **Token passed as `env` on the deploy step only** (not job-wide), so it
  isn't exported for steps that don't need it (checkout, install,
  typecheck).

## Business Rules & Constraints
- The Cloudflare API token is read only from `secrets.CLOUDFLARE_API_TOKEN`
  — never echoed, printed, or written to a file in any step.
- `DATABASE_URL` has no path into this workflow, as a GitHub secret or
  otherwise — enforced by omission (no step, env var, or secret reference
  to it exists in the YAML).
- The workflow must exit non-zero (job fails) if either `typecheck` step
  fails, and the `Build and deploy` step must not run in that case — this
  falls out of GitHub Actions' default step ordering (a failed step stops
  the job), not custom logic.
- Same commands as 00e's manual path (`pnpm install`, frontend build via
  `pnpm deploy`'s chain, `wrangler deploy` from `backend/`) — this ticket
  automates, it doesn't reimplement.

## Edge Cases
- **Two triggers firing close together** (a push to `main` right after a
  manual dispatch, or vice versa): handled by the `concurrency` group —
  the second run queues behind the first rather than deploying
  concurrently.
- **`workflow_dispatch` with no new commit**: deploys whatever is
  currently on `main` — this is the intended behavior (requirements.md:
  "on-demand redeploys without a new commit").
- **Typecheck fails in backend but not frontend (or vice versa)**: either
  failing step stops the job before `Build and deploy` runs — both
  packages are checked, not just the one `pnpm deploy` would incidentally
  catch.

## Acceptance Criteria
(mirrors [requirements.md](./requirements.md#acceptance-criteria) — repeated here as
implementation-verifiable checks)

- [ ] Push to `main` triggers the workflow; it completes a successful
      deploy with no manual `wrangler` step.
- [ ] Manual `workflow_dispatch` run (no new commit) also completes a
      successful deploy.
- [ ] `CLOUDFLARE_API_TOKEN` exists only as a GitHub Actions secret; no
      workflow YAML, commit, or log contains its value. No
      `DATABASE_URL` secret exists in the repo's GitHub secrets at all.
- [ ] A deliberately broken typecheck (introduced temporarily in either
      package) fails the workflow at the corresponding `Typecheck` step,
      before `Build and deploy` runs.
- [ ] After a CI-triggered deploy, the deployed instance still passes
      00e's full walkthrough (accept invite → `/leads` → logout → login →
      `/leads`).

## Out of Scope
- Database migrations in the workflow — decided against, see
  [requirements.md](./requirements.md#requirements).
- Staging/preview environments, per-PR preview deploys, GitHub
  Environments/approval gates — not requested; the Prerequisites section
  notes where a secret would move if this changes later.
- Branch protection requiring the workflow to pass before merge — a
  separate repo-settings decision, not part of this ticket.
- Any application code, schema, or route changes.

## Open Questions
None — requirements.md resolved both open questions from its first draft.

## Notes
- Related: [00e-cloudflare-deploy-and-walkthrough](../00e-cloudflare-deploy-and-walkthrough/specification.md),
  [architecture.md → Deployment](../../../architecture.md#deployment).
- Post-implementation, update this spec's Change Log only if the workflow
  YAML changes within this same cycle; otherwise record deviations in a
  `post-implementation-notes.md` alongside this file, matching 00e's
  convention.

## Post-Deployment Verification (human, after the first CI run)

Not GitHub/Cloudflare setup — these confirm the automation actually works,
after `deploy.yml` is merged and has run at least once:

1. Check the **Actions** tab for a green run on the push that merged this
   workflow.
2. Trigger one **manual `workflow_dispatch`** run and confirm it also goes
   green — this is the one path that can't be exercised by "just
   push a commit," so it needs a deliberate human click at least once.
3. Re-run 00e's walkthrough (accept invite → `/leads` → logout → login →
   `/leads`) against the instance the *CI run* deployed, not a leftover
   manual deploy — confirms CI isn't missing a step the manual path had.
4. Open one workflow run's logs and spot-check that the token value never
   appears (GitHub masks registered secrets automatically, but this is a
   cheap manual confirmation worth doing once).
5. Temporarily introduce a type error (either package), push it on a
   branch, and manually run the workflow via `workflow_dispatch` (or open
   a PR if branch-triggered runs are ever added) to confirm the
   `Typecheck` step actually fails the job — then revert the change.
   This is the one acceptance criterion that requires deliberately
   breaking something to prove the gate works.

# Change Log

|Date | Change |
| --- | --- |
| 13 August 2026 | First draft |
