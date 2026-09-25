import { NotificationChannel, Prisma } from "@prisma/client";
import { prisma } from "../../shared/lib/prisma.js";
import { logger } from "../../shared/lib/logger.js";
import { eventBus } from "../../shared/lib/eventBus.js";

/**
 * Notification templates. Keeping the copy here (rather than at each call
 * site) means the in-app feed and the email body can never drift apart.
 */
export type NotificationTemplate =
  | "work_order.assigned"
  | "work_order.status_changed"
  | "work_order.transfer_requested"
  | "work_order.transfer_decided"
  | "work_order.note_added"
  | "sla.breached"
  | "sla.escalated"
  | "issue.resolution_confirmation_request"
  | "issue.status_changed"
  | "issue.duplicate_linked"
  | "sla.digest";

interface TemplateCopy {
  title: string;
  body: string;
}

/** Citizen-facing labels for issue statuses — never show the raw enum value. */
const ISSUE_STATUS_LABELS: Record<string, string> = {
  reported: "reported",
  acknowledged: "acknowledged by the department",
  in_progress: "being worked on",
  resolved: "marked as resolved",
  verified: "verified as fixed",
  rejected: "rejected",
  reopened: "reopened",
  closed: "closed",
};

function issueStatusLabel(status: string): string {
  return ISSUE_STATUS_LABELS[status] ?? status;
}

/** Priority is stored 1..5, highest first. Staff read words, not numbers. */
const PRIORITY_LABELS: Record<number, string> = {
  1: "Critical",
  2: "High",
  3: "Medium",
  4: "Low",
  5: "Routine",
};

function priorityLabel(priority: unknown): string {
  return typeof priority === "number" ? (PRIORITY_LABELS[priority] ?? `P${priority}`) : "Unset";
}

/**
 * Minutes -> the coarsest unit that still reads honestly. A work order six
 * weeks past due should say "6 weeks overdue", not "60480 minutes".
 */
export function formatOverdue(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes));
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"}`;
  const hours = Math.floor(m / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days} day${days === 1 ? "" : "s"}`;
  const weeks = Math.floor(days / 7);
  return `${weeks} week${weeks === 1 ? "" : "s"}`;
}

/** Shared subject line for the two single-work-order SLA templates. */
function slaBody(payload: Record<string, unknown>): string {
  const title = payload.issueTitle ? `"${payload.issueTitle}"` : "This report";
  const dept = payload.department ?? "the assigned department";
  return `${title} — ${dept} · ${priorityLabel(payload.priority)} priority · ${formatOverdue(Number(payload.overdueMinutes ?? 0))} overdue.`;
}

export function renderTemplate(
  template: NotificationTemplate,
  payload: Record<string, unknown>
): TemplateCopy {
  const ref = payload.publicRef ?? payload.issueRef ?? "";
  switch (template) {
    case "work_order.assigned":
      return {
        title: "New work order assigned to you",
        body: `${ref} — ${payload.issueTitle ?? "A work order"} has been assigned to you.`,
      };
    case "work_order.status_changed":
      return {
        title: "Work order status changed",
        body: `${ref} moved from ${payload.from} to ${payload.to}.`,
      };
    case "work_order.transfer_requested":
      return {
        title: "Referral awaiting your approval",
        body: `${payload.fromDepartment} has referred ${ref} to your department: ${payload.reason}`,
      };
    case "work_order.transfer_decided":
      return {
        title: `Referral ${payload.decision}`,
        body: `Your referral of ${ref} to ${payload.toDepartment} was ${payload.decision}.`,
      };
    case "work_order.note_added":
      // Citizens only ever see this template for a "citizen"-visibility note
      // (coordination.service.ts); staff see it for inter-department notes too.
      return payload.audience === "citizen"
        ? {
            title: `Update on your report ${ref}`,
            body: `There's a new update on your report ${ref}: "${payload.note ?? payload.authorName ?? "see details"}"`,
          }
        : {
            title: "New note on a shared work order",
            body: `${payload.authorName ?? "A colleague"} commented on ${ref}.`,
          };
    case "sla.breached":
      return {
        title: `Overdue: ${ref}`,
        body: slaBody(payload),
      };
    case "sla.escalated":
      return {
        title: `Escalated to level ${payload.level}: ${ref}`,
        body: `${slaBody(payload)} Still unresolved, so it has escalated to level ${payload.level}.`,
      };
    case "sla.digest": {
      const count = Number(payload.count ?? 0);
      const oldest = payload.oldestRef
        ? ` Oldest: ${payload.oldestRef} (${formatOverdue(Number(payload.oldestOverdueMinutes ?? 0))} overdue).`
        : "";
      return {
        title: `${count} work order${count === 1 ? "" : "s"} overdue`,
        body: `${count} work order${count === 1 ? " has" : "s have"} passed the resolution deadline and need attention.${oldest}`,
      };
    }
    case "issue.resolution_confirmation_request":
      return {
        title: "Please confirm your issue is fixed",
        body: `Your report ${ref} has been marked resolved. Please check and let us know if the problem is actually gone.`,
      };
    case "issue.status_changed": {
      const label = issueStatusLabel(String(payload.to ?? ""));
      const reasonSuffix = payload.reason ? ` Reason: ${payload.reason}` : "";
      if (payload.audience === "staff") {
        return {
          title: `Citizen reopened ${ref}`,
          body: `The citizen who filed ${ref} was not satisfied and reopened it.${reasonSuffix}`,
        };
      }
      return {
        title: `Update on your report ${ref}`,
        body: `Your report ${ref} is now ${label}.${reasonSuffix}`,
      };
    }
    case "issue.duplicate_linked":
      return {
        title: `Someone else reported the same issue`,
        body: `Another citizen reported the same problem as your report ${ref}. It now has ${payload.supportsCount ?? "more"} people affected by it.`,
      };
    default:
      return { title: "Samadhan update", body: "You have a new notification." };
  }
}

