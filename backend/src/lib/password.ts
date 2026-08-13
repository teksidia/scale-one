// argon2id was spiked first, per this ticket's Open Questions, via a
// hash-wasm trial route: it failed under wrangler/Workers with
// "WebAssembly.compile(): Wasm code generation disallowed by embedder" —
// hash-wasm compiles its WASM binary from a base64 blob at runtime, which
// the Workers embedder blocks outright (unlike a statically bundled `.wasm`
// import). Falling back to PBKDF2-SHA256 via the native Web Crypto
// `crypto.subtle` API, as specced.

import { fromBase64Url, toBase64Url } from "./encoding";

const PBKDF2_ITERATIONS = 210_000; // OWASP-recommended minimum for PBKDF2-HMAC-SHA256
const SALT_BYTES = 16;
const DERIVED_KEY_BITS = 256;

// A syntactically-valid hash that will never match a real password (all-zero
// salt/digest). Used to run login's PBKDF2 derive on an unknown-email path
// too, so response timing doesn't leak whether an email is registered —
// message parity alone (see routes/auth.ts) isn't enough if the wrong-
// password path takes measurably longer than the unknown-email path.
export const DUMMY_PASSWORD_HASH = `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${toBase64Url(
  new Uint8Array(SALT_BYTES),
)}$${toBase64Url(new Uint8Array(DERIVED_KEY_BITS / 8))}`;

export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(salt);

  const derived = await deriveBits(password, salt, PBKDF2_ITERATIONS);

  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(derived)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterationsRaw, saltB64, hashB64] = stored.split("$");
  if (scheme !== "pbkdf2-sha256" || !iterationsRaw || !saltB64 || !hashB64) {
    return false;
  }

  const iterations = Number(iterationsRaw);
  const salt = fromBase64Url(saltB64);
  const expected = fromBase64Url(hashB64);

  const derived = await deriveBits(password, salt, iterations);

  return timingSafeEqual(derived, expected);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function deriveBits(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    keyMaterial,
    DERIVED_KEY_BITS,
  );

  return new Uint8Array(bits);
}
