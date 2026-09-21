# Architecture & Design Notes

**Source of truth:** `docs/CURSOR_BUILD_PLAN.md` (v2.2). This file is that plan's architecture
(§0, §2–§6, plus the locked analytics/percentile rule) as a standalone reviewer artifact.
Do not reintroduce NestJS, `class-validator`, a `reconcile` command, or aggregating
`SalaryRecord` history into current-pay analytics.

## Stack

| Layer | Choice | Reasoning |
|---|---|---|
| Backend | **Node.js, Express, TypeScript** | A real, independently testable and deployable API boundary. Next.js Route Handlers blur that boundary; NestJS would add DI/module ceremony the assessment does not need |
| Validation | **Zod** in `packages/contracts`, imported by API and web | One schema for HTTP, CSV import, and forms. Not `class-validator` |
| ORM | **Prisma** | Typed client, real migration files, schema as documentation |
| DB | **SQLite** | 10k employees × ~3 salary records is small. Zero-ops, file-backed, clonable. Postgres later is a datasource change plus swapping `getPercentile` |
| Frontend | **Next.js (App Router)** + TanStack Query + TanStack Table + shadcn/ui + Recharts | Server components for first paint; client tables in full manual (server) mode |
| Monorepo | **pnpm workspaces**, no Turborepo | Two apps + one contracts package |
| Tests | **Vitest + Supertest**, real SQLite file per test file | No mocked ORM |
| Deploy | **Render** — `api` (persistent disk) + `web` | Health check hits unauthenticated `GET /api/health` |

## Why Express is separate from Next.js

The assessment asks for an end-to-end backend and UI. A separate Express app gives a hard HTTP
contract, Supertest against `app.ts` with no port, and an independently scaled API. Route
Handlers would fold that into the UI process and make the API harder to review as a backend.

## Module layout

```
apps/api/src/
  modules/
    employees/      # directory, profile PATCH (no salary writes)
    compensation/   # hire, raise, terminate — only writer of SalaryRecord
    bands/          # upsert, compa-ratio, outliers
    analytics/      # current-pay aggregates; no service layer, no Clock
    fx/             # FxRateProvider
    transfer/       # CSV import/export, mounted at /api/import and /api/export
  common/           # money, clock, pagination, error-handler, auth-gate
  db/prisma/        # schema, migrations, seed
  app.ts            # Express app; BigInt json replacer; no listen()
  server.ts         # listen() only — tests never import this
apps/web/
  app/              # /employees, /employees/[id], /analytics
  components/ui/    # shadcn
  components/typography.tsx
  lib/              # api-client (Bearer token, SSR + browser), query-client, use-debounced-value
packages/contracts/ # Zod: Employee, EmployeeCreate, EmployeeUpdate.strict(), SalaryRecord, Band, pagination, errors, analytics, import
```

Each API module: `<name>.routes.ts` → parse with a contracts Zod schema → exactly one service
method. Services hold business rules and depend on repositories, `Clock` (compensation only),
and `FxRateProvider`. Repositories are the only files allowed to import Prisma.

## Data model (summary)

- **Employee** — profile + denormalized `currentSalaryAmountMinor` / `currentSalaryCurrency` /
  `currentSalaryBaseMinor` / `currentPayFrequency`. Those four are **period** amounts (not
  annualized). For active staff they mirror the open `SalaryRecord`; for terminated staff they
  freeze last pay.
- **SalaryRecord** — append-only, half-open `[effectiveFrom, effectiveTo)`. `effectiveTo = null`
  means currently open (**active employees only**). `fxRateToBase` and `amountBaseMinor` are
  snapshotted at write. `amountBaseMinor` is the same **period** as `amountMinor`, in
  `BASE_CURRENCY` (USD). Never pre-annualized.
- **CompensationBand** — annual min/mid/max per `(jobFamily, level, countryCode)`. Converted at
  the **current** FX rate on every comparison (not snapshotted).
- **FxRate** — `currencyCode` unique, `rateToBase` is a float (a ratio, not money).

### Open-record invariant

