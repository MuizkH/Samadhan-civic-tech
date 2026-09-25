import { prisma } from "../shared/lib/prisma.js";
import { logger } from "../shared/lib/logger.js";
import { env } from "../config/env.js";
import { slaService, EscalationStep } from "../modules/sla/sla.service.js";
import {
  notificationsService,
  NotificationTemplate,
} from "../modules/notifications/notifications.service.js";

/**
 * SLA sweeper. Runs every 5 minutes and is deliberately idempotent: the
 * unique (work_order_id, level) index on escalations means a re-run — or two
 * overlapping runs — cannot double-escalate or double-notify.
 *
 * Two things keep the noise down. A grace period means a deadline missed by
 * seconds does not page anyone. And alerts are collected per recipient for
 * the whole sweep, so a backlog that breaches all at once (a seeded or
 * migrated dataset, typically) arrives as one digest rather than dozens of
 * near-identical rows.
 */

/** One pending alert, held until we know whether to digest the recipient's batch. */
interface PendingAlert {
  template: NotificationTemplate;
  payload: Record<string, unknown>;
  overdueMinutes: number;
  publicRef: string;
}

const DEFAULT_CHAIN: EscalationStep[] = [
  { level: 1, afterMinutes: 0, notify: "department_head" },
  { level: 2, afterMinutes: 60 * 24, notify: "super_admin" },
];

/**
 * Who should hear about a breach at this level.
 *
 * Department heads are narrowed to the breaching issue's own city. Without
 * that, one department's admins are paged for every city it operates in — a
 * Bhopal roads admin would get Indore's breach notices, complete with the
 * issue title and public reference in the payload, for work they cannot see in
 * their queue or act on. Level-2 escalation to super_admin stays state-wide,
 * which is the point of that role.
 */
async function resolveRecipients(
  step: EscalationStep,
  departmentId: string,
  city: string | null
): Promise<string[]> {
  if (step.notify === "super_admin") {
    const admins = await prisma.user.findMany({ where: { role: "super_admin" }, select: { id: true } });
    return admins.map((a) => a.id);
  }
  const heads = await prisma.user.findMany({
    where: { departmentId, role: "dept_admin", city },
    select: { id: true },
  });
  return heads.map((h) => h.id);
}

export async function runSlaSweep(now = new Date()): Promise<{ breached: number; escalated: number }> {
  // Anything inside the grace window is treated as not yet breached, so a
  // deadline that slipped by a minute waits for the next sweep instead of
  // firing immediately.
  const graceCutoff = new Date(now.getTime() - env.SLA_GRACE_MINUTES * 60_000);

  const overdue = await prisma.workOrder.findMany({
    where: {
      dueAt: { not: null, lt: graceCutoff },
      status: { notIn: ["done", "rejected"] },
    },
    include: {
      slaPolicy: true,
      issue: { select: { id: true, publicRef: true, title: true, city: true } },
      department: { select: { id: true, nameEn: true } },
    },
    take: 500,
  });

  let breached = 0;
  let escalated = 0;
  const pendingByRecipient = new Map<string, PendingAlert[]>();

  for (const wo of overdue) {
    const overdueMinutes = Math.floor((now.getTime() - wo.dueAt!.getTime()) / 60_000);

    // First time past due: stamp the breach.
    if (!wo.breachedAt) {
      await prisma.workOrder.update({ where: { id: wo.id }, data: { breachedAt: now } });
      breached++;
    }

    const chain = wo.slaPolicy ? slaService.escalationChain(wo.slaPolicy) : DEFAULT_CHAIN;
    const steps = (chain.length > 0 ? chain : DEFAULT_CHAIN).sort((a, b) => a.level - b.level);

    // Highest level whose delay has already elapsed.
    const due = steps.filter((s) => overdueMinutes >= s.afterMinutes);
    if (due.length === 0) continue;
    const target = due[due.length - 1];
    if (target.level <= wo.escalationLevel) continue;

    // Fire every level between the current one and the target, so a long
    // outage doesn't skip the intermediate audit rows.
    for (const step of due.filter((s) => s.level > wo.escalationLevel)) {
      const recipients = await resolveRecipients(step, wo.departmentId, wo.issue.city);

      try {
        await prisma.escalation.create({
          data: {
            workOrderId: wo.id,
            level: step.level,
            reason: `Resolution SLA breached by ${overdueMinutes} minutes`,
            breachedAt: wo.breachedAt ?? now,
            overdueMinutes,
            notifiedUserId: recipients[0] ?? null,
          },
        });
      } catch (err: unknown) {
        // P2002 = this level already recorded by an earlier sweep.
        if (typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002") continue;
        throw err;
      }

      const alert: PendingAlert = {
        template: step.level === 1 ? "sla.breached" : "sla.escalated",
        payload: {
          workOrderId: wo.id,
          issueId: wo.issueId,
          publicRef: wo.issue.publicRef,
          issueTitle: wo.issue.title,
          department: wo.department.nameEn,
          priority: wo.priority,
          level: step.level,
          overdueMinutes,
        },
        overdueMinutes,
        publicRef: wo.issue.publicRef,
      };
      for (const recipientId of recipients) {
        const list = pendingByRecipient.get(recipientId) ?? [];
        list.push(alert);
        pendingByRecipient.set(recipientId, list);
      }

      escalated++;
    }

    await prisma.workOrder.update({
      where: { id: wo.id },
      data: { escalationLevel: target.level },
    });
  }

  let digested = 0;
  for (const [recipientId, alerts] of pendingByRecipient) {
    if (alerts.length < env.SLA_DIGEST_THRESHOLD) {
      for (const a of alerts) {
        await notificationsService.enqueue({ recipientId, template: a.template, payload: a.payload });
      }
      continue;
    }

    // One row for the whole batch, pointing at the worst offender so the
    // click-through still lands somewhere useful.
    const oldest = alerts.reduce((worst, a) => (a.overdueMinutes > worst.overdueMinutes ? a : worst));
    await notificationsService.enqueue({
      recipientId,
      template: "sla.digest",
      payload: {
        count: alerts.length,
        oldestRef: oldest.publicRef,
        oldestOverdueMinutes: oldest.overdueMinutes,
        issueId: oldest.payload.issueId,
        workOrderId: oldest.payload.workOrderId,
      },
    });
    digested++;
  }

  if (breached || escalated) {
    logger.info({ breached, escalated, digested, graceMinutes: env.SLA_GRACE_MINUTES }, "SLA sweep complete");
  }
  return { breached, escalated };
}
