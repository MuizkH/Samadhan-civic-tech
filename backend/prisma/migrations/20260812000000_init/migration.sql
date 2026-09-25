-- Enable PostGIS before any geography columns are created.
CREATE EXTENSION IF NOT EXISTS postgis;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
CREATE TYPE "UserRole" AS ENUM ('citizen', 'dept_admin', 'super_admin');
CREATE TYPE "IssueStatus" AS ENUM ('reported', 'acknowledged', 'in_progress', 'resolved', 'rejected', 'closed');
CREATE TYPE "WorkOrderRole" AS ENUM ('primary', 'supporting', 'notify');
CREATE TYPE "WorkOrderStatus" AS ENUM ('pending', 'acknowledged', 'in_progress', 'done', 'rejected');
CREATE TYPE "MediaKind" AS ENUM ('evidence', 'resolution_proof');

-- ---------------------------------------------------------------------------
-- departments
-- ---------------------------------------------------------------------------
CREATE TABLE "departments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_hi" TEXT NOT NULL,
    "parent_id" UUID,
    "contact" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "departments_code_key" ON "departments"("code");
ALTER TABLE "departments" ADD CONSTRAINT "departments_parent_id_fkey"
    FOREIGN KEY ("parent_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- issue_categories
-- ---------------------------------------------------------------------------
CREATE TABLE "issue_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_hi" TEXT NOT NULL,
    "default_department_id" UUID NOT NULL,
    "default_priority" INTEGER NOT NULL DEFAULT 3,
    "dedup_radius_m" INTEGER NOT NULL DEFAULT 75,
    "dedup_window_hours" INTEGER NOT NULL DEFAULT 72,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "issue_categories_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "issue_categories_code_key" ON "issue_categories"("code");
ALTER TABLE "issue_categories" ADD CONSTRAINT "issue_categories_default_department_id_fkey"
    FOREIGN KEY ("default_department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- category_department_rules (data-driven routing)
-- ---------------------------------------------------------------------------
CREATE TABLE "category_department_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "category_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "role" "WorkOrderRole" NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 3,
    CONSTRAINT "category_department_rules_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "category_department_rules_category_id_department_id_role_key"
    ON "category_department_rules"("category_id", "department_id", "role");
ALTER TABLE "category_department_rules" ADD CONSTRAINT "category_department_rules_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "issue_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "category_department_rules" ADD CONSTRAINT "category_department_rules_department_id_fkey"
    FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'citizen',
    "department_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "users_department_id_role_idx" ON "users"("department_id", "role");
ALTER TABLE "users" ADD CONSTRAINT "users_department_id_fkey"
    FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- issues (PostGIS geography column + GIST index)
-- ---------------------------------------------------------------------------
CREATE TABLE "issues" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "public_ref" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category_id" UUID NOT NULL,
    "status" "IssueStatus" NOT NULL DEFAULT 'reported',
    "location" geography(Point, 4326) NOT NULL,
    "address" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 3,
    "reported_by" UUID NOT NULL,
    "dedup_cluster_id" UUID,
    "supports_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    CONSTRAINT "issues_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "issues_public_ref_key" ON "issues"("public_ref");
CREATE INDEX "issues_category_id_status_created_at_idx" ON "issues"("category_id", "status", "created_at");
CREATE INDEX "issues_location_gist" ON "issues" USING GIST ("location");
ALTER TABLE "issues" ADD CONSTRAINT "issues_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "issue_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "issues" ADD CONSTRAINT "issues_reported_by_fkey"
    FOREIGN KEY ("reported_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- issue_supports
-- ---------------------------------------------------------------------------
CREATE TABLE "issue_supports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "issue_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "issue_supports_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "issue_supports_issue_id_user_id_key" ON "issue_supports"("issue_id", "user_id");
ALTER TABLE "issue_supports" ADD CONSTRAINT "issue_supports_issue_id_fkey"
    FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- issue_reports (append-only per-citizen report against an issue)
-- ---------------------------------------------------------------------------
CREATE TABLE "issue_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "issue_id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "issue_reports_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "issue_reports_issue_id_idx" ON "issue_reports"("issue_id");
ALTER TABLE "issue_reports" ADD CONSTRAINT "issue_reports_issue_id_fkey"
    FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "issue_reports" ADD CONSTRAINT "issue_reports_reporter_id_fkey"
    FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- issue_media
-- ---------------------------------------------------------------------------
CREATE TABLE "issue_media" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "issue_id" UUID NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "url" TEXT NOT NULL,
    "public_id" TEXT NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "issue_media_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "issue_media_issue_id_idx" ON "issue_media"("issue_id");
ALTER TABLE "issue_media" ADD CONSTRAINT "issue_media_issue_id_fkey"
    FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "issue_media" ADD CONSTRAINT "issue_media_uploaded_by_fkey"
    FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- work_orders
-- ---------------------------------------------------------------------------
CREATE TABLE "work_orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "issue_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "role" "WorkOrderRole" NOT NULL,
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'pending',
    "assignee_id" UUID,
    "priority" INTEGER NOT NULL DEFAULT 3,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    CONSTRAINT "work_orders_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "work_orders_department_id_status_idx" ON "work_orders"("department_id", "status");
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_issue_id_fkey"
    FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_department_id_fkey"
    FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_assignee_id_fkey"
    FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- issue_status_history (append-only)
-- ---------------------------------------------------------------------------
CREATE TABLE "issue_status_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "issue_id" UUID NOT NULL,
    "work_order_id" UUID,
    "from_status" TEXT,
    "to_status" TEXT NOT NULL,
    "actor_id" UUID NOT NULL,
    "actor_role" "UserRole" NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "issue_status_history_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "issue_status_history_issue_id_created_at_idx" ON "issue_status_history"("issue_id", "created_at");
ALTER TABLE "issue_status_history" ADD CONSTRAINT "issue_status_history_issue_id_fkey"
    FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "issue_status_history" ADD CONSTRAINT "issue_status_history_work_order_id_fkey"
    FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "issue_status_history" ADD CONSTRAINT "issue_status_history_actor_id_fkey"
    FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- audit_log (append-only)
-- ---------------------------------------------------------------------------
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ip_hash" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "audit_log_entity_type_entity_id_idx" ON "audit_log"("entity_type", "entity_id");
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_fkey"
    FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Self-referencing FK on departments (parent_id) needs departments to exist
-- first — already declared above with ON DELETE SET NULL.
-- ---------------------------------------------------------------------------
