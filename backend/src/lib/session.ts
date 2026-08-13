import type { Db } from "../db";
import { session } from "../db/schema";

export const SESSION_COOKIE_NAME = "session";

// Absolute timeout default from 00-skeleton-spike/specification.md's
// Business Rules — fixed at creation, never extended. Idle-timeout
// enforcement (lastSeenAt checked on read) belongs to 00c's session guard,
// not this ticket, which only ever creates sessions.
const SESSION_ABSOLUTE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000;

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

function generateSessionId(): string {
  const bytes = new Uint8Array(SESSION_ID_BYTES);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
