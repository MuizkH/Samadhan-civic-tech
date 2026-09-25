import { RequestHandler } from "express";
import { verifyAccessToken } from "../lib/jwt.js";
import { AuthError } from "../errors/AppError.js";

/** Verifies the Bearer access token and attaches its claims to req.auth. */
export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(new AuthError("Missing bearer token"));
  }

  try {
    req.auth = verifyAccessToken(header.slice("Bearer ".length));
    req.audit.actorId = req.auth.sub;
    next();
  } catch {
    next(new AuthError("Invalid or expired token"));
  }
};

/**
 * Auth for SSE endpoints. The native EventSource API cannot set request
 * headers, so the access token is accepted from ?token= as well. Same
 * verification path, just a different carrier.
 */
export const authenticateSse: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  const raw = header?.startsWith("Bearer ")
    ? header.slice("Bearer ".length)
    : typeof req.query.token === "string"
      ? req.query.token
      : null;

  if (!raw) return next(new AuthError("Missing access token"));

  try {
    req.auth = verifyAccessToken(raw);
    req.audit.actorId = req.auth.sub;
    next();
  } catch {
    next(new AuthError("Invalid or expired token"));
  }
};

/** Attaches auth claims if present, but does not reject the request without one. */
export const optionalAuthenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      req.auth = verifyAccessToken(header.slice("Bearer ".length));
      req.audit.actorId = req.auth.sub;
    } catch {
      // Ignore invalid tokens on optional routes.
    }
  }
  next();
};
