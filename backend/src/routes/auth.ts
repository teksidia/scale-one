import { Hono } from "hono";
import type { Bindings, Variables } from "../app";

// Populated in 00b (accept-invite) and 00c (login/session-guard/logout).
export const auth = new Hono<{ Bindings: Bindings; Variables: Variables }>();
