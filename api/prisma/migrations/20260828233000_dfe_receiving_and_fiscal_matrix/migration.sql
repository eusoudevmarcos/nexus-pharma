-- Fiscal matrix and DF-e receiving foundation.
CREATE TYPE "DfeEnvironment" AS ENUM ('HOMOLOGATION', 'PRODUCTION');
CREATE TYPE "DfeCertificateStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');
CREATE TYPE "DfeDocumentType" AS ENUM ('NFE', 'NFE_SUMMARY', 'EVENT', 'UNKNOWN');
CREATE TYPE "DfeDocumentStatus" AS ENUM ('DISCOVERED', 'XML_AVAILABLE', 'UNDER_REVIEW', 'CONFERENCING', 'ACCEPTED', 'REJECTED', 'CANCELLED');
CREATE TYPE "DfeManifestationType" AS ENUM ('SCIENCE', 'CONFIRMATION', 'UNKNOWN_OPERATION', 'OPERATION_NOT_PERFORMED');
CREATE TYPE "DfeTransmissionStatus" AS ENUM ('PENDING', 'PROCESSING', 'ACCEPTED', 'REJECTED', 'FAILED');
CREATE TYPE "DfeReceivingStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'REJECTED');
CREATE TYPE "DfeItemStatus" AS ENUM ('PENDING', 'MATCHED', 'DIVERGENT', 'ACCEPTED', 'REJECTED');
CREATE TYPE "DfeDiscrepancyStatus" AS ENUM ('OPEN', 'ACCEPTED_SUGGESTION', 'KEPT_SOURCE', 'RESOLVED', 'DISMISSED');

