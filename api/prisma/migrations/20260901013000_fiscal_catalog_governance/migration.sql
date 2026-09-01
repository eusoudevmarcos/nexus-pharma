ALTER TABLE "fiscal_matrix_rules"
  ADD COLUMN "evidence_hash" CHAR(64),
  ADD COLUMN "imported_by_id" UUID,
  ADD COLUMN "reviewed_by_id" UUID,
  ADD COLUMN "reviewed_at" TIMESTAMPTZ(3),
  ADD COLUMN "review_notes" VARCHAR(1000);

CREATE INDEX "fiscal_matrix_rules_evidence_hash_status_idx"
  ON "fiscal_matrix_rules"("evidence_hash", "status");

ALTER TABLE "fiscal_matrix_rules"
  ADD CONSTRAINT "fiscal_matrix_rules_imported_by_id_fkey"
  FOREIGN KEY ("imported_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "fiscal_matrix_rules"
  ADD CONSTRAINT "fiscal_matrix_rules_reviewed_by_id_fkey"
  FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
