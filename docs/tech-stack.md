# Tech stack

Every choice below is what is actually in the repo today, with the reason it
was picked over the obvious alternative.

## Shape

Two independent npm packages in one repo — `backend/` and `frontend/` — each
with its own `package.json`, lockfile and `node_modules`. There is no root
`package.json` and no workspace tooling. Commands must be run from inside the
package you mean.

Not a monorepo toolchain (Nx/Turborepo/workspaces) because there are exactly
two deployables and nothing is shared as a package between them; the wiring
would cost more than it saves.

## Backend

| Choice | Why |
|---|---|
| **Express 5** | Small, boring, well understood. The API is REST plus two SSE endpoints; nothing here needs a framework with opinions. |
| **PostgreSQL + PostGIS** | Deduplication is "is there an open report of this category within N metres in the last M hours". That is a spatial query with a GiST index, not something to reimplement in JS. |
| **Prisma** | Typed client generated from one schema, plus a real migration history. Raw SQL is used deliberately where Prisma cannot express PostGIS (`ST_DWithin`, `ST_MakePoint`) — see `issues.repository.ts`. |
| **pg-boss** | Job queue that lives in the same Postgres. Adding Redis for a five-minute SLA sweep and an email dispatcher would be a second datastore to run and back up for no gain. |
| **Zod** | One schema per request shape, validated at the edge in `validate()` middleware, and the inferred type is what the handler receives. No drift between the runtime check and the TS type. |
| **jsonwebtoken** | Short-lived access token (15 m) plus a long refresh token (30 d). Stateless verification keeps SSE endpoints cheap. |
| **bcrypt** | Standard password hashing. Cost factor is dropped to 4 in tests only, so the suite is not dominated by hashing. |
| **Resend** | Transactional email with a usable free tier. `DEV_EMAIL_OVERRIDE` redirects all mail to one verified address outside production, because the seeded users are on a domain we do not own. |
| **Cloudinary** | Signed direct-from-browser uploads, so image bytes never transit the API, plus URL-based transforms used for delivery sizing. |
| **pino** | Structured JSON logs. Cheap enough to leave on. |

## Frontend

| Choice | Why |
|---|---|
| **React 18 + TypeScript** | Baseline. |
| **Vite 8 (rolldown) + SWC** | Sub-3-second production builds. Route chunks fall out of dynamic `import()` boundaries, which is what keeps recharts, Leaflet and pdf.js off the initial payload. |
| **No `manualChunks`** | Tried and reverted: hand-grouping vendors forced route-only libraries into eagerly fetched chunks. Per-dynamic-import splitting beat it. See `docs/performance.md`. |
| **React Router 6** | Plain client routing. Every route is lazily imported. |
| **Tailwind + shadcn/ui (Radix)** | Radix primitives are copied into `shared/components/ui`, so they are ordinary source files that tree-shake per route rather than one imported component library. |
| **Leaflet** | Open tiles, no API key, no per-load billing. Only loaded on the map and report routes. |
| **Recharts** | Only charting dependency. Deliberately behind a lazy boundary and an IntersectionObserver — it is ~103 KB gz, larger than the rest of the dashboard combined. |
| **pdfjs-dist** | Document locker only; its own chunk, never on the citizen path. |
| **vite-plugin-compression2** | Emits `.br` and `.gz` at build time so the host serves precompressed bytes instead of compressing per request. |
| **puppeteer-core** | Build-time prerender of the two public routes, using the Chrome already on the machine rather than downloading a second Chromium. |
| **Vitest + Testing Library** | Same transform pipeline as the app; no separate Babel/Jest config to keep in step. |

## Deliberate non-choices

- **No SSR framework (Next/Remix).** Ten of the twelve routes are behind auth
  and have no SEO value. Two public pages are prerendered at build time
  instead, which costs one script rather than a rendering runtime.
- **No global state library.** Server state is fetched per feature and shared
  through small module-level caches (`useAnalytics`, `issueVerificationService`).
  Redux/Zustand would add a layer without removing one.
- **No Redis.** See pg-boss.
- **No REST client generator.** `apiRequest` in `shared/lib/apiClient.ts` is
  ~50 lines and handles auth refresh; a generator would need the backend to
  publish an OpenAPI document it does not currently produce.

## Environment

Backend reads config through `src/config/env.ts`, a Zod schema that fails
loudly at boot rather than surfacing `undefined` later. `backend/.env.example`
is the canonical list.

Notable flags: `DISABLE_JOBS` (run the API without background workers),
`DEV_EMAIL_OVERRIDE` (redirect all outbound mail in non-production),
`SLA_GRACE_MINUTES` (default 15) and `SLA_DIGEST_THRESHOLD` (default 3).
