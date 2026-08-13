Summary

Implemented POST /auth/login, POST /auth/logout, GET /auth/me, and the frontend route guard per the spec:

Backend
- lib/encoding.ts (new) — shared base64url helpers, extracted from session.ts/password.ts to avoid duplication
- lib/password.ts — added verifyPassword() with constant-time comparison, plus a DUMMY_PASSWORD_HASH so login always pays the PBKDF2 cost even on an unknown email (closes the timing side-channel that message-parity alone doesn't)
- lib/session.ts — added getValidSession() (enfute 7day timeouts, auto-deletes expired rows),touchSession(), deleteSession()
- lib/csrf.ts (new) — double-submit CSRF token generation
- routes/auth.ts — /login (rate-limited, generion rotation deleting any prior cookie session),/logout (idempotent 204, CSRF-checked only when a valid session actually exists), /me (401 or touch+return user)

Frontend
- pages/LoginPage.tsx (new) — mirrors AcceptInvitePage's form/error patterns
- lib/api.ts — guardedFetch wraps the hc client to redirect to /login on any 401 (except on public paths), plus a logout()
helper that reads the CSRF cookie for the heade
- App.tsx — calls GET /auth/me once for protectvoiding a flash of protected content

Both tsc --noEmit runs are clean. No test framework is wired up yet in this repo (per architecture.testing.md, Vitest/@cloudflare/vitest-pool-workers isn't installed), so the acceptance criteria are verifiable manually or once that infra lands — I didn't invent test scaffolding beyond this ticket's scope.