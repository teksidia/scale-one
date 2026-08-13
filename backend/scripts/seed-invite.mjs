// Dev-only convenience for the "raw insert, no admin UI" invite flow
// decided in docs/cycles/sprint-001/00b-accept-invite/specification.md.
// Not part of the app — remove once an admin UI can create invites.
//
// Usage: pnpm seed:invite [email]
import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set (expected in backend/.env)");
}

const email = process.argv[2] ?? "test@example.com";
const token = crypto.randomUUID().replace(/-/g, "");

const sql = neon(databaseUrl);
await sql`
  INSERT INTO invite (token, email, status, expires_at)
  VALUES (${token}, ${email}, 'pending', now() + interval '7 days')
`;

console.log("email:", email);
console.log("token:", token);
console.log("accept-invite URL: http://localhost:5173/accept-invite/" + token);
