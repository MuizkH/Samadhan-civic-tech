-- Full civic issue lifecycle:
--   reported -> acknowledged -> in_progress -> resolved -> verified -> closed
-- plus rejected (any active state) and reopened (from resolved/rejected).
ALTER TYPE "IssueStatus" ADD VALUE IF NOT EXISTS 'verified';
ALTER TYPE "IssueStatus" ADD VALUE IF NOT EXISTS 'reopened';

-- Resolution evidence: a note is mandatory on -> resolved, and a
-- resolution_proof photo must exist in issue_media (enforced in the service
-- layer, which can produce a useful 422 instead of an FK error).
ALTER TABLE "issues" ADD COLUMN IF NOT EXISTS "resolution_note" TEXT;
ALTER TABLE "issues" ADD COLUMN IF NOT EXISTS "resolved_by" UUID;
ALTER TABLE "issues" ADD COLUMN IF NOT EXISTS "verified_at" TIMESTAMP(3);
ALTER TABLE "issues" ADD COLUMN IF NOT EXISTS "reopen_count" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "issues"
  ADD CONSTRAINT "issues_resolved_by_fkey"
  FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Citizen verification votes, replacing the localStorage-only implementation.
-- One vote per (issue, user); vote is a confirm/dispute boolean.
CREATE TABLE "citizen_verifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "issue_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "vote" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "citizen_verifications_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "citizen_verifications_issue_id_user_id_key"
    ON "citizen_verifications"("issue_id", "user_id");
CREATE INDEX "citizen_verifications_issue_id_idx" ON "citizen_verifications"("issue_id");
ALTER TABLE "citizen_verifications" ADD CONSTRAINT "citizen_verifications_issue_id_fkey"
    FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "citizen_verifications" ADD CONSTRAINT "citizen_verifications_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Analytics reads status timestamps out of the append-only history table.
CREATE INDEX IF NOT EXISTS "issue_status_history_to_status_created_at_idx"
    ON "issue_status_history"("to_status", "created_at");
