import "dotenv/config";

// Tests must NEVER touch the dev/production database. TEST_DATABASE_URL is
// a separate database (neondb_test) with the same migrations applied; we
// swap it into DATABASE_URL before any module constructs a PrismaClient.
const testUrl = process.env.TEST_DATABASE_URL;

if (!testUrl) {
  throw new Error(
    "TEST_DATABASE_URL is not set. Refusing to run tests against DATABASE_URL — " +
      "set TEST_DATABASE_URL to an isolated test database (see .env.example)."
  );
}

if (testUrl === process.env.DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL must not be the same as DATABASE_URL.");
}

process.env.DATABASE_URL = testUrl;
process.env.DIRECT_URL = testUrl;
process.env.NODE_ENV = "test";
