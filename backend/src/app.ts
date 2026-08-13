import { Hono } from "hono";
import { cors } from "hono/cors";
import { createDb, type Db } from "./db";
import { auth } from "./routes/auth";
import { leads } from "./routes/leads";

export type Bindings = {
  DATABASE_URL: string;
  RATE_LIMIT: KVNamespace;
  // Only set locally (.dev.vars), so the separate Vite dev server can call
  // this Worker cross-origin. Unset in production, where this Worker serves
  // the built frontend itself (see wrangler.toml [assets]) — same-origin
  // needs no CORS header at all (00e).
  FRONTEND_URL?: string;
};

export type Variables = {
  db: Db;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// API routes live under /api/* so they never collide with the SPA's own
// client-side routes (e.g. the frontend page "/leads" vs. the API's
// "GET /leads") once both are served from the same origin (00e).
app.use(
  "/api/*",
  cors({
    origin: (_origin, c) => c.env.FRONTEND_URL ?? "",
    credentials: true,
  }),
);

app.use("/api/*", async (c, next) => {
  c.set("db", createDb(c.env.DATABASE_URL));
  await next();
});

const routes = app.route("/api/auth", auth).route("/api/leads", leads);

export type AppType = typeof routes;

export default app;
