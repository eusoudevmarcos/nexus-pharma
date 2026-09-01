CREATE TABLE "fiscal_correction_signals" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "analysis_id" UUID NOT NULL,
  "product_id" UUID,
  "category_id" UUID,
  "reviewer_id" UUID NOT NULL,
  "decision" VARCHAR(20) NOT NULL,
  "context_fingerprint" CHAR(64) NOT NULL,
  "suggestion_fingerprint" CHAR(64) NOT NULL,
  "corrected_classification" JSONB NOT NULL DEFAULT '{}',
  "review_notes" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fiscal_correction_signals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fiscal_correction_signals_analysis_id_key"
  ON "fiscal_correction_signals"("analysis_id");
CREATE INDEX "fiscal_correction_signals_company_id_context_fingerprint_decision_created_at_idx"
  ON "fiscal_correction_signals"("company_id", "context_fingerprint", "decision", "created_at");
CREATE INDEX "fiscal_correction_signals_product_id_created_at_idx"
  ON "fiscal_correction_signals"("product_id", "created_at");
CREATE INDEX "fiscal_correction_signals_category_id_created_at_idx"
  ON "fiscal_correction_signals"("category_id", "created_at");

ALTER TABLE "fiscal_correction_signals" ADD CONSTRAINT "fiscal_correction_signals_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fiscal_correction_signals" ADD CONSTRAINT "fiscal_correction_signals_analysis_id_fkey"
  FOREIGN KEY ("analysis_id") REFERENCES "tax_analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fiscal_correction_signals" ADD CONSTRAINT "fiscal_correction_signals_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fiscal_correction_signals" ADD CONSTRAINT "fiscal_correction_signals_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "fiscal_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fiscal_correction_signals" ADD CONSTRAINT "fiscal_correction_signals_reviewer_id_fkey"
  FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
