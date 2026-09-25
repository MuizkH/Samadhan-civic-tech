import { prisma } from "../../shared/lib/prisma.js";
import { logger } from "../../shared/lib/logger.js";
import { env } from "../../config/env.js";
import { slaService } from "../sla/sla.service.js";
import { complete, aiEnabled } from "./providers/index.js";
import {
  DECOMPOSE_SYSTEM,
  DECOMPOSE_JSON_SCHEMA,
  DECOMPOSE_VERSION,
  decomposeUser,
  decomposeSchema,
  DecomposeResult,
} from "./prompts/index.js";
import { AccessTokenClaims } from "../../shared/lib/jwt.js";
import { NotFoundError, ForbiddenError } from "../../shared/errors/AppError.js";

/**
 * Compound-issue decomposition.
 *
 * "The road collapsed over a leaking water main" is two departments' work in
 * a fixed order: the pipe is repaired, then the surface is restored. Routing
 * it to one department by category alone guarantees the second half never
 * happens, or happens twice.
 *
 * Runs on Groq by preference — the plan is visible in the admin panel and
 * latency shows. Everything it produces is recorded in coordination_plans
 * before any work order is touched, so the reasoning survives even if a
 * human later overrides it.
 */

/** Above this the plan is applied automatically; below it a human decides. */
const AUTO_APPLY_THRESHOLD = () => env.AI_PLAN_CONFIDENCE_THRESHOLD;

