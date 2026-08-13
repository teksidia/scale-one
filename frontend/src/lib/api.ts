import type { AppType } from "@scale-one/backend";
import { hc } from "hono/client";

export const client = hc<AppType>(import.meta.env.VITE_API_URL, {
  // The API sits on a different origin from the SPA (different port
  // locally, different domain once deployed), so the session cookie needs
  // an explicit opt-in to be sent/stored on cross-origin requests.
  init: { credentials: "include" },
});
