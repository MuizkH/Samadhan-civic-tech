# Roadmap

Status reflects what is in the repository, not what was planned. Reconstructed
from commit history and the current code.

| Phase | Scope | Status |
|---|---|---|
| 1 | Backend foundation — Express + Prisma + PostGIS, auth, citizen report vertical slice | ✅ Done |
| 1.5 | Bundle split, docs | ⚠️ Partly — split done, docs were never committed |
| 2 | Issue lifecycle, SSE, analytics, citizen verification | ✅ Done |
| 3 | Municipal coordination — work orders, dependencies, referrals, SLA | ✅ Done |
| 4 | Notifications — in-app, email, preferences | ✅ Done |
| 4.7 | Performance regression fix + public SEO | ✅ Done |
| 5 | AI assistance | 🚧 In progress (not by this workstream) |
| 6 | Not yet specified | ⬜ Not started |

## Phase 1 — Backend foundation ✅

Express 5 + Prisma + PostgreSQL/PostGIS. JWT auth with refresh. Citizen report
pipeline: category resolution, PostGIS dedup inside a per-category radius and
time window, data-driven routing to departments via
`category_department_rules`, work order creation with SLA deadlines, and an
initial status-history row — all in one transaction.

## Phase 1.5 — Bundle split and docs ⚠️

The bundle work happened (`df2d0fe`, "fix eager-load bundle bloat") and holds:
per-dynamic-import splitting, no `manualChunks`.

The docs did not. `docs/performance.md` was reported as written but is absent
from history. Root cause found in Phase 4.7: `.gitignore` ignored `**/*.md`
with an allowlist that did not include `docs/`, so anything written there was
silently dropped from every commit. Fixed, and the three files backfilled.

## Phase 2 — Lifecycle, SSE, analytics, verification ✅

Full issue state machine (`reported → acknowledged → in_progress → resolved →
verified/reopened → closed/rejected`) with role gating and 422s on illegal
transitions. Resolution requires a note and a proof photo. Live SSE streams,
server-side analytics aggregates, and citizen verification voting.

## Phase 3 — Municipal coordination ✅

Multi-department work orders with dependencies and blocking, inter-department
referrals with approval, a five-minute SLA sweep with an escalation chain, and
the public transparency scorecard.

## Phase 4 — Notifications ✅

In-app feed with a bell, email delivery via Resend, per-user channel and
category preferences honoured before anything is queued.

Fixed during and after the phase: citizen lifecycle notifications were never
wired (the state machine only emitted SSE); citizen-facing copy leaked enum
values and "work order"; the bell had no click-through and overflowed on
mobile; the profile preference toggles wrote to a localStorage mock rather
than the real API; SLA alerts were unreadable and arrived one-per-work-order.

Known gap: SMS, scheme alerts, document reminders and the weekly digest exist
as UI toggles with no backend channel behind them. The schema supports
`in_app` and `email` only.

## Phase 4.7 — Performance and SEO ✅

Established the missing baseline by measurement, then fixed what it showed:
recharts on the citizen critical path, a 20x N+1 plus 4x-duplicated analytics
calls, and no brotli. Prerendered the two public routes and gave them real
metadata. Numbers in `docs/performance.md`.

## Phase 5 — AI 🚧

Gemini and Groq integrations are being added on a separate track
(`c818349`, `aa7f441`). Out of scope for this workstream and untouched by it.

## Phase 6 — Unspecified ⬜

No scope defined yet.

## Carried debt

- Dev/test databases were created without the `gen_random_uuid()` column
  defaults the migrations declare; restoring them was needed to get the test
  suite green. Test databases should be provisioned with `prisma migrate
  deploy`, never a schema push.
- `CORS_ORIGIN` accepts a single origin, which is why the build-time prerender
  cannot reach the API and captures the transparency page pre-data.
- Frontend demo credentials (`@samadhan.gov`) issue a fake token the real
  backend rejects; only seeded `@samadhan.gov.in` accounts exercise the real
  API.
