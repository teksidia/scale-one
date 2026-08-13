# Report

All four 00e acceptance criteria are verified against the live deployment at `https://scale-one-backend.accounts-098.workers.dev`.

**Architecture change**: Merged from split Pages+Workers to a single Worker serving both the SPA (via Workers Static Assets) and the API, retiring the `scale-one` Pages project. This was necessary, not optional — `pages.dev`/`workers.dev` are different cookie "sites," so `SameSite=Lax` silently never reached the API. Same-origin fixes it with zero custom domain and zero CORS. API routes moved under `/api/*` to avoid colliding with the SPA's own client-side routes on the shared origin.

**Three real bugs found and fixed** (all invisible under `wrangler dev`, only surfaced against the actual deployed edge runtime):
1. PBKDF2 iterations (210k) exceeded the Workers `crypto.subtle` cap (100k) — every accept-invite call 500'd in production.
2. Accept-invite never issued the CSRF cookie login does, so logout 403'd immediately after accepting an invite — the walkthrough's own logout step was unrunnable.
3. `logout()` existed in code but no UI button ever called it.

One thing flagged but deliberately not fixed (out of scope): accept-invite consumes the invite token and creates the user in two separate, non-transactional steps, so a failure between them (like bug #1, before the fix) permanently burns the invite with no user created. Worth its own ticket.

**Docs updated**: `architecture.md` (Deployment + API Pattern sections, change log), 00b/00c/00d specs amended in place for the `/api` prefix, 00e's own requirements/spec checked off, and [post-implementation-notes.md](./post-implementation-notes.md) written up with full technical detail.

Nothing was committed to git as part of this ticket. Next up: GitHub Actions, once this manual deploy path was confirmed working — or the invite-atomicity issue as its own ticket, per what's prioritized next.
