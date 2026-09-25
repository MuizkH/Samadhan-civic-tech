import { IssueStatus, Prisma, WorkOrderStatus } from "@prisma/client";
import { prisma } from "../../shared/lib/prisma.js";
import { eventBus } from "../../shared/lib/eventBus.js";
import { AppError, ForbiddenError, NotFoundError, ValidationError } from "../../shared/errors/AppError.js";
import { assertCityAccess } from "../../shared/middleware/rbac.js";
import { AccessTokenClaims } from "../../shared/lib/jwt.js";
import { notificationsService } from "../notifications/notifications.service.js";
import { slaService } from "../sla/sla.service.js";

/** 422 — well-formed request, but the coordination rules forbid it. */
export class UnprocessableError extends AppError {
  constructor(message: string, code = "UNPROCESSABLE", details?: unknown) {
    super(message, 422, code, details);
  }
}

/** Per-work-order state machine, independent of the parent issue's. */
const ALLOWED_WO_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  pending: ["acknowledged", "rejected"],
  acknowledged: ["in_progress", "rejected"],
  in_progress: ["done", "rejected"],
  done: [],
  rejected: [],
};

/**
 * Derives the parent issue's status from its work orders.
 *
 * The primary work order drives the headline state, but an issue is only
 * resolvable once *every* work order has closed out — that is the whole
 * point of multi-department coordination: Roads cannot declare a street
 * fixed while Water still has an open pipe repair on the same issue.
 */
export function deriveIssueStatus(
  workOrders: { role: string; status: WorkOrderStatus }[],
  current: IssueStatus
): IssueStatus | null {
  if (workOrders.length === 0) return null;
  // Citizen-owned terminal states are never overwritten by department activity.
  if (current === "verified" || current === "closed" || current === "reopened") return null;

  const actionable = workOrders.filter((wo) => wo.role !== "notify");
  const pool = actionable.length > 0 ? actionable : workOrders;

  const allSettled = pool.every((wo) => wo.status === "done" || wo.status === "rejected");
  if (allSettled) {
    // Every department rejected it — the issue itself is rejected.
    return pool.every((wo) => wo.status === "rejected") ? "rejected" : "resolved";
  }

  if (pool.some((wo) => wo.status === "in_progress")) return "in_progress";
  if (pool.some((wo) => wo.status === "acknowledged")) return "acknowledged";
  return "reported";
}

/** Blockers preventing a work order from starting, per its dependencies. */
async function findBlockers(workOrderId: string) {
  const deps = await prisma.workOrderDependency.findMany({
    where: { successorId: workOrderId },
    include: {
      predecessor: {
        select: {
          id: true,
          status: true,
          role: true,
          department: { select: { code: true, nameEn: true } },
          issue: { select: { publicRef: true } },
        },
      },
    },
  });

  return deps.filter((dep) => {
    const p = dep.predecessor;
    // finish_to_start: predecessor must be closed out.
    if (dep.type === "finish_to_start") return p.status !== "done" && p.status !== "rejected";
    // start_to_start: predecessor must at least have started.
    return p.status === "pending" || p.status === "acknowledged";
  });
}

