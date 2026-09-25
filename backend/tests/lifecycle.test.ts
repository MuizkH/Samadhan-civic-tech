import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app, createTestUser, seedCategoryWithDepartment } from "./helpers/testApp.js";
import { prisma } from "../src/shared/lib/prisma.js";

/**
 * Critical paths only:
 *  - the lifecycle state machine rejects illegal jumps with 422
 *  - resolving without the required evidence is refused with 422
 *  - analytics return real aggregates rather than nulls
 *
 * Cross-department RBAC (403 on another department's queue) is already
 * covered in auth.test.ts and is deliberately not duplicated here.
 */

async function loginAs(email: string, password: string) {
  const res = await request(app).post("/auth/login").send({ email, password });
  return res.body.accessToken as string;
}

/** Reports an issue and returns its id, bypassing the dedup check. */
async function reportIssue(token: string, categoryCode: string) {
  const res = await request(app).post("/issues").set("Authorization", `Bearer ${token}`).send({
    title: "Lifecycle fixture issue",
    description: "Created by the lifecycle test suite.",
    categoryCode,
    latitude: 23.2599,
    longitude: 77.4126,
    force: true,
  });
  expect(res.status).toBe(201);
  return res.body.issue.id as string;
}

describe("issue lifecycle state machine", () => {
  it("rejects an illegal transition with 422 and reports what was allowed", async () => {
    const { category, department } = await seedCategoryWithDepartment({
      categoryCode: `lc-illegal-${Date.now()}`,
    });
    const citizen = await createTestUser("citizen");
    const admin = await createTestUser("dept_admin", department.id);

    const citizenToken = await loginAs(citizen.email, citizen.password);
    const adminToken = await loginAs(admin.email, admin.password);
    const issueId = await reportIssue(citizenToken, category.code);

    // reported -> resolved skips acknowledged and in_progress.
    const res = await request(app)
      .patch(`/issues/${issueId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        status: "resolved",
        resolutionNote: "Trying to skip ahead",
        proofUrl: "https://example.com/p.jpg",
      });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("ILLEGAL_TRANSITION");
    expect(res.body.error.details.allowed).toEqual(["acknowledged", "rejected"]);

    // The issue must not have moved.
    const after = await prisma.issue.findUniqueOrThrow({ where: { id: issueId } });
    expect(after.status).toBe("reported");
  });

  it("refuses to resolve without a resolution note (422)", async () => {
    const { category, department } = await seedCategoryWithDepartment({
      categoryCode: `lc-note-${Date.now()}`,
    });
    const citizen = await createTestUser("citizen");
    const admin = await createTestUser("dept_admin", department.id);

    const citizenToken = await loginAs(citizen.email, citizen.password);
    const adminToken = await loginAs(admin.email, admin.password);
    const issueId = await reportIssue(citizenToken, category.code);

    const patch = (body: Record<string, unknown>) =>
      request(app).patch(`/issues/${issueId}/status`).set("Authorization", `Bearer ${adminToken}`).send(body);

    // Walk it legally up to in_progress first.
    expect((await patch({ status: "acknowledged" })).status).toBe(200);
    expect((await patch({ status: "in_progress" })).status).toBe(200);

    // No note, no proof.
    const noNote = await patch({ status: "resolved" });
    expect(noNote.status).toBe(422);
    expect(noNote.body.error.message).toMatch(/resolution note is required/i);

    // Note but still no proof photo.
    const noProof = await patch({ status: "resolved", resolutionNote: "Fixed it" });
    expect(noProof.status).toBe(422);
    expect(noProof.body.error.message).toMatch(/proof-of-resolution photo is required/i);

    // With both, it goes through.
    const ok = await patch({
      status: "resolved",
      resolutionNote: "Pothole filled and compacted.",
      proofUrl: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
    });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe("resolved");
  });
});

describe("analytics", () => {
  it("returns real aggregates, not nulls", async () => {
    // Guarantee at least one fully resolved issue so the duration
    // percentiles have something to compute from.
    const { category, department } = await seedCategoryWithDepartment({ categoryCode: `an-${Date.now()}` });
    const citizen = await createTestUser("citizen");
    const admin = await createTestUser("dept_admin", department.id);
    const citizenToken = await loginAs(citizen.email, citizen.password);
    const adminToken = await loginAs(admin.email, admin.password);

    const issueId = await reportIssue(citizenToken, category.code);
    const patch = (body: Record<string, unknown>) =>
      request(app).patch(`/issues/${issueId}/status`).set("Authorization", `Bearer ${adminToken}`).send(body);
    await patch({ status: "acknowledged" });
    await patch({ status: "in_progress" });
    await patch({
      status: "resolved",
      resolutionNote: "Done.",
      proofUrl: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
    });

    const res = await request(app).get("/analytics/overview");
    expect(res.status).toBe(200);

    expect(res.body.totals.issues).toBeGreaterThan(0);
    expect(res.body.totals.resolved).toBeGreaterThan(0);
    expect(Array.isArray(res.body.byStatus)).toBe(true);
    expect(res.body.byStatus.length).toBeGreaterThan(0);
    expect(res.body.byCategory.length).toBeGreaterThan(0);

    // The whole point of sourcing durations from issue_status_history:
    // once anything is resolved these stop being null.
    expect(res.body.resolutionTime.avgHours).not.toBeNull();
    expect(res.body.resolutionTime.avgHours).toBeGreaterThanOrEqual(0);
    expect(res.body.resolutionTime.p90Hours).not.toBeNull();

    // Counts must be numbers, never bigint-as-string leaking out of SQL.
    for (const row of res.body.byStatus) {
      expect(typeof row.count).toBe("number");
    }
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
