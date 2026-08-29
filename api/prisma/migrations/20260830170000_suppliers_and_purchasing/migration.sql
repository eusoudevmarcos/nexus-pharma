CREATE TYPE "SupplierStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'BLOCKED');
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

CREATE TABLE "suppliers" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "tax_id" CHAR(14) NOT NULL,
  "legal_name" VARCHAR(180) NOT NULL,
  "trade_name" VARCHAR(180) NOT NULL,
  "email" VARCHAR(254),
  "phone" VARCHAR(30),
  "contact_name" VARCHAR(120),
  "lead_time_days" INTEGER NOT NULL DEFAULT 7,
  "minimum_order_value" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "payment_terms" VARCHAR(300),
  "status" "SupplierStatus" NOT NULL DEFAULT 'ACTIVE',
  "notes" VARCHAR(1000),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "suppliers_lead_time_valid" CHECK ("lead_time_days" BETWEEN 0 AND 365),
  CONSTRAINT "suppliers_minimum_order_nonnegative" CHECK ("minimum_order_value" >= 0)
);

CREATE TABLE "supplier_products" (
  "id" UUID NOT NULL,
  "supplier_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "supplier_code" VARCHAR(80),
  "last_unit_cost" DECIMAL(15,4),
  "minimum_order_quantity" DECIMAL(15,3) NOT NULL DEFAULT 1,
  "package_quantity" DECIMAL(15,3) NOT NULL DEFAULT 1,
  "preferred" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "supplier_products_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "supplier_products_quantities_positive" CHECK ("minimum_order_quantity" > 0 AND "package_quantity" > 0),
  CONSTRAINT "supplier_products_cost_nonnegative" CHECK ("last_unit_cost" IS NULL OR "last_unit_cost" >= 0)
);

CREATE TABLE "purchase_orders" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "supplier_id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "created_by_id" UUID NOT NULL,
  "approved_by_id" UUID,
  "code" VARCHAR(50) NOT NULL,
  "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "ordered_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expected_at" DATE,
  "approved_at" TIMESTAMPTZ(3),
  "cancelled_at" TIMESTAMPTZ(3),
  "total_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "notes" VARCHAR(1000),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchase_orders_total_nonnegative" CHECK ("total_amount" >= 0)
);

CREATE TABLE "purchase_order_items" (
  "id" UUID NOT NULL,
  "purchase_order_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "requested_quantity" DECIMAL(15,3) NOT NULL,
  "received_quantity" DECIMAL(15,3) NOT NULL DEFAULT 0,
  "unit_cost" DECIMAL(15,4) NOT NULL,
  "total_amount" DECIMAL(15,2) NOT NULL,
  "notes" VARCHAR(500),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchase_order_items_valid_values" CHECK ("requested_quantity" > 0 AND "received_quantity" >= 0 AND "unit_cost" >= 0 AND "total_amount" >= 0)
);

CREATE TABLE "purchase_order_receipts" (
  "id" UUID NOT NULL,
  "purchase_order_id" UUID NOT NULL,
  "dfe_receiving_id" UUID NOT NULL,
  "linked_by_id" UUID NOT NULL,
  "notes" VARCHAR(500),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "purchase_order_receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "suppliers_company_id_tax_id_key" ON "suppliers"("company_id", "tax_id");
CREATE INDEX "suppliers_company_id_status_trade_name_idx" ON "suppliers"("company_id", "status", "trade_name");
CREATE UNIQUE INDEX "supplier_products_supplier_id_product_id_key" ON "supplier_products"("supplier_id", "product_id");
CREATE INDEX "supplier_products_product_id_preferred_active_idx" ON "supplier_products"("product_id", "preferred", "active");
CREATE UNIQUE INDEX "purchase_orders_company_id_code_key" ON "purchase_orders"("company_id", "code");
CREATE INDEX "purchase_orders_company_id_status_ordered_at_idx" ON "purchase_orders"("company_id", "status", "ordered_at");
CREATE INDEX "purchase_orders_supplier_id_status_idx" ON "purchase_orders"("supplier_id", "status");
CREATE INDEX "purchase_orders_store_id_status_idx" ON "purchase_orders"("store_id", "status");
CREATE UNIQUE INDEX "purchase_order_items_purchase_order_id_product_id_key" ON "purchase_order_items"("purchase_order_id", "product_id");
CREATE INDEX "purchase_order_items_product_id_created_at_idx" ON "purchase_order_items"("product_id", "created_at");
CREATE UNIQUE INDEX "purchase_order_receipts_dfe_receiving_id_key" ON "purchase_order_receipts"("dfe_receiving_id");
CREATE UNIQUE INDEX "purchase_order_receipts_purchase_order_id_dfe_receiving_id_key" ON "purchase_order_receipts"("purchase_order_id", "dfe_receiving_id");
CREATE INDEX "purchase_order_receipts_purchase_order_id_created_at_idx" ON "purchase_order_receipts"("purchase_order_id", "created_at");

ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_order_receipts" ADD CONSTRAINT "purchase_order_receipts_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_order_receipts" ADD CONSTRAINT "purchase_order_receipts_dfe_receiving_id_fkey" FOREIGN KEY ("dfe_receiving_id") REFERENCES "dfe_receivings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_order_receipts" ADD CONSTRAINT "purchase_order_receipts_linked_by_id_fkey" FOREIGN KEY ("linked_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION reject_final_purchase_order_mutation() RETURNS trigger AS $$
BEGIN
  IF OLD."status" IN ('RECEIVED', 'CANCELLED') THEN
    RAISE EXCEPTION 'FINAL_PURCHASE_ORDER_IS_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "purchase_orders_final_immutable" BEFORE UPDATE ON "purchase_orders"
FOR EACH ROW EXECUTE FUNCTION reject_final_purchase_order_mutation();
