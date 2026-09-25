import { createApp } from "../../src/app.js";
import { prisma } from "../../src/shared/lib/prisma.js";
import bcrypt from "bcrypt";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { cityFromLocation } from "../../src/shared/lib/cityFromLocation.js";

export const app = createApp();

/** Creates a department + category + primary routing rule for isolated tests. */
export async function seedCategoryWithDepartment(opts: {
  categoryCode: string;
  radiusM?: number;
  windowHours?: number;
}) {
  const department = await prisma.department.create({
    data: { code: `${opts.categoryCode}-dept-${Date.now()}`, nameEn: "Test Dept", nameHi: "टेस्ट विभाग" },
  });
  const category = await prisma.issueCategory.create({
    data: {
      code: opts.categoryCode,
      nameEn: opts.categoryCode,
      nameHi: opts.categoryCode,
      defaultDepartmentId: department.id,
      dedupRadiusM: opts.radiusM ?? 75,
      dedupWindowHours: opts.windowHours ?? 72,
    },
  });
  await prisma.categoryDepartmentRule.create({
    data: { categoryId: category.id, departmentId: department.id, role: "primary", priority: 3 },
  });
  return { department, category };
}

/**
 * City-scoping fails closed: a dept_admin with no city resolves to the ""
 * sentinel and is refused every issue, so a staff fixture must carry one.
 * Defaults to Bhopal, which is the city the test coordinates fall in.
 */
export async function createTestUser(
  role: "citizen" | "dept_admin" | "super_admin" = "citizen",
  departmentId?: string,
  city: string | null = "Bhopal"
) {
  const email = `test-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.samadhan`;
  const password = "TestPass123!";
  const passwordHash = await bcrypt.hash(password, 4);
  const user = await prisma.user.create({
    data: { email, passwordHash, fullName: "Test User", role, departmentId, city },
  });
  return { user, email, password };
}

/** Inserts an issue directly via raw SQL (bypassing the API) for test fixtures. */
export async function insertRawIssue(opts: {
  categoryId: string;
  reportedBy: string;
  latitude: number;
  longitude: number;
  title?: string;
}) {
  // city is derived from the coordinates in production, and staff access is
  // scoped by it — a fixture that leaves it null is invisible to every
  // dept_admin, so derive it the same way the service does.
  const city = cityFromLocation(opts.latitude, opts.longitude);

  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    INSERT INTO issues (id, public_ref, title, description, category_id, reported_by, location, city)
    VALUES (
      ${randomUUID()}::uuid,
      ${"SAM-TEST-" + Math.random().toString(36).slice(2, 8).toUpperCase()},
      ${opts.title ?? "Test issue"}, 'Test issue description', ${opts.categoryId}::uuid, ${opts.reportedBy}::uuid,
      ST_SetSRID(ST_MakePoint(${opts.longitude}, ${opts.latitude}), 4326)::geography,
      ${city}
    )
    RETURNING id
  `);
  return rows[0].id;
}
