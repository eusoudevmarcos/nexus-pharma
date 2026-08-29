CREATE TYPE "PurchaseQuoteStatus" AS ENUM ('DRAFT', 'OPEN', 'ANALYSIS', 'AWARDED', 'CANCELLED');
CREATE TYPE "SupplierProposalStatus" AS ENUM ('INVITED', 'RECEIVED', 'DECLINED', 'NOT_SELECTED', 'AWARDED');

CREATE TABLE "purchase_quotes" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "created_by_id" UUID NOT NULL,
  "awarded_by_id" UUID,
  "purchase_order_id" UUID,
  "code" VARCHAR(50) NOT NULL,
  "status" "PurchaseQuoteStatus" NOT NULL DEFAULT 'DRAFT',
  "response_due_at" DATE,
  "opened_at" TIMESTAMPTZ(3),
  "awarded_at" TIMESTAMPTZ(3),
  "cancelled_at" TIMESTAMPTZ(3),
  "notes" VARCHAR(1000),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "purchase_quotes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "purchase_quote_items" (
  "id" UUID NOT NULL,
  "quote_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "requested_quantity" DECIMAL(15,3) NOT NULL,
  "current_cost" DECIMAL(15,4) NOT NULL,
  "sale_price" DECIMAL(15,2) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "purchase_quote_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchase_quote_items_values_valid" CHECK ("requested_quantity" > 0 AND "current_cost" >= 0 AND "sale_price" >= 0)
);

CREATE TABLE "supplier_proposals" (
  "id" UUID NOT NULL,
  "quote_id" UUID NOT NULL,
  "supplier_id" UUID NOT NULL,
  "status" "SupplierProposalStatus" NOT NULL DEFAULT 'INVITED',
  "freight_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "commercial_discount_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "financial_discount_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "payment_terms" VARCHAR(300),
  "delivery_days" INTEGER,
  "valid_until" DATE,
  "gross_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "net_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "potential_gross_profit" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "notes" VARCHAR(1000),
  "submitted_at" TIMESTAMPTZ(3),
  "awarded_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "supplier_proposals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "supplier_proposals_values_valid" CHECK (
    "freight_amount" >= 0 AND "commercial_discount_amount" >= 0 AND "financial_discount_amount" >= 0
    AND "gross_amount" >= 0 AND "net_amount" >= 0
    AND ("delivery_days" IS NULL OR "delivery_days" BETWEEN 0 AND 365)
  )
);

CREATE TABLE "supplier_proposal_items" (
  "id" UUID NOT NULL,
  "proposal_id" UUID NOT NULL,
  "quote_item_id" UUID NOT NULL,
  "offered_quantity" DECIMAL(15,3) NOT NULL,
  "bonus_quantity" DECIMAL(15,3) NOT NULL DEFAULT 0,
  "unit_cost" DECIMAL(15,4) NOT NULL,
  "discount_percent" DECIMAL(9,6) NOT NULL DEFAULT 0,
  "nonrecoverable_tax_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "gross_amount" DECIMAL(15,2) NOT NULL,
  "allocated_freight" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "allocated_discount" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "net_total" DECIMAL(15,2) NOT NULL,
  "net_unit_cost" DECIMAL(15,4) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "supplier_proposal_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "supplier_proposal_items_values_valid" CHECK (
    "offered_quantity" > 0 AND "bonus_quantity" >= 0 AND "unit_cost" >= 0
    AND "discount_percent" BETWEEN 0 AND 100 AND "nonrecoverable_tax_amount" >= 0
    AND "gross_amount" >= 0 AND "allocated_freight" >= 0 AND "allocated_discount" >= 0
    AND "net_total" >= 0 AND "net_unit_cost" >= 0
  )
);

CREATE UNIQUE INDEX "purchase_quotes_purchase_order_id_key" ON "purchase_quotes"("purchase_order_id");
CREATE UNIQUE INDEX "purchase_quotes_company_id_code_key" ON "purchase_quotes"("company_id", "code");
CREATE INDEX "purchase_quotes_company_id_status_created_at_idx" ON "purchase_quotes"("company_id", "status", "created_at");
CREATE INDEX "purchase_quotes_store_id_status_idx" ON "purchase_quotes"("store_id", "status");
CREATE UNIQUE INDEX "purchase_quote_items_quote_id_product_id_key" ON "purchase_quote_items"("quote_id", "product_id");
CREATE INDEX "purchase_quote_items_product_id_created_at_idx" ON "purchase_quote_items"("product_id", "created_at");
CREATE UNIQUE INDEX "supplier_proposals_quote_id_supplier_id_key" ON "supplier_proposals"("quote_id", "supplier_id");
CREATE INDEX "supplier_proposals_supplier_id_status_created_at_idx" ON "supplier_proposals"("supplier_id", "status", "created_at");
CREATE INDEX "supplier_proposals_quote_id_status_idx" ON "supplier_proposals"("quote_id", "status");
CREATE UNIQUE INDEX "supplier_proposal_items_proposal_id_quote_item_id_key" ON "supplier_proposal_items"("proposal_id", "quote_item_id");
CREATE INDEX "supplier_proposal_items_quote_item_id_idx" ON "supplier_proposal_items"("quote_item_id");

ALTER TABLE "purchase_quotes" ADD CONSTRAINT "purchase_quotes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_quotes" ADD CONSTRAINT "purchase_quotes_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_quotes" ADD CONSTRAINT "purchase_quotes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_quotes" ADD CONSTRAINT "purchase_quotes_awarded_by_id_fkey" FOREIGN KEY ("awarded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_quotes" ADD CONSTRAINT "purchase_quotes_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_quote_items" ADD CONSTRAINT "purchase_quote_items_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "purchase_quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_quote_items" ADD CONSTRAINT "purchase_quote_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_proposals" ADD CONSTRAINT "supplier_proposals_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "purchase_quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_proposals" ADD CONSTRAINT "supplier_proposals_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_proposal_items" ADD CONSTRAINT "supplier_proposal_items_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "supplier_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_proposal_items" ADD CONSTRAINT "supplier_proposal_items_quote_item_id_fkey" FOREIGN KEY ("quote_item_id") REFERENCES "purchase_quote_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION reject_final_purchase_quote_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'FINAL_PURCHASE_QUOTE_IS_IMMUTABLE';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "purchase_quotes_final_immutable" BEFORE UPDATE ON "purchase_quotes"
FOR EACH ROW WHEN (OLD."status" IN ('AWARDED', 'CANCELLED')) EXECUTE FUNCTION reject_final_purchase_quote_mutation();
CREATE TRIGGER "supplier_proposals_final_immutable" BEFORE UPDATE ON "supplier_proposals"
FOR EACH ROW WHEN (OLD."status" IN ('AWARDED', 'NOT_SELECTED')) EXECUTE FUNCTION reject_final_purchase_quote_mutation();
