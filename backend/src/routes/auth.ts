import { and, eq, gt } from "drizzle-orm";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Bindings, Variables } from "../app";
import { invite, user } from "../db/schema";
import { CSRF_COOKIE_NAME, generateCsrfToken } from "../lib/csrf";
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from "../lib/password";
import { checkRateLimit } from "../lib/rateLimit";
import {
  createSession,
  deleteSession,
  getValidSession,
  SESSION_COOKIE_NAME,
  touchSession,
} from "../lib/session";

const GENERIC_INVITE_ERROR = "Invalid or expired invite";
const GENERIC_LOGIN_ERROR = "Invalid email or password";
const MIN_PASSWORD_LENGTH = 8;

type AcceptInviteBody = {
  token?: unknown;
  password?: unknown;
};

type LoginBody = {
  email?: unknown;
  password?: unknown;
};

export const auth = new Hono<{ Bindings: Bindings; Variables: Variables }>()
  .post("/accept-invite", async (c) => {
    const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
    const rateLimit = await checkRateLimit(c.env.RATE_LIMIT, `accept-invite:${ip}`);
    if (!rateLimit.allowed) {
      c.header("Retry-After", String(rateLimit.retryAfterSeconds));
      return c.json({ error: "Too many attempts, try again later" }, 429);
    }

    const body = await c.req.json<AcceptInviteBody>().catch(() => ({}) as AcceptInviteBody);
    const token = typeof body.token === "string" ? body.token : undefined;
    const password = typeof body.password === "string" ? body.password : undefined;

    if (!token) {
      return c.json({ error: GENERIC_INVITE_ERROR }, 400);
    }
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      return c.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
        400,
      );
    }

    const db = c.get("db");

    // Single UPDATE with the pending/unexpired guard in the WHERE clause —
    // atomically consumes the invite so two concurrent requests for the
    // same token can't both succeed (the second sees zero rows updated).
    const [consumedInvite] = await db
      .update(invite)
      .set({ status: "accepted" })
      .where(
        and(
          eq(invite.token, token),
          eq(invite.status, "pending"),
          gt(invite.expiresAt, new Date()),
        ),
      )
      .returning();

    if (!consumedInvite) {
      return c.json({ error: GENERIC_INVITE_ERROR }, 400);
    }

    const passwordHash = await hashPassword(password);

    const [newUser] = await db
      .insert(user)
      .values({ email: consumedInvite.email, passwordHash })
      .returning();

    const newSession = await createSession(db, newUser.id);

    setCookie(c, SESSION_COOKIE_NAME, newSession.id, {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
    });

    return c.json({ user: { id: newUser.id, email: newUser.email } }, 200);
  })
  .post("/login", async (c) => {
    const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
    const rateLimit = await checkRateLimit(c.env.RATE_LIMIT, `login:${ip}`);
    if (!rateLimit.allowed) {
      c.header("Retry-After", String(rateLimit.retryAfterSeconds));
      return c.json({ error: "Too many attempts, try again later" }, 429);
    }

    const body = await c.req.json<LoginBody>().catch(() => ({}) as LoginBody);
    const email = typeof body.email === "string" ? body.email : undefined;
    const password = typeof body.password === "string" ? body.password : undefined;

    const db = c.get("db");

    const existingUser = email
      ? (await db.select().from(user).where(eq(user.email, email)))[0]
      : undefined;

    // Always run the PBKDF2 derive, even for an unknown email, against a
    // dummy hash — otherwise the unknown-email path returns measurably
    // faster than the wrong-password path and the generic error message
    // stops actually being generic.
    const passwordValid = password
      ? await verifyPassword(password, existingUser?.passwordHash ?? DUMMY_PASSWORD_HASH)
      : false;

    if (!existingUser || !passwordValid) {
      return c.json({ error: GENERIC_LOGIN_ERROR }, 401);
    }

    // Rotation on login: always issue a new session, and if the client
    // already held a still-valid session cookie, delete that row instead of
    // leaving it dangling (per architecture.md's Session Handling
    // Requirements).
    const existingSessionId = getCookie(c, SESSION_COOKIE_NAME);
    if (existingSessionId) {
      await deleteSession(db, existingSessionId);
    }

    const newSession = await createSession(db, existingUser.id);
    const csrfToken = generateCsrfToken();

    setCookie(c, SESSION_COOKIE_NAME, newSession.id, {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
    });
    setCookie(c, CSRF_COOKIE_NAME, csrfToken, {
      httpOnly: false,
      secure: true,
      sameSite: "Lax",
      path: "/",
    });

    return c.json({ user: { id: existingUser.id, email: existingUser.email } }, 200);
  })
  .post("/logout", async (c) => {
    const db = c.get("db");
    const sessionId = getCookie(c, SESSION_COOKIE_NAME);
    const sessionRow = await getValidSession(db, sessionId);

    // No session, or a cookie whose session was already deleted/expired —
    // logging out an already-logged-out client is not an error.
    if (!sessionRow) {
      deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" });
      deleteCookie(c, CSRF_COOKIE_NAME, { path: "/" });
      return c.body(null, 204);
    }

    const csrfCookie = getCookie(c, CSRF_COOKIE_NAME);
    const csrfHeader = c.req.header("X-CSRF-Token");
    if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
      return c.json({ error: "Invalid CSRF token" }, 403);
    }

    await deleteSession(db, sessionRow.id);
    deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" });
    deleteCookie(c, CSRF_COOKIE_NAME, { path: "/" });
    return c.body(null, 204);
  })
  .get("/me", async (c) => {
    const db = c.get("db");
    const sessionId = getCookie(c, SESSION_COOKIE_NAME);
    const sessionRow = await getValidSession(db, sessionId);

    if (!sessionRow) {
      return c.json({ error: "Not authenticated" }, 401);
    }

    await touchSession(db, sessionRow.id);

    const [userRow] = await db.select().from(user).where(eq(user.id, sessionRow.userId));

    return c.json({ user: { id: userRow.id, email: userRow.email } }, 200);
  });
