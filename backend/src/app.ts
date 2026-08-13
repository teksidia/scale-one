import { Hono } from "hono";
import { cors } from "hono/cors";
import { createDb, type Db } from "./db";
import { auth } from "./routes/auth";

export type Bindings = {
  DATABASE_URL: string;
  FRONTEND_URL: string;
  RATE_LIMIT: KVNamespace;
};

export type Variables = {
  db: Db;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use(
  "*",
  cors({
    origin: (_origin, c) => c.env.FRONTEND_URL,
    credentials: true,
  }),
);

app.use("*", async (c, next) => {
  c.set("db", createDb(c.env.DATABASE_URL));
  await next();
});

const routes = app.route("/auth", auth);

export type AppType = typeof routes;

export default app;
