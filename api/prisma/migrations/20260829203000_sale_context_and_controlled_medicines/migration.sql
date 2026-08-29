-- Human sale context and configurable controls for prescription/controlled products.
CREATE TYPE "SaleControlLevel" AS ENUM ('NONE', 'PRESCRIPTION_PRESENTATION', 'PRESCRIPTION_RETENTION', 'SPECIAL_CONTROL');
CREATE TYPE "PharmacistCredentialStatus" AS ENUM ('DRAFT', 'VERIFIED', 'SUSPENDED', 'EXPIRED');

ALTER TABLE "products"
  ADD COLUMN "control_level" "SaleControlLevel" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "requires_buyer_id" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "requires_prescription" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "requires_pharmacist" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "retains_prescription" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "minimum_buyer_age" INTEGER,
  ADD COLUMN "control_rule_version" VARCHAR(30),
  ADD COLUMN "control_legal_basis" VARCHAR(500),
  ADD COLUMN "control_metadata" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "sales"
  ADD COLUMN "customer_id" UUID,
  ADD COLUMN "seller_id" UUID,
  ADD COLUMN "pharmacist_credential_id" UUID,
  ADD COLUMN "customer_tax_id" VARCHAR(14),
  ADD COLUMN "customer_name" VARCHAR(180),
  ADD COLUMN "customer_birth_date" DATE,
  ADD COLUMN "seller_name" VARCHAR(180),
  ADD COLUMN "pharmacist_snapshot" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "sale_items"
  ADD COLUMN "control_level" "SaleControlLevel" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "control_rule_version" VARCHAR(30),
  ADD COLUMN "control_snapshot" JSONB NOT NULL DEFAULT '{}';

CREATE TABLE "customers" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "tax_id" VARCHAR(14) NOT NULL,
  "name" VARCHAR(180),
  "birth_date" DATE,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pharmacist_credentials" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "council" VARCHAR(20) NOT NULL DEFAULT 'CRF',
  "registration" VARCHAR(40) NOT NULL,
  "state" CHAR(2) NOT NULL,
  "status" "PharmacistCredentialStatus" NOT NULL DEFAULT 'DRAFT',
  "valid_from" DATE NOT NULL,
  "valid_until" DATE,
  "verified_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "pharmacist_credentials_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "controlled_sale_records" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "sale_id" UUID NOT NULL,
  "sale_item_id" UUID NOT NULL,
  "pharmacist_credential_id" UUID,
  "created_by_id" UUID NOT NULL,
  "control_level" "SaleControlLevel" NOT NULL,
  "buyer_tax_id" VARCHAR(14),
  "buyer_name" VARCHAR(180),
  "buyer_birth_date" DATE,
  "prescription_number" VARCHAR(80),
  "prescriber_name" VARCHAR(180),
  "prescriber_registration" VARCHAR(60),
  "prescriber_state" CHAR(2),
  "prescription_issued_at" DATE,
  "prescription_retained" BOOLEAN NOT NULL DEFAULT false,
  "rule_version" VARCHAR(30) NOT NULL,
  "evidence" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "controlled_sale_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customers_company_id_tax_id_key" ON "customers"("company_id", "tax_id");
CREATE INDEX "customers_company_id_name_idx" ON "customers"("company_id", "name");
CREATE UNIQUE INDEX "pharmacist_credentials_company_id_user_id_key" ON "pharmacist_credentials"("company_id", "user_id");
CREATE UNIQUE INDEX "pharmacist_credentials_company_id_council_registration_state_key" ON "pharmacist_credentials"("company_id", "council", "registration", "state");
CREATE INDEX "pharmacist_credentials_company_id_status_valid_until_idx" ON "pharmacist_credentials"("company_id", "status", "valid_until");
CREATE UNIQUE INDEX "controlled_sale_records_sale_item_id_key" ON "controlled_sale_records"("sale_item_id");
CREATE INDEX "controlled_sale_records_company_id_control_level_created_at_idx" ON "controlled_sale_records"("company_id", "control_level", "created_at");
CREATE INDEX "controlled_sale_records_sale_id_idx" ON "controlled_sale_records"("sale_id");
CREATE INDEX "sales_customer_id_sold_at_idx" ON "sales"("customer_id", "sold_at");
CREATE INDEX "sales_seller_id_sold_at_idx" ON "sales"("seller_id", "sold_at");

