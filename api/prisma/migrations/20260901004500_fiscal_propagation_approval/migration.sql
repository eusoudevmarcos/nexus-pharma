CREATE TABLE "fiscal_propagation_proposals" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "source_category_id" UUID NOT NULL,
  "target_category_id" UUID NOT NULL,
  "created_by_id" UUID NOT NULL,
  "reviewed_by_id" UUID,
  "status" "BulkWorkflowStatus" NOT NULL DEFAULT 'VALIDATED',
  "base_hash" CHAR(64) NOT NULL,
  "source_snapshot" JSONB NOT NULL,
  "target_snapshot" JSONB NOT NULL,
  "differences" JSONB NOT NULL,
  "impact_summary" JSONB NOT NULL,
  "rejection_reason" VARCHAR(1000),
  "submitted_at" TIMESTAMPTZ(3),
  "reviewed_at" TIMESTAMPTZ(3),
  "applied_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "fiscal_propagation_proposals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "fiscal_propagation_proposals_company_id_status_created_at_idx"
  ON "fiscal_propagation_proposals"("company_id", "status", "created_at");
CREATE INDEX "fiscal_propagation_proposals_source_category_id_status_idx"
  ON "fiscal_propagation_proposals"("source_category_id", "status");
CREATE INDEX "fiscal_propagation_proposals_target_category_id_status_idx"
  ON "fiscal_propagation_proposals"("target_category_id", "status");

ALTER TABLE "fiscal_propagation_proposals"
  ADD CONSTRAINT "fiscal_propagation_proposals_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "fiscal_propagation_proposals_source_category_id_fkey" FOREIGN KEY ("source_category_id") REFERENCES "fiscal_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "fiscal_propagation_proposals_target_category_id_fkey" FOREIGN KEY ("target_category_id") REFERENCES "fiscal_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "fiscal_propagation_proposals_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "fiscal_propagation_proposals_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
