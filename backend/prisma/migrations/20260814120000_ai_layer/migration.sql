-- NOTE: the PostGIS GiST index on issues.location is intentionally kept.
-- Prisma cannot represent it in schema.prisma, so migrate diff proposes
-- dropping it every time. Dedup queries depend on it.

-- AlterTable
ALTER TABLE "issue_media" ADD COLUMN     "ai_verification" JSONB;

-- AlterTable
ALTER TABLE "issues" ADD COLUMN     "ai_suggested_category" TEXT,
ADD COLUMN     "ai_suggested_priority" INTEGER,
ADD COLUMN     "ai_suggestion_confidence" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "ai_calls" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" UUID,
    "latency_ms" INTEGER NOT NULL,
    "prompt_tokens" INTEGER,
    "output_tokens" INTEGER,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coordination_plans" (
    "id" UUID NOT NULL,
    "issue_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "plan" JSONB NOT NULL,
    "rationale" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'suggested',
    "applied_at" TIMESTAMP(3),
    "overridden_by" UUID,
    "override_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coordination_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_calls_kind_created_at_idx" ON "ai_calls"("kind", "created_at");

-- CreateIndex
CREATE INDEX "coordination_plans_issue_id_idx" ON "coordination_plans"("issue_id");

-- AddForeignKey
ALTER TABLE "coordination_plans" ADD CONSTRAINT "coordination_plans_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coordination_plans" ADD CONSTRAINT "coordination_plans_overridden_by_fkey" FOREIGN KEY ("overridden_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

