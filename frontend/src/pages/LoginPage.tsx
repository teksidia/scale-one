import { useState, type FormEvent } from "react";
import { client } from "../lib/api";

const RATE_LIMIT_MESSAGE = "Too many attempts, try again later";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await client.api.auth.login.$post({ json: { email, password } });

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
      <h1>Log In</h1>
      <label>
        Email
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </label>
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? "Logging in…" : "Log in"}
      </button>
    </form>
  );
}