CREATE TABLE "fiscal_matrix_rules" (
  "id" UUID NOT NULL,
  "company_id" UUID,
  "code" VARCHAR(80) NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "origin_state" CHAR(2),
  "destination_state" CHAR(2) NOT NULL,
  "regime" "TaxRegime" NOT NULL,
  "operation_type" VARCHAR(60) NOT NULL,
  "ncm_pattern" VARCHAR(8) NOT NULL,
  "cest_pattern" VARCHAR(7),
  "priority" INTEGER NOT NULL DEFAULT 100,
  "conditions" JSONB NOT NULL DEFAULT '{}',
  "outcome" JSONB NOT NULL DEFAULT '{}',
  "source_references" JSONB NOT NULL DEFAULT '[]',
  "rule_version" VARCHAR(30) NOT NULL,
  "valid_from" DATE NOT NULL,
  "valid_until" DATE,
  "status" "FiscalRuleStatus" NOT NULL DEFAULT 'DRAFT',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "fiscal_matrix_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "dfe_certificates" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "installed_by_id" UUID NOT NULL,
  "environment" "DfeEnvironment" NOT NULL,
  "encrypted_payload" TEXT NOT NULL,
  "fingerprint" CHAR(64) NOT NULL,
  "subject" VARCHAR(500) NOT NULL,
  "serial_number" VARCHAR(120) NOT NULL,
  "valid_from" TIMESTAMPTZ(3) NOT NULL,
  "valid_until" TIMESTAMPTZ(3) NOT NULL,
  "status" "DfeCertificateStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "dfe_certificates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "dfe_distribution_cursors" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "environment" "DfeEnvironment" NOT NULL,
  "last_nsu" CHAR(15) NOT NULL DEFAULT '000000000000000',
  "max_nsu" CHAR(15) NOT NULL DEFAULT '000000000000000',
  "last_status_code" VARCHAR(3),
  "last_status_message" VARCHAR(500),
  "last_query_at" TIMESTAMPTZ(3),
  "next_allowed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "dfe_distribution_cursors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "dfe_documents" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "environment" "DfeEnvironment" NOT NULL,
  "nsu" CHAR(15),
  "access_key" CHAR(44),
  "schema_name" VARCHAR(120) NOT NULL,
  "document_type" "DfeDocumentType" NOT NULL,
  "status" "DfeDocumentStatus" NOT NULL DEFAULT 'DISCOVERED',
  "raw_xml" TEXT NOT NULL,
  "xml_hash" CHAR(64) NOT NULL,
  "issuer_tax_id" VARCHAR(14),
  "issuer_name" VARCHAR(180),
  "recipient_tax_id" VARCHAR(14),
  "origin_state" CHAR(2),
  "destination_state" CHAR(2),
  "document_number" VARCHAR(60),
  "issued_at" TIMESTAMPTZ(3),
  "total_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "summary" JSONB NOT NULL DEFAULT '{}',
  "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "dfe_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "dfe_document_items" (
  "id" UUID NOT NULL,
  "document_id" UUID NOT NULL,
  "product_id" UUID,
  "item_number" INTEGER NOT NULL,
  "supplier_code" VARCHAR(80),
  "ean" VARCHAR(14),
  "description" VARCHAR(500) NOT NULL,
  "ncm" CHAR(8) NOT NULL,
  "cest" CHAR(7),
  "cfop" CHAR(4) NOT NULL,
  "cst_icms" VARCHAR(3),
  "csosn" CHAR(3),
  "cst_pis" CHAR(2),
  "cst_cofins" CHAR(2),
  "unit" VARCHAR(10) NOT NULL,
  "quantity" DECIMAL(15,4) NOT NULL,
  "unit_price" DECIMAL(15,4) NOT NULL,
  "total_amount" DECIMAL(15,2) NOT NULL,
  "original_tax" JSONB NOT NULL DEFAULT '{}',
  "suggested_tax" JSONB NOT NULL DEFAULT '{}',
  "matched_rule_id" UUID,
  "status" "DfeItemStatus" NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "dfe_document_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "dfe_discrepancies" (
  "id" UUID NOT NULL,
  "document_id" UUID NOT NULL,
  "document_item_id" UUID,
  "code" VARCHAR(80) NOT NULL,
  "severity" VARCHAR(20) NOT NULL,
  "field" VARCHAR(80) NOT NULL,
  "received_value" VARCHAR(500),
  "suggested_value" VARCHAR(500),
  "explanation" VARCHAR(1200) NOT NULL,
  "source_references" JSONB NOT NULL DEFAULT '[]',
  "status" "DfeDiscrepancyStatus" NOT NULL DEFAULT 'OPEN',
  "resolution" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "dfe_discrepancies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "dfe_manifestations" (
  "id" UUID NOT NULL,
  "document_id" UUID NOT NULL,
  "created_by_id" UUID NOT NULL,
  "type" "DfeManifestationType" NOT NULL,
  "sequence" INTEGER NOT NULL DEFAULT 1,
  "justification" VARCHAR(1000),
  "status" "DfeTransmissionStatus" NOT NULL DEFAULT 'PENDING',
  "request_xml" TEXT,
  "request_hash" CHAR(64),
  "response_xml" TEXT,
  "response_code" VARCHAR(3),
  "response_message" VARCHAR(500),
  "protocol" VARCHAR(60),
  "attempted_at" TIMESTAMPTZ(3),
  "completed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "dfe_manifestations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "dfe_receivings" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "document_id" UUID NOT NULL,
  "store_id" UUID,
  "started_by_id" UUID NOT NULL,
  "completed_by_id" UUID,
  "status" "DfeReceivingStatus" NOT NULL DEFAULT 'PENDING',
  "notes" VARCHAR(1000),
  "started_at" TIMESTAMPTZ(3),
  "completed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "dfe_receivings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "dfe_receiving_items" (
  "id" UUID NOT NULL,
  "receiving_id" UUID NOT NULL,
  "document_item_id" UUID NOT NULL,
  "product_id" UUID,
  "inventory_lot_id" UUID,
  "expected_quantity" DECIMAL(15,4) NOT NULL,
  "received_quantity" DECIMAL(15,4) NOT NULL DEFAULT 0,
  "lot_code" VARCHAR(60),
  "manufactured_at" DATE,
  "expires_at" DATE,
  "unit_cost" DECIMAL(15,4) NOT NULL,
  "status" "DfeItemStatus" NOT NULL DEFAULT 'PENDING',
  "notes" VARCHAR(500),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "dfe_receiving_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fiscal_matrix_rules_company_id_code_rule_version_key" ON "fiscal_matrix_rules"("company_id", "code", "rule_version");
CREATE INDEX "fiscal_matrix_rules_destination_state_regime_operation_type_status_valid_from_idx" ON "fiscal_matrix_rules"("destination_state", "regime", "operation_type", "status", "valid_from");
CREATE INDEX "fiscal_matrix_rules_ncm_pattern_cest_pattern_idx" ON "fiscal_matrix_rules"("ncm_pattern", "cest_pattern");
CREATE UNIQUE INDEX "dfe_certificates_company_id_environment_fingerprint_key" ON "dfe_certificates"("company_id", "environment", "fingerprint");
CREATE INDEX "dfe_certificates_company_id_environment_status_valid_until_idx" ON "dfe_certificates"("company_id", "environment", "status", "valid_until");
CREATE UNIQUE INDEX "dfe_distribution_cursors_company_id_environment_key" ON "dfe_distribution_cursors"("company_id", "environment");
CREATE INDEX "dfe_distribution_cursors_next_allowed_at_idx" ON "dfe_distribution_cursors"("next_allowed_at");
CREATE UNIQUE INDEX "dfe_documents_company_id_environment_nsu_key" ON "dfe_documents"("company_id", "environment", "nsu");
CREATE UNIQUE INDEX "dfe_documents_company_id_environment_access_key_document_type_key" ON "dfe_documents"("company_id", "environment", "access_key", "document_type");
CREATE INDEX "dfe_documents_company_id_status_issued_at_idx" ON "dfe_documents"("company_id", "status", "issued_at");
CREATE INDEX "dfe_documents_xml_hash_idx" ON "dfe_documents"("xml_hash");
CREATE UNIQUE INDEX "dfe_document_items_document_id_item_number_key" ON "dfe_document_items"("document_id", "item_number");
CREATE INDEX "dfe_document_items_ean_idx" ON "dfe_document_items"("ean");
CREATE INDEX "dfe_document_items_ncm_cest_idx" ON "dfe_document_items"("ncm", "cest");
CREATE UNIQUE INDEX "dfe_discrepancies_document_id_document_item_id_code_field_key" ON "dfe_discrepancies"("document_id", "document_item_id", "code", "field");
CREATE INDEX "dfe_discrepancies_document_id_status_severity_idx" ON "dfe_discrepancies"("document_id", "status", "severity");
CREATE UNIQUE INDEX "dfe_manifestations_document_id_type_sequence_key" ON "dfe_manifestations"("document_id", "type", "sequence");
CREATE INDEX "dfe_manifestations_status_created_at_idx" ON "dfe_manifestations"("status", "created_at");
CREATE UNIQUE INDEX "dfe_receivings_document_id_key" ON "dfe_receivings"("document_id");
CREATE INDEX "dfe_receivings_company_id_status_created_at_idx" ON "dfe_receivings"("company_id", "status", "created_at");
CREATE UNIQUE INDEX "dfe_receiving_items_receiving_id_document_item_id_key" ON "dfe_receiving_items"("receiving_id", "document_item_id");
CREATE INDEX "dfe_receiving_items_product_id_status_idx" ON "dfe_receiving_items"("product_id", "status");

ALTER TABLE "fiscal_matrix_rules" ADD CONSTRAINT "fiscal_matrix_rules_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dfe_certificates" ADD CONSTRAINT "dfe_certificates_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dfe_certificates" ADD CONSTRAINT "dfe_certificates_installed_by_id_fkey" FOREIGN KEY ("installed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dfe_distribution_cursors" ADD CONSTRAINT "dfe_distribution_cursors_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dfe_documents" ADD CONSTRAINT "dfe_documents_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dfe_document_items" ADD CONSTRAINT "dfe_document_items_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "dfe_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dfe_document_items" ADD CONSTRAINT "dfe_document_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "dfe_document_items" ADD CONSTRAINT "dfe_document_items_matched_rule_id_fkey" FOREIGN KEY ("matched_rule_id") REFERENCES "fiscal_matrix_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "dfe_discrepancies" ADD CONSTRAINT "dfe_discrepancies_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "dfe_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dfe_discrepancies" ADD CONSTRAINT "dfe_discrepancies_document_item_id_fkey" FOREIGN KEY ("document_item_id") REFERENCES "dfe_document_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dfe_manifestations" ADD CONSTRAINT "dfe_manifestations_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "dfe_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dfe_manifestations" ADD CONSTRAINT "dfe_manifestations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dfe_receivings" ADD CONSTRAINT "dfe_receivings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dfe_receivings" ADD CONSTRAINT "dfe_receivings_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "dfe_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dfe_receivings" ADD CONSTRAINT "dfe_receivings_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "dfe_receivings" ADD CONSTRAINT "dfe_receivings_started_by_id_fkey" FOREIGN KEY ("started_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dfe_receivings" ADD CONSTRAINT "dfe_receivings_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "dfe_receiving_items" ADD CONSTRAINT "dfe_receiving_items_receiving_id_fkey" FOREIGN KEY ("receiving_id") REFERENCES "dfe_receivings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dfe_receiving_items" ADD CONSTRAINT "dfe_receiving_items_document_item_id_fkey" FOREIGN KEY ("document_item_id") REFERENCES "dfe_document_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dfe_receiving_items" ADD CONSTRAINT "dfe_receiving_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "dfe_receiving_items" ADD CONSTRAINT "dfe_receiving_items_inventory_lot_id_fkey" FOREIGN KEY ("inventory_lot_id") REFERENCES "inventory_lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The legally relevant source XML and its digest are append-only. Parsed status,
-- conference data and manifestations remain evolvable in their own tables.
CREATE FUNCTION prevent_dfe_source_mutation() RETURNS trigger AS $$
BEGIN
  IF NEW."raw_xml" IS DISTINCT FROM OLD."raw_xml" OR NEW."xml_hash" IS DISTINCT FROM OLD."xml_hash" THEN
    RAISE EXCEPTION 'DFE_SOURCE_XML_IS_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "dfe_documents_source_immutable"
BEFORE UPDATE ON "dfe_documents"
FOR EACH ROW EXECUTE FUNCTION prevent_dfe_source_mutation();
