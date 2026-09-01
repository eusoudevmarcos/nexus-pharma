CREATE TYPE "BulkWorkflowStatus" AS ENUM ('VALIDATED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'APPLIED', 'FAILED');
CREATE TYPE "ProductImportRowAction" AS ENUM ('CREATE', 'UPDATE');

ALTER TABLE "products"
  ADD COLUMN "composition" VARCHAR(1000) NOT NULL DEFAULT '',
  ADD COLUMN "anvisa_registration" VARCHAR(30);

CREATE INDEX "products_company_id_anvisa_registration_idx"
  ON "products"("company_id", "anvisa_registration");

CREATE TABLE "product_import_batches" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "created_by_id" UUID NOT NULL,
  "reviewed_by_id" UUID,
  "file_name" VARCHAR(255) NOT NULL,
  "file_type" VARCHAR(12) NOT NULL,
  "payload_hash" CHAR(64) NOT NULL,
  "status" "BulkWorkflowStatus" NOT NULL DEFAULT 'VALIDATED',
  "row_count" INTEGER NOT NULL,
  "valid_row_count" INTEGER NOT NULL,
  "error_row_count" INTEGER NOT NULL,
  "summary" JSONB NOT NULL DEFAULT '{}',
  "rejection_reason" VARCHAR(1000),
  "submitted_at" TIMESTAMPTZ(3),
  "reviewed_at" TIMESTAMPTZ(3),
  "applied_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "product_import_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_import_rows" (
  "id" UUID NOT NULL,
  "batch_id" UUID NOT NULL,
  "existing_product_id" UUID,
  "row_number" INTEGER NOT NULL,
  "action" "ProductImportRowAction" NOT NULL,
  "raw_data" JSONB NOT NULL,
  "normalized_data" JSONB NOT NULL,
  "errors" JSONB NOT NULL DEFAULT '[]',
  "warnings" JSONB NOT NULL DEFAULT '[]',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_import_rows_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "product_import_batches_company_id_status_created_at_idx"
  ON "product_import_batches"("company_id", "status", "created_at");
CREATE INDEX "product_import_batches_payload_hash_idx"
  ON "product_import_batches"("payload_hash");
CREATE UNIQUE INDEX "product_import_rows_batch_id_row_number_key"
  ON "product_import_rows"("batch_id", "row_number");
CREATE INDEX "product_import_rows_existing_product_id_idx"
  ON "product_import_rows"("existing_product_id");

ALTER TABLE "product_import_batches"
  ADD CONSTRAINT "product_import_batches_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "product_import_batches_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "product_import_batches_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "product_import_rows"
  ADD CONSTRAINT "product_import_rows_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "product_import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "product_import_rows_existing_product_id_fkey" FOREIGN KEY ("existing_product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
