import { and, eq, gt } from "drizzle-orm";
import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import type { Bindings, Variables } from "../app";
import { invite, user } from "../db/schema";
import { hashPassword } from "../lib/password";
import { checkRateLimit } from "../lib/rateLimit";
import { createSession, SESSION_COOKIE_NAME } from "../lib/session";

const GENERIC_INVITE_ERROR = "Invalid or expired invite";
const MIN_PASSWORD_LENGTH = 8;

type AcceptInviteBody = {
  token?: unknown;
  password?: unknown;
};

export const auth = new Hono<{ Bindings: Bindings; Variables: Variables }>().post(
  "/accept-invite",
  async (c) => {
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
  },
);
