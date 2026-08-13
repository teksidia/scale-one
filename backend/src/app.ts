import { Hono } from "hono";
import { cors } from "hono/cors";
import { createDb, type Db } from "./db";

export type Bindings = {
  DATABASE_URL: string;
};

export type Variables = {
  db: Db;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use("*", cors());

app.use("*", async (c, next) => {
  c.set("db", createDb(c.env.DATABASE_URL));
  await next();
});

// Placeholder route for this ticket only — proves the deploy + `hc` typed
// RPC chain works end to end. Replaced by real routes in 00b–00d, not
// additive to them.
const routes = app.get("/api/ping", (c) => {
  return c.json({ message: "pong", timestamp: new Date().toISOString() });
});

export type AppType = typeof routes;

export default app;
