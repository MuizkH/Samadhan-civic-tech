import { prisma } from "./prisma.js";
import { Request } from "express";

export async function writeAuditLog(
  req: Request,
  entry: { action: string; entityType: string; entityId: string; before?: unknown; after?: unknown }
) {
  await prisma.auditLog.create({
    data: {
      actorId: req.audit.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: entry.before === undefined ? undefined : (entry.before as object),
      after: entry.after === undefined ? undefined : (entry.after as object),
      ipHash: req.audit.ipHash,
    },
  });
}
