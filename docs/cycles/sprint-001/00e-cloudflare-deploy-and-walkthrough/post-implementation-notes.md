Summary

Deployed the full app to Cloudflare and verified all four acceptance criteria against the live instance. Along the way, hit and fixed three real production-only bugs — this ticket's whole purpose was to catch exactly this class of thing before it's discovered by a user.

Architecture change: single Worker, not Pages + Workers
- 00a deployed the frontend to a separate Cloudflare Pages project and the backend to a Worker. First walkthrough attempt against that split showed the session cookie never reaching the API: `pages.dev` and `workers.dev` are different registrable "sites" (both are on the public suffix list), so `SameSite=Lax` — binding per architecture.md — is never sent on the SPA's own cross-site `fetch` calls, only on top-level navigation. Invisible in local dev, where both sides are `localhost` and therefore same-site.
- Fix: one Worker now serves both the built SPA (Workers Static Assets, `[assets]` in `wrangler.toml`, `not_found_handling = "single-page-application"` for client-side routing) and the API (Hono), with `run_worker_first = ["/api/*"]` so only API paths hit the Worker script — everything else goes straight to the asset handler. True same-origin: no CORS needed in production, `SameSite=Lax` works exactly as documented, no custom domain required (matches the "frictionless, zero-maintenance self-hosting" goal in architecture.md's Deployment section).
- Retired the `scale-one` Pages project.
- Consequence: API routes had to move under `/api/*` (`/api/auth/*`, `/api/leads`) — without a prefix, the SPA's own `/leads` page route and the API's `GET /leads` are the same string on the same origin, and the asset handler's SPA fallback wins every time. Amended in place in 00b/00c/00d's specification.md (still in-cycle) plus architecture.md's API Pattern and Deployment sections.

Bugs found and fixed (all only surfaced against the real deployed Worker, not `wrangler dev`)
- **PBKDF2 iteration cap**: `lib/password.ts` used 210,000 iterations; Cloudflare's `crypto.subtle` PBKDF2 implementation on the actual edge runtime caps at 100,000 and throws `NotSupportedError` above that — `wrangler dev`'s Node-based polyfill doesn't enforce this, so it was invisible locally. Every `accept-invite` call 500'd in production. Dropped to 100,000 (the platform ceiling).
- **Missing CSRF cookie on accept-invite**: architecture.md says the CSRF token is issued "at login/accept-invite time," but `routes/auth.ts`'s accept-invite handler only ever set the session cookie. A user who just accepted an invite had no `csrf_token` cookie, so `/api/auth/logout` 403'd immediately — the literal walkthrough (accept invite → leads → **logout** → login → leads) was unrunnable. Fixed to mirror login's cookie issuance exactly.
- **No logout control in the UI**: `logout()` existed in `lib/api.ts` but nothing called it — `LeadsPage` rendered only the list. Added a minimal "Log out" button to `LeadsPage.tsx` wired to the existing helper; no new logic, just the missing wire-up.

Two burned invite tokens (`de30f979…`, `5e2944be…`) got stuck in `accepted` status with no corresponding `User` row, from hitting the PBKDF2 bug before it was fixed — the invite UPDATE and the user INSERT aren't wrapped in a transaction, so a failure between them leaves a burned invite with nobody able to redeem it. Didn't fix this in 00e (it's accept-invite business logic, out of scope here) but flagging it as worth a follow-up ticket.

Verification against https://scale-one-backend.accounts-098.workers.dev
- [x] Full app deploys via one command (`pnpm deploy` at the repo root: builds the frontend, then `wrangler deploy` from `backend/`, which bundles `frontend/dist` as Worker assets).
- [x] Full walkthrough (accept invite → `/leads` → logout → login → `/leads`) succeeds end-to-end over HTTPS, driven through the real UI via Playwright, not just curl.
- [x] Session cookie confirmed via `curl -i`: `session=...; Path=/; HttpOnly; Secure; SameSite=Lax`.
- [x] Rate limiting confirmed against the real `RATE_LIMIT` KV binding: 11 total `POST /api/auth/login` attempts from the same IP within 5 minutes → `429` with `Retry-After: 300` on the 11th (my test's first two "new" attempts landed on top of two earlier successful logins from this same session, so the 429 appeared at the 9th new request — same underlying count, confirmed correct).

Not done (deliberately, per 00e's Out of Scope)
- Non-atomic invite-consumption bug noted above.
- GitHub Actions — next up, once this manual path was confirmed working.
