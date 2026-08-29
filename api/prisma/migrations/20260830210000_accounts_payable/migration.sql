CREATE TYPE "AccountPayableStatus" AS ENUM ('DRAFT', 'OPEN', 'PARTIAL', 'PAID', 'CANCELLED', 'DISPUTED');
CREATE TYPE "PayableInstallmentStatus" AS ENUM ('OPEN', 'PARTIAL', 'PAID', 'CANCELLED');
CREATE TYPE "PayablePaymentMethod" AS ENUM ('CASH', 'PIX', 'BANK_TRANSFER', 'BOLETO', 'CARD', 'OTHER');

CREATE TABLE "accounts_payable" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "supplier_id" UUID NOT NULL,
  "purchase_order_id" UUID NOT NULL,
  "purchase_receipt_id" UUID NOT NULL,
  "dfe_document_id" UUID NOT NULL,
  "created_by_id" UUID NOT NULL,
  "approved_by_id" UUID,
  "status" "AccountPayableStatus" NOT NULL DEFAULT 'DRAFT',
  "document_number" VARCHAR(60),
  "access_key" CHAR(44) NOT NULL,
  "issued_at" TIMESTAMPTZ(3),
  "total_amount" DECIMAL(15,2) NOT NULL,
  "paid_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "configured_at" TIMESTAMPTZ(3),
  "cancelled_at" TIMESTAMPTZ(3),
  "notes" VARCHAR(1000),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "accounts_payable_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "accounts_payable_amounts_valid" CHECK ("total_amount" >= 0 AND "paid_amount" >= 0 AND "paid_amount" <= "total_amount")
);

CREATE TABLE "payable_installments" (
  "id" UUID NOT NULL,
  "payable_id" UUID NOT NULL,
  "number" INTEGER NOT NULL,
  "due_at" DATE NOT NULL,
  "amount" DECIMAL(15,2) NOT NULL,
  "paid_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "status" "PayableInstallmentStatus" NOT NULL DEFAULT 'OPEN',
  "barcode" VARCHAR(200),
  "external_ref" VARCHAR(120),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "payable_installments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payable_installments_values_valid" CHECK ("number" > 0 AND "amount" > 0 AND "paid_amount" >= 0 AND "paid_amount" <= "amount")
);

CREATE TABLE "payable_payments" (
  "id" UUID NOT NULL,
  "installment_id" UUID NOT NULL,
  "recorded_by_id" UUID NOT NULL,
  "reversed_by_id" UUID,
  "amount" DECIMAL(15,2) NOT NULL,
  "method" "PayablePaymentMethod" NOT NULL,
  "paid_at" TIMESTAMPTZ(3) NOT NULL,
  "reference" VARCHAR(160),
  "notes" VARCHAR(500),
  "reversed_at" TIMESTAMPTZ(3),
  "reversal_reason" VARCHAR(500),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payable_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payable_payments_positive_amount" CHECK ("amount" > 0),
  CONSTRAINT "payable_payments_reversal_complete" CHECK (("reversed_at" IS NULL AND "reversed_by_id" IS NULL AND "reversal_reason" IS NULL) OR ("reversed_at" IS NOT NULL AND "reversed_by_id" IS NOT NULL AND length("reversal_reason") >= 10))
);

CREATE UNIQUE INDEX "accounts_payable_purchase_receipt_id_key" ON "accounts_payable"("purchase_receipt_id");
CREATE UNIQUE INDEX "accounts_payable_dfe_document_id_key" ON "accounts_payable"("dfe_document_id");
CREATE INDEX "accounts_payable_company_id_status_created_at_idx" ON "accounts_payable"("company_id", "status", "created_at");
CREATE INDEX "accounts_payable_supplier_id_status_idx" ON "accounts_payable"("supplier_id", "status");
CREATE INDEX "accounts_payable_purchase_order_id_idx" ON "accounts_payable"("purchase_order_id");
CREATE UNIQUE INDEX "payable_installments_payable_id_number_key" ON "payable_installments"("payable_id", "number");
CREATE INDEX "payable_installments_status_due_at_idx" ON "payable_installments"("status", "due_at");
CREATE INDEX "payable_payments_installment_id_paid_at_idx" ON "payable_payments"("installment_id", "paid_at");
CREATE INDEX "payable_payments_reversed_at_paid_at_idx" ON "payable_payments"("reversed_at", "paid_at");

ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_purchase_receipt_id_fkey" FOREIGN KEY ("purchase_receipt_id") REFERENCES "purchase_order_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_dfe_document_id_fkey" FOREIGN KEY ("dfe_document_id") REFERENCES "dfe_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payable_installments" ADD CONSTRAINT "payable_installments_payable_id_fkey" FOREIGN KEY ("payable_id") REFERENCES "accounts_payable"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payable_payments" ADD CONSTRAINT "payable_payments_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "payable_installments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payable_payments" ADD CONSTRAINT "payable_payments_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payable_payments" ADD CONSTRAINT "payable_payments_reversed_by_id_fkey" FOREIGN KEY ("reversed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "accounts_payable" (
  "id", "company_id", "supplier_id", "purchase_order_id", "purchase_receipt_id", "dfe_document_id", "created_by_id",
  "status", "document_number", "access_key", "issued_at", "total_amount", "paid_amount", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(), po."company_id", po."supplier_id", po."id", por."id", dd."id", por."linked_by_id",
  'DRAFT'::"AccountPayableStatus", dd."document_number", dd."access_key", dd."issued_at", dd."total_amount", 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "purchase_order_receipts" por
JOIN "purchase_orders" po ON po."id" = por."purchase_order_id"
JOIN "dfe_receivings" dr ON dr."id" = por."dfe_receiving_id"
JOIN "dfe_documents" dd ON dd."id" = dr."document_id"
WHERE dd."access_key" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "accounts_payable" ap WHERE ap."purchase_receipt_id" = por."id");

CREATE OR REPLACE FUNCTION protect_payable_payment_history() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'PAYABLE_PAYMENT_CANNOT_BE_DELETED';
  END IF;
  IF OLD."reversed_at" IS NOT NULL THEN
    RAISE EXCEPTION 'REVERSED_PAYABLE_PAYMENT_IS_IMMUTABLE';
  END IF;
  IF OLD."installment_id" <> NEW."installment_id" OR OLD."recorded_by_id" <> NEW."recorded_by_id"
     OR OLD."amount" <> NEW."amount" OR OLD."method" <> NEW."method" OR OLD."paid_at" <> NEW."paid_at"
     OR OLD."reference" IS DISTINCT FROM NEW."reference" OR OLD."notes" IS DISTINCT FROM NEW."notes" THEN
    RAISE EXCEPTION 'PAYABLE_PAYMENT_CORE_IS_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "payable_payment_no_delete" BEFORE DELETE ON "payable_payments"
FOR EACH ROW EXECUTE FUNCTION protect_payable_payment_history();
CREATE TRIGGER "payable_payment_reversal_only" BEFORE UPDATE ON "payable_payments"
FOR EACH ROW EXECUTE FUNCTION protect_payable_payment_history();