export const decompositionService = {
  /**
   * Analyses an issue and, when confident, creates the extra work orders and
   * the dependencies between them. Safe to call for every new issue: a
   * single-department issue produces a plan row and no changes.
   */
  async planForIssue(issueId: string): Promise<{ planId: string; applied: boolean } | null> {
    if (!aiEnabled()) return null;

    const issue = await prisma.issue.findUnique({
      where: { id: issueId },
      include: {
        category: { select: { id: true, code: true } },
        workOrders: { select: { id: true, departmentId: true, sequence: true } },
      },
    });
    if (!issue) return null;

    let result: DecomposeResult;
    let provider: string;
    let model: string;
    try {
      const res = await complete(
        {
          kind: "decompose",
          promptVersion: DECOMPOSE_VERSION,
          system: DECOMPOSE_SYSTEM,
          user: decomposeUser({
            title: issue.title,
            description: issue.description,
            category: issue.category.code,
          }),
          jsonSchema: DECOMPOSE_JSON_SCHEMA,
          entityType: "issue",
          entityId: issue.id,
        },
        decomposeSchema,
        { preferFast: true }
      );
      result = res.data;
      provider = res.provider;
      model = res.model;
    } catch (err) {
      // Both providers down. The issue keeps the work orders that
      // category routing already gave it.
      logger.warn({ issueId, err }, "Decomposition unavailable; leaving category routing in place");
      return null;
    }

    const shouldApply =
      result.isCompound && result.confidence >= AUTO_APPLY_THRESHOLD() && result.subtasks.length > 1;

    const plan = await prisma.coordinationPlan.create({
      data: {
        issueId: issue.id,
        provider,
        model,
        promptVersion: DECOMPOSE_VERSION,
        plan: result as unknown as object,
        rationale: result.rationale,
        confidence: result.confidence,
        status: shouldApply ? "applied" : "suggested",
        appliedAt: shouldApply ? new Date() : null,
      },
    });

    if (!shouldApply) {
      logger.info(
        { issueId, confidence: result.confidence, isCompound: result.isCompound },
        "Coordination plan stored as a suggestion"
      );
      return { planId: plan.id, applied: false };
    }

    await this.applyPlan(plan.id, issue.id, result, issue.category.id);
    return { planId: plan.id, applied: true };
  },

  /**
   * Materialises a plan into work orders + dependencies.
   *
   * SLA deadlines come from slaService, the same source the category-routing
   * path uses, so an AI-created work order is not a second class of row with
   * different clock behaviour.
   */
  async applyPlan(planId: string, issueId: string, result: DecomposeResult, categoryId: string) {
    const departments = await prisma.department.findMany({
      where: { code: { in: result.subtasks.map((s) => s.department) } },
      select: { id: true, code: true },
    });
    const deptByCode = new Map(departments.map((d) => [d.code, d.id]));

    const existing = await prisma.workOrder.findMany({
      where: { issueId },
      select: { id: true, departmentId: true, sequence: true },
    });
    const existingByDept = new Map(existing.map((w) => [w.departmentId, w.id]));
    let nextSequence = existing.reduce((m, w) => Math.max(m, w.sequence), -1) + 1;

    const now = new Date();
    /** order value -> work order id, for wiring dependencies afterwards. */
    const byOrder = new Map<number, string>();

    for (const task of [...result.subtasks].sort((a, b) => a.order - b.order)) {
      const departmentId = deptByCode.get(task.department);
      if (!departmentId) {
        logger.warn({ department: task.department, issueId }, "Plan named an unknown department; skipping");
        continue;
      }

      // Category routing may already have created this department's order.
      const already = existingByDept.get(departmentId);
      if (already) {
        byOrder.set(task.order, already);
        continue;
      }

      const sla = await slaService.computeDueDates({
        categoryId,
        departmentId,
        priority: 3,
        from: now,
      });

      const created = await prisma.workOrder.create({
        data: {
          issueId,
          departmentId,
          role: "supporting",
          priority: 3,
          sequence: nextSequence++,
          slaPolicyId: sla.slaPolicyId,
          ackDueAt: sla.ackDueAt,
          dueAt: sla.dueAt,
        },
        select: { id: true },
      });
      byOrder.set(task.order, created.id);
      existingByDept.set(departmentId, created.id);
    }

    // Dependencies. The graph is acyclic by construction — a subtask may only
    // depend on a lower `order` — so this skips the cycle guard that
    // coordinationService.addDependency runs for human edits, which also
    // carries RBAC checks that make no sense for a system actor.
    const edges: { predecessorId: string; successorId: string }[] = [];
    for (const task of result.subtasks) {
      const successorId = byOrder.get(task.order);
      if (!successorId) continue;
      for (const dep of task.dependsOn) {
        if (dep >= task.order) continue;
        const predecessorId = byOrder.get(dep);
        if (predecessorId && predecessorId !== successorId) {
          edges.push({ predecessorId, successorId });
        }
      }
    }
    if (edges.length > 0) {
      await prisma.workOrderDependency.createMany({ data: edges, skipDuplicates: true });
    }

    logger.info(
      { issueId, planId, workOrders: byOrder.size, dependencies: edges.length },
      "Coordination plan applied"
    );
  },

  /** The plan behind an issue, for the admin coordination panel. */
  async forIssue(issueId: string) {
    const plans = await prisma.coordinationPlan.findMany({
      where: { issueId },
      orderBy: { createdAt: "desc" },
      include: { overriddenBy: { select: { id: true, fullName: true } } },
    });
    return plans.map((p) => ({
      id: p.id,
      provider: p.provider,
      model: p.model,
      promptVersion: p.promptVersion,
      plan: p.plan,
      rationale: p.rationale,
      confidence: p.confidence,
      status: p.status,
      appliedAt: p.appliedAt,
      overriddenBy: p.overriddenBy,
      overrideNote: p.overrideNote,
      createdAt: p.createdAt,
    }));
  },

  /**
   * A human accepting or rejecting a suggestion. Always recorded against the
   * plan — an override is as much a part of the audit trail as the plan.
   */
  async override(
    planId: string,
    input: { action: "apply" | "reject"; note?: string },
    actor: AccessTokenClaims
  ) {
    if (actor.role !== "dept_admin" && actor.role !== "super_admin") {
      throw new ForbiddenError("Only department staff can act on a coordination plan.");
    }

    const plan = await prisma.coordinationPlan.findUnique({
      where: { id: planId },
      include: { issue: { select: { id: true, categoryId: true } } },
    });
    if (!plan) throw new NotFoundError("Coordination plan not found");

    if (input.action === "apply" && plan.status !== "applied") {
      const parsed = decomposeSchema.safeParse(plan.plan);
      if (parsed.success) {
        await this.applyPlan(plan.id, plan.issue.id, parsed.data, plan.issue.categoryId);
      }
    }

    return prisma.coordinationPlan.update({
      where: { id: planId },
      data: {
        status: input.action === "apply" ? "applied" : "rejected",
        appliedAt: input.action === "apply" ? new Date() : plan.appliedAt,
        overriddenById: actor.sub,
        overrideNote: input.note ?? null,
      },
    });
  },
};
