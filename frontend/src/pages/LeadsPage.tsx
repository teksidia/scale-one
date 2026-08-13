import type { InferResponseType } from "hono/client";
import { useEffect, useState } from "react";
import { client, logout } from "../lib/api";

type LeadsResponse = InferResponseType<typeof client.api.leads.$get, 200>;
type Lead = LeadsResponse["items"][number];

export function LeadsPage() {
  const [leads, setLeads] = useState<Lead[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    client.api.leads.$get().then(async (res) => {
      if (!res.ok) return;
      const body = await res.json();
      if (!cancelled) setLeads(body.items);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogout() {
    await logout();
    window.location.assign("/login");
  }

  return (
    <div>
      <button type="button" onClick={handleLogout}>
        Log out
      </button>
      {leads === null ? (
        <p>Loading…</p>
      ) : leads.length === 0 ? (
        <p>No leads yet</p>
      ) : (
        <ul>
          {leads.map((item) => (
            <li key={item.id}>
              {item.title} — {item.status}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
