CREATE TYPE "AccessReviewStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED');
CREATE TYPE "AccessReviewDecision" AS ENUM ('PENDING', 'CONFIRMED', 'ADJUSTMENT_REQUIRED', 'REVOKED');

CREATE TABLE "access_review_campaigns" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "period_label" VARCHAR(80) NOT NULL,
  "status" "AccessReviewStatus" NOT NULL DEFAULT 'OPEN',
  "due_at" TIMESTAMPTZ(3) NOT NULL,
  "snapshot_hash" CHAR(64) NOT NULL,
  "notes" TEXT,
  "created_by_id" UUID NOT NULL,
  "completed_by_id" UUID,
  "completed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "access_review_campaigns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "access_review_items" (
  "id" UUID NOT NULL,
  "campaign_id" UUID NOT NULL,
  "membership_id" UUID NOT NULL,
  "user_name_snapshot" VARCHAR(160) NOT NULL,
  "user_email_snapshot" VARCHAR(254) NOT NULL,
  "role_snapshot" "TenantRole" NOT NULL,
  "active_snapshot" BOOLEAN NOT NULL,
  "decision" "AccessReviewDecision" NOT NULL DEFAULT 'PENDING',
  "justification" TEXT,
  "reviewed_by_id" UUID,
  "reviewed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "access_review_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "access_review_items_campaign_id_membership_id_key"
  ON "access_review_items"("campaign_id", "membership_id");
CREATE INDEX "access_review_campaigns_company_id_status_due_at_idx"
  ON "access_review_campaigns"("company_id", "status", "due_at");
CREATE INDEX "access_review_campaigns_created_by_id_created_at_idx"
  ON "access_review_campaigns"("created_by_id", "created_at");
CREATE INDEX "access_review_items_campaign_id_decision_idx"
  ON "access_review_items"("campaign_id", "decision");
CREATE INDEX "access_review_items_membership_id_created_at_idx"
  ON "access_review_items"("membership_id", "created_at");

ALTER TABLE "access_review_campaigns" ADD CONSTRAINT "access_review_campaigns_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "access_review_campaigns" ADD CONSTRAINT "access_review_campaigns_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "access_review_campaigns" ADD CONSTRAINT "access_review_campaigns_completed_by_id_fkey"
  FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "access_review_items" ADD CONSTRAINT "access_review_items_campaign_id_fkey"
  FOREIGN KEY ("campaign_id") REFERENCES "access_review_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "access_review_items" ADD CONSTRAINT "access_review_items_membership_id_fkey"
  FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "access_review_items" ADD CONSTRAINT "access_review_items_reviewed_by_id_fkey"
  FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
