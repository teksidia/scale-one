# Backlog

Cross-cycle list of things worth doing that don't warrant their own ticket
yet, or that were deliberately deferred out of a ticket's scope. Not
scheduled to a cycle — pull an item into a new `cycles/*/requirements.md`
when it's ready to be worked.

## BL-0001 - Display a vague error message on login error

**Problem**: `LoginPage.handleSubmit` (`frontend/src/pages/LoginPage.tsx`)
only handles two response shapes from `POST /api/auth/login`: `429`
(shows the rate-limit message) and other non-`ok` responses, where it
assumes a JSON body and reads `body.error` (the server's already-generic
`"Invalid email or password"`, per `architecture.md`'s account-enumeration
requirement). An unexpected `500` — plain-text `"Internal Server Error"`,
not JSON — breaks that assumption: `res.json()` throws on the
non-JSON body, the throw isn't caught (only `finally` runs), and it
surfaces as an unhandled promise rejection. The user sees the button
reset to "Log in" with **no error message at all**, not even a bad one —
silently indistinguishable from doing nothing.

**How this was found**: hit live during
[00f-github-actions-deploy](./sprint-001/00f-github-actions-deploy/)'s
post-deploy verification — logging in as a leftover local test account
(`test@example.com`) 500'd because its password hash was created at
PBKDF2 210,000 iterations (before
[00e](./sprint-001/00e-cloudflare-deploy-and-walkthrough/)'s fix capped
new hashes at 100,000, the deployed edge runtime's ceiling); `verifyPassword`
reads the iteration count from the *stored* hash, so old hashes still
throw `NotSupportedError` on the real Worker. That specific data issue is
one-account-only and not this backlog item — but it exposed a real gap:
nothing on the frontend catches an unexpected non-2xx/non-JSON response
and tells the user *something* went wrong.

**Suggested fix**: wrap the `res.json()` parse (and the fetch itself) so
any failure — network error, non-JSON body, unexpected status — falls
back to one generic message (e.g. "Something went wrong, try again"),
shown the same way as the existing `error` state. Keep the server's
specific generic message (`"Invalid email or password"`) for the `401`
case where it already comes through cleanly; this is about the paths that
don't return the expected shape at all, not about being *more* vague on
`401`.

**Related**: `frontend/src/pages/LoginPage.tsx`,
`backend/src/routes/auth.ts` (`GENERIC_LOGIN_ERROR`), `architecture.md`
→ [Session Handling Requirements](../architecture.md#session-handling-requirements)
(account enumeration).

# Change Log

|Date | Change |
| --- | --- |
| 13 August 2026 | First entry: vague login error message |
