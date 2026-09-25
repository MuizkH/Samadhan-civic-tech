import { RequestHandler } from "express";
import { AuthError, ForbiddenError } from "../errors/AppError.js";
import { AccessTokenClaims } from "../lib/jwt.js";

// ---------------------------------------------------------------------------
// Two-role access model
// ---------------------------------------------------------------------------
// Samadhan exposes exactly TWO user roles to the product:
//
//   Citizen       — the public. Can report issues, track own reports, verify
//                   resolutions, and support others' reports.
//
//   Administrator — municipal staff. Split into two SCOPES:
//                     • dept_admin  – departmental scope: one department + one city.
//                     • super_admin – city-wide scope: all departments + all cities.
//
// "dept_admin" and "super_admin" are implementation-level scope labels carried
// inside the JWT. They are NOT a third role — they are how the single
// Administrator role is partitioned by jurisdiction.
//
// Use `isAdministrator(role)` wherever the code only cares whether the actor
// is staff (either scope). Use `requireDepartmentAccess` to enforce the scope
// boundary, and `resolveCityScope` / `assertCityAccess` to enforce geography.
// ---------------------------------------------------------------------------

/**
 * Returns true for any Administrator-role actor (dept_admin OR super_admin).
 * Use this instead of an inline `role === 'dept_admin' || role === 'super_admin'`
 * check so scope changes stay in one place.
 */
export function isAdministrator(role: AccessTokenClaims["role"]): boolean {
  return role === "dept_admin" || role === "super_admin";
}

/** Restricts a route to the given roles. Must run after `authenticate`. */
export function requireRole(...roles: AccessTokenClaims["role"][]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) return next(new AuthError());
    if (!roles.includes(req.auth.role)) return next(new ForbiddenError(`Requires role: ${roles.join(", ")}`));
    next();
  };
}

/**
 * Restricts a department-scoped route: super_admin may access any
 * department, dept_admin only their own (matched against req.params[paramName]).
 */
export function requireDepartmentAccess(paramName = "departmentId"): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) return next(new AuthError());
    if (req.auth.role === "super_admin") return next();
    if (req.auth.role === "dept_admin" && req.auth.departmentId === req.params[paramName]) return next();
    next(new ForbiddenError("Not authorized for this department"));
  };
}

/**
 * The city a request is allowed to read, given who is asking.
 *
 * A department is only half of a staff account's jurisdiction — the other half
 * is geography. The roads admin for Bhopal has no business reading Indore's
 * roads backlog, but `requireDepartmentAccess` alone lets them, because both
 * cities share one `roads` department row.
 *
 * Returns `null` to mean "no city restriction". That applies to super_admin,
 * who is state-wide by design, and to citizens, who are scoped by authorship
 * rather than geography — a resident browsing the public civic map is meant to
 * see the whole state.
 *
 * For a dept_admin it returns their own city, and deliberately fails CLOSED:
 * an admin with no city assigned resolves to the sentinel `""`, which matches
 * no issue, so they get an empty queue rather than everything. Silently
 * widening to state-wide access on missing data is exactly the bug this
 * scoping exists to prevent. `/auth/me` returns the city so the client can
 * explain the empty state instead of looking broken.
 */
export function resolveCityScope(auth: AccessTokenClaims): string | null {
  if (auth.role !== "dept_admin") return null;
  return auth.city ?? "";
}

/**
 * Throws unless the actor's city scope covers `issueCity`. Use on every
 * per-record staff action so a write cannot reach a record the equivalent read
 * would have hidden.
 *
 * Note an issue whose city is null (reported outside every serviced
 * municipality) is unreachable by any dept_admin and needs a super_admin.
 */
export function assertCityAccess(auth: AccessTokenClaims, issueCity: string | null): void {
  const cityScope = resolveCityScope(auth);
  if (cityScope === null) return;
  if (issueCity !== cityScope) throw new ForbiddenError("This issue is outside your city.");
}
