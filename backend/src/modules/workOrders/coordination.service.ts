import { DependencyType, NoteVisibility } from "@prisma/client";
import { prisma } from "../../shared/lib/prisma.js";
import { ForbiddenError, NotFoundError } from "../../shared/errors/AppError.js";
import { AccessTokenClaims } from "../../shared/lib/jwt.js";
import { assertCityAccess } from "../../shared/middleware/rbac.js";
import { notificationsService } from "../notifications/notifications.service.js";
import { UnprocessableError } from "./workOrders.service.js";

/**
 * Walks the dependency graph forward from `startId` to see whether `targetId`
 * is reachable. Adding predecessor -> successor is only safe when the
 * successor cannot already reach the predecessor, otherwise the two work
 * orders would deadlock each other forever.
 */
async function reaches(startId: string, targetId: string): Promise<boolean> {
  const seen = new Set<string>();
  let frontier = [startId];

  while (frontier.length > 0) {
    const edges = await prisma.workOrderDependency.findMany({
      where: { predecessorId: { in: frontier } },
      select: { successorId: true },
    });

    const next: string[] = [];
    for (const edge of edges) {
      if (edge.successorId === targetId) return true;
      if (!seen.has(edge.successorId)) {
        seen.add(edge.successorId);
        next.push(edge.successorId);
      }
    }
    frontier = next;
  }
  return false;
}

