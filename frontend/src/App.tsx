import { useEffect, useState } from "react";
import { ACCEPT_INVITE_PATH, client } from "./lib/api";
import { AcceptInvitePage } from "./pages/AcceptInvitePage";
import { LeadsPage } from "./pages/LeadsPage";
import { LoginPage } from "./pages/LoginPage";

function App() {
  const pathname = window.location.pathname;
  const acceptInviteMatch = pathname.match(ACCEPT_INVITE_PATH);
  const isProtectedRoute = !acceptInviteMatch && pathname !== "/login";

  // Only protected routes need to know session state before rendering —
  // /login and /accept-invite/:token are reachable while logged out.
  // Starts true (nothing to check) so those routes never block on it.
  const [sessionChecked, setSessionChecked] = useState(!isProtectedRoute);

  useEffect(() => {
    if (!isProtectedRoute) return;

    let cancelled = false;
    // Determines session state before rendering any protected route, so we
    // never flash protected content that then gets yanked. A 401 here is
    // handled by the same guardedFetch redirect every other API call uses
    // (see lib/api.ts) — this effect only needs to know when it's safe to
    // render, not to perform the redirect itself.
    client.api.auth.me.$get().finally(() => {
      if (!cancelled) setSessionChecked(true);
    });

    return () => {
      cancelled = true;
    };
  }, [isProtectedRoute]);

  if (acceptInviteMatch) {
    const token = acceptInviteMatch[1] ? decodeURIComponent(acceptInviteMatch[1]) : undefined;
    return <AcceptInvitePage token={token} />;
  }

  if (pathname === "/login") {
    return <LoginPage />;
  }

  if (!sessionChecked) {
    return null;
  }

  return <LeadsPage />;
}

export default App;
