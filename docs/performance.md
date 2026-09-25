# Performance

Phase 1.5 reported writing this file but never did, so there was no committed
baseline to regress against. This establishes one from measurement, not memory.

**How everything here was measured**

- Build: `npm run build` in `frontend/` (Vite 8, rolldown).
- Chunk sizes: Vite's own build report (gzip column) and
  `npx vite-bundle-visualizer`.
- Lighthouse: `npx lighthouse` v13.4.1, mobile form factor, simulated
  throttling, **4x CPU slowdown**, **Slow 4G** (150 ms RTT, 1638.4 Kbps),
  headless Chrome, against the **production build** served by `vite preview`.
- Waterfall / request counts: `performance.getEntriesByType('resource')` in the
  page itself, so the numbers are what the browser actually fetched.
- `/dashboard` is behind auth, so Lighthouse cannot score it directly. Its
  numbers below come from the in-page resource timing with a real citizen
  session (`citizen1@samadhan.gov.in`).

Sizes are **gzip over the wire** unless stated otherwise. `vite preview`
already gzips responses; it does **not** serve brotli.

---

## Phase 4.7 — Before

Measured 2026-08-13 against commit `bfafee4`.

### Budget

| Metric | Target | Landing `/` | Dashboard `/dashboard` |
|---|---|---|---|
| Initial JS (gz) | < 180 KB | **144 KB** ✅ | **287 KB** ❌ |
| Largest route chunk (gz) | < 150 KB | **119.6 KB** ✅ | same ✅ |
| Lighthouse Performance | ≥ 85 | **88** ✅ | not scorable (auth) |
| First Contentful Paint | < 2.5 s | **2.7 s** ❌ | not scorable (auth) |
| Time to Interactive | < 5 s | **3.0 s** ✅ | not scorable (auth) |
| Lighthouse SEO | ≥ 95 | **100** ✅ | n/a (noindex) |

`/transparency`: Performance **88**, SEO **100**, FCP **2.8 s**, TTI **3.0 s**.

### Largest chunks (gzip)

| Chunk | Raw | Gzip | Loaded on |
|---|---|---|---|
| `DashboardPage` | 450.8 KB | **119.6 KB** | `/dashboard` |
| `pdf` | 421.2 KB | 125.4 KB | Documents only (lazy) ✅ |
| `index` (entry) | 235.0 KB | **73.9 KB** | every route |
| `leaflet` | 148.8 KB | 43.4 KB | map / report only (lazy) ✅ |
| `react-dom` | 132.7 KB | 43.1 KB | every route |
| `types` | 56.4 KB | 12.9 KB | every route |
| `createLucideIcon` | 38.2 KB | 12.6 KB | every route |
| `index.css` | 76.0 KB | 13.3 KB | every route |

### What regressed, and why

Route-level lazy loading **mostly still holds**. Verified by grepping the built
chunks rather than the source:

- `leaflet` — **not** in the entry chunk. The two matches in `index.js` are
  preload manifest strings, not the library. ✅
- `pdfjs` — own chunk, Documents route only. ✅
- `recharts` — **83 references inside `DashboardPage`**. ❌

`DashboardPage.tsx` statically imports `AnalyticsPanel` (line 56), which imports
recharts. Two more Phase 3/4 surfaces are also static imports on the same page:
`ResolutionReviewPanel` (line 60) and `CoordinationPanel` (line 61) — the latter
is staff-only and lives inside a modal, so a citizen downloads it and never
sees it. That is what pushed the citizen dashboard's initial JS to 287 KB gz,
60% over budget.

### Request waterfall — `/dashboard`, first load, authenticated citizen

**43 API requests** before the page settles. Nearly all are cross-origin
(`:8080` → `:4000`), so each non-simple GET also pays a CORS `OPTIONS`
preflight — roughly **83 round trips** in total.

| Endpoint | Calls | Note |
|---|---|---|
| `/issues/:id/verification` | **20** | N+1 — one per issue card |
| `/analytics/overview` | **4** | same response fetched 4x |
| `/analytics/departments` | **4** | same response fetched 4x |
| `/analytics/hotspots` | **4** | same response fetched 4x |
| `/analytics/trends` | **4** | same response fetched 4x |
| `/issues` | 2 | duplicated |
| `/users/me/supports` | 2 | duplicated |
| `/auth/me` | 1 | |
| `/notifications/unread-count` | 1 | |
| `/users/me/stats` | 1 | |

Assets on the same load: 37 requests, 287 KB JS + 13 KB CSS.

`/` (landing, logged out): 14 JS requests, 144 KB JS, 13 KB CSS, **0 API calls**.

### Compression

| | Status |
|---|---|
| gzip | ✅ served by `vite preview` (`Content-Encoding: gzip`) |
| brotli | ❌ not served even when the client sends `Accept-Encoding: br` |
| precompressed artifacts at build | ❌ none emitted |

A `curl -I` (HEAD) shows no `Content-Encoding` and is misleading here — the
compression middleware only kicks in on GET. Always verify with a GET.

### Images — the brief's hypothesis did not survive measurement

The brief expected images to be the biggest 3G win. They are not, in this
dataset:

- **200 of 202** `issue_media` rows point at small local seed files
  (`/water.webp`, `/electricity.webp`, …). Only **2** are Cloudinary-hosted.
- Those local files are already WebP and small: 10.8 – 35.8 KB each, **125 KB
  for the entire `public/` folder**.
- The dashboard's first paint fetched **0** image bytes — cards render before
  any photo is requested.

