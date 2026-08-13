import { AcceptInvitePage } from "./pages/AcceptInvitePage";

// Hand-rolled path match, not a router library — full routing (and the
// auth guard that goes with it) is added in 00c once LoginPage/LeadsPage
// exist for it to guard between. This is just enough to reach
// /accept-invite/:token for this ticket.
const ACCEPT_INVITE_PATH = /^\/accept-invite\/?([^/]*)$/;

function App() {
  const match = window.location.pathname.match(ACCEPT_INVITE_PATH);

  if (match) {
    const token = match[1] ? decodeURIComponent(match[1]) : undefined;
    return <AcceptInvitePage token={token} />;
  }

  return null;
}

export default App;
