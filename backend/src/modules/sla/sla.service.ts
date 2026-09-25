import { Prisma, WorkOrder } from "@prisma/client";
import { prisma } from "../../shared/lib/prisma.js";

/**
 * SLA resolution and clock arithmetic.
 *
 * Policies are matched most-specific-first, so a department can tighten or
 * relax a category default without duplicating every combination:
 *   (category + department + priority) > (category + department) >
 *   (category + priority) > (category) > global default
 */

export interface EscalationStep {
  level: number;
  /** Minutes past due_at at which this level fires. */
  afterMinutes: number;
  /** Who to notify: a department head, or every super_admin. */
  notify: "department_head" | "super_admin";
}

const BUSINESS_START_HOUR = 9;
const BUSINESS_END_HOUR = 18;

/**
 * Adds working minutes to a timestamp, skipping nights and weekends.
 * A 4-hour SLA raised at 5pm Friday should be due Monday morning, not
 * silently breached over the weekend.
 */
export function addBusinessMinutes(start: Date, minutes: number): Date {
  const cursor = new Date(start);
  let remaining = minutes;

  const advanceToBusinessWindow = () => {
    // Weekend -> next Monday 09:00
    while (cursor.getDay() === 0 || cursor.getDay() === 6) {
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(BUSINESS_START_HOUR, 0, 0, 0);
    }
    if (cursor.getHours() < BUSINESS_START_HOUR) {
      cursor.setHours(BUSINESS_START_HOUR, 0, 0, 0);
    } else if (cursor.getHours() >= BUSINESS_END_HOUR) {
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(BUSINESS_START_HOUR, 0, 0, 0);
      advanceToBusinessWindow();
    }
  };

  advanceToBusinessWindow();

  // Guard against pathological inputs looping forever.
  let iterations = 0;
  while (remaining > 0 && iterations < 5000) {
    iterations++;
    const endOfDay = new Date(cursor);
    endOfDay.setHours(BUSINESS_END_HOUR, 0, 0, 0);
    const availableToday = Math.max(0, (endOfDay.getTime() - cursor.getTime()) / 60_000);

    if (remaining <= availableToday) {
      cursor.setTime(cursor.getTime() + remaining * 60_000);
      remaining = 0;
    } else {
      remaining -= availableToday;
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(BUSINESS_START_HOUR, 0, 0, 0);
      advanceToBusinessWindow();
    }
  }

  return cursor;
}

export function addMinutes(start: Date, minutes: number, businessHoursOnly: boolean): Date {
  return businessHoursOnly
    ? addBusinessMinutes(start, minutes)
    : new Date(start.getTime() + minutes * 60_000);
}

export const slaService = {
  /** Best-matching active policy for a work order's category/department/priority. */
  async resolvePolicy(params: { categoryId: string; departmentId: string; priority: number }) {
    const candidates = await prisma.slaPolicy.findMany({
      where: {
        active: true,
        OR: [{ categoryId: params.categoryId }, { categoryId: null }],
        AND: [
          { OR: [{ departmentId: params.departmentId }, { departmentId: null }] },
          { OR: [{ priority: params.priority }, { priority: null }] },
        ],
      },
    });

    if (candidates.length === 0) return null;

    // Specificity score: category 4, department 2, priority 1.
    const score = (p: (typeof candidates)[number]) =>
      (p.categoryId ? 4 : 0) + (p.departmentId ? 2 : 0) + (p.priority !== null ? 1 : 0);

    return candidates.sort((a, b) => score(b) - score(a))[0];
  },

  /** Computes ack/resolve deadlines for a work order about to be created. */
  async computeDueDates(params: { categoryId: string; departmentId: string; priority: number; from: Date }) {
    const policy = await this.resolvePolicy(params);
    if (!policy) return { slaPolicyId: null, ackDueAt: null, dueAt: null };

    return {
      slaPolicyId: policy.id,
      ackDueAt: addMinutes(params.from, policy.ackMinutes, policy.businessHoursOnly),
      dueAt: addMinutes(params.from, policy.resolveMinutes, policy.businessHoursOnly),
    };
  },

  escalationChain(policy: { escalationChain: Prisma.JsonValue }): EscalationStep[] {
    const raw = policy.escalationChain;
    if (!Array.isArray(raw)) return [];
    return (raw as unknown as EscalationStep[]).filter(
      (s) => typeof s?.level === "number" && typeof s?.afterMinutes === "number"
    );
  },

  /** A work order is "open" for SLA purposes until it is done or rejected. */
  isOpen(wo: Pick<WorkOrder, "status">) {
    return wo.status !== "done" && wo.status !== "rejected";
  },
};
