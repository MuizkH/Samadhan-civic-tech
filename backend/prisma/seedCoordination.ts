import "dotenv/config";
import { PrismaClient, Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { addMinutes } from "../src/modules/sla/sla.service.js";

/**
 * Coordination seed, run after the main seed.
 *
 * Adds SLA policies, backfills due dates onto the existing work orders so
 * compliance percentages are real, and builds the compound demo issue
 * ("Roads cannot repave until Water closes the pipe repair").
 *
 * Idempotent: policies are matched on their scope, and the demo issue is
 * keyed by a fixed public_ref.
 */

const prisma = new PrismaClient();

/** Per-category targets, in minutes. Electricity is fastest, buildings slowest. */
const SLA_BY_CATEGORY: Record<string, { ack: number; resolve: number; businessHoursOnly: boolean }> = {
  electricity: { ack: 60, resolve: 24 * 60, businessHoursOnly: false },
  water: { ack: 120, resolve: 3 * 24 * 60, businessHoursOnly: false },
  sanitation: { ack: 180, resolve: 2 * 24 * 60, businessHoursOnly: false },
  roads: { ack: 8 * 60, resolve: 10 * 24 * 60, businessHoursOnly: true },
  parks: { ack: 12 * 60, resolve: 7 * 24 * 60, businessHoursOnly: true },
  buildings: { ack: 24 * 60, resolve: 21 * 24 * 60, businessHoursOnly: true },
  metro: { ack: 60, resolve: 24 * 60, businessHoursOnly: false },
};

const ESCALATION_CHAIN = [
  { level: 1, afterMinutes: 0, notify: "department_head" },
  { level: 2, afterMinutes: 48 * 60, notify: "super_admin" },
];

const DEMO_REF = "SAM-DEMO-0001";

async function seedSlaPolicies() {
  const categories = await prisma.issueCategory.findMany({ select: { id: true, code: true } });
  let created = 0;

  for (const cat of categories) {
    const cfg = SLA_BY_CATEGORY[cat.code];
    if (!cfg) continue;

    const existing = await prisma.slaPolicy.findFirst({
      where: { categoryId: cat.id, departmentId: null, priority: null },
    });

    const data = {
      categoryId: cat.id,
      departmentId: null,
      priority: null,
      ackMinutes: cfg.ack,
      resolveMinutes: cfg.resolve,
      businessHoursOnly: cfg.businessHoursOnly,
      escalationChain: ESCALATION_CHAIN as unknown as Prisma.InputJsonValue,
    };

    if (existing) {
      await prisma.slaPolicy.update({ where: { id: existing.id }, data });
    } else {
      await prisma.slaPolicy.create({ data });
      created++;
    }
  }
  console.log(`SLA policies: ${categories.length} categories covered (${created} new)`);
}

/**
 * Backfills ack/resolve deadlines onto work orders created before SLA
 * existed. Without this every historical work order has a null due_at and
 * the compliance figure would be "no data" on a database full of history.
 */
async function backfillDueDates() {
  const workOrders = await prisma.workOrder.findMany({
    where: { dueAt: null },
    include: { issue: { select: { categoryId: true, createdAt: true } } },
  });
  if (workOrders.length === 0) {
    console.log("Due dates: nothing to backfill");
    return;
  }

  const policies = await prisma.slaPolicy.findMany({ where: { active: true } });
  const byCategory = new Map(policies.filter((p) => p.categoryId).map((p) => [p.categoryId!, p]));

  let updated = 0;
  for (const wo of workOrders) {
    const policy = byCategory.get(wo.issue.categoryId);
    if (!policy) continue;

    const from = wo.createdAt ?? wo.issue.createdAt;
    await prisma.workOrder.update({
      where: { id: wo.id },
      data: {
        slaPolicyId: policy.id,
        ackDueAt: addMinutes(from, policy.ackMinutes, policy.businessHoursOnly),
        dueAt: addMinutes(from, policy.resolveMinutes, policy.businessHoursOnly),
        // Historical work orders that finished late should read as late.
        acknowledgedAt: wo.acknowledgedAt ?? (wo.status !== "pending" ? from : null),
        startedAt: wo.startedAt ?? (wo.status === "in_progress" || wo.status === "done" ? from : null),
      },
    });
    updated++;
  }
  console.log(`Due dates: backfilled ${updated} work orders`);
}

/**
 * The compound coordination demo: a single citizen report that needs two
 * departments in sequence. Water must close the pipe repair before Roads
 * can repave over it.
 */
async function seedCompoundDemo() {
  const existing = await prisma.issue.findUnique({ where: { publicRef: DEMO_REF } });
  if (existing) {
    console.log("Compound demo issue already present");
    return;
  }

  const [roadsCat, waterDept, roadsDept, citizen, waterAdmin, roadsAdmin] = await Promise.all([
    prisma.issueCategory.findUniqueOrThrow({ where: { code: "roads" } }),
    prisma.department.findUniqueOrThrow({ where: { code: "water_supply" } }),
    prisma.department.findUniqueOrThrow({ where: { code: "roads" } }),
    prisma.user.findFirstOrThrow({ where: { role: "citizen" }, orderBy: { email: "asc" } }),
    // Resolved by department + role rather than a hardcoded address: the admin
    // emails come from SEED_<CODE>_ADMIN_EMAIL and differ per deployment, so
    // literal addresses here threw findUniqueOrThrow and aborted this seed.
    prisma.user.findFirstOrThrow({
      where: { role: "dept_admin", department: { code: "water_supply" } },
      orderBy: { email: "asc" },
    }),
    prisma.user.findFirstOrThrow({
      where: { role: "dept_admin", department: { code: "roads" } },
      orderBy: { email: "asc" },
    }),
  ]);

  const createdAt = new Date(Date.now() - 5 * 24 * 3600 * 1000);
  const newIssueId = randomUUID();

  const [{ id: issueId }] = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    INSERT INTO issues (id, public_ref, title, description, category_id, status, priority, reported_by, address, city, location, created_at)
    VALUES (
      ${newIssueId}::uuid,
      ${DEMO_REF},
      ${"Road collapsed over a leaking water main"},
      ${"The road surface has caved in above a burst pipe. The leak has to be fixed before the road can be repaved, otherwise the new surface will simply collapse again."},
      ${roadsCat.id}::uuid, ${"in_progress"}::"IssueStatus", 1, ${citizen.id}::uuid,
      ${"MP Nagar Zone-I, Bhopal, Madhya Pradesh"},
      -- Must be set explicitly: an issue with no city is fail-closed and
      -- invisible to every dept_admin, which would silently empty the
      -- coordination demo for both of the admins it is built for.
      ${"Bhopal"},
      ST_SetSRID(ST_MakePoint(77.4340, 23.2330), 4326)::geography,
      ${createdAt}
    )
    RETURNING id
  `);

  await prisma.issueReport.create({
    data: {
      issueId,
      reporterId: citizen.id,
      description: "Reported by a resident after the surface gave way overnight.",
      isPrimary: true,
      createdAt,
    },
  });

  await prisma.issueMedia.create({
    data: {
      issueId,
      kind: "evidence",
      url: "/broken%20road.webp",
      publicId: `seed/evidence/${DEMO_REF}`,
      uploadedBy: citizen.id,
      createdAt,
    },
  });

  const waterPolicy = await prisma.slaPolicy.findFirst({
    where: { categoryId: (await prisma.issueCategory.findUniqueOrThrow({ where: { code: "water" } })).id },
  });
  const roadsPolicy = await prisma.slaPolicy.findFirst({ where: { categoryId: roadsCat.id } });

  // Water goes first and is deliberately already overdue, so the SLA sweep
  // has something genuine to escalate during the demo.
  const waterWo = await prisma.workOrder.create({
    data: {
      issueId,
      departmentId: waterDept.id,
      role: "primary",
      status: "in_progress",
      priority: 1,
      sequence: 0,
      assigneeId: waterAdmin.id,
      createdAt,
      startedAt: new Date(createdAt.getTime() + 3600 * 1000),
      slaPolicyId: waterPolicy?.id ?? null,
      ackDueAt: new Date(createdAt.getTime() + 2 * 3600 * 1000),
      dueAt: new Date(Date.now() - 26 * 3600 * 1000),
    },
  });

  const roadsWo = await prisma.workOrder.create({
    data: {
      issueId,
      departmentId: roadsDept.id,
      role: "supporting",
      status: "pending",
      priority: 2,
      sequence: 1,
      assigneeId: roadsAdmin.id,
      createdAt,
      slaPolicyId: roadsPolicy?.id ?? null,
      ackDueAt: new Date(createdAt.getTime() + 8 * 3600 * 1000),
      dueAt: new Date(Date.now() + 5 * 24 * 3600 * 1000),
    },
  });

  // Roads is blocked until Water finishes.
  await prisma.workOrderDependency.create({
    data: {
      predecessorId: waterWo.id,
      successorId: roadsWo.id,
      type: "finish_to_start",
      createdById: roadsAdmin.id,
    },
  });

  await prisma.workOrderNote.createMany({
    data: [
      {
        workOrderId: roadsWo.id,
        authorId: roadsAdmin.id,
        body: "Holding off on resurfacing until Jal Board confirms the main is sealed. Repaving over a live leak will just fail again.",
        visibility: "inter_dept",
        createdAt: new Date(createdAt.getTime() + 2 * 3600 * 1000),
      },
      {
        workOrderId: waterWo.id,
        authorId: waterAdmin.id,
        body: "Excavation done, replacement section ordered. Expect to close by tomorrow.",
        visibility: "inter_dept",
        createdAt: new Date(createdAt.getTime() + 26 * 3600 * 1000),
      },
    ],
  });

  await prisma.issueStatusHistory.createMany({
    data: [
      {
        issueId,
        fromStatus: null,
        toStatus: "reported",
        actorId: citizen.id,
        actorRole: "citizen",
        reason: "Issue reported",
        createdAt,
      },
      {
        issueId,
        fromStatus: "reported",
        toStatus: "acknowledged",
        actorId: waterAdmin.id,
        actorRole: "dept_admin",
        reason: "Jal Board accepted the pipe repair",
        createdAt: new Date(createdAt.getTime() + 1800 * 1000),
      },
      {
        issueId,
        fromStatus: "acknowledged",
        toStatus: "in_progress",
        actorId: waterAdmin.id,
        actorRole: "dept_admin",
        reason: "Excavation started",
        createdAt: new Date(createdAt.getTime() + 3600 * 1000),
      },
    ],
  });

  console.log(`Compound demo issue ${DEMO_REF} created`);
  console.log(`  water work order  ${waterWo.id} (in_progress, overdue)`);
  console.log(`  roads work order  ${roadsWo.id} (pending, blocked by water)`);
}

async function main() {
  await seedSlaPolicies();
  await backfillDueDates();
  await seedCompoundDemo();
  console.log("Coordination seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
