# ACME Salary Management — Build Plan (v2.2 — final, build-ready)

This is the working spec for an AI coding agent (Cursor) to build against. Follow the commit
order exactly — each commit should be a working, reviewable state, not a checkpoint in a larger
uncommitted change. Do not skip ahead to UI before a backend module has passing tests.

**v2.1 changelog (fixes contradictions found in v2 review):** `amountBaseMinor` is now a
*period* amount, never pre-annualized — `toAnnualBaseMinor` is the only multiplier, used
consistently by analytics, compa-ratio, and outliers. Open-record invariant now correctly
distinguishes active (exactly one open record) from terminated (zero open records) instead of
contradicting itself. Added a dedicated terminate endpoint that closes the record and flips
status in one transaction — `PATCH` no longer touches `status` at all. Mutable/immutable field
table is now actually written out. Added `EmployeeCreate`/`EmployeeUpdate` contract schemas so
CSV import and the create endpoint aren't asked to do something the plain `Employee` schema
can't express. Fixed the commit-7-needs-commit-8 ordering bug in the seed fixture. Renumbered
the whole commit checklist to remove "commit 6.5." Non-goals and architecture decisions are now
pasted inline, not referenced. See §17 for the full list of what changed and why.

**v2.2.1 (docs consistency, no new product decisions):** `getPercentile` now explicitly orders
the annualized `Employee.currentSalary*` expression — never raw `amountBaseMinor` and never
`SalaryRecord` history. Decision 3 no longer mentions a reconcile script (it contradicted
decision 9). `docs/REQUIREMENTS.md` and `docs/ARCHITECTURE.md` are rewritten from this plan.

**v2.2 changelog (closing nits + six finalization locks):** `EmployeeCreate` no longer has a
separate `effectiveFrom` — it's always derived from `hireDate`, one date, not two that could
disagree. `recordSalaryChange` on a terminated employee (no open record) is now a `409`, not an
unspecified error. `PATCH countryCode` explicitly does not cascade into currency or band
recalculation. Percentile-via-`LIMIT/OFFSET` is noted as an approximate quantile, one line, not
hidden. Seed batches hire + full salary history + termination inside the same per-batch
transaction, not one transaction per record. `BASE_CURRENCY=INR` is pinned as a seed constant
matching `FxRate` INR=1. Terminate requires a UI confirm dialog. Plus six locks: annualized sort
on the directory, `/bands/outliers` explicitly active-only by default, hire and CSV-export UI
added to the frontend plan, `terminateDate` validation rules, the reconcile job explicitly cut
(not deferred-and-forgotten) with reasoning, and `EmployeeUpdate` as a `.strict()` Zod schema so
the mutable-field table is enforced in code, not just documented in prose.

---

## 0. Stack (locked, do not substitute)

- **Backend:** Node.js, Express, TypeScript, Prisma ORM, SQLite
- **Frontend:** Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui, TanStack Query,
  TanStack Table, Recharts
- **Shared:** Zod (schemas live in `packages/contracts`, imported by both apps)
- **Monorepo:** pnpm workspaces, no Turborepo
- **Testing:** Vitest + Supertest, real SQLite file per test *file* (no mocked ORM)
- **Deployment target:** Render — two services, `api` (persistent disk) and `web`

---

## 1. Requirements one-pager (pasted inline so the agent never has to invent scope)

**Goal:** let ACME HR manage salary data for ~10,000 employees in a web app and answer
org-level pay questions in seconds, replacing Excel.

**In scope:** employee directory (search/filter/paginate), employee profile + salary history
timeline, record a salary change (raise/correction), record a new hire with their starting pay,
terminate an employee, compensation bands + compa-ratio + outliers, analytics dashboard
(headcount, payroll cost, distribution, by country/department/level), CSV import/export, a
10,000-employee deterministic seed.

**Non-goals, and why:**

| Excluded | Reasoning |
|---|---|
| SSO / RBAC / user accounts | Single-persona brief. A shared `DEMO_ACCESS_TOKEN` gates the public demo URL — that's a deployment guardrail, not an auth feature, and it does not contradict this non-goal |
| Payroll runs, tax, statutory deductions, payslips | Different product, different risk profile (money movement). This models what people are paid, not paying them |
| Employee self-service | Persona is HR, not the employee |
| Bonus, equity, benefits | Modelling total rewards properly needs grants/vesting/accrual; doing it badly is worse than base-salary-only |
| Excel import *wizard* UI | CSV import with row-level validation errors is the migration path; a full mapping UI is a different, bigger feature |
| Multi-tenant | ACME is one org |
| Org chart visualization | `managerId` exists for future use; no dedicated UI in v1 |
| Gender pay-gap productized charts | `gender` stays an optional analytics dimension in the schema; no dedicated chart ships in v1 |
| Rehire | `status: terminated` is one-way in v1; a rehire is a new-hire flow with historical continuity that's out of scope |
| E2E / browser tests | Low signal per second of runtime at this project size |
| Postgres in v1 | SQLite is correct at 10k rows / one writer; the one SQLite-specific query (percentile) is isolated in one method specifically so this is a later, contained port |

