CREATE TYPE "StoreType" AS ENUM ('MAIN', 'BRANCH');
CREATE TYPE "SetupType" AS ENUM ('SIMPLE_CONVERSION', 'FINE_TUNING');
CREATE TYPE "OnboardingStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "SetupInstallmentStatus" AS ENUM ('PENDING', 'BILLED', 'PAID', 'WAIVED');
CREATE TYPE "SavingsLedgerStatus" AS ENUM ('DRAFT', 'VERIFIED', 'LOCKED');
CREATE TYPE "InvoiceItemType" AS ENUM ('SUBSCRIPTION', 'ADDITIONAL_STORE', 'EXTRA_PDV', 'SUCCESS_FEE', 'SETUP_ENTRY', 'SETUP_INSTALLMENT');
CREATE TYPE "ChargeRequestStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED');

ALTER TABLE "plans"
  ADD COLUMN "setup_price" DECIMAL(12,2) NOT NULL DEFAULT 890,
  ADD COLUMN "success_fee_rate" DECIMAL(9,6) NOT NULL DEFAULT 0,
  ADD COLUMN "has_fine_tuning" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "included_stores" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "included_pdvs_per_store" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "additional_store_price" DECIMAL(12,2) NOT NULL DEFAULT 1000,
  ADD COLUMN "extra_pdv_price" DECIMAL(12,2) NOT NULL DEFAULT 280;

ALTER TABLE "subscriptions"
  ADD COLUMN "contract_started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "invoices"
  ADD COLUMN "billing_period" DATE,
  ADD COLUMN "requires_review" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "calculation_hash" CHAR(64);

CREATE UNIQUE INDEX "invoices_subscription_id_billing_period_key" ON "invoices"("subscription_id", "billing_period");

CREATE TABLE "stores" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "code" VARCHAR(40) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "type" "StoreType" NOT NULL DEFAULT 'BRANCH',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "activated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deactivated_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "points_of_sale" (
  "id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "code" VARCHAR(40) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "activated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deactivated_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "points_of_sale_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_onboardings" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "subscription_id" UUID NOT NULL,
  "type" "SetupType" NOT NULL,
  "status" "OnboardingStatus" NOT NULL DEFAULT 'PENDING',
  "setup_total" DECIMAL(12,2) NOT NULL,
  "entry_amount" DECIMAL(12,2) NOT NULL,
  "installment_count" INTEGER NOT NULL,
  "installment_amount" DECIMAL(12,2) NOT NULL,
  "started_at" TIMESTAMPTZ(3) NOT NULL,
  "completed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "customer_onboardings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "setup_installments" (
  "id" UUID NOT NULL,
  "onboarding_id" UUID NOT NULL,
  "invoice_id" UUID,
  "number" INTEGER NOT NULL,
  "label" VARCHAR(100) NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "due_period" DATE NOT NULL,
  "status" "SetupInstallmentStatus" NOT NULL DEFAULT 'PENDING',
  "billed_at" TIMESTAMPTZ(3),
  "paid_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "setup_installments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "monthly_savings_ledgers" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "period" DATE NOT NULL,
  "tax_savings" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "inventory_loss_savings" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "status" "SavingsLedgerStatus" NOT NULL DEFAULT 'DRAFT',
  "evidence" JSONB NOT NULL DEFAULT '[]',
  "verified_by_id" UUID,
  "verified_at" TIMESTAMPTZ(3),
  "locked_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "monthly_savings_ledgers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invoice_items" (
  "id" UUID NOT NULL,
  "invoice_id" UUID NOT NULL,
  "type" "InvoiceItemType" NOT NULL,
  "description" VARCHAR(250) NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL DEFAULT 1,
  "unit_amount" DECIMAL(12,2) NOT NULL,
  "total_amount" DECIMAL(12,2) NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "billing_charge_requests" (
  "id" UUID NOT NULL,
  "invoice_id" UUID NOT NULL,
  "status" "ChargeRequestStatus" NOT NULL DEFAULT 'QUEUED',
  "provider" VARCHAR(40) NOT NULL DEFAULT 'manual',
  "provider_reference" VARCHAR(180),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "payload_hash" CHAR(64) NOT NULL,
  "last_error" VARCHAR(2000),
  "sent_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "billing_charge_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stores_company_id_code_key" ON "stores"("company_id", "code");
CREATE UNIQUE INDEX "stores_one_main_per_company_uidx" ON "stores"("company_id") WHERE "type" = 'MAIN';
CREATE INDEX "stores_company_id_active_type_idx" ON "stores"("company_id", "active", "type");
CREATE UNIQUE INDEX "points_of_sale_store_id_code_key" ON "points_of_sale"("store_id", "code");
CREATE INDEX "points_of_sale_store_id_active_idx" ON "points_of_sale"("store_id", "active");
CREATE UNIQUE INDEX "customer_onboardings_subscription_id_key" ON "customer_onboardings"("subscription_id");
CREATE INDEX "customer_onboardings_company_id_status_idx" ON "customer_onboardings"("company_id", "status");
CREATE UNIQUE INDEX "setup_installments_onboarding_id_number_key" ON "setup_installments"("onboarding_id", "number");
CREATE INDEX "setup_installments_status_due_period_idx" ON "setup_installments"("status", "due_period");
CREATE UNIQUE INDEX "monthly_savings_ledgers_company_id_period_key" ON "monthly_savings_ledgers"("company_id", "period");
CREATE INDEX "monthly_savings_ledgers_status_period_idx" ON "monthly_savings_ledgers"("status", "period");
CREATE INDEX "invoice_items_invoice_id_type_idx" ON "invoice_items"("invoice_id", "type");
CREATE UNIQUE INDEX "billing_charge_requests_provider_reference_key" ON "billing_charge_requests"("provider_reference");
CREATE INDEX "billing_charge_requests_status_created_at_idx" ON "billing_charge_requests"("status", "created_at");
CREATE INDEX "billing_charge_requests_invoice_id_created_at_idx" ON "billing_charge_requests"("invoice_id", "created_at");
CREATE UNIQUE INDEX "billing_charge_requests_invoice_id_payload_hash_key" ON "billing_charge_requests"("invoice_id", "payload_hash");

ALTER TABLE "stores" ADD CONSTRAINT "stores_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "points_of_sale" ADD CONSTRAINT "points_of_sale_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_onboardings" ADD CONSTRAINT "customer_onboardings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_onboardings" ADD CONSTRAINT "customer_onboardings_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "setup_installments" ADD CONSTRAINT "setup_installments_onboarding_id_fkey" FOREIGN KEY ("onboarding_id") REFERENCES "customer_onboardings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "setup_installments" ADD CONSTRAINT "setup_installments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "monthly_savings_ledgers" ADD CONSTRAINT "monthly_savings_ledgers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "monthly_savings_ledgers" ADD CONSTRAINT "monthly_savings_ledgers_verified_by_id_fkey" FOREIGN KEY ("verified_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "billing_charge_requests" ADD CONSTRAINT "billing_charge_requests_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
