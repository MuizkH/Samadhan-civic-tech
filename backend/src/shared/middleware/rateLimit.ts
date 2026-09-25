import { RequestHandler } from "express";
import { AppError } from "../errors/AppError.js";

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Minimal in-memory fixed-window rate limiter, keyed by IP. Good enough for
 * a single-process deployment; a multi-instance deployment would need a
 * shared store (deliberately not Redis per the stack constraints — revisit
 * if this backend is ever horizontally scaled).
 */
export function rateLimit(opts: { windowMs: number; max: number }): RequestHandler {
  const buckets = new Map<string, Bucket>();

  return (req, res, next) => {
    const key = req.ip ?? "unknown";
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
      return next();
    }

    if (bucket.count >= opts.max) {
      const retryAfterSec = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfterSec));
      return next(new AppError("Too many requests", 429, "RATE_LIMITED"));
    }

    bucket.count++;
    next();
  };
}