**Success:** HR can find anyone in under 2 seconds, record a raise or a hire, terminate someone,
and answer "what's average pay in India vs the US, and who's below band?" without opening Excel.

---

## 2. Architecture decisions (pasted inline)

1. **Express is a separate app from Next.js**, not Next.js Route Handlers, so there's a real,
   independently testable, independently deployable API boundary — the thing this assessment is
   explicitly asking to see, and a property Route Handlers blur.
2. **SQLite, not Postgres**, because 10,000 employees × ~3 salary records is small, and SQLite
   is zero-ops and instantly clonable. The one place this would bite (concurrent aggregate
   queries) is isolated behind `getPercentile`, so a Postgres port later is a contained change,
   not a rewrite.
3. **Current pay is denormalized onto `Employee`** because the directory and dashboard both need
   every employee's current salary on every request; computing it as a correlated subquery over
   `SalaryRecord` at 10k rows is the obvious performance cliff. The tradeoff is a consistency
   risk, covered by an explicit invariant test (§5). There is no reconcile/drift-repair job
   in v1 — cut, not deferred; see decision 9.
4. **`SalaryRecord` snapshots its FX rate; `CompensationBand` does not.** A raise given in EUR
   in 2023 should report the same INR figure forever — that's a historical fact. A band is "what
   we think fair pay is *right now*," so it converts at the current rate on every comparison.
   This asymmetry is intentional, not an inconsistency.
5. **Money is integer minor units; FX rates are floats.** Both are correct — money has no
   acceptable rounding drift, a rate is inherently a ratio. Don't "fix" `fxRateToBase` into a
   `Money`.
6. **`amountBaseMinor` is a period amount, never pre-annualized.** `toAnnualBaseMinor` is the
   only place multiplication by 12 happens. See §4 and §12 item 1 — this was a real bug in an
   earlier draft of this plan and is now locked to prevent regressing it.
