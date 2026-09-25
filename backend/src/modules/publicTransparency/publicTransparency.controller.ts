import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../shared/lib/prisma.js";

export const publicRouter = Router();

const toNum = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const toHours = (seconds: unknown) => {
  if (seconds === null || seconds === undefined) return null;
  const n = Number(seconds);
  return Number.isFinite(n) ? Math.round((n / 3600) * 10) / 10 : null;
};

/**
 * Public transparency scorecard — no authentication.
 *
 * Everything here is aggregate: per-department counts, speeds and SLA
 * compliance. No citizen, reporter or address data is exposed, so this can
 * safely sit on an open route.
 *
 * SLA compliance counts work orders that closed on or before their due_at
 * against all closed work orders that had a due_at at all.
 */
publicRouter.get("/transparency", async (_req, res, next) => {
  try {
    const rows = await prisma.$queryRaw<
      {
        id: string;
        code: string;
        name_en: string;
        total: bigint;
        open: bigint;
        resolved: bigint;
        avg_seconds: number | null;
        p90_seconds: number | null;
        sla_tracked: bigint;
        sla_met: bigint;
        currently_breached: bigint;
      }[]
    >(Prisma.sql`
      WITH resolution AS (
        SELECT i.id AS issue_id,
               EXTRACT(EPOCH FROM (h.first_resolved_at - i.created_at)) AS seconds
        FROM issues i
        JOIN (
          SELECT issue_id, MIN(created_at) AS first_resolved_at
          FROM issue_status_history WHERE to_status = 'resolved' GROUP BY issue_id
        ) h ON h.issue_id = i.id
      )
      SELECT
        d.id, d.code, d.name_en,
        COUNT(DISTINCT wo.id)::bigint AS total,
        COUNT(DISTINCT wo.id) FILTER (WHERE wo.status NOT IN ('done','rejected'))::bigint AS open,
        COUNT(DISTINCT wo.id) FILTER (WHERE wo.status = 'done')::bigint AS resolved,
        AVG(r.seconds) AS avg_seconds,
        PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY r.seconds) AS p90_seconds,
        COUNT(DISTINCT wo.id) FILTER (
          WHERE wo.due_at IS NOT NULL AND wo.status IN ('done','rejected')
        )::bigint AS sla_tracked,
        COUNT(DISTINCT wo.id) FILTER (
          WHERE wo.due_at IS NOT NULL AND wo.status IN ('done','rejected')
            AND wo.completed_at IS NOT NULL AND wo.completed_at <= wo.due_at
        )::bigint AS sla_met,
        COUNT(DISTINCT wo.id) FILTER (
          WHERE wo.breached_at IS NOT NULL AND wo.status NOT IN ('done','rejected')
        )::bigint AS currently_breached
      FROM departments d
      LEFT JOIN work_orders wo ON wo.department_id = d.id AND wo.role = 'primary'
      LEFT JOIN issues i ON i.id = wo.issue_id
      LEFT JOIN resolution r ON r.issue_id = i.id
      WHERE d.active = true
      GROUP BY d.id, d.code, d.name_en
      ORDER BY total DESC
    `);

    const departments = rows.map((r) => {
      const total = toNum(r.total);
      const resolved = toNum(r.resolved);
      const slaTracked = toNum(r.sla_tracked);
      const slaMet = toNum(r.sla_met);
      return {
        departmentId: r.id,
        code: r.code,
        name: r.name_en,
        totalWorkOrders: total,
        openBacklog: toNum(r.open),
        resolved,
        resolutionRate: total === 0 ? 0 : Math.round((resolved / total) * 100),
        avgResolutionHours: toHours(r.avg_seconds),
        p90ResolutionHours: toHours(r.p90_seconds),
        slaCompliance: slaTracked === 0 ? null : Math.round((slaMet / slaTracked) * 100),
        slaTracked,
        currentlyBreached: toNum(r.currently_breached),
      };
    });

    const cityTotals = departments.reduce(
      (acc, d) => {
        acc.totalWorkOrders += d.totalWorkOrders;
        acc.openBacklog += d.openBacklog;
        acc.resolved += d.resolved;
        acc.slaTracked += d.slaTracked;
        acc.currentlyBreached += d.currentlyBreached;
        return acc;
      },
      { totalWorkOrders: 0, openBacklog: 0, resolved: 0, slaTracked: 0, currentlyBreached: 0 }
    );

    const weightedCompliance = departments
      .filter((d) => d.slaCompliance !== null && d.slaTracked > 0)
      .reduce((sum, d) => sum + d.slaCompliance! * d.slaTracked, 0);

    res.json({
      generatedAt: new Date().toISOString(),
      city: {
        ...cityTotals,
        resolutionRate:
          cityTotals.totalWorkOrders === 0
            ? 0
            : Math.round((cityTotals.resolved / cityTotals.totalWorkOrders) * 100),
        slaCompliance:
          cityTotals.slaTracked === 0 ? null : Math.round(weightedCompliance / cityTotals.slaTracked),
      },
      departments,
    });
  } catch (err) {
    next(err);
  }
});