- **Active:** exactly one open salary record, matching `currentSalary*`.
- **Terminated:** zero open records; last record closed at `terminationDate`; `currentSalary*`
  frozen. Status changes only via `POST /api/employees/:id/terminate`. No rehire in v1.

## Decisions (locked)

1. **Express is a separate app from Next.js** — independently testable and deployable API.
2. **SQLite, not Postgres** — correct at this size; `getPercentile` is the one isolated seam.
3. **Current pay is denormalized onto `Employee`** — directory and dashboard need it every
   request. Consistency is guarded by invariant tests on the three writers
   (`insertEmployeeWithHire`, `recordSalaryChange`, `terminateEmployee`). **No reconcile /
   drift-repair job in v1** — cut, not deferred. If drift is ever observed, a one-off script is
   a half-hour fix, not a missing feature.
4. **`SalaryRecord` snapshots FX; `CompensationBand` does not.** Historical USD on a raise is a
   fact. A band is "fair pay *right now*."
5. **Money is integer minor units; FX rates are floats.** Do not "fix" `fxRateToBase` into `Money`.
6. **`amountBaseMinor` is a period amount.** `Money.annualize(minor, payFrequency)` is the only
   ×12 in the codebase. Analytics, compa-ratio, outliers, and directory sort all call it
   (or the equivalent SQL `CASE` expression).
7. **`part_time` stores actual contracted pay**, not FTE-normalized pay.
8. **Percentile via `ORDER BY … LIMIT 1 OFFSET n` is nearest-rank**, not interpolated.
9. **No reconcile job** — see (3).

## Current-pay analytics (do not get this wrong)

Payroll cost, distribution, summary, and percentiles aggregate **`Employee.currentSalary*`**,
never `SalaryRecord` history (that would double-count raises).

`getPercentile` orders the **annualized current-pay expression**, never raw `amountBaseMinor`:

```sql
ORDER BY CASE
  WHEN currentPayFrequency = 'monthly'
    THEN currentSalaryBaseMinor * 12
  ELSE currentSalaryBaseMinor
END
LIMIT 1 OFFSET (...)
```

Directory sort on `currentSalaryBaseMinor` uses the same expression. Outliers default to
**active** employees only.

## Money and JSON

Contracts expose money as `z.string()` (base-10 integer minor units). Express sets
`app.set('json replacer', …)` to stringify `bigint` — no `BigInt.prototype` mutation.

## Auth (deployment gate, not a product)

`DEMO_ACCESS_TOKEN` via `Authorization: Bearer …` on every route except `/api/health` and
`/api/ready`. CORS allows `Authorization` and `Content-Type` from `CORS_ORIGIN`. This is not
SSO/RBAC and does not contradict that non-goal.

## Performance

- Indexes: `(countryCode, department, level)`, `(status)`, `(lastName)`,
  `(employeeId, effectiveFrom)`, `(employeeId, effectiveTo)`.
- Offset pagination, max `pageSize=100`, default `page=1`, `pageSize=20`.
- Aggregation in SQL, not in Node.
- SQLite production: `connection_limit=1`, WAL via migration, `DATABASE_URL` on the Render disk
  (`file:/data/acme.db?connection_limit=1`).
- Two frontend URLs: `NEXT_PUBLIC_API_URL` (browser) and `API_INTERNAL_URL` (SSR).

## Testing

- Unit: `Money`, `annualize`, FX fake, effective-dating, percentile maths on hand-computed
  fixtures. `FixedClock`. No DB.
- Integration: Supertest against `app.ts`, temp SQLite per **file**, small fixture (~50).
- Write tests use unique `employeeCode` / `workEmail`; never assert global row counts.
- No snapshot tests, no E2E.

## Seed

`faker.seed(42)`, `SEED_TODAY = 2026-09-01T00:00:00.000Z`, `BASE_CURRENCY` pinned to `USD`.
10,000 employees through `insertEmployeeWithHire` / `recordSalaryChange` / `terminateEmployee`
inside batched `$transaction`s (~500 employee lifecycles each), target < 15s.

## Commit order

Docs first (`REQUIREMENTS.md`, `ARCHITECTURE.md`), then scaffold, contracts, schema, domain
modules with tests, seed, transfer, web, deploy. Exact sequence: build plan §14.
