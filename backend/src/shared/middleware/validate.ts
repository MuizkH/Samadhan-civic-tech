import { RequestHandler } from "express";
import { ZodSchema } from "zod";

type ValidateTarget = "body" | "query" | "params";

/**
 * Parses req[target] with the given Zod schema.
 *  - body/params are writable on the Express 5 Request, so they're
 *    replaced in place with the validated (and possibly coerced/defaulted) value.
 *  - query is a getter-only accessor in Express 5 that re-parses req.url on
 *    every read, so it can't be reassigned or usefully mutated. The
 *    validated result is stored on req.validatedQuery instead — read from
 *    there, not req.query, after this middleware runs.
 */
export function validate(schema: ZodSchema, target: ValidateTarget = "body"): RequestHandler {
  return (req, _res, next) => {
    const source = target === "query" ? req.query : req[target];
    const result = schema.safeParse(source);
    if (!result.success) {
      return next(result.error);
    }

    if (target === "query") {
      req.validatedQuery = result.data;
    } else {
      req[target] = result.data;
    }

    next();
  };
}
