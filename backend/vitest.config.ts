import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Redirects DATABASE_URL to TEST_DATABASE_URL before any PrismaClient
    // is constructed, so the suite can never write to the dev database.
    setupFiles: ["./tests/setup.ts"],
    // The suite talks to a hosted Postgres, and the lifecycle cases make
    // several sequential round-trips each. 5s is not enough over that RTT.
    testTimeout: 45_000,
    hookTimeout: 45_000,
  },
});
