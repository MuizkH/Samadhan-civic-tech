-- City-based jurisdiction scoping for staff accounts.
--
-- `users.city` was already added by 20260813054416_add_user_city but was never
-- declared in schema.prisma, so Prisma could not see it. The IF NOT EXISTS
-- guard makes this migration safe on databases that did and did not get it.

-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "city" TEXT;

-- AlterTable
ALTER TABLE "issues" ADD COLUMN IF NOT EXISTS "city" TEXT;

-- Backfill issues.city from the existing reverse-geocoded address strings,
-- which follow the "<area>, <city>, <state>" convention. The city is the
-- SECOND-TO-LAST segment, not the second: several seeded areas contain their
-- own comma ("New Market, TT Nagar, Bhopal, Madhya Pradesh"), so splitting
-- from the left picks up the area's tail instead of the city.
UPDATE "issues"
SET "city" = btrim(
      (string_to_array("address", ','))[
        array_length(string_to_array("address", ','), 1) - 1
      ]
    )
WHERE "city" IS NULL
  AND "address" IS NOT NULL
  AND array_length(string_to_array("address", ','), 1) >= 2;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "issues_city_status_created_at_idx" ON "issues" ("city", "status", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "users_city_idx" ON "users" ("city");

-- The 20260813054416 migration dropped the spatial index on issues.location
-- (it is an Unsupported column, so Prisma's differ cannot see it and kept
-- emitting the DROP). Restore it — the dedup radius check and the map bbox
-- filter both do ST_ lookups that go sequential without it.
CREATE INDEX IF NOT EXISTS "issues_location_gist" ON "issues" USING GIST ("location");