7. **`part_time` employees store their actual contracted pay**, not an FTE-equivalent
   full-time-normalized figure, and are annualized the same way as everyone else
   (`toAnnualBaseMinor` doesn't care about employment type, only pay frequency).
8. **Percentile via `ORDER BY ... LIMIT 1 OFFSET n` is an approximate quantile** (nearest-rank,
   not interpolated), which is fine for an HR dashboard reading "roughly the median" — this is
   noted so it's a stated tradeoff, not a silently wrong number.
9. **No reconcile/drift-repair job in v1 — cut, not deferred.** The denormalized `currentSalary*`
   fields are written by exactly three functions (`insertEmployeeWithHire`,
   `recordSalaryChange`, `terminateEmployee`) and nothing else touches them, so the drift risk a
   reconcile job would guard against is structurally small. Building a repair script for a risk
   this contained is spending time the assessment's scope doesn't need spent; if drift is ever
   observed in practice, a one-off script is a half-hour fix, not a missing feature.

---

## 3. Repo layout

```
acme-salary/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── employees/
│   │   │   │   ├── compensation/
│   │   │   │   ├── bands/
│   │   │   │   ├── analytics/
│   │   │   │   ├── fx/
│   │   │   │   └── transfer/
│   │   │   ├── common/
│   │   │   │   ├── money.ts              # Money class + annualize() helper
│   │   │   │   ├── clock.ts
│   │   │   │   ├── pagination.ts
│   │   │   │   ├── error-handler.ts
│   │   │   │   └── auth-gate.ts          # shared-token guard, skips /health & /ready
│   │   │   ├── db/
│   │   │   │   ├── client.ts
│   │   │   │   └── prisma/
│   │   │   │       ├── schema.prisma
│   │   │   │       ├── migrations/
│   │   │   │       └── seed.ts
│   │   │   ├── app.ts                    # sets 'json replacer' for BigInt here
│   │   │   └── server.ts
│   │   ├── test/
│   │   │   ├── setup.ts
│   │   │   └── fixtures/
│   │   │       └── small-seed.ts
│   │   ├── .env.example
│   │   ├── package.json
│   │   └── vitest.config.ts
│   └── web/
│       ├── app/
│       │   ├── employees/
│       │   │   ├── page.tsx
│       │   │   ├── employees-table.tsx
│       │   │   └── [id]/page.tsx
│       │   ├── analytics/page.tsx
│       │   └── layout.tsx
│       ├── components/
│       │   ├── ui/
│       │   └── typography.tsx
│       ├── lib/
│       │   ├── api-client.ts             # attaches Authorization header, both SSR + browser
│       │   ├── query-client.ts
│       │   └── use-debounced-value.ts
│       ├── .env.example
│       └── package.json
├── packages/
│   └── contracts/
│       ├── src/
│       │   ├── employee.schema.ts        # Employee (read), EmployeeCreate, EmployeeUpdate
│       │   ├── salary-record.schema.ts
│       │   ├── band.schema.ts
│       │   ├── pagination.schema.ts
│       │   ├── error.schema.ts
│       │   ├── analytics.schema.ts
│       │   ├── import.schema.ts          # CSV row = EmployeeCreate shape
│       │   └── index.ts
│       └── package.json
├── docs/
│   ├── REQUIREMENTS.md                   # §1 above, standalone
│   ├── ARCHITECTURE.md                   # §2 above, standalone
│   ├── AI_USAGE.md
│   ├── DEMO.md
│   └── prompts/
├── render.yaml
├── pnpm-workspace.yaml
├── .eslintrc.cjs
├── .prettierrc
├── .github/workflows/ci.yml
└── README.md
```

---

## 4. Data model (Prisma schema, target shape)

```prisma
model Employee {
  id                       String   @id @default(cuid())
  employeeCode             String   @unique   // immutable
  firstName                String
  lastName                 String
  workEmail                String   @unique   // immutable
  countryCode              String
  location                 String
  department               String
  jobFamily                String
  level                    String
  managerId                String?
  manager                  Employee?  @relation("ManagerReports", fields: [managerId], references: [id])
  reports                  Employee[] @relation("ManagerReports")
  employmentType           String     // full_time | part_time | contractor
  hireDate                 DateTime   // immutable
  status                   String     // active | terminated — settable ONLY via /terminate, never PATCH
  gender                   String?

  // Denormalized current-pay snapshot. Mirrors the employee's open SalaryRecord exactly,
  // for active employees. For terminated employees these reflect the LAST record before
  // termination (there is no open record — see the invariant below).
  currentSalaryAmountMinor BigInt     // native currency, period amount (matches payFrequency)
  currentSalaryCurrency    String     // native currency code
  currentSalaryBaseMinor   BigInt     // same period, converted to BASE_CURRENCY — NOT annualized
  currentPayFrequency      String     // annual | monthly

  salaryRecords            SalaryRecord[]
  createdAt                DateTime @default(now())
  updatedAt                DateTime @updatedAt

  @@index([countryCode, department, level])
  @@index([status])
  @@index([lastName])
}

model SalaryRecord {
  id               String    @id @default(cuid())
  employeeId       String
  employee         Employee  @relation(fields: [employeeId], references: [id])
  amountMinor      BigInt    // native currency, period amount (matches payFrequency)
  currency         String
  payFrequency     String    // annual | monthly
  effectiveFrom    DateTime
  effectiveTo      DateTime? // null = currently open (active employees only, see §5)
  changeReason     String    // hire | promotion | merit | market_adjustment | correction
  note             String?
  fxRateToBase     Float     // rate AT THE TIME this record was written — never recomputed
  amountBaseMinor  BigInt    // amountMinor converted to BASE_CURRENCY, SAME PERIOD — not annualized
  createdAt        DateTime  @default(now())

  @@index([employeeId, effectiveFrom])
  @@index([employeeId, effectiveTo])
}

model CompensationBand {
  id          String  @id @default(cuid())
  jobFamily   String
  level       String
  countryCode String
  minMinor    BigInt  // always annual
  midMinor    BigInt  // always annual
  maxMinor    BigInt  // always annual
  currency    String

  @@unique([jobFamily, level, countryCode])
}

model FxRate {
  id           String   @id @default(cuid())
  currencyCode String   @unique
  rateToBase   Float
  asOf         DateTime
}
```

---

## 5. Open-record & termination invariant (the exact rule, no ambiguity)

- **Active employee:** exactly one `SalaryRecord` with `effectiveTo = null`, and its
  `amountMinor` / `currency` / `payFrequency` / `amountBaseMinor` exactly match the employee's
  denormalized `currentSalary*` fields.
- **Terminated employee:** zero `SalaryRecord`s with `effectiveTo = null`. The record that was
  open at termination gets `effectiveTo` set to the termination date. The employee's
  `currentSalary*` fields freeze at whatever that last record held — they are the historical
  "last pay" snapshot, not a claim that the employee is currently being paid.
- **Termination is a dedicated action**, not a `PATCH`: `POST /api/employees/:id/terminate`
  (body: `{ terminationDate, note? }`) does, in one transaction: close the open record
  (`effectiveTo = terminationDate`), set `status = 'terminated'`. Rejects if already terminated.
- **No rehire in v1.** `status` only ever transitions `active → terminated`. `PATCH` never
  accepts a `status` field at all — it's not in the mutable list below, and the route 400s if
  it's present in the body.
- Intervals are half-open `[effectiveFrom, effectiveTo)`. A same-day raise is legal: the closed
  record's `effectiveTo` equals the new record's `effectiveFrom`; they don't overlap because the
  interval excludes its own end.

Test coverage required: create → active with one open record; raise → old closes, new opens,
denormalized fields match; terminate → zero open records, `currentSalary*` frozen at last value;
terminate-already-terminated → rejected; `PATCH { status: ... }` → 400.

---

## 6. `amountMinor` vs `amountBaseMinor` vs annualized — the one true rule

`amountMinor` and `amountBaseMinor` are **always a period amount** — whatever `payFrequency`
says (monthly or annual), both fields describe that same period, one in native currency, one
converted to `BASE_CURRENCY`. Neither field is ever annualized. `Money.annualize(minor,
payFrequency)` — `payFrequency === 'monthly' ? minor * 12n : minor` — is the **only** place a
period amount becomes an annual figure, and every consumer that needs an annual number
(analytics aggregates, compa-ratio, outliers) calls it explicitly rather than reading a field
that's silently already annualized. This was double-counted in an earlier draft of this plan
(every monthly employee would have been counted 12× in payroll totals) — §12 keeps a record of
that so it isn't reintroduced.

---

## 7. API surface

All list endpoints are paginated (`page`, `pageSize`, max `pageSize=100`) and return
`{ data, page, pageSize, total }`, including `/api/bands` and `/api/bands/outliers` (outliers
defaults `pageSize=50` since the set is naturally small — 3–5% of 10k). `GET
/employees/:id/history` stays unpaginated — bounded to a handful of rows per employee.

```
GET    /api/health                    liveness, no DB dependency, NOT behind auth-gate
GET    /api/ready                     readiness, one cheap DB query, NOT behind auth-gate

GET    /api/employees                 list — filters: country, department, level, status
                                       (default status=active unless explicitly requested);
                                       search: firstName/lastName/workEmail, 0–1 chars = no
                                       filter (not a 400), 2+ chars = contains match;
                                       sort: allowlist — lastName, hireDate, department,
                                       currentSalaryBaseMinor (ANNUALIZED for sort purposes —
                                       see note below; raw period comparison would rank a
                                       monthly employee below an annual one even when they earn
                                       more per year)
GET    /api/employees/:id             detail, includes current salary + manager name
GET    /api/employees/:id/history     full salary record timeline, newest first, unpaginated
POST   /api/employees                 body: EmployeeCreate (profile + amountMinor + currency +
                                       payFrequency — NO separate effectiveFrom field; the hire
                                       SalaryRecord's effectiveFrom is always exactly hireDate,
                                       one date, never two that could disagree) — one
                                       transaction, creates Employee + first
                                       SalaryRecord(reason: hire)
PATCH  /api/employees/:id             body: EmployeeUpdate, a `.strict()` Zod schema containing
                                       ONLY the mutable fields from §8 — unknown or immutable
                                       fields (including `status`) fail validation at the schema
                                       boundary, 400, before reaching the service. Changing
                                       `countryCode` does NOT cascade into recomputing currency
                                       or re-checking band membership — those are evaluated live
                                       wherever they're read (compa-ratio, outliers), so a
                                       changed country simply means the next compa-ratio lookup
                                       uses the new country; if no band exists there, that
                                       lookup returns `null`, which is the expected, documented
                                       behavior (§9 bands), not an error
POST   /api/employees/:id/terminate   body: { terminationDate, note? }, validated: must be >=
                                       the open record's effectiveFrom, must be <= Clock.now()
                                       (no future terminations) — closes open record, sets
                                       status=terminated, one transaction, rejects if already
                                       terminated (409) or if the date fails validation (400)

POST   /api/employees/:id/salary-changes   body: amount, currency, payFrequency, effectiveFrom,
                                            changeReason, note — changeReason MUST NOT be 'hire'
                                            (400 if it is); if the employee is terminated (no
                                            open record to modify), returns 409, not a generic
                                            error
GET    /api/employees/:id/compa-ratio      toAnnualBaseMinor(current pay) / band.midMinor,
                                            band converted to base at the CURRENT fx rate

GET    /api/bands                     paginated, filter by family/level/country
PUT    /api/bands                     upsert by (jobFamily, level, countryCode)
GET    /api/bands/outliers            paginated, ACTIVE EMPLOYEES ONLY by default (same
                                       includeTerminated opt-in flag as analytics — a
                                       terminated employee's frozen last-pay snapshot showing up
                                       as "out of band" would be misleading, they're not
                                       currently being paid at all) — toAnnualBaseMinor(current
                                       pay) < band.min OR > band.max, both sides compared as
                                       annual base-currency

GET    /api/analytics/headcount       by country / department / level; includes contractors
GET    /api/analytics/payroll-cost    toAnnualBaseMinor summed, active only by default,
                                       excludes contractors by default (includeTerminated,
                                       includeContractors query flags to opt in)
GET    /api/analytics/distribution    median / p25 / p75, same annualization + scoping rules
GET    /api/analytics/summary         top-line numbers for the dashboard landing view

POST   /api/import/employees          multipart CSV, one row = EmployeeCreate shape, 5MB limit,
                                       text/csv only, all rows validated before any write,
                                       returns { imported, errors: [{ row, field, message }] }
GET    /api/export/employees          CSV download (wider row: profile + current pay),
                                       current filters applied, streamed via Prisma cursor
```

Every route except `/health` and `/ready` requires `Authorization: Bearer <DEMO_ACCESS_TOKEN>`
— enforced by `auth-gate` middleware mounted after those two routes, before everything else.
Errors return `{ error: { code, message, details? } }` via `common/error-handler.ts`. An unknown
FX currency from `FxRateProvider.getRate` throws a typed `FxRateNotFoundError`, mapped to `400`
by the error handler, never a `500`.

---

## 8. Mutable vs immutable fields (the actual table)

| Immutable (never in `PATCH`) | Mutable via `PATCH` |
|---|---|
| `employeeCode`, `workEmail`, `hireDate`, `status` | `firstName`, `lastName`, `location`, `department`, `jobFamily`, `level`, `managerId`, `employmentType`, `gender`, `countryCode` |

`status` changes only through `POST /employees/:id/terminate`. `PATCH` 400s if `status` appears
in the request body at all, even set to its current value. This table is not just documentation
— `contracts/employee.schema.ts` defines `EmployeeUpdate` as `z.object({...}).strict()` over
exactly the right-hand column, so an unlisted or immutable field in a request body fails Zod
validation before any route or service code runs. The schema *is* the enforcement of this table,
not a separate thing that has to be kept in sync with it by hand.

---

## 9. Module-by-module notes for the agent

**`common/money.ts`** — `Money` class (`{ amountMinor: bigint, currency: string }`, `plus`,
`percentOf`, `convertTo`, `toContractString`/`fromContractString`), plus a standalone
`annualize(minor: bigint, payFrequency: string): bigint` helper — this is the *only* function
in the codebase allowed to multiply a money value by 12. No floats in this file; FX rates are
floats by design (§2.5), documented so nobody "fixes" that.

**`common/clock.ts`** — `Clock` interface, `now(): Date`. Used by `compensation` (effective-date
validation) only. `analytics` is a pure read-model repository with no time-dependent logic in
v1 (no as-of-date queries), so it does not take a `Clock` — this removes the contradiction in an
earlier draft where `clock.ts` claimed analytics needed one and the analytics section said it
had no service layer at all. Ban bare `Date.now()` / `new Date()` with no arguments inside
services; the seed script's fixed-instant `new Date('2026-09-01T00:00:00.000Z')` is fine, it's
not the zero-arg form.

**`fx`** — `FxRateProvider.getRate(currency)` throws `FxRateNotFoundError` for an unknown
currency (caught by the global error handler → 400). DB-backed implementation reads `FxRate`.
Tests use an in-memory fake.

**`app.ts` JSON/BigInt handling** — `app.set('json replacer', (key, value) => typeof value ===
'bigint' ? value.toString() : value)`. This is Express's built-in hook for `res.json`'s
`JSON.stringify` replacer — no `BigInt.prototype` mutation, no global surprises for Prisma or
tests that construct BigInts directly.

**`compensation`** — the core write path, and the only module allowed to write `SalaryRecord`.

`createEmployee(input: EmployeeCreate)`: one transaction — insert `Employee`, insert first
`SalaryRecord` (`effectiveFrom: input.hireDate` — always derived from `hireDate`, `EmployeeCreate`
has no separate date field for this, so the two can never disagree — `changeReason: 'hire'`,
`effectiveTo: null`, `amountBaseMinor` = period amount converted, not annualized), set
`currentSalary*` from it. Implemented as `insertEmployeeWithHire(tx, input)` — takes a Prisma
transaction client as its first argument so both the Express service (wraps one call in
`$transaction`) and the seed script (batches many calls inside larger `$transaction`s) share the
exact same invariant-writing logic. This is one business path with two callers, not two business
paths.

**Directory sort on `currentSalaryBaseMinor`** compares `annualize(currentSalaryBaseMinor,
currentPayFrequency)`, computed inline in the Prisma/SQL query (a `CASE WHEN
currentPayFrequency = 'monthly' THEN currentSalaryBaseMinor * 12 ELSE currentSalaryBaseMinor
END` ordering expression, not a stored column) — sorting on the raw period value would rank
monthly-paid employees below annual ones even when they earn more per year.

`recordSalaryChange(employeeId, input)`: rejects `input.changeReason === 'hire'` (400). Loads
the open record; if none exists (employee is terminated), returns `409 Conflict` — this is a
state conflict, not a missing resource or a bad request. Rejects with 400 if
`input.effectiveFrom` is before the open record's `effectiveFrom`. Transaction: close the open
record (`effectiveTo = input.effectiveFrom`), insert the new record (period amount, not
annualized), update `currentSalary*`.

`terminateEmployee(employeeId, input)`: rejects with `409` if already terminated. Rejects with
`400` if `input.terminationDate` is before the open record's `effectiveFrom` or after
`Clock.now()`. Transaction: close the open record (`effectiveTo = input.terminationDate`), set
`status = 'terminated'`. `currentSalary*` is left as-is (the last-pay snapshot).

Required tests: create (denormalized fields match), standard raise, same-day raise, correction
(`changeReason: 'correction'` — included in payroll-cost like any other record; there is no
"raises-only" analytics endpoint, so nothing needs to filter corrections out — an earlier draft
implied one existed and it doesn't, that sentence is deliberately removed here), reject
backdate-before-open-record, reject `changeReason: 'hire'` via the raise endpoint, currency
change mid-history, pay-frequency change mid-history, terminate (zero open records after,
`currentSalary*` frozen), reject double-terminate, reject `PATCH { status }`.

**`bands`** — `compaRatio = annualize(employee.currentSalaryBaseMinor,
employee.currentPayFrequency) / bandMidpointInBase`, where the band's `midMinor` (already
annual) is converted to base currency via the *current* `FxRateProvider` rate. Missing band for
a `(jobFamily, level, countryCode)` combination → `null`, not a throw. Outliers use the same
annualized, base-currency comparison against `band.minMinor`/`maxMinor`. Compa-ratio is a
secondary UI signal (e.g. flagged outside 0.8–1.2); it is not a second, competing outlier
definition — `/bands/outliers` is the one source of truth for "who's out of range."

**`analytics`** — read-only repository, direct SQL, no service layer, no `Clock`. Analytics
operates on **`Employee.currentSalary*`**, never on `SalaryRecord.amountBaseMinor` — salary
history must not be aggregated into current payroll, distribution, or percentiles. Every
money aggregate goes through `annualize()` first. Default scope: `status = 'active'`; accepts
`includeTerminated` and `includeContractors` flags. The dashboard's own copy should say this
explicitly ("headcount includes contractors; payroll excludes them unless shown") — see §12 —
so the numbers don't look wrong to someone comparing the two charts.

`getPercentile` must order/filter on the **annualized current-pay expression**, never raw
`amountBaseMinor` or raw `currentSalaryBaseMinor`. Isolated in one `getPercentile` method
(the single SQLite-specific seam; nearest-rank `LIMIT/OFFSET` is an approximate quantile,
§2.8). Conceptually:

```sql
ORDER BY CASE
  WHEN currentPayFrequency = 'monthly'
    THEN currentSalaryBaseMinor * 12
  ELSE currentSalaryBaseMinor
END
LIMIT 1 OFFSET (...)
```

**`transfer`** — mounted at `/api/import` and `/api/export`. Import rows validate against
`contracts/import.schema.ts`, which is the `EmployeeCreate` shape (profile + hire pay) — an
employee cannot be imported without a starting salary, matching the "no employee without a
salary record" rule. Multer, memory storage, 5MB limit, `text/csv` only. All rows validated
before any write; response returns every row-level error at once. Export uses the wider read
model (current pay included) and streams via Prisma cursor iteration — never buffers all 10k
rows.

---

## 10. Seed script (`db/prisma/seed.ts`)

- Fixed clock: `SEED_TODAY = new Date('2026-09-01T00:00:00.000Z')` — every relative date is
  computed from this constant.
- Fixed RNG: `faker.seed(42)`.
- `BASE_CURRENCY` is pinned to `'INR'` as a seed constant (not read from `process.env` — the
  seed must be reproducible independent of local `.env` contents), matching the `FxRate` row
  where `currencyCode = 'INR'` has `rateToBase = 1.0`.
- 10,000 employees, pyramid distribution (45% L1–L2, 35% L3–L4, 15% L5, 5% L6), 6 countries (US,
  IN, UK, DE, SG, BR) each mapped to its currency, 8 departments, 6 job families.
- `employmentType`: 85% `full_time`, 10% `contractor`, 5% `part_time` — part-time employees get
  their actual contracted period pay, annualized the same way as everyone else (§2.7).
- `status`: ~10% `terminated`, produced by calling `terminateEmployee`'s underlying transaction
  logic (not hand-writing a second termination path in the seed) with a plausible termination
  date after their last raise.
- `managerId`: assign top-down by level, one level above, same department/country where
  possible. If this proves fiddly under time pressure, leave it `null` for everyone rather than
  risk a cyclic assignment — log the decision either way in `AI_USAGE.md`.
- Each employee's full lifecycle — hire (`insertEmployeeWithHire`), every subsequent raise
  (`recordSalaryChange`), and termination if applicable (`terminateEmployee`) — is applied
  inside the **same** per-batch `$transaction` as ~500 other employees' full lifecycles, not one
  transaction per individual record. A naive "one transaction per salary record" approach turns
  10k employees with up to 5 records each into tens of thousands of separate transactions, which
  blows well past the 15s target; batching whole employee lifecycles together keeps the
  transaction count in the tens, not the tens of thousands, while still going through the real
  invariant-preserving functions rather than a raw bulk insert.
- Each employee gets 1–5 `SalaryRecord`s total (including the hire record): `promotion` or
  `merit`, 3–15% raises, 9–24 months apart.
- ~3–5% of active employees deliberately below their band's `min`.
- `FxRate`: `INR = 1.0` plus a rate for each other currency into INR, `asOf = SEED_TODAY`.
- `CompensationBand`: one row per `(jobFamily, level, countryCode)` combination present in the
  data, except the deliberate outlier set.
- Print final counts (employees, salary records, terminated count, bands, FX rates) on
  completion.

---

## 11. Testing conventions

- `test/setup.ts`: fresh temp SQLite file per test *file*, `prisma migrate deploy`, run
  `test/fixtures/small-seed.ts`, expose the Prisma client, teardown deletes the file.
- **`test/fixtures/small-seed.ts` has two versions across the commit sequence, not two designs:**
  in commit 8 (employees module — `insertEmployeeWithHire` doesn't exist yet) it inserts ~50
  employees directly via Prisma, enough to exercise list/filter/search/sort/pagination. In
  commit 9 (compensation module lands), it's refactored in place to call
  `insertEmployeeWithHire` instead, and gains the salary-history depth needed for effective-
  dating tests. This is a documented refactor step, not a second competing fixture.
- **Isolation convention:** every write test generates its own unique `employeeCode`/`workEmail`
  and asserts against those specific records by id — never a global row count.
- Unit tests (`money.test.ts`, `annualize()`, `fx.test.ts`, effective-dating transitions,
  percentile math) use no DB and a `FixedClock`.
- Integration tests import `app` from `app.ts` (never `server.ts`), Supertest.
- Full suite (`pnpm --filter api test`) under 30 seconds.
- No snapshot tests, no browser/E2E tests.

---

## 12. Frontend notes

- `app/layout.tsx`: nav shell (Employees, Analytics), `/` redirects to `/employees`.
- `components/typography.tsx`: all visible copy goes through shared text primitives.
- `lib/use-debounced-value.ts`: 400ms debounce; 0–1 character search is treated as "no search
  filter" and still loads the paginated list (never a 400, never an empty state for a short
  query). The previous in-flight request is aborted when a new **debounced** query fires — not
  on every keystroke.
- `lib/api-client.ts` attaches `Authorization: Bearer <token>` to every request, including
  server-component (SSR) fetches to `API_INTERNAL_URL` — not just browser calls to
  `NEXT_PUBLIC_API_URL`. The token being visible in the client JS bundle is expected and fine
  for a casual demo gate; `README.md` says so explicitly so it's never mistaken for real auth.
- **Directory**: server component for first paint, `employees-table.tsx` client component,
  TanStack Table in full manual mode (`manualPagination`/`manualFiltering`/`manualSorting`).
  Default filter `status=active`. Loading, empty, and error states. Header includes two actions
  the earlier draft of this plan specified an API for but never gave a UI: an **"Add employee"**
  button opening a form (`EmployeeUpdate`'s mutable fields + `amountMinor`/`currency`/
  `payFrequency`, i.e. the `EmployeeCreate` shape) that calls `POST /api/employees`, and an
  **"Export CSV"** button that calls `GET /api/export/employees` with the directory's current
  filters applied and triggers a browser download of the streamed response.
- **Detail**: profile card, salary history timeline, raise form (decimal-string money input,
  transformed to minor units by the shared Zod schema — never a raw `type="number"` float as
  source of truth), a **Terminate** action behind a confirm dialog (shadcn `AlertDialog` — this
  is a destructive, one-way state transition per §5, so it does not fire on a single click) that
  collects `terminationDate` and calls the dedicated endpoint, surfacing the 400/409 validation
  cases from §7 as inline form errors, 404 state for an unknown id.
- **Analytics**: headcount and payroll-cost charts, distribution view, outliers table reading
  directly from `GET /api/bands/outliers`. Dashboard copy states explicitly: *"Headcount
  includes contractors. Payroll cost excludes contractors unless shown."* — printed near the
  relevant chart, not left implicit, so the two numbers don't look contradictory.
- shadcn has no `DatePicker` — built from `Popover` + `Calendar`.

---

## 13. CI & deploy

- `.github/workflows/ci.yml`: pin `node-version: 20`, run `prisma generate` then
  `prisma migrate deploy` against a throwaway SQLite file before `pnpm --filter api test` and
  `pnpm -r lint`.
- Root scripts use `pnpm --filter api db:migrate` / `pnpm --filter api db:seed` — **not**
  `pnpm -r`, since `apps/web` has no database and `-r` would run (or fail) it there too.
- `render.yaml`: `api` service on a persistent disk, `DATABASE_URL=file:/data/acme.db?connection_limit=1`,
  WAL mode enabled at connection time via `ensureDbReady` in `src/db/client.ts`
  (not in migration.sql — Prisma wraps migrations in a transaction and SQLite ignores
  journal_mode changes inside a transaction), health check hits
  `GET /api/health` (unauthenticated). `web` service sets `API_INTERNAL_URL` to the api
  service's private Render hostname, `NEXT_PUBLIC_API_URL` to its public one.

---

## 14. Commit checklist (renumbered, sequential)

- [ ] **1.** `docs/REQUIREMENTS.md` (§1), `docs/ARCHITECTURE.md` (§2)
- [ ] **2.** `docs/AI_USAGE.md` + `docs/prompts/` seeded with prompts used so far
- [ ] **3.** Monorepo scaffold — pnpm workspaces, empty apps/packages, shared tsconfig,
      ESLint/Prettier, `.github/workflows/ci.yml`, root scripts (`dev`, `test`, `lint`,
      `db:migrate`/`db:seed` scoped to `api` only, per §13)
- [ ] **4.** `packages/contracts` — `Employee`, `EmployeeCreate`, `EmployeeUpdate`,
      `SalaryRecord`, `Band`, pagination envelope, error envelope, analytics query params,
      import row (= `EmployeeCreate`)
- [ ] **5.** Prisma schema (§4) + first migration, `db/client.ts`, `common/clock.ts` + tests,
      `common/money.ts` (`Money` + `annualize()`) + full test coverage
- [ ] **6.** `fx` module — provider interface, DB-backed impl, in-memory fake,
      `FxRateNotFoundError`, conversion tests
- [ ] **7.** Plumbing — `common/pagination.ts`, `common/error-handler.ts`, `json replacer` in
      `app.ts`, `common/auth-gate.ts`, CORS, `GET /api/health` + `GET /api/ready` (both
      unauthenticated), wired before any domain module
- [ ] **8.** `employees` module — repository/service/routes (list/filter/search/sort/paginate,
      get, `PATCH` with the mutable-field table from §8), Supertest tests;
      `test/fixtures/small-seed.ts` created here via raw Prisma inserts (§11)
- [ ] **9.** `compensation` module — `insertEmployeeWithHire`, `recordSalaryChange`,
      `terminateEmployee`, all test cases from §9, invariant tests from §5; refactor
      `small-seed.ts` to use `insertEmployeeWithHire` (§11)
- [ ] **10.** `bands` module — upsert, compa-ratio, outliers (paginated) + tests
- [ ] **11.** `analytics` module — headcount, payroll-cost, distribution, `getPercentile`,
      `annualize()` used throughout, tests against a hand-computable fixture
- [ ] **12.** Seed script — full 10k generation per §10
- [ ] **13.** `transfer` module — CSV import (multer, `EmployeeCreate` rows, row-level errors) +
      streamed export + tests
- [ ] **14.** `apps/web` scaffold — Next.js, Tailwind, shadcn init, nav shell,
      `components/typography.tsx`, `lib/api-client.ts` (with auth header), `lib/query-client.ts`,
      `lib/use-debounced-value.ts`
- [ ] **15.** Employee directory page — server-paginated table, filters (default active), search,
      sort, states
- [ ] **16.** Employee detail page — profile, salary history timeline, raise form, terminate
      action, 404 state
- [ ] **17.** Analytics dashboard page — charts, distribution, outliers table, explicit
      contractor-scoping copy
- [ ] **18.** `render.yaml`, root `README.md` (setup/run/test/deploy + demo URL + bearer token
      note), `docs/DEMO.md` + recorded video link

---

## 15. Environment variables

`apps/api/.env.example`
```
DATABASE_URL="file:./dev.db?connection_limit=1"
PORT=4000
BASE_CURRENCY=INR
CORS_ORIGIN="http://localhost:3000"
DEMO_ACCESS_TOKEN="change-me"
```

`apps/web/.env.example`
```
NEXT_PUBLIC_API_URL="http://localhost:4000"
API_INTERNAL_URL="http://localhost:4000"
NEXT_PUBLIC_DEMO_ACCESS_TOKEN="change-me"
```

---

## 16. Definition of done

- `pnpm install && pnpm --filter api db:migrate && pnpm --filter api db:seed && pnpm -r dev`
  runs both apps locally from a clean clone.
- `pnpm --filter api test` passes, under 30s. `pnpm -r lint` passes.
- Directory list and analytics dashboard under 300ms p95 against the full 10k seed.
- Deployed to Render, both services up, migrations + seed run via a documented release step.
- Demo video (2–3 min) linked from `README.md` and `docs/DEMO.md`: search/filter, salary
  history, recording a raise, a hire, a termination, the analytics dashboard, CSV export.

---

## 17. v2 → v2.1 changes and why (kept as a record, not just a changelog line)

1. **`amountBaseMinor` was defined as both "converted" and "annualized" simultaneously in v2.**
   That double-counts every monthly employee by 12× in every aggregate. Fixed: period-only,
   `annualize()` is the sole multiplier (§6).
2. **v2 said "exactly one open record per employee" and separately "terminated employees have
   zero open records" without reconciling them.** Fixed: the rule is scoped to active employees;
   terminated employees are explicitly zero (§5).
3. **v2 had no way to actually terminate someone**, despite the seed needing terminated
   employees to exist. Added `POST /employees/:id/terminate` as its own transaction (§5, §9).
4. **v2's §11 referenced a mutable-field table that didn't exist in the document.** Written out
   in §8.
5. **v2 required CSV import to match the plain `Employee` schema, which has no salary fields, while
   also requiring every employee to have a hire salary.** Fixed with a distinct `EmployeeCreate`
   contract used by both the create endpoint and CSV import (§9).
6. **v2's commit 7 needed `test/fixtures/small-seed.ts`, but the function it was supposed to
   call (`createEmployee`/`insertEmployeeWithHire`) didn't exist until commit 8.** Fixed by
   splitting the fixture's implementation across those two commits explicitly (§11, §14).

**v2.2 additions** (finalization pass, no further architecture changes expected after this):
sorting by current pay now annualizes first, so a monthly employee earning more per year than an
annual employee sorts correctly; `/bands/outliers` is active-only by default, matching
analytics' scoping, since a terminated employee's frozen pay snapshot isn't a current
out-of-band finding; the directory and detail pages gained the hire-employee and CSV-export
actions their APIs already supported but had no UI; `terminateDate` is validated against the
open record's start and against "not in the future"; the reconcile job from the very first draft
of this plan is explicitly cut, with the reasoning recorded in §2.9 rather than left as a silent
scope drop; and `EmployeeUpdate` is a `.strict()` schema so the mutable-field table in §8 is
enforced by the type system, not just written down.
