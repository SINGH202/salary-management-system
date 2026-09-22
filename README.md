# ACME Salary Management

Monorepo for ACME HR salary management (Express API + Next.js web + shared Zod contracts).

## Docs

- [Requirements](docs/REQUIREMENTS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Build plan](docs/CURSOR_BUILD_PLAN.md)
- [AI usage](docs/AI_USAGE.md)
- [Deploy (GCP Always Free + Vercel)](docs/DEPLOY.md)

## Why SQLite (not Postgres)

v1 uses **SQLite** on purpose, not because Postgres was overlooked.

- **Scale fits:** ~10k employees × a few salary records, one HR persona / low concurrent writers.
- **Ops fit:** file-backed DB is zero-ops for local/CI and a single VM (`connection_limit=1`, WAL).
- **Tests fit:** a real temp SQLite file per test suite stays fast and deterministic without a Dockerized DB.
- **Port path:** the only SQLite-specific query is percentile (`getPercentile`); a later Postgres move is mostly a Prisma datasource change plus that method.

Prefer Postgres when you need multiple API replicas, sustained multi-writer concurrency, managed HA/backups, or multi-tenant SaaS. See [Architecture](docs/ARCHITECTURE.md) for the full stack decisions.

## Deploy target

| Service | Host |
|---|---|
| API + SQLite | **GCP Always Free `e2-micro`** (~$0) |
| Next.js UI | **Vercel Hobby** (free) |

Full steps: **[docs/DEPLOY.md](docs/DEPLOY.md)** (AWS EC2 alternative at the end of that doc).

Demo URL and bearer token will be listed here after first production deploy.

## Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io/) 9+

## Setup

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

```bash
pnpm db:migrate
pnpm db:seed
pnpm dev
```

- API: http://localhost:4000  
- Web: http://localhost:3000  

`DEMO_ACCESS_TOKEN` / `NEXT_PUBLIC_DEMO_ACCESS_TOKEN` must match. The token is a **demo gate**, not real auth — it is expected in the client bundle.

## Scripts

| Script | Description |
|---|---|
| `pnpm dev` | Run API + web |
| `pnpm test` | API + contracts Vitest suite |
| `pnpm lint` | Lint all workspaces |
| `pnpm db:migrate` | Prisma migrate (API only) |
| `pnpm db:seed` | Seed 10k employees (API only) |

## License

Private assessment submission.
