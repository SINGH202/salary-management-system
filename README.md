# ACME Salary Management

Monorepo for ACME HR salary management (Express API + Next.js web + shared Zod contracts).

## Docs

- [Requirements](docs/REQUIREMENTS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Build plan](docs/CURSOR_BUILD_PLAN.md)
- [AI usage](docs/AI_USAGE.md)

## Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io/) 9+

## Setup

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Later commits wire migrate/seed and the full apps:

```bash
pnpm db:migrate
pnpm db:seed
pnpm dev
```

## Scripts

| Script | Description |
|---|---|
| `pnpm dev` | Run API (and web when scaffolded) |
| `pnpm test` | API Vitest suite |
| `pnpm lint` | Lint all workspaces |
| `pnpm db:migrate` | Prisma migrate (API only) |
| `pnpm db:seed` | Seed 10k employees (API only) |

## License

Private assessment submission.