ALTER TABLE "customers" ADD CONSTRAINT "customers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pharmacist_credentials" ADD CONSTRAINT "pharmacist_credentials_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pharmacist_credentials" ADD CONSTRAINT "pharmacist_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sales" ADD CONSTRAINT "sales_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales" ADD CONSTRAINT "sales_pharmacist_credential_id_fkey" FOREIGN KEY ("pharmacist_credential_id") REFERENCES "pharmacist_credentials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "controlled_sale_records" ADD CONSTRAINT "controlled_sale_records_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "controlled_sale_records" ADD CONSTRAINT "controlled_sale_records_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "controlled_sale_records" ADD CONSTRAINT "controlled_sale_records_sale_item_id_fkey" FOREIGN KEY ("sale_item_id") REFERENCES "sale_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "controlled_sale_records" ADD CONSTRAINT "controlled_sale_records_pharmacist_credential_id_fkey" FOREIGN KEY ("pharmacist_credential_id") REFERENCES "pharmacist_credentials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "controlled_sale_records" ADD CONSTRAINT "controlled_sale_records_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "products" ADD CONSTRAINT "products_control_policy_check" CHECK (
  ("minimum_buyer_age" IS NULL OR "minimum_buyer_age" BETWEEN 0 AND 130)
  AND (NOT "retains_prescription" OR "requires_prescription")
  AND (("control_level" = 'NONE' AND NOT "requires_buyer_id" AND NOT "requires_prescription" AND NOT "requires_pharmacist" AND NOT "retains_prescription" AND "minimum_buyer_age" IS NULL)
    OR ("control_level" <> 'NONE' AND "control_rule_version" IS NOT NULL AND length(trim("control_rule_version")) > 0 AND "control_legal_basis" IS NOT NULL AND length(trim("control_legal_basis")) >= 10))
);
ALTER TABLE "pharmacist_credentials" ADD CONSTRAINT "pharmacist_credentials_validity_check" CHECK ("valid_until" IS NULL OR "valid_until" >= "valid_from");
ALTER TABLE "controlled_sale_records" ADD CONSTRAINT "controlled_sale_rule_version_check" CHECK (length(trim("rule_version")) > 0);

CREATE OR REPLACE FUNCTION protect_sale_human_context()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."customer_id" IS DISTINCT FROM OLD."customer_id"
    OR NEW."seller_id" IS DISTINCT FROM OLD."seller_id"
    OR NEW."pharmacist_credential_id" IS DISTINCT FROM OLD."pharmacist_credential_id"
    OR NEW."customer_tax_id" IS DISTINCT FROM OLD."customer_tax_id"
    OR NEW."customer_name" IS DISTINCT FROM OLD."customer_name"
    OR NEW."customer_birth_date" IS DISTINCT FROM OLD."customer_birth_date"
    OR NEW."seller_name" IS DISTINCT FROM OLD."seller_name"
    OR NEW."pharmacist_snapshot" IS DISTINCT FROM OLD."pharmacist_snapshot"
  THEN
    RAISE EXCEPTION 'CONTEXTO_HUMANO_DA_VENDA_IMUTAVEL';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "sale_human_context_immutable"
BEFORE UPDATE ON "sales"
FOR EACH ROW EXECUTE FUNCTION protect_sale_human_context();

CREATE OR REPLACE FUNCTION protect_sale_item_control_context()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."control_level" IS DISTINCT FROM OLD."control_level"
    OR NEW."control_rule_version" IS DISTINCT FROM OLD."control_rule_version"
    OR NEW."control_snapshot" IS DISTINCT FROM OLD."control_snapshot"
  THEN
    RAISE EXCEPTION 'CONTEXTO_DE_CONTROLE_DO_ITEM_IMUTAVEL';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "sale_item_control_context_immutable"
BEFORE UPDATE ON "sale_items"
FOR EACH ROW EXECUTE FUNCTION protect_sale_item_control_context();

CREATE OR REPLACE FUNCTION block_controlled_sale_record_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'REGISTRO_DE_VENDA_CONTROLADA_IMUTAVEL';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "controlled_sale_records_immutable"
BEFORE UPDATE OR DELETE ON "controlled_sale_records"
FOR EACH ROW EXECUTE FUNCTION block_controlled_sale_record_mutation();