export const workOrdersService = {
  async getById(workOrderId: string, actor?: AccessTokenClaims) {
    const wo = await prisma.workOrder.findUnique({
      where: { id: workOrderId },
      include: {
        department: { select: { id: true, code: true, nameEn: true } },
        assignee: { select: { id: true, fullName: true } },
        issue: {
          select: { id: true, publicRef: true, title: true, status: true, categoryId: true, city: true },
        },
        slaPolicy: true,
      },
    });
    if (!wo) throw new NotFoundError("Work order not found");
    // Looked up by id with no department filter at all, so the city gate is
    // the only thing standing between a dept_admin and another jurisdiction's
    // assignee names and SLA policy.
    if (actor) assertCityAccess(actor, wo.issue.city);
    return wo;
  },

  /**
   * Full coordination view for an issue: work orders, dependencies, blockers.
   *
   * `actor` is optional because the citizen-facing issue detail renders this
   * too; when present the city gate applies.
   */
  async listForIssue(issueId: string, actor?: AccessTokenClaims) {
    if (actor) {
      const issue = await prisma.issue.findUnique({ where: { id: issueId }, select: { city: true } });
      if (!issue) throw new NotFoundError("Issue not found");
      assertCityAccess(actor, issue.city);
    }

    const workOrders = await prisma.workOrder.findMany({
      where: { issueId },
      orderBy: [{ sequence: "asc" }, { createdAt: "asc" }],
      include: {
        department: { select: { id: true, code: true, nameEn: true, nameHi: true } },
        assignee: { select: { id: true, fullName: true } },
        dependsOn: {
          include: {
            predecessor: {
              select: {
                id: true,
                status: true,
                department: { select: { code: true, nameEn: true } },
              },
            },
          },
        },
      },
    });

    const now = Date.now();
    return workOrders.map((wo) => {
      const blockers = wo.dependsOn.filter((dep) =>
        dep.type === "finish_to_start"
          ? dep.predecessor.status !== "done" && dep.predecessor.status !== "rejected"
          : dep.predecessor.status === "pending" || dep.predecessor.status === "acknowledged"
      );

      return {
        id: wo.id,
        role: wo.role,
        status: wo.status,
        priority: wo.priority,
        sequence: wo.sequence,
        department: wo.department,
        assignee: wo.assignee,
        createdAt: wo.createdAt,
        acknowledgedAt: wo.acknowledgedAt,
        startedAt: wo.startedAt,
        completedAt: wo.completedAt,
        ackDueAt: wo.ackDueAt,
        dueAt: wo.dueAt,
        breachedAt: wo.breachedAt,
        escalationLevel: wo.escalationLevel,
        isOverdue: !!wo.dueAt && slaService.isOpen(wo) && wo.dueAt.getTime() < now,
        isBlocked: blockers.length > 0,
        dependsOn: wo.dependsOn.map((dep) => ({
          id: dep.id,
          type: dep.type,
          satisfied: !blockers.some((b) => b.id === dep.id),
          predecessor: {
            id: dep.predecessor.id,
            status: dep.predecessor.status,
            department: dep.predecessor.department,
          },
        })),
      };
    });
  },

  /** Recomputes and persists the parent issue's status from its work orders. */
  async syncIssueStatus(tx: Prisma.TransactionClient, issueId: string, actor: AccessTokenClaims) {
    const issue = await tx.issue.findUnique({
      where: { id: issueId },
      select: { id: true, status: true, workOrders: { select: { role: true, status: true } } },
    });
    if (!issue) return;

    const derived = deriveIssueStatus(issue.workOrders, issue.status);
    if (!derived || derived === issue.status) return;

    const now = new Date();
    await tx.issue.update({
      where: { id: issueId },
      data: {
        status: derived,
        acknowledgedAt: derived === "acknowledged" ? now : undefined,
        // resolved_at is only stamped by the lifecycle endpoint, which also
        // enforces the note + proof requirement. Deriving "resolved" here
        // means every department finished; a human still has to file the
        // evidence before the citizen sees it as resolved.
      },
    });

    await tx.issueStatusHistory.create({
      data: {
        issueId,
        fromStatus: issue.status,
        toStatus: derived,
        actorId: actor.sub,
        actorRole: actor.role,
        reason: "Derived from work order progress",
      },
    });
  },

  /**
   * Moves a single work order through its own state machine. Dependencies
   * are enforced here: a blocked work order cannot start.
   */
  async updateStatus(
    workOrderId: string,
    input: { status: WorkOrderStatus; note?: string },
    actor: AccessTokenClaims
  ) {
    const wo = await prisma.workOrder.findUnique({
      where: { id: workOrderId },
      include: { issue: { select: { id: true, publicRef: true, title: true, city: true } } },
    });
    if (!wo) throw new NotFoundError("Work order not found");

    if (actor.role === "dept_admin" && actor.departmentId !== wo.departmentId) {
      throw new ForbiddenError("This work order belongs to another department.");
    }
    assertCityAccess(actor, wo.issue.city);

    const allowed = ALLOWED_WO_TRANSITIONS[wo.status];
    if (!allowed.includes(input.status)) {
      throw new UnprocessableError(
        `Illegal work order transition "${wo.status}" -> "${input.status}".`,
        "ILLEGAL_TRANSITION",
        { from: wo.status, to: input.status, allowed }
      );
    }

    // Dependency gate — only when work is actually starting.
    if (input.status === "in_progress") {
      const blockers = await findBlockers(workOrderId);
      if (blockers.length > 0) {
        const names = blockers
          .map((b) => `${b.predecessor.department.nameEn} (${b.predecessor.status})`)
          .join(", ");
        throw new UnprocessableError(
          `Blocked: this work order cannot start until ${names} ${blockers.length === 1 ? "completes" : "complete"}.`,
          "DEPENDENCY_BLOCKED",
          {
            blockers: blockers.map((b) => ({
              workOrderId: b.predecessorId,
              type: b.type,
              department: b.predecessor.department.nameEn,
              status: b.predecessor.status,
            })),
          }
        );
      }
    }

    const now = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.workOrder.update({
        where: { id: workOrderId },
        data: {
          status: input.status,
          acknowledgedAt: input.status === "acknowledged" ? now : undefined,
          startedAt: input.status === "in_progress" ? now : undefined,
          completedAt: input.status === "done" || input.status === "rejected" ? now : undefined,
        },
      });

      if (input.note?.trim()) {
        await tx.workOrderNote.create({
          data: {
            workOrderId,
            authorId: actor.sub,
            body: input.note.trim(),
            visibility: "internal",
          },
        });
      }

      await this.syncIssueStatus(tx, wo.issueId, actor);
      return result;
    });

    eventBus.emitIssueEvent({
      type: "issue.status_changed",
      issueId: wo.issueId,
      departmentIds: [wo.departmentId],
      city: wo.issue.city,
      payload: { workOrderId, from: wo.status, to: input.status },
      at: now.toISOString(),
    });

    if (wo.assigneeId && wo.assigneeId !== actor.sub) {
      await notificationsService.enqueue({
        recipientId: wo.assigneeId,
        template: "work_order.status_changed",
        payload: {
          workOrderId,
          issueId: wo.issueId,
          publicRef: wo.issue.publicRef,
          from: wo.status,
          to: input.status,
        },
      });
    }

    // Anything newly unblocked is worth telling the waiting department about.
    if (input.status === "done" || input.status === "rejected") {
      await this.notifyUnblocked(workOrderId, wo.issue.publicRef, wo.issueId);
    }

    return updated;
  },

  /** Tells successors' departments that their blocker just cleared. */
  async notifyUnblocked(predecessorId: string, publicRef: string, issueId: string) {
    const successors = await prisma.workOrderDependency.findMany({
      where: { predecessorId },
      include: { successor: { select: { id: true, assigneeId: true, departmentId: true } } },
    });

    for (const dep of successors) {
      const stillBlocked = await findBlockers(dep.successorId);
      if (stillBlocked.length > 0) continue;

      const recipients: string[] = [];
      if (dep.successor.assigneeId) recipients.push(dep.successor.assigneeId);
      else {
        const admins = await prisma.user.findMany({
          where: { departmentId: dep.successor.departmentId, role: "dept_admin" },
          select: { id: true },
        });
        recipients.push(...admins.map((a) => a.id));
      }

      await notificationsService.enqueueMany(recipients, "work_order.status_changed", {
        workOrderId: dep.successorId,
        issueId,
        publicRef,
        from: "blocked",
        to: "ready to start",
      });
    }
  },

  /** Reassigns a work order to a department, and optionally to a person. */
  async assign(
    workOrderId: string,
    input: { departmentId?: string; assigneeId?: string | null },
    actor: AccessTokenClaims
  ) {
    const wo = await prisma.workOrder.findUnique({
      where: { id: workOrderId },
      include: {
        issue: { select: { id: true, publicRef: true, title: true, categoryId: true, city: true } },
      },
    });
    if (!wo) throw new NotFoundError("Work order not found");

    if (actor.role === "dept_admin" && actor.departmentId !== wo.departmentId) {
      throw new ForbiddenError("This work order belongs to another department.");
    }
    assertCityAccess(actor, wo.issue.city);
    // Moving work to a different department is a referral, and referrals
    // need the receiving department's consent — see requestTransfer.
    if (input.departmentId && input.departmentId !== wo.departmentId && actor.role !== "super_admin") {
      throw new ForbiddenError(
        "Only a super admin can reassign departments directly. Raise a transfer request instead."
      );
    }

    if (input.assigneeId) {
      const targetDept = input.departmentId ?? wo.departmentId;
      const assignee = await prisma.user.findUnique({ where: { id: input.assigneeId } });
      if (!assignee) throw new ValidationError("Assignee not found");
      if (assignee.departmentId !== targetDept) {
        throw new ValidationError("Assignee must belong to the work order's department.");
      }
    }

    const updated = await prisma.workOrder.update({
      where: { id: workOrderId },
      data: {
        departmentId: input.departmentId ?? undefined,
        assigneeId: input.assigneeId === undefined ? undefined : input.assigneeId,
      },
    });

    if (input.assigneeId) {
      await notificationsService.enqueue({
        recipientId: input.assigneeId,
        template: "work_order.assigned",
        payload: {
          workOrderId,
          issueId: wo.issueId,
          publicRef: wo.issue.publicRef,
          issueTitle: wo.issue.title,
        },
      });
    }

    return updated;
  },
};
