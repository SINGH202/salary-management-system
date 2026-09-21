# Salary Management — Requirements

**Persona:** Priya, HR Manager at ACME. Owns compensation data for ~10,000 employees across
multiple countries. Today this lives in a set of Excel workbooks that are emailed around,
diverge from each other, and can't answer a cross-country question without an afternoon of
pivot tables.

**Source of truth:** `docs/CURSOR_BUILD_PLAN.md` (v2.2). This file is the one-pager from that
plan's §1, with product jobs and lifecycle/auth semantics made explicit so they cannot drift.

## Goal

Let ACME HR manage salary data for ~10,000 employees in a web app and answer org-level pay
questions in seconds, replacing Excel.

Give HR one authoritative, queryable system of record so that (a) recording a pay change is
safe and auditable, and (b) questions about *how the org pays people* are answered in seconds
rather than an afternoon.

## Jobs to be done

1. "Find Rahul's record and tell me what he earns and when he last got a raise."
2. "Give him a 7% increase effective 1 April, reason: promotion." — without destroying the old number.
3. "Hire a new person with a starting salary in one step."
4. "Terminate someone so they drop out of current payroll, and keep their last-pay history."
5. "What do we pay Senior Engineers in Germany vs India, comparably?"
6. "Who is paid below the bottom of their band?"
7. "What is our total annual payroll cost, by department?"
8. "Get our Excel data in, and get a CSV out for finance."

## In scope (v1)

| Feature | Why it earns its place |
|---|---|
| Employee directory — server-paginated list, search, filter by country / department / level / status, sort | 10k rows cannot be shipped to a browser; this is the primary navigation surface |
| Add employee (hire) with starting pay | An employee cannot exist without an open salary record |
| Employee detail with full **salary history timeline** | The history *is* the product. Excel overwrites cells; we append |
| Record a salary change (amount, currency, effective date, reason) | The core write operation. Effective-dated, append-only, never destructive |
| Terminate an employee (dedicated action, not a profile PATCH) | Active vs terminated changes who is on current payroll |
| **Multi-currency** with normalization to a base currency for comparison | Without it, cross-country questions are unanswerable |
| **Compensation bands** per job family × level × country, with compa-ratio and outliers | Turns raw numbers into judgement: "is this person paid correctly?" |
| Analytics dashboard: headcount & payroll cost by dimension, median / p25 / p75, distribution, band outliers | This is the "answer questions" half of the brief, not a nice-to-have |
| CSV import & export | The migration path off Excel. A tool you can't load your data into is a demo |
| 10,000-employee deterministic seed | Required by the brief; makes directory and analytics real, not empty |

## Deliberately out of scope

| Excluded | Reasoning |
|---|---|
| **SSO / RBAC / user accounts** | Single-persona brief. A shared `DEMO_ACCESS_TOKEN` (`Authorization: Bearer …`) gates the public demo URL. That is a deployment guardrail, not an auth product. `/api/health` and `/api/ready` are unauthenticated so Render can probe them. The token is expected to appear in the web bundle; README says so. |
| **Payroll execution** — disbursement, tax, statutory deductions, payslips | A different product with a different risk profile (money movement). We model *what people are paid*, not *paying them* |
| **Employee self-service** | Persona is HR, not the employee |
| **Bonus, equity, benefits** | Modelling total rewards properly means grants, vesting and accruals. Doing it badly is worse than base-salary-only |
| **Excel import wizard UI** | CSV import with row-level validation errors is the migration path; a mapping UI is a different feature |
| **Multi-tenant** | ACME is one org |
| **Org chart visualization** | `managerId` exists for future use; no dedicated UI in v1 |
| **Gender pay-gap productized charts** | `gender` stays an optional schema field; no dedicated chart in v1 |
| **Rehire** | `status: terminated` is one-way in v1 |
| **E2E / browser tests** | Low signal per second of runtime at this project size |
| **Postgres in v1** | SQLite is correct at 10k rows / one writer; the percentile query is isolated for a later port |
| **Live FX feed** | Rates are seeded behind an `FxRateProvider`. Snapshot-on-write is the interesting decision and is already made |
| **Elasticsearch / fuzzy search** | 10k rows. An index and a `LIKE` clause is the correct answer |

## Lifecycle (must not be simplified to "one open record always")

- **Active employee:** exactly one `SalaryRecord` with `effectiveTo = null`. That record matches the denormalized `currentSalary*` fields on `Employee`.
- **Terminated employee:** zero open salary records. The record that was open is closed at `terminationDate`. `currentSalary*` freezes as last-pay history — not a claim they are still being paid.
- **Hire** creates the employee and the first salary record (`reason: hire`) in one transaction.
- **Terminate** is `POST /api/employees/:id/terminate`, not `PATCH` of `status`.
- **No rehire** in v1.

## Non-functional targets

- Directory list and dashboard respond **< 300 ms p95** against the full 10k dataset.
- **Money is never a float** — integer minor units, ISO-4217 currency alongside. FX *rates* are floats (ratios).
- Period amounts are stored; **annualization happens at read** via one helper.
- **Salary history is immutable** — corrections are new records, not edits.
- Seed is **deterministic** (fixed RNG seed `42`, fixed clock `2026-09-01`).
- Test suite runs in **under 30 seconds**, no network, no wall-clock dependency.

## Success

HR can find anyone in under 2 seconds, record a raise or a hire, terminate someone, and
answer "what's average pay in India vs the US, and who's below band?" without opening Excel.

## Explicit assumptions

- One HR manager, one organisation — no multi-tenancy.
- Base salary only. Stored at native pay frequency (monthly or annual); compared and charted as annualized base-currency amounts.
- INR is the reporting base currency (`BASE_CURRENCY=INR`).
- Active employees have exactly one open salary record; terminated employees have none.
- Demo access is one shared bearer token, not a user session.
