# Technology Consultant Referral Network

An open-source, self-hostable referral network for independent technology consultants and boutique agencies — post leads, express interest, and track referrals through a clear lifecycle, without platform fees or a central authority.

See [Vision](./docs/vision.md) for the problem/solution and [Architecture](./docs/architecture.md) for the stack, data model, and system constraints.

## Stack

| Layer | Choice |
| --- | --- |
| Frontend | React (Vite) — `frontend/` |
| Backend | Hono (TypeScript) — `backend/`, deployable to Cloudflare Workers or Docker/Node/Bun |
| Database | Neon (Serverless Postgres) via Drizzle ORM |
| API | Hono RPC (`hc`) — typed client, no separate schema sync |

## Repo Structure

```
/frontend   React SPA
/backend    Hono API, Drizzle schema/migrations
/docs
 ├── vision.md         Product "why"
 ├── architecture.md   Technical "how" — stack, data model, API pattern
 └── cycles/           Development sprints (requirements + specs per feature)
```

A pnpm workspace (`pnpm-workspace.yaml`); `frontend` and `backend` are separate packages.

## Getting Started

Requires Node, pnpm, and a Neon Postgres database.

```sh
pnpm install

# backend — set DATABASE_URL
cp backend/.dev.vars.example backend/.dev.vars
pnpm db:migrate

# frontend — set VITE_API_URL
cp frontend/.env.example frontend/.env
```

Run the dev servers:

```sh
pnpm dev            # both, in parallel

# or individually
pnpm dev:backend    # http://localhost:8787
pnpm dev:frontend   # http://localhost:5173
```

No admin UI exists yet to create accounts, so seed a test login via a raw
`Invite` insert:

```sh
pnpm --filter backend run seed:invite [email]   # defaults to test@example.com
```

Prints an `/accept-invite/:token` URL — visit it on the frontend to set a
password and log in. Remove this script once an admin UI can create
invites (see [00b](./docs/cycles/sprint-001/00b-accept-invite/specification.md)).

## Development Workflow

Built following a SaSSE (Semi-automated Senior Software Engineer) workflow: structured development in cycles, with guardrails for careful, iterative, AI-assisted development. See [Instructions](./docs/instructions.md) and the [Cycles README](./docs/cycles/README.md).
