import { RequestHandler } from "express";
import { createHash } from "crypto";
import { env } from "../../config/env.js";

/**
 * Attaches a request-scoped audit context (req.audit) before auth runs, so
 * every downstream handler/service can write audit_log rows without having
 * to re-derive actor/IP info. `authenticate` fills in actorId once the
 * token is verified.
 */
export const auditContext: RequestHandler = (req, _res, next) => {
  const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
  req.audit = {
    actorId: null,
    ipHash: createHash("sha256").update(`${ip}:${env.JWT_ACCESS_SECRET}`).digest("hex"),
  };
  next();
};
