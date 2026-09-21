# Prompt: Spec contradiction review

**When:** After build plan v1 / v2 drafts

**Intent:** Find contradictions that would ship wrong payroll numbers or break invariants.

**Prompt (abridged):**

> Review this build plan against the assessment brief. Find what is missing or inconsistent:
> money over JSON, create employee vs first salary, currency-consistent compa-ratio,
> outlier definition, payroll annualization, CSV mechanics, SQLite test isolation, Render env,
> auth vs health checks, and whether docs land before scaffold.

**Outcome kept:**

- `amountBaseMinor` is period-only; `annualize()` is the only ×12
- Active = one open salary record; terminated = zero; dedicated terminate endpoint
- `EmployeeCreate` for hire + CSV; `EmployeeUpdate.strict()` for PATCH
- Docs before scaffold; demo bearer token (not SSO)
- Analytics aggregates `Employee.currentSalary*`, not salary history
- `getPercentile` orders annualized current-pay expression

**Outcome rejected:** Pre-annualized base amounts; NestJS architecture docs; reconcile job as
required deliverable; “exactly one open record always” without termination exception.
