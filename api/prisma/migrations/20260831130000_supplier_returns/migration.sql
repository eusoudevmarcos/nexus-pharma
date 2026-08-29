CREATE TYPE "SupplierReturnScope" AS ENUM ('ONE', 'SOME', 'ALL');
CREATE TYPE "SupplierReturnStatus" AS ENUM ('PENDING_FISCAL', 'AUTHORIZED', 'FISCAL_REJECTED');
CREATE TYPE "SupplierReturnFinancialEffect" AS ENUM ('NONE', 'PAYABLE_REDUCED', 'SUPPLIER_CREDIT', 'MIXED');

CREATE TABLE "supplier_returns" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "supplier_id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "purchase_receipt_id" UUID NOT NULL,
  "dfe_document_id" UUID NOT NULL,
  "account_payable_id" UUID,
  "created_by_id" UUID NOT NULL,
  "idempotency_key" UUID NOT NULL,
  "code" VARCHAR(50) NOT NULL,
  "scope" "SupplierReturnScope" NOT NULL,
  "status" "SupplierReturnStatus" NOT NULL DEFAULT 'PENDING_FISCAL',
  "financial_effect" "SupplierReturnFinancialEffect" NOT NULL DEFAULT 'NONE',
  "reason" VARCHAR(1000) NOT NULL,
  "source_access_key" CHAR(44) NOT NULL,
  "source_document_number" VARCHAR(60),
  "total_amount" DECIMAL(15,2) NOT NULL,
  "payable_adjustment_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "supplier_credit_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "fiscal_draft" JSONB NOT NULL DEFAULT '{}',
  "fiscal_access_key" CHAR(44),
  "fiscal_protocol" VARCHAR(60),
  "fiscal_rejection_reason" VARCHAR(1000),
  "internal_reversed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "fiscal_authorized_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "supplier_returns_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "supplier_returns_amounts_check" CHECK (
    "total_amount" > 0 AND "payable_adjustment_amount" >= 0 AND "supplier_credit_amount" >= 0
    AND "payable_adjustment_amount" + "supplier_credit_amount" = "total_amount"
  )
);

CREATE TABLE "supplier_return_items" (
  "id" UUID NOT NULL,
  "supplier_return_id" UUID NOT NULL,
  "receiving_item_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "lot_id" UUID NOT NULL,
  "provenance_id" UUID NOT NULL,
  "source_item_number" INTEGER NOT NULL,
  "source_received_quantity" DECIMAL(15,3) NOT NULL,
  "quantity" DECIMAL(15,3) NOT NULL,
  "unit_cost" DECIMAL(15,4) NOT NULL,
  "total_amount" DECIMAL(15,2) NOT NULL,
  "tax_snapshot" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_return_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "supplier_return_items_values_check" CHECK (
    "source_received_quantity" > 0 AND "quantity" > 0
    AND "quantity" <= "source_received_quantity" AND "unit_cost" >= 0 AND "total_amount" >= 0
  )
);

CREATE UNIQUE INDEX "supplier_returns_company_id_idempotency_key_key" ON "supplier_returns"("company_id", "idempotency_key");
CREATE UNIQUE INDEX "supplier_returns_company_id_code_key" ON "supplier_returns"("company_id", "code");
CREATE UNIQUE INDEX "supplier_returns_fiscal_access_key_key" ON "supplier_returns"("fiscal_access_key");
CREATE INDEX "supplier_returns_company_id_status_created_at_idx" ON "supplier_returns"("company_id", "status", "created_at");
CREATE INDEX "supplier_returns_purchase_receipt_id_created_at_idx" ON "supplier_returns"("purchase_receipt_id", "created_at");
CREATE INDEX "supplier_returns_supplier_id_created_at_idx" ON "supplier_returns"("supplier_id", "created_at");
CREATE UNIQUE INDEX "supplier_return_items_supplier_return_id_receiving_item_id_key" ON "supplier_return_items"("supplier_return_id", "receiving_item_id");
CREATE INDEX "supplier_return_items_receiving_item_id_created_at_idx" ON "supplier_return_items"("receiving_item_id", "created_at");
CREATE INDEX "supplier_return_items_product_id_created_at_idx" ON "supplier_return_items"("product_id", "created_at");
CREATE INDEX "supplier_return_items_provenance_id_idx" ON "supplier_return_items"("provenance_id");

ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_purchase_receipt_id_fkey" FOREIGN KEY ("purchase_receipt_id") REFERENCES "purchase_order_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_dfe_document_id_fkey" FOREIGN KEY ("dfe_document_id") REFERENCES "dfe_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_account_payable_id_fkey" FOREIGN KEY ("account_payable_id") REFERENCES "accounts_payable"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "supplier_return_items" ADD CONSTRAINT "supplier_return_items_supplier_return_id_fkey" FOREIGN KEY ("supplier_return_id") REFERENCES "supplier_returns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_return_items" ADD CONSTRAINT "supplier_return_items_receiving_item_id_fkey" FOREIGN KEY ("receiving_item_id") REFERENCES "dfe_receiving_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_return_items" ADD CONSTRAINT "supplier_return_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_return_items" ADD CONSTRAINT "supplier_return_items_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "inventory_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_return_items" ADD CONSTRAINT "supplier_return_items_provenance_id_fkey" FOREIGN KEY ("provenance_id") REFERENCES "tax_provenances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION block_supplier_return_mutation() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'SUPPLIER_RETURN_HISTORY_IS_IMMUTABLE';
  END IF;
  IF OLD."internal_reversed_at" IS DISTINCT FROM NEW."internal_reversed_at"
     OR OLD."company_id" IS DISTINCT FROM NEW."company_id"
     OR OLD."purchase_receipt_id" IS DISTINCT FROM NEW."purchase_receipt_id"
     OR OLD."total_amount" IS DISTINCT FROM NEW."total_amount"
     OR OLD."scope" IS DISTINCT FROM NEW."scope" THEN
    RAISE EXCEPTION 'SUPPLIER_RETURN_REVERSAL_FIELDS_ARE_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "supplier_return_immutable_history"
BEFORE UPDATE OR DELETE ON "supplier_returns"
FOR EACH ROW EXECUTE FUNCTION block_supplier_return_mutation();

CREATE OR REPLACE FUNCTION block_supplier_return_item_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'SUPPLIER_RETURN_ITEMS_ARE_IMMUTABLE';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "supplier_return_items_immutable_history"
BEFORE UPDATE OR DELETE ON "supplier_return_items"
FOR EACH ROW EXECUTE FUNCTION block_supplier_return_item_mutation();
