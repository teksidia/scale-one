import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { Bindings, Variables } from "../app";
import { lead } from "../db/schema";
import { getValidSession, SESSION_COOKIE_NAME, touchSession } from "../lib/session";

export const leads = new Hono<{ Bindings: Bindings; Variables: Variables }>().get(
  "/",
  async (c) => {
    const db = c.get("db");
    const sessionId = getCookie(c, SESSION_COOKIE_NAME);
    const sessionRow = await getValidSession(db, sessionId);

    if (!sessionRow) {
      return c.json({ error: "Not authenticated" }, 401);
    }

    await touchSession(db, sessionRow.id);

    const items = await db.select().from(lead);

    return c.json({ items }, 200);
  },
);
