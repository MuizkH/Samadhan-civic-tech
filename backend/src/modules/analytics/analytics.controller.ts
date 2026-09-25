import { Router } from "express";
import { z } from "zod";
import { analyticsService } from "./analytics.service.js";
import { validate } from "../../shared/middleware/validate.js";
import { optionalAuthenticate } from "../../shared/middleware/authenticate.js";
import { resolveCityScope } from "../../shared/middleware/rbac.js";
import { AccessTokenClaims } from "../../shared/lib/jwt.js";

export const analyticsRouter = Router();

// Analytics are aggregate counts over public civic data — no per-citizen
// rows are ever returned, so these stay readable without auth (the citizen
// dashboard renders them too).
//
// `optionalAuthenticate` does not gate access; it identifies staff. A
// dept_admin gets figures for their own city only, so the headline numbers on
// the admin dashboard agree with the work queue rendered beneath them —
// otherwise the page reads "142 open issues" above a list holding 61.

/** The city these figures should cover: the caller's own, or a chosen one. */
function analyticsCity(auth: AccessTokenClaims | undefined, requested?: string): string | null {
  const cityScope = auth ? resolveCityScope(auth) : null;
  // A dept_admin's scope wins over the query param, so `?city=` can never
  // widen their view; an unscoped caller may narrow voluntarily.
  return cityScope ?? requested ?? null;
}

const cityQuery = z.object({ city: z.string().max(120).optional() });

analyticsRouter.get(
  "/overview",
  optionalAuthenticate,
  validate(cityQuery, "query"),
  async (req, res, next) => {
    try {
      const { city } = req.validatedQuery as z.infer<typeof cityQuery>;
      res.json(await analyticsService.overview(analyticsCity(req.auth, city)));
    } catch (err) {
      next(err);
    }
  }
);

analyticsRouter.get(
  "/departments",
  optionalAuthenticate,
  validate(cityQuery, "query"),
  async (req, res, next) => {
    try {
      const { city } = req.validatedQuery as z.infer<typeof cityQuery>;
      res.json(await analyticsService.departments(analyticsCity(req.auth, city)));
    } catch (err) {
      next(err);
    }
  }
);

const hotspotsQuery = z.object({
  precision: z.coerce.number().min(0.001).max(1).optional(),
  minCount: z.coerce.number().int().min(1).max(100).optional(),
  city: z.string().max(120).optional(),
});

analyticsRouter.get(
  "/hotspots",
  optionalAuthenticate,
  validate(hotspotsQuery, "query"),
  async (req, res, next) => {
    try {
      const q = req.validatedQuery as z.infer<typeof hotspotsQuery>;
      res.json(await analyticsService.hotspots(q, analyticsCity(req.auth, q.city)));
    } catch (err) {
      next(err);
    }
  }
);

const trendsQuery = z.object({
  months: z.coerce.number().int().min(1).max(24).default(6),
  city: z.string().max(120).optional(),
});

analyticsRouter.get(
  "/trends",
  optionalAuthenticate,
  validate(trendsQuery, "query"),
  async (req, res, next) => {
    try {
      const { months, city } = req.validatedQuery as z.infer<typeof trendsQuery>;
      res.json(await analyticsService.trends(months, analyticsCity(req.auth, city)));
    } catch (err) {
      next(err);
    }
  }
);
