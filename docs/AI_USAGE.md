# AI Usage

How AI tools (primarily Cursor) were used on this assessment, what was kept, and what was
rejected. The goal is intentional acceleration with human ownership of correctness — not
blind generation.

## How AI was used

| Phase | Use | Human ownership |
|---|---|---|
| Product framing | Drafted requirements, non-goals, and persona jobs-to-be-done | Reviewed and locked non-goals (no payroll, no SSO product, no Excel wizard) |
| Architecture | Compared stack options (Next-only vs Express split; SQLite vs Postgres; Nest vs Express) | Chose Express + Zod + SQLite with documented scale path; rejected Nest and Turborepo |
| Spec hardening | Multi-pass review of the build plan for contradictions (money annualization, open-record vs terminated, CSV vs hire salary) | Each contradiction fixed into locked product rules before any app code |
| Docs | Generated `REQUIREMENTS.md` / `ARCHITECTURE.md` from the locked plan | Verified Express/Zod/demo-token semantics; removed stale Nest/`CurrentUser`/`reconcile` content |
| Implementation (ongoing) | Scaffold, boilerplate, first-pass tests, seed shape | Review every money field, query, and invariant; do not accept giant one-shot dumps |

## What was rejected (and why)

| Idea | Why rejected |
|---|---|
| NestJS + `class-validator` | Extra DI ceremony for a small API; Zod in a shared `packages/contracts` package is the single validation source for API and UI |
| Turborepo | pnpm workspaces are enough for two apps + one package |
| Next.js Route Handlers as the only backend | Blurs the independently testable/deployable API boundary the assessment asks to demonstrate |
| Postgres in v1 | Overkill for 10k rows / one writer; SQLite with WAL + `connection_limit=1` is the deliberate choice |
| Mocked ORM in tests | Real SQLite per test file catches query and migration mistakes; suite stays under 30s with a small fixture |
| Client-side table sorting/filtering of 10k rows | Directory uses TanStack Table in full manual (server) mode |
| Pre-annualizing `amountBaseMinor` | Would double-count monthly employees in payroll; annualize only via `Money.annualize` / SQL `CASE` |
| Reconcile/drift-repair job | Denormalized current pay is written by exactly three functions; a repair script was cut, not deferred |
| Full SSO / RBAC | Out of scope; shared `DEMO_ACCESS_TOKEN` is a deployment gate only |
| E2E / browser tests | Low signal per runtime second for this project size |

## Prompts and artifacts

Representative prompts and instructions used during planning live under `docs/prompts/`.
Update this file when a later phase meaningfully changes how AI is used (e.g. seed generator,
analytics SQL).

## Rules for continuing with AI

1. Follow `docs/CURSOR_BUILD_PLAN.md` commit order — no UI before backend module tests pass.
2. Prefer small, reviewable commits over one large generated PR.
3. Never invent APIs or money semantics that contradict §5–§9 of the build plan.
4. Prefer failing tests first for domain rules (compensation invariants, annualize, percentiles).