/** Which preference flag governs each template. */
function preferenceKeyFor(template: NotificationTemplate): "statusChanges" | "assignments" | "slaAlerts" {
  if (template === "work_order.assigned") return "assignments";
  if (template === "sla.breached" || template === "sla.escalated" || template === "sla.digest")
    return "slaAlerts";
  return "statusChanges";
}

export interface EnqueueInput {
  recipientId: string;
  template: NotificationTemplate;
  payload?: Record<string, unknown>;
}

export const notificationsService = {
  /**
   * Queues a notification per enabled channel. Rows are written as
   * `pending`; the pg-boss worker delivers them and flips the status, so a
   * delivery failure is visible in the table instead of vanishing.
   */
  async enqueue(input: EnqueueInput): Promise<void> {
    const prefs = await prisma.notificationPreference.findUnique({
      where: { userId: input.recipientId },
    });

    const key = preferenceKeyFor(input.template);
    // Absent preferences mean "not yet configured", which we treat as opted in.
    if (prefs && prefs[key] === false) {
      logger.debug({ template: input.template }, "Notification suppressed by user preference");
      return;
    }

    const channels: NotificationChannel[] = [];
    if (!prefs || prefs.inAppEnabled) channels.push("in_app");
    if (prefs?.emailEnabled) channels.push("email");
    if (channels.length === 0) return;

    await prisma.notification.createMany({
      data: channels.map((channel) => ({
        recipientId: input.recipientId,
        channel,
        template: input.template,
        payload: (input.payload ?? {}) as Prisma.InputJsonValue,
      })),
    });

    // Nudge any open SSE connection so the bell updates without a refresh.
    eventBus.emitIssueEvent({
      type: "issue.status_changed",
      issueId: String(input.payload?.issueId ?? ""),
      departmentIds: [],
      // Addressed to a single recipient, never fanned out to a department
      // channel, so there is no city to scope it by.
      city: null,
      payload: { notificationFor: input.recipientId },
      at: new Date().toISOString(),
    });
  },

  /** Fan-out helper: same notification to many recipients, de-duplicated. */
  async enqueueMany(
    recipientIds: string[],
    template: NotificationTemplate,
    payload?: Record<string, unknown>
  ) {
    const unique = [...new Set(recipientIds.filter(Boolean))];
    await Promise.all(unique.map((recipientId) => this.enqueue({ recipientId, template, payload })));
  },

  async listForUser(userId: string, opts: { unreadOnly?: boolean; limit?: number } = {}) {
    const rows = await prisma.notification.findMany({
      where: {
        recipientId: userId,
        channel: "in_app",
        ...(opts.unreadOnly ? { readAt: null } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: opts.limit ?? 30,
    });

    return rows.map((n) => {
      const copy = renderTemplate(
        n.template as NotificationTemplate,
        (n.payload ?? {}) as Record<string, unknown>
      );
      return {
        id: n.id,
        template: n.template,
        title: copy.title,
        body: copy.body,
        payload: n.payload,
        readAt: n.readAt,
        createdAt: n.createdAt,
      };
    });
  },

  async unreadCount(userId: string) {
    return prisma.notification.count({
      where: { recipientId: userId, channel: "in_app", readAt: null },
    });
  },

  async markRead(userId: string, ids?: string[]) {
    await prisma.notification.updateMany({
      where: {
        recipientId: userId,
        channel: "in_app",
        readAt: null,
        ...(ids?.length ? { id: { in: ids } } : {}),
      },
      data: { readAt: new Date() },
    });
  },
};
