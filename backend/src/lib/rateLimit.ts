const WINDOW_SECONDS = 5 * 60;
const MAX_ATTEMPTS = 10;

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

// One counter per (route, IP), refreshed on every attempt — KV's eventual
// consistency is fine here (unlike sessions) because a rate-limit counter
// only needs to be approximately right, per architecture.md's Auth section.
export async function checkRateLimit(
  kv: KVNamespace,
  key: string,
): Promise<RateLimitResult> {
  const raw = await kv.get(key);
  const attempts = raw ? Number(raw) : 0;

  if (attempts >= MAX_ATTEMPTS) {
    return { allowed: false, retryAfterSeconds: WINDOW_SECONDS };
  }

  await kv.put(key, String(attempts + 1), { expirationTtl: WINDOW_SECONDS });
  return { allowed: true };
}
