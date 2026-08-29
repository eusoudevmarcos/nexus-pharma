-- Operational cash register and immutable closing reconciliation.
CREATE TYPE "CashSessionStatus" AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE "CashMovementType" AS ENUM ('SUPPLY', 'WITHDRAWAL');
CREATE TYPE "SalePaymentMethod" AS ENUM ('CASH', 'PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'VOUCHER', 'OTHER');
CREATE TYPE "SalePaymentStatus" AS ENUM ('RECORDED', 'CONFIRMED', 'CANCELLED', 'REFUNDED');
CREATE TYPE "CashReconciliationStatus" AS ENUM ('MATCHED', 'DIVERGENT', 'REVIEWED');

ALTER TABLE "sales" ADD COLUMN "cash_session_id" UUID;

CREATE TABLE "cash_sessions" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "point_of_sale_id" UUID NOT NULL,
  "opened_by_id" UUID NOT NULL,
  "closed_by_id" UUID,
  "status" "CashSessionStatus" NOT NULL DEFAULT 'OPEN',
  "opening_amount" DECIMAL(15,2) NOT NULL,
  "opened_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closed_at" TIMESTAMPTZ(3),
  "closing_note" VARCHAR(1000),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "cash_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cash_movements" (
  "id" UUID NOT NULL,
  "cash_session_id" UUID NOT NULL,
  "created_by_id" UUID NOT NULL,
  "type" "CashMovementType" NOT NULL,
  "amount" DECIMAL(15,2) NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "idempotency_key" VARCHAR(80) NOT NULL,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sale_payments" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "sale_id" UUID NOT NULL,
  "cash_session_id" UUID NOT NULL,
  "created_by_id" UUID NOT NULL,
  "method" "SalePaymentMethod" NOT NULL,
  "status" "SalePaymentStatus" NOT NULL DEFAULT 'RECORDED',
  "amount" DECIMAL(15,2) NOT NULL,
  "idempotency_key" VARCHAR(100) NOT NULL,
  "external_reference" VARCHAR(160),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "paid_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "sale_payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cash_reconciliations" (
  "id" UUID NOT NULL,
  "cash_session_id" UUID NOT NULL,
  "status" "CashReconciliationStatus" NOT NULL,
  "expected_amounts" JSONB NOT NULL,
  "declared_amounts" JSONB NOT NULL,
  "differences" JSONB NOT NULL,
  "expected_total" DECIMAL(15,2) NOT NULL,
  "declared_total" DECIMAL(15,2) NOT NULL,
  "difference_total" DECIMAL(15,2) NOT NULL,
  "snapshot_hash" CHAR(64) NOT NULL,
  "reviewed_by_id" UUID,
  "reviewed_at" TIMESTAMPTZ(3),
  "review_note" VARCHAR(1000),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cash_reconciliations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cash_sessions_one_open_per_pdv" ON "cash_sessions"("point_of_sale_id") WHERE "status" = 'OPEN';
CREATE INDEX "cash_sessions_company_id_status_opened_at_idx" ON "cash_sessions"("company_id", "status", "opened_at");
CREATE INDEX "cash_sessions_point_of_sale_id_status_idx" ON "cash_sessions"("point_of_sale_id", "status");
CREATE UNIQUE INDEX "cash_movements_cash_session_id_idempotency_key_key" ON "cash_movements"("cash_session_id", "idempotency_key");
CREATE INDEX "cash_movements_cash_session_id_occurred_at_idx" ON "cash_movements"("cash_session_id", "occurred_at");
CREATE UNIQUE INDEX "sale_payments_company_id_idempotency_key_key" ON "sale_payments"("company_id", "idempotency_key");
CREATE INDEX "sale_payments_cash_session_id_method_status_idx" ON "sale_payments"("cash_session_id", "method", "status");
CREATE INDEX "sale_payments_sale_id_idx" ON "sale_payments"("sale_id");
CREATE UNIQUE INDEX "cash_reconciliations_cash_session_id_key" ON "cash_reconciliations"("cash_session_id");
CREATE INDEX "cash_reconciliations_status_created_at_idx" ON "cash_reconciliations"("status", "created_at");
CREATE INDEX "sales_cash_session_id_sold_at_idx" ON "sales"("cash_session_id", "sold_at");

ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_point_of_sale_id_fkey" FOREIGN KEY ("point_of_sale_id") REFERENCES "points_of_sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_opened_by_id_fkey" FOREIGN KEY ("opened_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_closed_by_id_fkey" FOREIGN KEY ("closed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_reconciliations" ADD CONSTRAINT "cash_reconciliations_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_reconciliations" ADD CONSTRAINT "cash_reconciliations_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales" ADD CONSTRAINT "sales_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_opening_amount_check" CHECK ("opening_amount" >= 0);
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_amount_check" CHECK ("amount" > 0);
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_amount_check" CHECK ("amount" > 0);

CREATE OR REPLACE FUNCTION protect_cash_reconciliation_snapshot()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."cash_session_id" IS DISTINCT FROM OLD."cash_session_id"
    OR NEW."expected_amounts" IS DISTINCT FROM OLD."expected_amounts"
    OR NEW."declared_amounts" IS DISTINCT FROM OLD."declared_amounts"
    OR NEW."differences" IS DISTINCT FROM OLD."differences"
    OR NEW."expected_total" IS DISTINCT FROM OLD."expected_total"
    OR NEW."declared_total" IS DISTINCT FROM OLD."declared_total"
    OR NEW."difference_total" IS DISTINCT FROM OLD."difference_total"
    OR NEW."snapshot_hash" IS DISTINCT FROM OLD."snapshot_hash"
  THEN
    RAISE EXCEPTION 'CONCILIACAO_CAIXA_IMUTAVEL';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "cash_reconciliation_snapshot_immutable"
BEFORE UPDATE ON "cash_reconciliations"
FOR EACH ROW EXECUTE FUNCTION protect_cash_reconciliation_snapshot();
