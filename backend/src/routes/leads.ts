import { Hono } from "hono";
import type { Bindings, Variables } from "../app";

// Populated in 00d (leads-list).
export const leads = new Hono<{ Bindings: Bindings; Variables: Variables }>();