So there is no 50 KB-per-thumbnail problem to fix in the seeded data. The
Cloudinary transformation helper is still worth adding, because real user
uploads *do* go to Cloudinary (`issueRepository.ts:163`) and today nothing
constrains their dimensions — but it is a correctness fix for production
uploads, not the measured win. The measured win is JS and round trips.

### Ranked by expected impact on Slow 4G (at time of measurement)

1. **Dashboard initial JS, 287 KB gz** — recharts on the citizen critical path.
2. **~83 round trips** — 20x N+1 plus 4x-duplicated analytics, each with a
   preflight. On 150 ms RTT this dominates wall-clock even though the payloads
   are small.
3. **No brotli** — ~15–20% off every text asset, free.
4. FCP 2.7 s on a route that fetches no data at all — entry chunk cost.

---

## Phase 4.7 — After

Same method, same machine. Lighthouse figures are the **median of 5 runs**
for `/` and 3 runs for `/transparency`.

### A note on measurement noise

Single Lighthouse runs on this machine are not trustworthy. With other Chrome
instances alive, the same build scored 60, 66, 71, 81 and 88 on the landing
page. With the machine idle the same build scores 89–90 across five
consecutive runs. **Every number below was taken with the machine idle.**

The "before" Lighthouse figures in the section above were single runs taken
while other processes were active, so they carry that uncertainty. The byte
counts and request counts do not — those are deterministic and are the
figures to trust for the before/after comparison.

### Budget

| Metric | Target | Before | After | Verdict |
|---|---|---|---|---|
| Initial JS, dashboard (gz) | < 180 KB | 287 KB | **151 KB** | ✅ pass |
| Initial JS, landing (gz) | < 180 KB | 144 KB | **~130 KB** (brotli) | ✅ pass |
| Largest route chunk (gz) | < 150 KB | 119.6 KB | **11.5 KB** | ✅ pass |
| Lighthouse Performance, `/` | ≥ 85 | 88 (noisy) | **90** (89–90, n=5) | ✅ pass |
| Lighthouse Performance, `/transparency` | ≥ 85 | 88 (noisy) | **88** (88–92, n=3) | ✅ pass |
| FCP, `/` | < 2.5 s | 2.7 s | **2.62 s** | ❌ miss (see below) |
| FCP, `/transparency` | < 2.5 s | 2.8 s | **2.33 s** | ✅ pass |
| TTI, `/` | < 5 s | 3.0 s | **2.70 s** | ✅ pass |
| TTI, `/transparency` | < 5 s | 3.0 s | **2.91 s** | ✅ pass |
| Lighthouse SEO, both | ≥ 95 | 100 | **100** | ✅ pass |

### Deterministic counts

| | Before | After |
|---|---|---|
| Dashboard initial JS (wire) | 287 KB | **151 KB** |
| Dashboard `DashboardPage` chunk (gz) | 119.6 KB | **11.5 KB** |
| recharts on dashboard load | yes | **no** |
| Dashboard API requests | 43 | **12** |
| Dashboard round trips (incl. preflights) | ~83 | **~24** |
| `/issues/:id/verification` calls | 20 | **1** (bulk) |
| Each analytics endpoint | 4x | **1x** |
| Entry chunk on the wire | 237 KB raw / 74 KB gzip | **63 KB brotli** |
| Precompressed artifacts | none | **68 `.br` + 69 `.gz`** |

### What changed

1. **recharts off the critical path.** `AnalyticsPanel` is lazy and gated
   behind an IntersectionObserver. The two chart-free cards moved to
   `PerformanceCards.tsx` so they no longer drag recharts in. The coordination,
   resolution-review and AI panels are lazy too — they only mount inside the
   issue modal.
2. **Round trips.** New `GET /issues/verifications?ids=` returns state for up
   to 100 issues from two grouped queries. `useAnalytics` shares one in-flight
   promise per window instead of fetching per mounting component.
3. **Brotli.** `.br`/`.gz` emitted at build; a preview middleware negotiates
   them ahead of Vite's gzip-only handler.
4. **Images.** `imageUrl`/`imageProps` helper with per-site Cloudinary presets
   plus intrinsic width/height and `loading="lazy"`.

### Largest single win

Getting recharts off the dashboard's critical path: the route chunk fell from
119.6 KB to 11.5 KB gz and initial JS from 287 KB to 176 KB gz before
compression even applied. Brotli then took it to 151 KB on the wire.

### Missed target

**FCP on `/` is 2.62 s against a 2.5 s target** — 120 ms over. The landing
page fetches no data; the cost is the entry chunk plus React on a 4x-throttled
CPU. Closing it means shrinking the shared entry (`index` 63 KB br +
`react-dom` 37 KB br), which is a bundle-level change beyond this phase's
scope. `/transparency` passes at 2.33 s.

### Deliberately not done

- **Hydration.** Prerender writes head-only HTML. The app mounts with
  `createRoot`, so shipping the rendered body cost a larger document for
  markup React immediately discards — measured at Lighthouse 88 → 68 on
  `/transparency`. Switching to `hydrateRoot` would need the app to be
  hydration-safe (it reads `localStorage` and `IntersectionObserver` during
  render) and was too large a change to make safely here.
- **Font subsetting.** No webfont is loaded; the UI uses system fonts. There
  is nothing to subset or preload.
- **Leaflet deferral.** Already correct — Leaflet is in its own chunk on the
  map and report routes only, never on the dashboard.
