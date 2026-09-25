import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app, createTestUser } from "./helpers/testApp.js";
import { prisma } from "../src/shared/lib/prisma.js";

describe("auth flow", () => {
  const email = `auth-test-${Date.now()}@test.samadhan`;
  const password = "TestPass123!";

  it("registers a new citizen", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ email, password, fullName: "Auth Test User" });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe("citizen");
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
  });

  it("rejects duplicate registration", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ email, password, fullName: "Auth Test User" });
    expect(res.status).toBe(409);
  });

  it("logs in with correct credentials", async () => {
    const res = await request(app).post("/auth/login").send({ email, password });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
  });

  it("rejects login with wrong password", async () => {
    const res = await request(app).post("/auth/login").send({ email, password: "wrong" });
    expect(res.status).toBe(401);
  });

  it("returns the current user for /auth/me with a valid token", async () => {
    const login = await request(app).post("/auth/login").send({ email, password });
    const me = await request(app).get("/auth/me").set("Authorization", `Bearer ${login.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.email).toBe(email);
  });

  it("rejects /auth/me without a token", async () => {
    const res = await request(app).get("/auth/me");
    expect(res.status).toBe(401);
  });

  it("issues a new access token via refresh", async () => {
    const login = await request(app).post("/auth/login").send({ email, password });
    const refreshed = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: login.body.refreshToken });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.accessToken).toBeTruthy();
  });
});

describe("RBAC", () => {
  it("denies a citizen access to a department queue", async () => {
    const { email, password } = await createTestUser("citizen");
    const login = await request(app).post("/auth/login").send({ email, password });
    const fakeDeptId = "00000000-0000-0000-0000-000000000000";

    const res = await request(app)
      .get(`/departments/${fakeDeptId}/queue`)
      .set("Authorization", `Bearer ${login.body.accessToken}`);

    expect(res.status).toBe(403);
  });

  it("denies a dept_admin access to another department's queue", async () => {
    const dept = await prisma.department.create({
      data: { code: `rbac-dept-${Date.now()}`, nameEn: "X", nameHi: "X" },
    });
    const otherDept = await prisma.department.create({
      data: { code: `rbac-other-${Date.now()}`, nameEn: "Y", nameHi: "Y" },
    });
    const { email, password } = await createTestUser("dept_admin", dept.id);
    const login = await request(app).post("/auth/login").send({ email, password });

    const res = await request(app)
      .get(`/departments/${otherDept.id}/queue`)
      .set("Authorization", `Bearer ${login.body.accessToken}`);

    expect(res.status).toBe(403);
  });

  it("allows a super_admin access to any department's queue", async () => {
    const dept = await prisma.department.create({
      data: { code: `rbac-super-${Date.now()}`, nameEn: "Z", nameHi: "Z" },
    });
    const { email, password } = await createTestUser("super_admin");
    const login = await request(app).post("/auth/login").send({ email, password });

    const res = await request(app)
      .get(`/departments/${dept.id}/queue`)
      .set("Authorization", `Bearer ${login.body.accessToken}`);

    expect(res.status).toBe(200);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
