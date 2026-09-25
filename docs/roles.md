# Samadhan - Role and Permission Model

## Two-Role System

Samadhan exposes exactly **two user roles** to the product:

| Product Role | JWT scope label | Who holds it |
|---|---|---|
| **Citizen** | `citizen` | Any registered member of the public |
| **Administrator** | `dept_admin` | Municipal staff scoped to one department + one city |
| **Administrator** | `super_admin` | Municipal staff with city-wide, all-department access |

`dept_admin` and `super_admin` are **scopes of the Administrator role**, not separate roles.
The scope boundary is enforced at the middleware layer (`requireDepartmentAccess`,
`resolveCityScope`, `assertCityAccess`) so individual handlers do not repeat it.

The `isAdministrator(role)` helper in
[rbac.ts](../backend/src/shared/middleware/rbac.ts) returns `true` for either
Administrator scope, and is used wherever the code only needs to tell staff from
the public.

---

## Scope Boundaries

| Scope | Department access | City access |
|---|---|---|
| `dept_admin` | Own department only | Own city only (from the JWT claim) |
| `super_admin` | All departments | All cities (state-wide) |

A `dept_admin` with no city assigned resolves to the sentinel `""`, which matches
no issue. They get an empty queue rather than inadvertent state-wide access -
fail-closed by design.

---

## Permissions Matrix

Legend: **Yes** = permitted, **No** = rejected with 403, **Public** = no
authentication required at all.

| Action | Citizen | dept_admin (Administrator) | super_admin (Administrator) |
|---|:---:|:---:|:---:|
| **Issues** | | | |
| Report a new issue | Yes | No | No |
| View own reported issues | Yes | Yes | Yes |
| Browse the public issue list / civic map | Public | Public | Public |
| View a single issue | Public | Yes (own city) | Yes |
| Transition issue status | No | Yes (own dept + city) | Yes |
| Reopen a resolved issue | Yes (own report) | Yes (own dept + city) | Yes |
| Resolve an issue (note + proof photo required) | No | Yes (own dept + city) | Yes |
| Support another citizen's issue | Yes | No | No |
| Vote on resolution verification | Yes | No | No |
| View issue status history | Public | Public | Public |
| **Work Orders** | | | |
| View a work order | No | Yes (own city) | Yes |
| Update work order status / assignee | No | Yes (own dept + city) | Yes |
| Add work order notes | No | Yes (own dept + city) | Yes |
| Create / delete dependencies | No | Yes (own dept + city) | Yes |
| Transfer a work order to another dept | No | Yes (own dept only) | Yes |
| Reassign a work order's department outright | No | No | Yes |
| **Departments** | | | |
| List active departments (directory) | Yes | Yes | Yes |
| List serviced cities | Yes | Yes (own city only) | Yes (all) |
| Read a department's work queue | No | Yes (own dept) | Yes |
| Subscribe to a department's SSE stream | No | Yes (own dept) | Yes |
| **Analytics** | | | |
| Overview / departments / hotspots / trends | Public | Public (own city) | Public (state-wide) |
| **AI features** | | | |
| Read AI availability status | Public | Public | Public |
| Request a category suggestion | Yes | Yes | Yes |
| Read an issue's coordination plan | Public | Public | Public |
| Apply / reject a coordination plan | No | Yes | Yes |
| View AI metrics and call stats | No | Yes | Yes |
| View the flagged-resolution review queue | No | No | Yes |
| Read recurring hotspots | Public | Public | Public |
| **Notifications** | | | |
| Read own notifications and preferences | Yes | Yes | Yes |
| **Public transparency** | | | |
| View the public scorecard | Public | Public | Public |
| **Uploads** | | | |
| Obtain a signed Cloudinary upload URL | Yes | Yes | Yes |

Rows marked **Public** are deliberately unauthenticated: they are the
transparency surface the problem statement asks for. They expose aggregate or
already-public issue data only, never personal details of a reporter.

Analytics endpoints use `optionalAuthenticate`: an anonymous caller sees
state-wide figures, and a signed-in `dept_admin` is silently narrowed to their
own city by `resolveCityScope`.

---

## Enforcement Points

| Middleware / helper | Where used | What it enforces |
|---|---|---|
| `authenticate` | All protected routes | A valid access token is required |
| `authenticateSse` | SSE streams | Same, but reads the token from the query string, since `EventSource` cannot set headers |
| `optionalAuthenticate` | Public routes that benefit from auth context | Token parsed if present, never required |
| `requireRole("dept_admin", "super_admin")` | Staff-only routes | Citizens rejected with 403 |
| `requireDepartmentAccess(paramName)` | Department-scoped routes | `dept_admin` can only reach their own department |
| `resolveCityScope(auth)` | List queries | Returns the `dept_admin`'s city, or `null` for no restriction |
| `assertCityAccess(auth, issueCity)` | Per-record write actions | A `dept_admin` cannot write to another city's records |
| `isAdministrator(role)` | Service-layer staff checks | True for either Administrator scope |
| `actorMayTransition(to, role, isReporter)` | Issue lifecycle | Which party may drive each specific status change |

Reads and writes are guarded symmetrically on purpose: `assertCityAccess` runs on
every per-record staff action, so a write can never reach a record the equivalent
read would have hidden.
