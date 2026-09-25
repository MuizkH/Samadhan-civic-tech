import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../../shared/lib/prisma.js";
import { authenticate, authenticateSse } from "../../shared/middleware/authenticate.js";
import { requireDepartmentAccess, resolveCityScope } from "../../shared/middleware/rbac.js";
import { validate } from "../../shared/middleware/validate.js";
import { uuidParam } from "../../shared/schemas/common.js";
import { openSseStream } from "../../shared/lib/sse.js";
import { eventBus } from "../../shared/lib/eventBus.js";

export const departmentsRouter = Router();

const queueQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .enum([
      "reported",
      "acknowledged",
      "in_progress",
      "resolved",
      "verified",
      "rejected",
      "reopened",
      "closed",
    ])
    .optional(),
  categoryCode: z.string().optional(),
  /**
   * Super-admin-only narrowing filter. A dept_admin's city comes from their
   * token and this param is ignored for them, so it cannot be used to widen
   * scope — see the effectiveCity resolution in the handler.
   */
  city: z.string().optional(),
  /** ISO timestamps bounding issue creation. */
  from: z.string().optional(),
  to: z.string().optional(),
  sort: z.enum(["created_desc", "created_asc", "priority", "status"]).default("created_desc"),
});

const SORT_CLAUSE: Record<string, Prisma.Sql> = {
  created_desc: Prisma.sql`i.created_at DESC`,
  created_asc: Prisma.sql`i.created_at ASC`,
  priority: Prisma.sql`wo.priority ASC, i.created_at DESC`,
  status: Prisma.sql`i.status ASC, i.created_at DESC`,
};

/**
 * Department work queue. Returns the FULL issue shape (coordinates,
 * reporter, support count, lifecycle timestamps) because the admin
 * dashboard maps these rows straight into its domain model — the previous
 * slim projection silently rendered an empty queue.
 *
 * RBAC: super_admin may read any department, dept_admin only their own.
 */
