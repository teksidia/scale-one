// argon2id was spiked first, per this ticket's Open Questions, via a
// hash-wasm trial route: it failed under wrangler/Workers with
// "WebAssembly.compile(): Wasm code generation disallowed by embedder" —
// hash-wasm compiles its WASM binary from a base64 blob at runtime, which
// the Workers embedder blocks outright (unlike a statically bundled `.wasm`
// import). Falling back to PBKDF2-SHA256 via the native Web Crypto
// `crypto.subtle` API, as specced.

const PBKDF2_ITERATIONS = 210_000; // OWASP-recommended minimum for PBKDF2-HMAC-SHA256
const SALT_BYTES = 16;
const DERIVED_KEY_BITS = 256;

export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(salt);

  const derived = await deriveBits(password, salt, PBKDF2_ITERATIONS);

  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(derived)}`;
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

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
