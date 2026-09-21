# Prompt: Assessment framing → build plan

**When:** Planning phase (before any application code)

**Intent:** Turn the ACME salary-management assessment brief into a concrete stack, scope,
and commit-ordered build plan for Cursor to execute.

**Prompt (abridged):**

> Build a plan for employee salary management software for ~10,000 employees. Prefer Next.js
> for UI and a Node-based backend that can grow. Include a one-page requirements doc with
> deliberate non-goals. Design for HR manager persona: directory, salary history, org-level
> pay questions. Seed 10k employees. Production-quality tests. Incremental commits. Artifacts
> that show thinking (architecture, AI usage, trade-offs).

**Outcome kept:** Separate Express API + Next.js web, Prisma + SQLite, Zod contracts package,
effective-dated salary records, bands + analytics, CSV import/export, Render deploy.

**Outcome rejected:** NestJS, Turborepo, Postgres-in-v1, mocked ORM, Excel mapping wizard UI.