departmentsRouter.get(
  "/:departmentId/queue",
  authenticate,
  validate(uuidParam("departmentId"), "params"),
  requireDepartmentAccess("departmentId"),
  validate(queueQuerySchema, "query"),
  async (req, res, next) => {
    try {
      const q = req.validatedQuery as z.infer<typeof queueQuerySchema>;
      const departmentId = req.params.departmentId as string;

      // A department row is shared by every city it operates in, so the
      // department filter alone is not a jurisdiction. Narrow to the caller's
      // own city; a super_admin (null scope) may optionally pick one.
      const cityScope = resolveCityScope(req.auth!);
      const effectiveCity = cityScope ?? q.city ?? null;

      const conditions: Prisma.Sql[] = [Prisma.sql`wo.department_id = ${departmentId}::uuid`];
      if (effectiveCity !== null) conditions.push(Prisma.sql`i.city = ${effectiveCity}`);
      if (q.status) conditions.push(Prisma.sql`i.status = ${q.status}::"IssueStatus"`);
      if (q.categoryCode) conditions.push(Prisma.sql`c.code = ${q.categoryCode}`);
      if (q.from) conditions.push(Prisma.sql`i.created_at >= ${new Date(q.from)}`);
      if (q.to) conditions.push(Prisma.sql`i.created_at <= ${new Date(q.to)}`);

      const where = Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;
      const offset = (q.page - 1) * q.pageSize;

      const rows = await prisma.$queryRaw<
        {
          work_order_id: string;
          work_order_status: string;
          work_order_role: string;
          work_order_priority: number;
          assignee_id: string | null;
          assignee_name: string | null;
          id: string;
          public_ref: string;
          title: string;
          description: string;
          category_code: string;
          category_name_en: string;
          status: string;
          latitude: number;
          longitude: number;
          address: string | null;
          city: string | null;
          priority: number;
          reported_by: string;
          reporter_name: string | null;
          supports_count: number;
          resolution_note: string | null;
          created_at: Date;
          acknowledged_at: Date | null;
          resolved_at: Date | null;
          verified_at: Date | null;
          closed_at: Date | null;
        }[]
      >(Prisma.sql`
        SELECT
          wo.id AS work_order_id, wo.status AS work_order_status, wo.role AS work_order_role,
          wo.priority AS work_order_priority, wo.assignee_id, au.full_name AS assignee_name,
          i.id, i.public_ref, i.title, i.description, i.status, i.address, i.city, i.priority,
          i.reported_by, ru.full_name AS reporter_name, i.supports_count, i.resolution_note,
          i.created_at, i.acknowledged_at, i.resolved_at, i.verified_at, i.closed_at,
          ST_Y(i.location::geometry) AS latitude,
          ST_X(i.location::geometry) AS longitude,
          c.code AS category_code, c.name_en AS category_name_en
        FROM work_orders wo
        JOIN issues i ON i.id = wo.issue_id
        JOIN issue_categories c ON c.id = i.category_id
        LEFT JOIN users au ON au.id = wo.assignee_id
        LEFT JOIN users ru ON ru.id = i.reported_by
        ${where}
        ORDER BY ${SORT_CLAUSE[q.sort]}
        LIMIT ${q.pageSize} OFFSET ${offset}
      `);

      const countRows = await prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM work_orders wo
        JOIN issues i ON i.id = wo.issue_id
        JOIN issue_categories c ON c.id = i.category_id
        ${where}
      `);

      res.json({
        items: rows.map((r) => ({
          workOrderId: r.work_order_id,
          status: r.work_order_status,
          role: r.work_order_role,
          priority: r.work_order_priority,
          assignee: r.assignee_id ? { id: r.assignee_id, fullName: r.assignee_name } : null,
          createdAt: r.created_at,
          issue: {
            id: r.id,
            publicRef: r.public_ref,
            title: r.title,
            description: r.description,
            category: { code: r.category_code, nameEn: r.category_name_en },
            status: r.status,
            latitude: r.latitude,
            longitude: r.longitude,
            address: r.address,
            city: r.city,
            priority: r.priority,
            reportedBy: r.reported_by,
            reporterName: r.reporter_name,
            supportsCount: r.supports_count,
            resolutionNote: r.resolution_note,
            createdAt: r.created_at,
            acknowledgedAt: r.acknowledged_at,
            resolvedAt: r.resolved_at,
            verifiedAt: r.verified_at,
            closedAt: r.closed_at,
          },
        })),
        page: q.page,
        pageSize: q.pageSize,
        total: Number(countRows[0]?.count ?? 0),
      });
    } catch (err) {
      next(err);
    }
  }
);

/** SSE stream of events touching this department's queue. */
departmentsRouter.get(
  "/:departmentId/stream",
  authenticateSse,
  validate(uuidParam("departmentId"), "params"),
  requireDepartmentAccess("departmentId"),
  (req, res) => {
    const departmentId = req.params.departmentId as string;
    // Same city scope as the paged queue, so the live feed and the fetched
    // list never disagree about what this admin is allowed to see.
    const cityScope = resolveCityScope(req.auth!);
    openSseStream(req, res, (push) => eventBus.onDepartment(departmentId, cityScope, push));
  }
);

/**
 * City directory — backs the super-admin city filter.
 *
 * Derived from the issues table rather than a cities table because a city is
 * only meaningful here once it has issues in it. A dept_admin gets back just
 * their own city, so the filter control cannot be used to probe which other
 * jurisdictions exist.
 */
departmentsRouter.get("/cities", authenticate, async (req, res, next) => {
  try {
    const cityScope = resolveCityScope(req.auth!);
    if (cityScope !== null) {
      res.json({ items: cityScope ? [cityScope] : [] });
      return;
    }
    const rows = await prisma.issue.findMany({
      where: { city: { not: null } },
      distinct: ["city"],
      select: { city: true },
      orderBy: { city: "asc" },
    });
    res.json({ items: rows.map((r) => r.city).filter((c): c is string => !!c) });
  } catch (err) {
    next(err);
  }
});

/** Department directory — backs the super-admin department filter. */
departmentsRouter.get("/", authenticate, async (_req, res, next) => {
  try {
    const departments = await prisma.department.findMany({
      where: { active: true },
      orderBy: { nameEn: "asc" },
      select: { id: true, code: true, nameEn: true, nameHi: true },
    });
    res.json({ items: departments });
  } catch (err) {
    next(err);
  }
});
