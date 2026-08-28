CREATE TYPE "TaxProvenanceStatus" AS ENUM (
  'DRAFT',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'SUPERSEDED'
);

CREATE TYPE "TaxCreditTreatment" AS ENUM (
  'NOT_APPLICABLE',
  'ALLOWED',
  'PROHIBITED',
  'PENDING_REVIEW'
);

CREATE TYPE "TaxExitAssessmentStatus" AS ENUM (
  'ALLOWED',
  'NEEDS_REVIEW',
  'BLOCKED'
);

CREATE TABLE "tax_provenances" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "lot_id" UUID NOT NULL,
  "source_access_key" CHAR(44),
  "source_item_number" INTEGER,
  "source_document_number" VARCHAR(60),
  "supplier_tax_id" CHAR(14),
  "origin_state" CHAR(2) NOT NULL,
  "destination_state" CHAR(2) NOT NULL,
  "operation_date" DATE NOT NULL,
  "quantity" DECIMAL(15,3) NOT NULL,
  "remaining_quantity" DECIMAL(15,3) NOT NULL,
  "input_cfop" CHAR(4) NOT NULL,
  "input_cst_icms" VARCHAR(3) NOT NULL,
  "input_csosn" CHAR(3),
  "icms_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "icms_st_base" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "icms_st_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "fcp_st_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "st_collected_previously" BOOLEAN NOT NULL DEFAULT false,
  "input_cst_pis_cofins" CHAR(2) NOT NULL,
  "pis_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "cofins_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "monophase_applicable" BOOLEAN NOT NULL DEFAULT false,
  "revenue_nature" VARCHAR(20),
  "pis_credit_treatment" "TaxCreditTreatment" NOT NULL DEFAULT 'PENDING_REVIEW',
  "cofins_credit_treatment" "TaxCreditTreatment" NOT NULL DEFAULT 'PENDING_REVIEW',
  "input_cst_ibs_cbs" VARCHAR(5),
  "input_cclass_trib" CHAR(6),
  "cbs_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "ibs_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "raw_tax_snapshot" JSONB NOT NULL DEFAULT '{}',
  "evidence" JSONB NOT NULL DEFAULT '[]',
  "source_hash" CHAR(64) NOT NULL,
  "rule_version" VARCHAR(30) NOT NULL,
  "status" "TaxProvenanceStatus" NOT NULL DEFAULT 'DRAFT',
  "approved_by_id" UUID,
  "approved_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "tax_provenances_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tax_provenances_positive_quantity_check"
    CHECK ("quantity" > 0),
  CONSTRAINT "tax_provenances_remaining_quantity_check"
    CHECK ("remaining_quantity" >= 0 AND "remaining_quantity" <= "quantity"),
  CONSTRAINT "tax_provenances_source_identity_check"
    CHECK (
      ("source_access_key" IS NULL AND "source_item_number" IS NULL)
      OR ("source_access_key" IS NOT NULL AND "source_item_number" IS NOT NULL)
    ),
  CONSTRAINT "tax_provenances_approval_check"
    CHECK (
      "status" <> 'APPROVED'
      OR ("approved_by_id" IS NOT NULL AND "approved_at" IS NOT NULL)
    ),
  CONSTRAINT "tax_provenances_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "tax_provenances_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "tax_provenances_lot_id_fkey"
    FOREIGN KEY ("lot_id") REFERENCES "inventory_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "tax_provenances_approved_by_id_fkey"
    FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "tax_provenances_company_id_source_access_key_source_item_number_key"
  ON "tax_provenances"("company_id", "source_access_key", "source_item_number");
CREATE INDEX "tax_provenances_company_id_product_id_status_idx"
  ON "tax_provenances"("company_id", "product_id", "status");
CREATE INDEX "tax_provenances_lot_id_status_remaining_quantity_idx"
  ON "tax_provenances"("lot_id", "status", "remaining_quantity");
CREATE INDEX "tax_provenances_operation_date_idx"
  ON "tax_provenances"("operation_date");

CREATE TABLE "tax_exit_assessments" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "lot_id" UUID,
  "provenance_id" UUID,
  "sale_item_id" UUID,
  "requested_by_id" UUID,
  "request_id" VARCHAR(80),
  "status" "TaxExitAssessmentStatus" NOT NULL,
  "operation_type" VARCHAR(60) NOT NULL,
  "origin_state" CHAR(2),
  "destination_state" CHAR(2),
  "quantity" DECIMAL(15,3) NOT NULL,
  "gross_amount" DECIMAL(15,2) NOT NULL,
  "output_cfop" CHAR(4) NOT NULL,
  "output_cst_icms" VARCHAR(3) NOT NULL,
  "output_csosn" CHAR(3),
  "output_cst_pis_cofins" CHAR(2) NOT NULL,
  "output_revenue_nature" VARCHAR(20),
  "output_cst_ibs_cbs" VARCHAR(5) NOT NULL,
  "output_cclass_trib" CHAR(6) NOT NULL,
  "icms_rate" DECIMAL(9,6) NOT NULL DEFAULT 0,
  "pis_rate" DECIMAL(9,6) NOT NULL DEFAULT 0,
  "cofins_rate" DECIMAL(9,6) NOT NULL DEFAULT 0,
  "cbs_rate" DECIMAL(9,6) NOT NULL DEFAULT 0,
  "ibs_rate" DECIMAL(9,6) NOT NULL DEFAULT 0,
  "prevented_tax_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "findings" JSONB NOT NULL DEFAULT '[]',
  "evidence" JSONB NOT NULL DEFAULT '[]',
  "rule_version" VARCHAR(30) NOT NULL,
  "decision_hash" CHAR(64) NOT NULL,
  "evaluated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "tax_exit_assessments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tax_exit_assessments_positive_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "tax_exit_assessments_nonnegative_amounts_check"
    CHECK ("gross_amount" >= 0 AND "prevented_tax_amount" >= 0),
  CONSTRAINT "tax_exit_assessments_rate_range_check"
    CHECK (
      "icms_rate" BETWEEN 0 AND 1
      AND "pis_rate" BETWEEN 0 AND 1
      AND "cofins_rate" BETWEEN 0 AND 1
      AND "cbs_rate" BETWEEN 0 AND 1
      AND "ibs_rate" BETWEEN 0 AND 1
    ),
  CONSTRAINT "tax_exit_assessments_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "tax_exit_assessments_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "tax_exit_assessments_lot_id_fkey"
    FOREIGN KEY ("lot_id") REFERENCES "inventory_lots"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "tax_exit_assessments_provenance_id_fkey"
    FOREIGN KEY ("provenance_id") REFERENCES "tax_provenances"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "tax_exit_assessments_sale_item_id_fkey"
    FOREIGN KEY ("sale_item_id") REFERENCES "sale_items"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "tax_exit_assessments_requested_by_id_fkey"
    FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "tax_exit_assessments_company_id_status_evaluated_at_idx"
  ON "tax_exit_assessments"("company_id", "status", "evaluated_at");
CREATE INDEX "tax_exit_assessments_product_id_evaluated_at_idx"
  ON "tax_exit_assessments"("product_id", "evaluated_at");
CREATE INDEX "tax_exit_assessments_sale_item_id_idx"
  ON "tax_exit_assessments"("sale_item_id");
CREATE INDEX "tax_exit_assessments_provenance_id_idx"
  ON "tax_exit_assessments"("provenance_id");
