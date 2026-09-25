-- DropIndex
DROP INDEX "issue_status_history_to_status_created_at_idx";

-- DropIndex
DROP INDEX "issues_location_gist";

-- AlterTable
ALTER TABLE "audit_log" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "category_department_rules" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "citizen_verifications" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "departments" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "issue_categories" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "issue_media" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "issue_reports" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "issue_status_history" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "issue_supports" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "issues" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable: add city column and drop id default
ALTER TABLE "users" ADD COLUMN "city" TEXT,
ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "work_orders" ALTER COLUMN "id" DROP DEFAULT;
