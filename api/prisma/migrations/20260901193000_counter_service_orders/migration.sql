ALTER TYPE "TenantRole" ADD VALUE IF NOT EXISTS 'ATTENDANT';

CREATE TYPE "CounterOrderStatus" AS ENUM (
  'WAITING_CASHIER',
  'IN_CHECKOUT',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED'
);

CREATE TABLE "counter_orders" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "attendant_id" UUID NOT NULL,
  "pharmacist_credential_id" UUID,
  "cash_session_id" UUID,
  "claimed_by_id" UUID,
  "code" VARCHAR(32) NOT NULL,
  "status" "CounterOrderStatus" NOT NULL DEFAULT 'WAITING_CASHIER',
  "customer_tax_id" VARCHAR(14),
  "customer_name" VARCHAR(180),
  "customer_birth_date" DATE,
  "discount_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "original_gross_amount" DECIMAL(15,2) NOT NULL,
  "gross_amount" DECIMAL(15,2) NOT NULL,
  "notes" VARCHAR(500),
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "sent_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimed_at" TIMESTAMPTZ(3),
  "completed_at" TIMESTAMPTZ(3),
  "cancelled_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "counter_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "counter_order_items" (
  "id" UUID NOT NULL,
  "counter_order_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "ean" VARCHAR(14) NOT NULL,
  "product_name" VARCHAR(180) NOT NULL,
  "quantity" DECIMAL(15,3) NOT NULL,
  "list_unit_price" DECIMAL(15,2) NOT NULL,
  "commercial_unit_price" DECIMAL(15,2) NOT NULL,
  "prescription" JSONB NOT NULL DEFAULT '{}',
  "control_snapshot" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "counter_order_items_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "sales" ADD COLUMN "counter_order_id" UUID;

CREATE UNIQUE INDEX "counter_orders_company_id_code_key" ON "counter_orders"("company_id", "code");
CREATE INDEX "counter_orders_company_id_status_sent_at_idx" ON "counter_orders"("company_id", "status", "sent_at");
CREATE INDEX "counter_orders_store_id_status_expires_at_idx" ON "counter_orders"("store_id", "status", "expires_at");
CREATE INDEX "counter_orders_attendant_id_sent_at_idx" ON "counter_orders"("attendant_id", "sent_at");
CREATE UNIQUE INDEX "counter_order_items_counter_order_id_product_id_key" ON "counter_order_items"("counter_order_id", "product_id");
CREATE INDEX "counter_order_items_product_id_idx" ON "counter_order_items"("product_id");
CREATE UNIQUE INDEX "sales_counter_order_id_key" ON "sales"("counter_order_id");

ALTER TABLE "counter_orders" ADD CONSTRAINT "counter_orders_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "counter_orders" ADD CONSTRAINT "counter_orders_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "counter_orders" ADD CONSTRAINT "counter_orders_attendant_id_fkey" FOREIGN KEY ("attendant_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "counter_orders" ADD CONSTRAINT "counter_orders_pharmacist_credential_id_fkey" FOREIGN KEY ("pharmacist_credential_id") REFERENCES "pharmacist_credentials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "counter_orders" ADD CONSTRAINT "counter_orders_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "counter_orders" ADD CONSTRAINT "counter_orders_claimed_by_id_fkey" FOREIGN KEY ("claimed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "counter_order_items" ADD CONSTRAINT "counter_order_items_counter_order_id_fkey" FOREIGN KEY ("counter_order_id") REFERENCES "counter_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "counter_order_items" ADD CONSTRAINT "counter_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales" ADD CONSTRAINT "sales_counter_order_id_fkey" FOREIGN KEY ("counter_order_id") REFERENCES "counter_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
