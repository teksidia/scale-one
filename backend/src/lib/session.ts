import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { session } from "../db/schema";
import { toBase64Url } from "./encoding";

export const SESSION_COOKIE_NAME = "session";

// Absolute timeout default from 00-skeleton-spike/specification.md's
// Business Rules — fixed at creation, never extended.
const SESSION_ABSOLUTE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000;

// Idle timeout default from 00c's Business Rules — lastSeenAt is updated on
// every authenticated request (touchSession) and checked here on every read.
const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

const SESSION_ID_BYTES = 32; // 256 bits, well over the required ≥128-bit floor

export async function createSession(db: Db, userId: string) {
  const now = new Date();

  const [row] = await db
    .insert(session)
    .values({
      id: generateSessionId(),
      userId,
      expiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_TIMEOUT_MS),
      lastSeenAt: now,
    })
    .returning();

  return row;
}

// Looks up a session by cookie value and enforces both timeouts. A session
// past either its idle or absolute timeout is treated identically to no
// session (per 00c's Edge Cases) — and is deleted here so it doesn't linger.
export async function getValidSession(db: Db, sessionId: string | undefined) {
  if (!sessionId) return null;

  const [row] = await db.select().from(session).where(eq(session.id, sessionId));
  if (!row) return null;

  const now = Date.now();
  const idleExpired = now - row.lastSeenAt.getTime() > SESSION_IDLE_TIMEOUT_MS;
  const absoluteExpired = now > row.expiresAt.getTime();

  if (idleExpired || absoluteExpired) {
    await deleteSession(db, sessionId);
    return null;
  }

  return row;
}

export async function touchSession(db: Db, sessionId: string) {
  await db.update(session).set({ lastSeenAt: new Date() }).where(eq(session.id, sessionId));
}

export async function deleteSession(db: Db, sessionId: string) {
  await db.delete(session).where(eq(session.id, sessionId));
}

function generateSessionId(): string {
  const bytes = new Uint8Array(SESSION_ID_BYTES);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}
