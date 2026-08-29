-- Local and auditable NFC-e lifecycle. Real authorization stays opt-in and disabled.
CREATE TYPE "NfceEnvironment" AS ENUM ('HOMOLOGATION', 'PRODUCTION');
CREATE TYPE "NfceEmissionType" AS ENUM ('NORMAL', 'OFFLINE_CONTINGENCY');
CREATE TYPE "NfceDocumentStatus" AS ENUM ('DRAFT', 'VALIDATED', 'TRANSMISSION_BLOCKED', 'QUEUED', 'AUTHORIZED', 'REJECTED', 'CANCELLED');
CREATE TYPE "NfceTransmissionStatus" AS ENUM ('BLOCKED', 'QUEUED', 'PROCESSING', 'ACCEPTED', 'REJECTED', 'FAILED');

CREATE TABLE "nfce_number_sequences" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "environment" "NfceEnvironment" NOT NULL,
  "series" INTEGER NOT NULL,
  "last_number" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "nfce_number_sequences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "nfce_documents" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "sale_id" UUID NOT NULL,
  "created_by_id" UUID NOT NULL,
  "environment" "NfceEnvironment" NOT NULL,
  "emission_type" "NfceEmissionType" NOT NULL DEFAULT 'NORMAL',
  "status" "NfceDocumentStatus" NOT NULL DEFAULT 'DRAFT',
  "schema_version" VARCHAR(20) NOT NULL,
  "series" INTEGER NOT NULL,
  "number" INTEGER NOT NULL,
  "numeric_code" CHAR(8) NOT NULL,
  "access_key" CHAR(44) NOT NULL,
  "issued_at" TIMESTAMPTZ(3) NOT NULL,
  "payment_method" CHAR(2) NOT NULL,
  "customer_tax_id" VARCHAR(14),
  "fiscal_payload" JSONB NOT NULL,
  "payload_hash" CHAR(64) NOT NULL,
  "xml_draft" TEXT NOT NULL,
  "validation_errors" JSONB NOT NULL DEFAULT '[]',
  "authorized_xml" TEXT,
  "protocol" VARCHAR(60),
  "authorized_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "nfce_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "nfce_transmission_attempts" (
  "id" UUID NOT NULL,
  "document_id" UUID NOT NULL,
  "status" "NfceTransmissionStatus" NOT NULL DEFAULT 'QUEUED',
  "request_hash" CHAR(64) NOT NULL,
  "response_code" VARCHAR(20),
  "response_message" VARCHAR(500),
  "protocol" VARCHAR(60),
  "started_at" TIMESTAMPTZ(3),
  "completed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "nfce_transmission_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "nfce_number_sequences_company_id_environment_series_key" ON "nfce_number_sequences"("company_id", "environment", "series");
CREATE UNIQUE INDEX "nfce_documents_access_key_key" ON "nfce_documents"("access_key");
CREATE UNIQUE INDEX "nfce_documents_company_id_sale_id_environment_key" ON "nfce_documents"("company_id", "sale_id", "environment");
CREATE UNIQUE INDEX "nfce_documents_company_id_environment_series_number_key" ON "nfce_documents"("company_id", "environment", "series", "number");
CREATE INDEX "nfce_documents_company_id_status_issued_at_idx" ON "nfce_documents"("company_id", "status", "issued_at");
CREATE INDEX "nfce_transmission_attempts_document_id_created_at_idx" ON "nfce_transmission_attempts"("document_id", "created_at");
CREATE INDEX "nfce_transmission_attempts_status_created_at_idx" ON "nfce_transmission_attempts"("status", "created_at");

ALTER TABLE "nfce_number_sequences" ADD CONSTRAINT "nfce_number_sequences_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "nfce_documents" ADD CONSTRAINT "nfce_documents_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "nfce_documents" ADD CONSTRAINT "nfce_documents_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "nfce_documents" ADD CONSTRAINT "nfce_documents_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "nfce_transmission_attempts" ADD CONSTRAINT "nfce_transmission_attempts_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "nfce_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "nfce_number_sequences" ADD CONSTRAINT "nfce_number_sequences_series_check" CHECK ("series" BETWEEN 1 AND 999);
ALTER TABLE "nfce_number_sequences" ADD CONSTRAINT "nfce_number_sequences_number_check" CHECK ("last_number" BETWEEN 0 AND 999999999);
ALTER TABLE "nfce_documents" ADD CONSTRAINT "nfce_documents_series_check" CHECK ("series" BETWEEN 1 AND 999);
ALTER TABLE "nfce_documents" ADD CONSTRAINT "nfce_documents_number_check" CHECK ("number" BETWEEN 1 AND 999999999);
ALTER TABLE "nfce_documents" ADD CONSTRAINT "nfce_documents_access_key_check" CHECK ("access_key" ~ '^[0-9]{44}$');

-- The sale snapshot used to prepare an NFC-e is evidence. Only lifecycle/authorization
-- columns can change after insertion; fiscal payload, hash, number, key and draft cannot.
CREATE OR REPLACE FUNCTION protect_nfce_fiscal_snapshot()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."company_id" IS DISTINCT FROM OLD."company_id"
    OR NEW."sale_id" IS DISTINCT FROM OLD."sale_id"
    OR NEW."environment" IS DISTINCT FROM OLD."environment"
    OR NEW."emission_type" IS DISTINCT FROM OLD."emission_type"
    OR NEW."schema_version" IS DISTINCT FROM OLD."schema_version"
    OR NEW."series" IS DISTINCT FROM OLD."series"
    OR NEW."number" IS DISTINCT FROM OLD."number"
    OR NEW."numeric_code" IS DISTINCT FROM OLD."numeric_code"
    OR NEW."access_key" IS DISTINCT FROM OLD."access_key"
    OR NEW."issued_at" IS DISTINCT FROM OLD."issued_at"
    OR NEW."payment_method" IS DISTINCT FROM OLD."payment_method"
    OR NEW."customer_tax_id" IS DISTINCT FROM OLD."customer_tax_id"
    OR NEW."fiscal_payload" IS DISTINCT FROM OLD."fiscal_payload"
    OR NEW."payload_hash" IS DISTINCT FROM OLD."payload_hash"
    OR NEW."xml_draft" IS DISTINCT FROM OLD."xml_draft"
  THEN
    RAISE EXCEPTION 'NFCE_FISCAL_SNAPSHOT_IMUTAVEL';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "nfce_fiscal_snapshot_immutable"
BEFORE UPDATE ON "nfce_documents"
FOR EACH ROW EXECUTE FUNCTION protect_nfce_fiscal_snapshot();