export const coordinationService = {
  // ── Dependencies ────────────────────────────────────────────────────────

  async addDependency(
    input: { predecessorId: string; successorId: string; type: DependencyType },
    actor: AccessTokenClaims
  ) {
    if (input.predecessorId === input.successorId) {
      throw new UnprocessableError("A work order cannot depend on itself.", "INVALID_DEPENDENCY");
    }

    const [predecessor, successor] = await Promise.all([
      prisma.workOrder.findUnique({
        where: { id: input.predecessorId },
        include: { department: { select: { nameEn: true } }, issue: { select: { city: true } } },
      }),
      prisma.workOrder.findUnique({
        where: { id: input.successorId },
        include: { department: { select: { nameEn: true } }, issue: { select: { city: true } } },
      }),
    ]);
    if (!predecessor || !successor) throw new NotFoundError("Work order not found");

    // Both ends, before the cycle guard: its 422 message names the other
    // departments, so an out-of-city admin could otherwise probe the graph
    // through error text alone.
    assertCityAccess(actor, successor.issue.city);
    assertCityAccess(actor, predecessor.issue.city);

    // Dependencies only make sense between work orders on the same issue.
    if (predecessor.issueId !== successor.issueId) {
      throw new UnprocessableError(
        "Work orders must belong to the same issue to be linked.",
        "INVALID_DEPENDENCY"
      );
    }

    if (actor.role === "dept_admin" && actor.departmentId !== successor.departmentId) {
      throw new ForbiddenError("Only the waiting department can declare what blocks it.");
    }

    // Cycle guard: would the new predecessor already be downstream of the successor?
    if (await reaches(input.successorId, input.predecessorId)) {
      throw new UnprocessableError(
        `Adding this dependency would create a cycle: ${successor.department.nameEn} already blocks ${predecessor.department.nameEn}.`,
        "DEPENDENCY_CYCLE"
      );
    }

    return prisma.workOrderDependency.upsert({
      where: {
        predecessorId_successorId: {
          predecessorId: input.predecessorId,
          successorId: input.successorId,
        },
      },
      update: { type: input.type },
      create: { ...input, createdById: actor.sub },
    });
  },

  async removeDependency(dependencyId: string, actor: AccessTokenClaims) {
    const dep = await prisma.workOrderDependency.findUnique({
      where: { id: dependencyId },
      include: { successor: { select: { departmentId: true, issue: { select: { city: true } } } } },
    });
    if (!dep) throw new NotFoundError("Dependency not found");
    if (actor.role === "dept_admin" && actor.departmentId !== dep.successor.departmentId) {
      throw new ForbiddenError("Only the waiting department can remove its own blocker.");
    }
    assertCityAccess(actor, dep.successor.issue.city);
    await prisma.workOrderDependency.delete({ where: { id: dependencyId } });
  },

  // ── Notes ───────────────────────────────────────────────────────────────

  async addNote(
    workOrderId: string,
    input: { body: string; visibility: NoteVisibility },
    actor: AccessTokenClaims
  ) {
    const wo = await prisma.workOrder.findUnique({
      where: { id: workOrderId },
      include: { issue: { select: { id: true, publicRef: true, reportedBy: true, city: true } } },
    });
    if (!wo) throw new NotFoundError("Work order not found");

    // Any department involved in the issue may comment; that is the point of
    // an inter-departmental thread. Involvement is not enough on its own
    // though — the same department serves several cities, so without the city
    // check a Bhopal admin could post a citizen-visible note (which notifies
    // the reporter) on an Indore issue.
    if (actor.role === "dept_admin") {
      const involved = await prisma.workOrder.count({
        where: { issueId: wo.issueId, departmentId: actor.departmentId! },
      });
      if (involved === 0) throw new ForbiddenError("Your department is not involved in this issue.");
    }
    assertCityAccess(actor, wo.issue.city);

    const note = await prisma.workOrderNote.create({
      data: {
        workOrderId,
        authorId: actor.sub,
        body: input.body.trim(),
        visibility: input.visibility,
      },
      include: { author: { select: { id: true, fullName: true, role: true } } },
    });

    // inter_dept notes ping the other departments on the issue; citizen
    // notes ping the reporter. Internal notes stay silent.
    if (input.visibility === "inter_dept") {
      const others = await prisma.workOrder.findMany({
        where: { issueId: wo.issueId, NOT: { departmentId: actor.departmentId ?? undefined } },
        select: { departmentId: true, assigneeId: true },
      });
      const recipients: string[] = others.map((o) => o.assigneeId).filter((x): x is string => !!x);
      const admins = await prisma.user.findMany({
        where: {
          departmentId: { in: others.map((o) => o.departmentId) },
          role: "dept_admin",
          // Only the admins posted to this issue's city. Otherwise every
          // same-department admin state-wide is notified, and the payload
          // carries the issue's publicRef into other jurisdictions' bells.
          city: wo.issue.city,
        },
        select: { id: true },
      });
      recipients.push(...admins.map((a) => a.id));
      await notificationsService.enqueueMany(
        recipients.filter((r) => r !== actor.sub),
        "work_order.note_added",
        { workOrderId, issueId: wo.issueId, publicRef: wo.issue.publicRef, authorName: note.author.fullName }
      );
    } else if (input.visibility === "citizen") {
      await notificationsService.enqueue({
        recipientId: wo.issue.reportedBy,
        template: "work_order.note_added",
        payload: {
          workOrderId,
          issueId: wo.issueId,
          publicRef: wo.issue.publicRef,
          authorName: note.author.fullName,
          audience: "citizen",
          note: note.body,
        },
      });
    }

    return note;
  },

  /**
   * Notes visible to the caller. Citizens only ever see `citizen` notes;
   * `internal` notes stay within the authoring department.
   */
  async listNotes(workOrderId: string, actor?: AccessTokenClaims) {
    const wo = await prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: { departmentId: true, issue: { select: { city: true } } },
    });
    if (!wo) throw new NotFoundError("Work order not found");

    // Matching on departmentId alone would hand a dept_admin the `internal`
    // thread of the same department in another city.
    if (actor) assertCityAccess(actor, wo.issue.city);

    const visibilities: NoteVisibility[] =
      !actor || actor.role === "citizen"
        ? ["citizen"]
        : actor.role === "super_admin" || actor.departmentId === wo.departmentId
          ? ["internal", "inter_dept", "citizen"]
          : ["inter_dept", "citizen"];

    const notes = await prisma.workOrderNote.findMany({
      where: { workOrderId, visibility: { in: visibilities } },
      orderBy: { createdAt: "asc" },
      include: { author: { select: { id: true, fullName: true, role: true } } },
    });

    return notes.map((n) => ({
      id: n.id,
      body: n.body,
      visibility: n.visibility,
      author: n.author,
      createdAt: n.createdAt,
    }));
  },

  // ── Transfers (referral with approval) ──────────────────────────────────

  async requestTransfer(
    workOrderId: string,
    input: { toDepartmentId: string; reason: string },
    actor: AccessTokenClaims
  ) {
    const wo = await prisma.workOrder.findUnique({
      where: { id: workOrderId },
      include: {
        issue: { select: { id: true, publicRef: true, city: true } },
        department: { select: { nameEn: true } },
      },
    });
    if (!wo) throw new NotFoundError("Work order not found");

    if (actor.role === "dept_admin" && actor.departmentId !== wo.departmentId) {
      throw new ForbiddenError("Only the owning department can refer this work order.");
    }
    assertCityAccess(actor, wo.issue.city);
    if (input.toDepartmentId === wo.departmentId) {
      throw new UnprocessableError(
        "A work order cannot be referred to its own department.",
        "INVALID_TRANSFER"
      );
    }

    const pending = await prisma.workOrderTransfer.findFirst({
      where: { workOrderId, status: "requested" },
    });
    if (pending) {
      throw new UnprocessableError(
        "A referral for this work order is already awaiting a decision.",
        "TRANSFER_PENDING"
      );
    }

    const transfer = await prisma.workOrderTransfer.create({
      data: {
        workOrderId,
        fromDepartmentId: wo.departmentId,
        toDepartmentId: input.toDepartmentId,
        reason: input.reason.trim(),
        requestedById: actor.sub,
      },
    });

    // The receiving department's admins in THIS city — a referral is a local
    // handover, so admins of the same department elsewhere are not parties to
    // it and must not receive the issue reference.
    const receivers = await prisma.user.findMany({
      where: { departmentId: input.toDepartmentId, role: "dept_admin", city: wo.issue.city },
      select: { id: true },
    });
    await notificationsService.enqueueMany(
      receivers.map((r) => r.id),
      "work_order.transfer_requested",
      {
        transferId: transfer.id,
        workOrderId,
        issueId: wo.issueId,
        publicRef: wo.issue.publicRef,
        fromDepartment: wo.department.nameEn,
        reason: transfer.reason,
      }
    );

    return transfer;
  },

  /** The receiving department accepts or refuses the referral. */
  async decideTransfer(
    transferId: string,
    input: { decision: "approved" | "rejected"; decisionNote?: string },
    actor: AccessTokenClaims
  ) {
    const transfer = await prisma.workOrderTransfer.findUnique({
      where: { id: transferId },
      include: {
        workOrder: { include: { issue: { select: { id: true, publicRef: true, city: true } } } },
        toDepartment: { select: { nameEn: true } },
      },
    });
    if (!transfer) throw new NotFoundError("Transfer not found");
    if (transfer.status !== "requested") {
      throw new UnprocessableError(`This referral was already ${transfer.status}.`, "TRANSFER_DECIDED");
    }
    // Only the receiving department (or a super admin) may accept work.
    if (actor.role === "dept_admin" && actor.departmentId !== transfer.toDepartmentId) {
      throw new ForbiddenError("Only the receiving department can decide this referral.");
    }
    assertCityAccess(actor, transfer.workOrder.issue.city);

    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.workOrderTransfer.update({
        where: { id: transferId },
        data: {
          status: input.decision,
          approvedById: actor.sub,
          decisionNote: input.decisionNote?.trim() ?? null,
          decidedAt: now,
        },
      });

      if (input.decision === "approved") {
        // Ownership moves; the assignee does not come with it.
        await tx.workOrder.update({
          where: { id: transfer.workOrderId },
          data: { departmentId: transfer.toDepartmentId, assigneeId: null },
        });
      }

      await tx.issueStatusHistory.create({
        data: {
          issueId: transfer.workOrder.issueId,
          workOrderId: transfer.workOrderId,
          fromStatus: transfer.workOrder.status,
          toStatus: transfer.workOrder.status,
          actorId: actor.sub,
          actorRole: actor.role,
          reason: `Referral ${input.decision}: ${transfer.reason}`,
        },
      });

      return updated;
    });

    await notificationsService.enqueue({
      recipientId: transfer.requestedById,
      template: "work_order.transfer_decided",
      payload: {
        transferId,
        workOrderId: transfer.workOrderId,
        issueId: transfer.workOrder.issueId,
        publicRef: transfer.workOrder.issue.publicRef,
        decision: input.decision,
        toDepartment: transfer.toDepartment.nameEn,
      },
    });

    return result;
  },

  /**
   * Referral history for a work order. Reveals referral reasons, decision
   * notes and the names of the staff involved, so it takes the same city gate
   * as the work order itself.
   */
  async listTransfers(workOrderId: string, actor?: AccessTokenClaims) {
    if (actor) {
      const wo = await prisma.workOrder.findUnique({
        where: { id: workOrderId },
        select: { issue: { select: { city: true } } },
      });
      if (!wo) throw new NotFoundError("Work order not found");
      assertCityAccess(actor, wo.issue.city);
    }

    const rows = await prisma.workOrderTransfer.findMany({
      where: { workOrderId },
      orderBy: { createdAt: "desc" },
      include: {
        fromDepartment: { select: { id: true, nameEn: true } },
        toDepartment: { select: { id: true, nameEn: true } },
        requestedBy: { select: { id: true, fullName: true } },
        approvedBy: { select: { id: true, fullName: true } },
      },
    });
    return rows;
  },

  /**
   * Referrals waiting on a department's decision, optionally narrowed to one
   * city. `city` is a required parameter rather than an optional filter so
   * that whoever eventually exposes this over HTTP has to decide the scope —
   * defaulting to state-wide here would make the leak the easy path.
   */
  async pendingForDepartment(departmentId: string, city: string | null) {
    return prisma.workOrderTransfer.findMany({
      where: {
        toDepartmentId: departmentId,
        status: "requested",
        ...(city === null ? {} : { workOrder: { issue: { city } } }),
      },
      orderBy: { createdAt: "asc" },
      include: {
        fromDepartment: { select: { nameEn: true } },
        requestedBy: { select: { fullName: true } },
        workOrder: { include: { issue: { select: { id: true, publicRef: true, title: true } } } },
      },
    });
  },
};
