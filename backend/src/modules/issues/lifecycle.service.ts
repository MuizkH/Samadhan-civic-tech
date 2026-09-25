import { IssueStatus, Prisma } from "@prisma/client";
import { prisma } from "../../shared/lib/prisma.js";
import { eventBus } from "../../shared/lib/eventBus.js";
import { AppError, ForbiddenError, NotFoundError } from "../../shared/errors/AppError.js";
import { AccessTokenClaims } from "../../shared/lib/jwt.js";
import { assertCityAccess, isAdministrator } from "../../shared/middleware/rbac.js";
import {
  isTransitionAllowed,
  actorMayTransition,
  timestampFieldFor,
  ALLOWED_ISSUE_TRANSITIONS,
} from "./lifecycle.js";
import { notificationsService } from "../notifications/notifications.service.js";
import { enqueueAi } from "../../jobs/scheduler.js";

/** 422 — the request was well-formed but the state change isn't legal. */
class UnprocessableError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 422, "ILLEGAL_TRANSITION", details);
  }
}

/** Work order status mirrored from the issue's lifecycle state. */
const ISSUE_TO_WORK_ORDER_STATUS: Partial<
  Record<IssueStatus, "pending" | "acknowledged" | "in_progress" | "done" | "rejected">
> = {
  reported: "pending",
  reopened: "pending",
  acknowledged: "acknowledged",
  in_progress: "in_progress",
  resolved: "done",
  verified: "done",
  closed: "done",
  rejected: "rejected",
};

export interface TransitionInput {
  status: IssueStatus;
  reason?: string;
  resolutionNote?: string;
  /** Cloudinary URL + public id of the proof-of-resolution photo. */
  proofUrl?: string;
  proofPublicId?: string;
}

/**
 * The citizen who filed an issue only ever sees it change from the outside —
 * this is the one place that tells them. Staff-initiated moves notify the
 * reporter; a citizen-initiated reopen (disputing a resolution/rejection)
 * notifies the owning department instead.
 */
async function notifyOnTransition(
  issue: {
    id: string;
    publicRef: string;
    title: string;
    reportedBy: string;
    workOrders: { departmentId: string }[];
  },
  to: IssueStatus,
  reason: string | null,
  actor: AccessTokenClaims
) {
  const actorIsStaff = isAdministrator(actor.role);
  const actorIsReporter = actor.sub === issue.reportedBy;

  if (actorIsStaff && !actorIsReporter) {
    if (to === "resolved") {
      await notificationsService.enqueue({
        recipientId: issue.reportedBy,
        template: "issue.resolution_confirmation_request",
        payload: { issueId: issue.id, publicRef: issue.publicRef, issueTitle: issue.title },
      });
    } else if (to === "acknowledged" || to === "in_progress" || to === "rejected" || to === "closed") {
      await notificationsService.enqueue({
        recipientId: issue.reportedBy,
        template: "issue.status_changed",
        payload: { issueId: issue.id, publicRef: issue.publicRef, to, reason },
      });
    }
  } else if (!actorIsStaff && to === "reopened") {
    const admins = await prisma.user.findMany({
      where: { role: "dept_admin", departmentId: { in: issue.workOrders.map((wo) => wo.departmentId) } },
      select: { id: true },
    });
    await notificationsService.enqueueMany(
      admins.map((a) => a.id),
      "issue.status_changed",
      { issueId: issue.id, publicRef: issue.publicRef, to, reason, audience: "staff" }
    );
  }
}

