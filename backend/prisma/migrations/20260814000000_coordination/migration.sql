-- ── Enums ───────────────────────────────────────────────────────────────
CREATE TYPE "DependencyType" AS ENUM ('finish_to_start', 'start_to_start');
CREATE TYPE "NoteVisibility" AS ENUM ('internal', 'inter_dept', 'citizen');
CREATE TYPE "TransferStatus" AS ENUM ('requested', 'approved', 'rejected', 'cancelled');
CREATE TYPE "NotificationChannel" AS ENUM ('in_app', 'email');
CREATE TYPE "NotificationStatus" AS ENUM ('pending', 'sent', 'failed');

-- ── Work order scheduling / SLA fields ──────────────────────────────────
ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS "ack_due_at" TIMESTAMP(3);
ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS "due_at" TIMESTAMP(3);
ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS "acknowledged_at" TIMESTAMP(3);
ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS "started_at" TIMESTAMP(3);
ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS "breached_at" TIMESTAMP(3);
ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS "escalation_level" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS "sla_policy_id" UUID;

CREATE INDEX IF NOT EXISTS "work_orders_due_at_idx" ON "work_orders"("due_at");
CREATE INDEX IF NOT EXISTS "work_orders_breached_at_idx" ON "work_orders"("breached_at");

-- ── SLA policies ────────────────────────────────────────────────────────
-- Resolved most-specific-first: an exact (category, department, priority)
-- row wins over a category-wide default.
CREATE TABLE "sla_policies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "category_id" UUID,
    "department_id" UUID,
    "priority" INTEGER,
    "ack_minutes" INTEGER NOT NULL,
    "resolve_minutes" INTEGER NOT NULL,
    "business_hours_only" BOOLEAN NOT NULL DEFAULT false,
    /* Ordered list of {level, afterMinutes, notifyRole, notifyDepartmentHead} */
    "escalation_chain" JSONB NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sla_policies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sla_policies_scope_key"
    ON "sla_policies"(COALESCE("category_id", '00000000-0000-0000-0000-000000000000'::uuid),
                      COALESCE("department_id", '00000000-0000-0000-0000-000000000000'::uuid),
                      COALESCE("priority", -1));
ALTER TABLE "sla_policies" ADD CONSTRAINT "sla_policies_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "issue_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sla_policies" ADD CONSTRAINT "sla_policies_department_id_fkey"
    FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_sla_policy_id_fkey"
    FOREIGN KEY ("sla_policy_id") REFERENCES "sla_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Work order dependencies ─────────────────────────────────────────────
CREATE TABLE "work_order_dependencies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "predecessor_id" UUID NOT NULL,
    "successor_id" UUID NOT NULL,
    "type" "DependencyType" NOT NULL DEFAULT 'finish_to_start',
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "work_order_dependencies_pkey" PRIMARY KEY ("id"),
    -- A work order can never depend on itself.
    CONSTRAINT "work_order_dependencies_no_self" CHECK ("predecessor_id" <> "successor_id")
);
CREATE UNIQUE INDEX "work_order_dependencies_predecessor_id_successor_id_key"
    ON "work_order_dependencies"("predecessor_id", "successor_id");
CREATE INDEX "work_order_dependencies_successor_id_idx" ON "work_order_dependencies"("successor_id");
ALTER TABLE "work_order_dependencies" ADD CONSTRAINT "work_order_dependencies_predecessor_id_fkey"
    FOREIGN KEY ("predecessor_id") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_order_dependencies" ADD CONSTRAINT "work_order_dependencies_successor_id_fkey"
    FOREIGN KEY ("successor_id") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_order_dependencies" ADD CONSTRAINT "work_order_dependencies_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Inter-department notes ──────────────────────────────────────────────
CREATE TABLE "work_order_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "work_order_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "visibility" "NoteVisibility" NOT NULL DEFAULT 'internal',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "work_order_notes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "work_order_notes_work_order_id_created_at_idx"
    ON "work_order_notes"("work_order_id", "created_at");
ALTER TABLE "work_order_notes" ADD CONSTRAINT "work_order_notes_work_order_id_fkey"
    FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_order_notes" ADD CONSTRAINT "work_order_notes_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Departmental referral with an approval step ─────────────────────────
CREATE TABLE "work_order_transfers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "work_order_id" UUID NOT NULL,
    "from_department_id" UUID NOT NULL,
    "to_department_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "requested_by" UUID NOT NULL,
    "approved_by" UUID,
    "status" "TransferStatus" NOT NULL DEFAULT 'requested',
    "decision_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMP(3),
    CONSTRAINT "work_order_transfers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "work_order_transfers_distinct_depts" CHECK ("from_department_id" <> "to_department_id")
);
CREATE INDEX "work_order_transfers_work_order_id_idx" ON "work_order_transfers"("work_order_id");
CREATE INDEX "work_order_transfers_to_department_id_status_idx"
    ON "work_order_transfers"("to_department_id", "status");
ALTER TABLE "work_order_transfers" ADD CONSTRAINT "work_order_transfers_work_order_id_fkey"
    FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_order_transfers" ADD CONSTRAINT "work_order_transfers_from_department_id_fkey"
    FOREIGN KEY ("from_department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_order_transfers" ADD CONSTRAINT "work_order_transfers_to_department_id_fkey"
    FOREIGN KEY ("to_department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_order_transfers" ADD CONSTRAINT "work_order_transfers_requested_by_fkey"
    FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_order_transfers" ADD CONSTRAINT "work_order_transfers_approved_by_fkey"
    FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── SLA escalations ─────────────────────────────────────────────────────
CREATE TABLE "escalations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "work_order_id" UUID NOT NULL,
    "level" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "breached_at" TIMESTAMP(3) NOT NULL,
    "overdue_minutes" INTEGER NOT NULL,
    "notified_user_id" UUID,
    "acknowledged_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "escalations_pkey" PRIMARY KEY ("id")
);
-- One escalation per work order per level; the sweeper is idempotent.
CREATE UNIQUE INDEX "escalations_work_order_id_level_key" ON "escalations"("work_order_id", "level");
CREATE INDEX "escalations_created_at_idx" ON "escalations"("created_at");
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_work_order_id_fkey"
    FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_notified_user_id_fkey"
    FOREIGN KEY ("notified_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Notifications ───────────────────────────────────────────────────────
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "recipient_id" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'in_app',
    "template" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" "NotificationStatus" NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "sent_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "notifications_recipient_id_read_at_idx" ON "notifications"("recipient_id", "read_at");
CREATE INDEX "notifications_status_idx" ON "notifications"("status");
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_fkey"
    FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Per-user notification preferences already existed only in the frontend
-- mock; give them a real home so the fan-out can honour them.
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "in_app_enabled" BOOLEAN NOT NULL DEFAULT true,
    "email_enabled" BOOLEAN NOT NULL DEFAULT true,
    "status_changes" BOOLEAN NOT NULL DEFAULT true,
    "assignments" BOOLEAN NOT NULL DEFAULT true,
    "sla_alerts" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "notification_preferences_user_id_key" ON "notification_preferences"("user_id");
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Drop gen_random_uuid() defaults from tables created in this migration
-- (Prisma manages IDs in the application layer from this migration onward).
ALTER TABLE "sla_policies" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "work_order_dependencies" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "work_order_notes" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "work_order_transfers" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "escalations" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "notifications" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "notification_preferences" ALTER COLUMN "id" DROP DEFAULT;
