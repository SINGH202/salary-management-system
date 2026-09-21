# Prompt: Align docs with v2.2 plan

**When:** Before implementation commit 1

**Intent:** Make `REQUIREMENTS.md` and `ARCHITECTURE.md` match `CURSOR_BUILD_PLAN.md` so an
agent cannot invent NestJS or wrong open-record semantics from stale files.

**Prompt (abridged):**

> Treat CURSOR_BUILD_PLAN.md as source of truth. Rewrite ARCHITECTURE.md from the Express/Zod
> decisions (no NestJS, no class-validator, reconcile cut). Rewrite REQUIREMENTS.md: replace
> CurrentUser guard with DEMO_ACCESS_TOKEN; document active vs terminated salary-record
> lifecycle. Fix getPercentile to use annualized Employee.currentSalary*, not raw
> amountBaseMinor / SalaryRecord history.

**Outcome kept:** Three docs internally consistent; percentile SQL locked; no further
architecture changes before coding.
