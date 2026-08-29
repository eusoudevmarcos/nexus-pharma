-- Discounts and auditable post-sale reversals without deleting the original sale.
CREATE TYPE "SaleReversalType" AS ENUM ('FULL_CANCELLATION', 'PARTIAL_RETURN');
CREATE TYPE "SaleReversalStatus" AS ENUM ('COMPLETED', 'PENDING_EXTERNAL_REFUND');
CREATE TYPE "ReturnedItemCondition" AS ENUM ('RESALABLE', 'DAMAGED', 'EXPIRED', 'OTHER');
CREATE TYPE "FiscalFollowUpStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'COMPLETED');
CREATE TYPE "PaymentRefundStatus" AS ENUM ('RECORDED', 'BLOCKED', 'CONFIRMED', 'FAILED');

ALTER TABLE "sales" ADD COLUMN "original_gross_amount" DECIMAL(15,2) NOT NULL DEFAULT 0;
ALTER TABLE "sales" ADD COLUMN "discount_amount" DECIMAL(15,2) NOT NULL DEFAULT 0;
ALTER TABLE "sale_items" ADD COLUMN "original_unit_price" DECIMAL(15,2) NOT NULL DEFAULT 0;
ALTER TABLE "sale_items" ADD COLUMN "discount_amount" DECIMAL(15,2) NOT NULL DEFAULT 0;
UPDATE "sales" SET "original_gross_amount" = "gross_amount";
UPDATE "sale_items" SET "original_unit_price" = "unit_price";

CREATE TABLE "sale_reversals" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "sale_id" UUID NOT NULL,
  "cash_session_id" UUID NOT NULL,
  "created_by_id" UUID NOT NULL,
  "type" "SaleReversalType" NOT NULL,
  "status" "SaleReversalStatus" NOT NULL,
  "fiscal_status" "FiscalFollowUpStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
  "idempotency_key" VARCHAR(100) NOT NULL,
  "reason" VARCHAR(1000) NOT NULL,
  "gross_amount" DECIMAL(15,2) NOT NULL,
  "cost_amount" DECIMAL(15,2) NOT NULL,
  "tax_amount" DECIMAL(15,2) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sale_reversals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sale_reversal_items" (
  "id" UUID NOT NULL,
  "reversal_id" UUID NOT NULL,
  "sale_item_id" UUID NOT NULL,
  "condition" "ReturnedItemCondition" NOT NULL,
  "quantity" DECIMAL(15,3) NOT NULL,
  "restocked" BOOLEAN NOT NULL DEFAULT false,
  "gross_amount" DECIMAL(15,2) NOT NULL,
  "cost_amount" DECIMAL(15,2) NOT NULL,
  "tax_amount" DECIMAL(15,2) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sale_reversal_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sale_reversal_allocations" (
  "id" UUID NOT NULL,
  "reversal_item_id" UUID NOT NULL,
  "lot_id" UUID,
  "provenance_id" UUID,
  "quantity" DECIMAL(15,3) NOT NULL,
  "restocked" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sale_reversal_allocations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_refunds" (
  "id" UUID NOT NULL,
  "sale_payment_id" UUID NOT NULL,
  "reversal_id" UUID NOT NULL,
  "cash_session_id" UUID NOT NULL,
  "status" "PaymentRefundStatus" NOT NULL,
  "amount" DECIMAL(15,2) NOT NULL,
  "external_reference" VARCHAR(160),
  "reason" VARCHAR(500),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "payment_refunds_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sale_reversals_company_id_idempotency_key_key" ON "sale_reversals"("company_id", "idempotency_key");
CREATE INDEX "sale_reversals_sale_id_created_at_idx" ON "sale_reversals"("sale_id", "created_at");
CREATE INDEX "sale_reversals_company_id_fiscal_status_created_at_idx" ON "sale_reversals"("company_id", "fiscal_status", "created_at");
CREATE UNIQUE INDEX "sale_reversal_items_reversal_id_sale_item_id_key" ON "sale_reversal_items"("reversal_id", "sale_item_id");
CREATE INDEX "sale_reversal_items_sale_item_id_idx" ON "sale_reversal_items"("sale_item_id");
CREATE INDEX "sale_reversal_allocations_reversal_item_id_idx" ON "sale_reversal_allocations"("reversal_item_id");
CREATE INDEX "sale_reversal_allocations_lot_id_idx" ON "sale_reversal_allocations"("lot_id");
CREATE INDEX "sale_reversal_allocations_provenance_id_idx" ON "sale_reversal_allocations"("provenance_id");
CREATE UNIQUE INDEX "payment_refunds_sale_payment_id_reversal_id_key" ON "payment_refunds"("sale_payment_id", "reversal_id");
CREATE INDEX "payment_refunds_cash_session_id_status_created_at_idx" ON "payment_refunds"("cash_session_id", "status", "created_at");

