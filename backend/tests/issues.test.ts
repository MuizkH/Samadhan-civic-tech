import { describe, it, expect, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import { app, createTestUser, seedCategoryWithDepartment, insertRawIssue } from "./helpers/testApp.js";
import { prisma } from "../src/shared/lib/prisma.js";

const ai = vi.hoisted(() => ({
  complete: vi.fn(),
}));

vi.mock("../src/modules/ai/providers/index.js", () => ({
  complete: ai.complete,
  aiEnabled: () => true,
  visionEnabled: () => true,
}));

async function loginAs(email: string, password: string) {
  const res = await request(app).post("/auth/login").send({ email, password });
  return res.body.accessToken as string;
}

describe("issue dedup + routing pipeline", () => {
  beforeEach(() => {
    ai.complete.mockReset();
    ai.complete.mockResolvedValue({
      data: {
        is_duplicate: false,
        confidence_score: 12,
        reasoning: "The complaints are near each other but describe different visible problems.",
      },
      provider: "test",
      model: "test",
      latencyMs: 0,
    });
  });

  it("creates a new issue and its work order when no nearby duplicate exists (dedup miss)", async () => {
    const { category, department } = await seedCategoryWithDepartment({
      categoryCode: `roads-${Date.now()}`,
    });
    const { email, password } = await createTestUser("citizen");
    const token = await loginAs(email, password);

    const res = await request(app).post("/issues").set("Authorization", `Bearer ${token}`).send({
      title: "Pothole near market",
      description: "Deep pothole causing traffic issues",
      categoryCode: category.code,
      latitude: 22.7196,
      longitude: 75.8577,
    });

    expect(res.status).toBe(201);
    expect(res.body.issue).toBeTruthy();
    expect(res.body.issue.category.code).toBe(category.code);

    const workOrders = await prisma.workOrder.findMany({ where: { issueId: res.body.issue.id } });
    expect(workOrders).toHaveLength(1);
    expect(workOrders[0].departmentId).toBe(department.id);
    expect(workOrders[0].role).toBe("primary");
  });

  it("returns a duplicateCandidate instead of creating a new issue when AI matches a nearby unresolved complaint", async () => {
    ai.complete.mockResolvedValueOnce({
      data: {
        is_duplicate: true,
        confidence_score: 91,
        reasoning: "Both complaints describe the same overflowing garbage pile at the same spot.",
      },
      provider: "test",
      model: "test",
      latencyMs: 0,
    });

    const { category } = await seedCategoryWithDepartment({
      categoryCode: `sanitation-${Date.now()}`,
    });
    const { user, email, password } = await createTestUser("citizen");
    const token = await loginAs(email, password);

    const existingIssueId = await insertRawIssue({
      categoryId: category.id,
      reportedBy: user.id,
      latitude: 22.72,
      longitude: 75.86,
      title: "Existing garbage report",
    });

    // Report the "same" issue within 10 meters.
    const res = await request(app).post("/issues").set("Authorization", `Bearer ${token}`).send({
      title: "Garbage pile nearby",
      description: "Same overflowing bin, different angle",
      categoryCode: category.code,
      latitude: 22.72004,
      longitude: 75.86002,
    });

    expect(res.status).toBe(200);
    expect(res.body.duplicateCandidate).toBeTruthy();
    expect(res.body.duplicateCandidate.id).toBe(existingIssueId);
    expect(res.body.duplicateCandidate.message).toBe(
      "This looks similar to an already reported issue. Is this the same?"
    );
    expect(res.body.duplicateCandidate.ai).toEqual({
      is_duplicate: true,
      confidence_score: 91,
      reasoning: "Both complaints describe the same overflowing garbage pile at the same spot.",
    });

    const totalIssuesWithThatCategory = await prisma.issue.count({ where: { categoryId: category.id } });
    expect(totalIssuesWithThatCategory).toBe(1); // no new row inserted
  });

  it("creates a new issue when nearby complaints exist but AI says they are different", async () => {
    const { category } = await seedCategoryWithDepartment({
      categoryCode: `mixed-${Date.now()}`,
    });
    const { user, email, password } = await createTestUser("citizen");
    const token = await loginAs(email, password);

    await insertRawIssue({
      categoryId: category.id,
      reportedBy: user.id,
      latitude: 22.72,
      longitude: 75.86,
      title: "Broken streetlight",
    });

    const res = await request(app).post("/issues").set("Authorization", `Bearer ${token}`).send({
      title: "Pothole under streetlight",
      description: "A pothole is directly below the light pole",
      categoryCode: category.code,
      latitude: 22.72004,
      longitude: 75.86002,
    });

    expect(res.status).toBe(201);
    expect(res.body.issue).toBeTruthy();
    expect(ai.complete).toHaveBeenCalled();

    const totalIssuesWithThatCategory = await prisma.issue.count({ where: { categoryId: category.id } });
    expect(totalIssuesWithThatCategory).toBe(2);
  });

  it("creates a new issue when the user rejects the duplicate warning and force is set", async () => {
    const { category } = await seedCategoryWithDepartment({
      categoryCode: `forced-${Date.now()}`,
    });
    const { user, email, password } = await createTestUser("citizen");
    const token = await loginAs(email, password);

    await insertRawIssue({
      categoryId: category.id,
      reportedBy: user.id,
      latitude: 22.72,
      longitude: 75.86,
      title: "Existing issue",
    });

    const res = await request(app).post("/issues").set("Authorization", `Bearer ${token}`).send({
      title: "Different issue",
      description: "Citizen says this is not the same issue",
      categoryCode: category.code,
      latitude: 22.72004,
      longitude: 75.86002,
      force: true,
    });

    expect(res.status).toBe(201);
    expect(res.body.issue).toBeTruthy();
    expect(ai.complete).not.toHaveBeenCalled();
  });

  it("does NOT dedup a report outside the 10-meter radius", async () => {
    const { category } = await seedCategoryWithDepartment({
      categoryCode: `elec-${Date.now()}`,
      radiusM: 50,
    });
    const { user, email, password } = await createTestUser("citizen");
    const token = await loginAs(email, password);

    await insertRawIssue({ categoryId: category.id, reportedBy: user.id, latitude: 22.72, longitude: 75.86 });

    // ~1km away — outside the fixed 10m AI dedup search radius.
    const res = await request(app).post("/issues").set("Authorization", `Bearer ${token}`).send({
      title: "Unrelated outage",
      description: "Different location entirely",
      categoryCode: category.code,
      latitude: 22.73,
      longitude: 75.86,
    });

    expect(res.status).toBe(201);
    expect(res.body.issue).toBeTruthy();
    expect(ai.complete).not.toHaveBeenCalled();
  });
});

describe("work order status transitions", () => {
  it("rejects an invalid transition (pending -> done, skipping acknowledged/in_progress)", async () => {
    const { category, department } = await seedCategoryWithDepartment({
      categoryCode: `buildings-${Date.now()}`,
    });
    const { email: citizenEmail, password: citizenPassword } = await createTestUser("citizen");
    const citizenToken = await loginAs(citizenEmail, citizenPassword);

    const create = await request(app).post("/issues").set("Authorization", `Bearer ${citizenToken}`).send({
      title: "Cracked wall",
      description: "Visible crack",
      categoryCode: category.code,
      latitude: 23.2599,
      longitude: 77.4126,
    });

    const workOrder = await prisma.workOrder.findFirstOrThrow({ where: { issueId: create.body.issue.id } });

    const { email: adminEmail, password: adminPassword } = await createTestUser("dept_admin", department.id);
    const adminToken = await loginAs(adminEmail, adminPassword);

    const res = await request(app)
      .patch(`/work-orders/${workOrder.id}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "done" });

    // 422, not 400: the request is well-formed, the state change is what's
    // rejected. Matches the issue lifecycle endpoint's contract.
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("ILLEGAL_TRANSITION");
  });

  it("accepts a valid transition and propagates status to the parent issue for a primary work order", async () => {
    const { category, department } = await seedCategoryWithDepartment({
      categoryCode: `parks-${Date.now()}`,
    });
    const { email: citizenEmail, password: citizenPassword } = await createTestUser("citizen");
    const citizenToken = await loginAs(citizenEmail, citizenPassword);

    const create = await request(app).post("/issues").set("Authorization", `Bearer ${citizenToken}`).send({
      title: "Broken swing",
      description: "Unsafe for kids",
      categoryCode: category.code,
      latitude: 23.2599,
      longitude: 77.4126,
    });

    const workOrder = await prisma.workOrder.findFirstOrThrow({ where: { issueId: create.body.issue.id } });

    const { email: adminEmail, password: adminPassword } = await createTestUser("dept_admin", department.id);
    const adminToken = await loginAs(adminEmail, adminPassword);

    const res = await request(app)
      .patch(`/work-orders/${workOrder.id}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "acknowledged" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("acknowledged");

    const issue = await prisma.issue.findUniqueOrThrow({ where: { id: create.body.issue.id } });
    expect(issue.status).toBe("acknowledged");
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
