import type { InferResponseType } from "hono/client";
import { useEffect, useState } from "react";
import { client } from "../lib/api";

type LeadsResponse = InferResponseType<typeof client.leads.$get, 200>;
type Lead = LeadsResponse["items"][number];

export function LeadsPage() {
  const [leads, setLeads] = useState<Lead[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    client.leads.$get().then(async (res) => {
      if (!res.ok) return;
      const body = await res.json();
      if (!cancelled) setLeads(body.items);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (leads === null) {
    return <p>Loading…</p>;
  }

  if (leads.length === 0) {
    return <p>No leads yet</p>;
  }

  return (
    <ul>
      {leads.map((item) => (
        <li key={item.id}>
          {item.title} — {item.status}
        </li>
      ))}
    </ul>
  );
}