ALTER TABLE "sale_reversals" ADD CONSTRAINT "sale_reversals_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sale_reversals" ADD CONSTRAINT "sale_reversals_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_reversals" ADD CONSTRAINT "sale_reversals_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_reversals" ADD CONSTRAINT "sale_reversals_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_reversal_items" ADD CONSTRAINT "sale_reversal_items_reversal_id_fkey" FOREIGN KEY ("reversal_id") REFERENCES "sale_reversals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_reversal_items" ADD CONSTRAINT "sale_reversal_items_sale_item_id_fkey" FOREIGN KEY ("sale_item_id") REFERENCES "sale_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_reversal_allocations" ADD CONSTRAINT "sale_reversal_allocations_reversal_item_id_fkey" FOREIGN KEY ("reversal_item_id") REFERENCES "sale_reversal_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_reversal_allocations" ADD CONSTRAINT "sale_reversal_allocations_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "inventory_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_reversal_allocations" ADD CONSTRAINT "sale_reversal_allocations_provenance_id_fkey" FOREIGN KEY ("provenance_id") REFERENCES "tax_provenances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_sale_payment_id_fkey" FOREIGN KEY ("sale_payment_id") REFERENCES "sale_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_reversal_id_fkey" FOREIGN KEY ("reversal_id") REFERENCES "sale_reversals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sales" ADD CONSTRAINT "sales_discount_amount_check" CHECK ("discount_amount" >= 0 AND "original_gross_amount" >= "gross_amount");
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_discount_amount_check" CHECK ("discount_amount" >= 0 AND "original_unit_price" >= "unit_price");
ALTER TABLE "sale_reversals" ADD CONSTRAINT "sale_reversals_amounts_check" CHECK ("gross_amount" > 0 AND "cost_amount" >= 0 AND "tax_amount" >= 0);
ALTER TABLE "sale_reversal_items" ADD CONSTRAINT "sale_reversal_items_amounts_check" CHECK ("quantity" > 0 AND "gross_amount" > 0 AND "cost_amount" >= 0 AND "tax_amount" >= 0);
ALTER TABLE "sale_reversal_allocations" ADD CONSTRAINT "sale_reversal_allocations_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_amount_check" CHECK ("amount" > 0);

CREATE OR REPLACE FUNCTION protect_sale_reversal_core()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."company_id" IS DISTINCT FROM OLD."company_id"
    OR NEW."sale_id" IS DISTINCT FROM OLD."sale_id"
    OR NEW."cash_session_id" IS DISTINCT FROM OLD."cash_session_id"
    OR NEW."created_by_id" IS DISTINCT FROM OLD."created_by_id"
    OR NEW."type" IS DISTINCT FROM OLD."type"
    OR NEW."idempotency_key" IS DISTINCT FROM OLD."idempotency_key"
    OR NEW."reason" IS DISTINCT FROM OLD."reason"
    OR NEW."gross_amount" IS DISTINCT FROM OLD."gross_amount"
    OR NEW."cost_amount" IS DISTINCT FROM OLD."cost_amount"
    OR NEW."tax_amount" IS DISTINCT FROM OLD."tax_amount"
  THEN
    RAISE EXCEPTION 'ESTORNO_VENDA_IMUTAVEL';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "sale_reversal_core_immutable"
BEFORE UPDATE ON "sale_reversals"
FOR EACH ROW EXECUTE FUNCTION protect_sale_reversal_core();

CREATE OR REPLACE FUNCTION block_sale_reversal_detail_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'DETALHE_ESTORNO_IMUTAVEL';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "sale_reversal_items_immutable"
BEFORE UPDATE OR DELETE ON "sale_reversal_items"
FOR EACH ROW EXECUTE FUNCTION block_sale_reversal_detail_mutation();

CREATE TRIGGER "sale_reversal_allocations_immutable"
BEFORE UPDATE OR DELETE ON "sale_reversal_allocations"
FOR EACH ROW EXECUTE FUNCTION block_sale_reversal_detail_mutation();

CREATE OR REPLACE FUNCTION protect_payment_refund_core()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."sale_payment_id" IS DISTINCT FROM OLD."sale_payment_id"
    OR NEW."reversal_id" IS DISTINCT FROM OLD."reversal_id"
    OR NEW."cash_session_id" IS DISTINCT FROM OLD."cash_session_id"
    OR NEW."amount" IS DISTINCT FROM OLD."amount"
  THEN
    RAISE EXCEPTION 'REEMBOLSO_IMUTAVEL';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "payment_refund_core_immutable"
BEFORE UPDATE OR DELETE ON "payment_refunds"
FOR EACH ROW EXECUTE FUNCTION protect_payment_refund_core();