export const lifecycleService = {
  async transition(issueId: string, input: TransitionInput, actor: AccessTokenClaims) {
    const issue = await prisma.issue.findUnique({
      where: { id: issueId },
      include: { workOrders: true, media: true },
    });
    if (!issue) throw new NotFoundError("Issue not found");

    const from = issue.status;
    const to = input.status;

    if (from === to) {
      throw new UnprocessableError(`Issue is already "${to}".`);
    }

    if (!isTransitionAllowed(from, to)) {
      throw new UnprocessableError(`Illegal transition "${from}" -> "${to}".`, {
        from,
        to,
        allowed: ALLOWED_ISSUE_TRANSITIONS[from],
      });
    }

    const isReporter = issue.reportedBy === actor.sub;
    const permission = actorMayTransition(to, actor.role, isReporter);
    if (!permission.allowed) throw new ForbiddenError(permission.reason);

    // A dept_admin may only act on issues routed to their own department AND
    // located in their own city — the department alone is shared across every
    // city it operates in, so it is not a jurisdiction by itself.
    if (actor.role === "dept_admin") {
      const ownsWorkOrder = issue.workOrders.some((wo) => wo.departmentId === actor.departmentId);
      if (!ownsWorkOrder) {
        throw new ForbiddenError("This issue is not routed to your department.");
      }
      assertCityAccess(actor, issue.city);
    }

    // Resolution evidence is mandatory (PS #5): a note explaining what was
    // done, and a photo proving it.
    if (to === "resolved") {
      if (!input.resolutionNote?.trim()) {
        throw new UnprocessableError("A resolution note is required when marking an issue resolved.");
      }
      const hasProof = !!input.proofUrl || issue.media.some((m) => m.kind === "resolution_proof");
      if (!hasProof) {
        throw new UnprocessableError(
          "A proof-of-resolution photo is required when marking an issue resolved."
        );
      }
    }

    const now = new Date();
    const data: Prisma.IssueUpdateInput = { status: to };

    const tsField = timestampFieldFor(to);
    if (tsField) (data as Record<string, unknown>)[tsField] = now;

    if (to === "resolved") {
      data.resolutionNote = input.resolutionNote!.trim();
      data.resolvedByUser = { connect: { id: actor.sub } };
    }
    if (to === "reopened") {
      data.reopenCount = { increment: 1 };
      // Clear stale resolution state so the next resolve must re-prove itself.
      data.resolvedAt = null;
      data.resolutionNote = null;
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (input.proofUrl) {
        await tx.issueMedia.create({
          data: {
            issueId,
            kind: "resolution_proof",
            url: input.proofUrl,
            publicId: input.proofPublicId ?? input.proofUrl,
            uploadedBy: actor.sub,
          },
        });
      }

      const result = await tx.issue.update({ where: { id: issueId }, data });

      await tx.issueStatusHistory.create({
        data: {
          issueId,
          fromStatus: from,
          toStatus: to,
          actorId: actor.sub,
          actorRole: actor.role,
          reason: input.reason ?? input.resolutionNote ?? null,
        },
      });

      // Keep department work orders in step with the issue's own state.
      const woStatus = ISSUE_TO_WORK_ORDER_STATUS[to];
      if (woStatus) {
        await tx.workOrder.updateMany({
          where: { issueId },
          data: {
            status: woStatus,
            completedAt: woStatus === "done" || woStatus === "rejected" ? now : null,
          },
        });
      }

      return result;
    });

    eventBus.emitIssueEvent({
      type: "issue.status_changed",
      issueId,
      departmentIds: issue.workOrders.map((wo) => wo.departmentId),
      city: issue.city,
      payload: { from, to, actorRole: actor.role, reason: input.reason ?? null },
      at: now.toISOString(),
    });

    await notifyOnTransition(issue, to, input.reason ?? null, actor);

    // Advisory only, and after the fact: the resolution is already recorded.
    if (to === "resolved") void enqueueAi({ type: "issue.resolved", issueId });

    return updated;
  },

  async history(issueId: string) {
    const exists = await prisma.issue.findUnique({ where: { id: issueId }, select: { id: true } });
    if (!exists) throw new NotFoundError("Issue not found");

    const rows = await prisma.issueStatusHistory.findMany({
      where: { issueId },
      orderBy: { createdAt: "asc" },
      include: { actor: { select: { id: true, fullName: true, role: true } } },
    });

    return rows.map((r) => ({
      id: r.id,
      fromStatus: r.fromStatus,
      toStatus: r.toStatus,
      reason: r.reason,
      actorRole: r.actorRole,
      actor: r.actor ? { id: r.actor.id, fullName: r.actor.fullName } : null,
      createdAt: r.createdAt,
    }));
  },
};
