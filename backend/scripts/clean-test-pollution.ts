/**
 * One-off cleanup: earlier test runs pointed at the dev database and left
 * throwaway users/departments/categories/issues behind. Tests now run
 * against TEST_DATABASE_URL, so this only has to be run once.
 *
 * Junk is identified by the fixtures' own naming patterns:
 *   users        -> *@test.samadhan
 *   departments  -> *-dept-*, rbac-*, repro-*
 *   categories   -> <name>-<13-digit-timestamp>
 * Everything created by prisma/seed.ts or by a real signup is left alone.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const JUNK_CATEGORY = /-\d{13}$/;
const JUNK_DEPARTMENT = /(-dept-|^rbac-|^repro-)/;
const JUNK_USER_EMAIL = /@test\.samadhan$/;

async function main() {
  const [categories, departments, users] = await Promise.all([
    prisma.issueCategory.findMany({ select: { id: true, code: true } }),
    prisma.department.findMany({ select: { id: true, code: true } }),
    prisma.user.findMany({ select: { id: true, email: true } }),
  ]);

  const junkCategoryIds = categories.filter((c) => JUNK_CATEGORY.test(c.code)).map((c) => c.id);
  const junkDepartmentIds = departments.filter((d) => JUNK_DEPARTMENT.test(d.code)).map((d) => d.id);
  const junkUserIds = users.filter((u) => JUNK_USER_EMAIL.test(u.email)).map((u) => u.id);

  console.log(
    `junk found -> categories: ${junkCategoryIds.length}, departments: ${junkDepartmentIds.length}, users: ${junkUserIds.length}`
  );

  // Issues belonging to a junk category or reported by a junk user. Deleting
  // an issue cascades to its reports, media, supports, work orders and history.
  const junkIssues = await prisma.issue.findMany({
    where: { OR: [{ categoryId: { in: junkCategoryIds } }, { reportedBy: { in: junkUserIds } }] },
    select: { id: true },
  });
  const junkIssueIds = junkIssues.map((i) => i.id);
  console.log(`junk issues: ${junkIssueIds.length}`);

  if (junkIssueIds.length) {
    await prisma.issue.deleteMany({ where: { id: { in: junkIssueIds } } });
  }

  // A junk user may have authored history/audit rows against a surviving
  // issue. actor_id is RESTRICT on history, so clear those first.
  if (junkUserIds.length) {
    const orphanHistory = await prisma.issueStatusHistory.deleteMany({
      where: { actorId: { in: junkUserIds } },
    });
    const orphanAudit = await prisma.auditLog.deleteMany({ where: { actorId: { in: junkUserIds } } });
    await prisma.issueSupport.deleteMany({ where: { userId: { in: junkUserIds } } });
    await prisma.issueReport.deleteMany({ where: { reporterId: { in: junkUserIds } } });
    await prisma.issueMedia.deleteMany({ where: { uploadedBy: { in: junkUserIds } } });
    await prisma.workOrder.updateMany({
      where: { assigneeId: { in: junkUserIds } },
      data: { assigneeId: null },
    });
    console.log(`cleared ${orphanHistory.count} history + ${orphanAudit.count} audit rows from junk actors`);
    await prisma.user.deleteMany({ where: { id: { in: junkUserIds } } });
  }

  if (junkDepartmentIds.length) {
    await prisma.workOrder.deleteMany({ where: { departmentId: { in: junkDepartmentIds } } });
    await prisma.categoryDepartmentRule.deleteMany({ where: { departmentId: { in: junkDepartmentIds } } });
  }
  if (junkCategoryIds.length) {
    await prisma.categoryDepartmentRule.deleteMany({ where: { categoryId: { in: junkCategoryIds } } });
    await prisma.issueCategory.deleteMany({ where: { id: { in: junkCategoryIds } } });
  }
  if (junkDepartmentIds.length) {
    await prisma.department.deleteMany({ where: { id: { in: junkDepartmentIds } } });
  }

  console.log("--- after cleanup ---");
  console.log("departments:", await prisma.department.count());
  console.log("categories:", await prisma.issueCategory.count());
  console.log("users:", await prisma.user.count());
  console.log("issues:", await prisma.issue.count());
  console.log("workOrders:", await prisma.workOrder.count());
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
