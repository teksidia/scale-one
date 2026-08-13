import { useState, type FormEvent } from "react";
import { client } from "../lib/api";

const RATE_LIMIT_MESSAGE = "Too many attempts, try again later";
const PASSWORD_MISMATCH_MESSAGE = "Passwords do not match";

type AcceptInvitePageProps = {
  token: string | undefined;
};

export function AcceptInvitePage({ token }: AcceptInvitePageProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError(PASSWORD_MISMATCH_MESSAGE);
      return;
    }

    setSubmitting(true);
    try {
      const res = await client.api.auth["accept-invite"].$post({
        json: { token: token ?? "", password },
      });

      if (res.status === 429) {
        setError(RATE_LIMIT_MESSAGE);
        return;
      }

      if (!res.ok) {
        const body = await res.json();
        setError(body.error);
        return;
      }

      window.location.assign("/leads");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>Accept Invite</h1>
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </label>
      <label>
        Confirm password
        <input
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? "Submitting…" : "Accept invite"}
      </button>
    </form>
  );
}
