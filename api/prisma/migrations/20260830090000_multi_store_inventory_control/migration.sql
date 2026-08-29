CREATE TYPE "StockReservationStatus" AS ENUM ('ACTIVE', 'FULFILLED', 'RELEASED', 'EXPIRED');
CREATE TYPE "StockTransferStatus" AS ENUM ('DRAFT', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED');
CREATE TYPE "InventoryCountStatus" AS ENUM ('OPEN', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE "StockAdjustmentStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE "StockAdjustmentReason" AS ENUM ('LOSS', 'DAMAGE', 'EXPIRED', 'CORRECTION');

ALTER TABLE "stock_movements" ADD COLUMN "store_id" UUID;

CREATE TABLE "store_stock_balances" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "lot_id" UUID NOT NULL,
  "on_hand" DECIMAL(15,3) NOT NULL DEFAULT 0,
  "reserved" DECIMAL(15,3) NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "store_stock_balances_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "store_stock_balances_nonnegative" CHECK ("on_hand" >= 0 AND "reserved" >= 0 AND "reserved" <= "on_hand")
);

CREATE TABLE "stock_reservations" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "lot_id" UUID NOT NULL,
  "created_by_id" UUID NOT NULL,
  "status" "StockReservationStatus" NOT NULL DEFAULT 'ACTIVE',
  "quantity" DECIMAL(15,3) NOT NULL,
  "reference" VARCHAR(120),
  "notes" VARCHAR(500),
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "finalized_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stock_reservations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stock_reservations_positive_quantity" CHECK ("quantity" > 0)
);

CREATE TABLE "stock_transfers" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "origin_store_id" UUID NOT NULL,
  "destination_store_id" UUID NOT NULL,
  "created_by_id" UUID NOT NULL,
  "dispatched_by_id" UUID,
  "received_by_id" UUID,
  "status" "StockTransferStatus" NOT NULL DEFAULT 'DRAFT',
  "code" VARCHAR(40) NOT NULL,
  "notes" VARCHAR(500),
  "dispatched_at" TIMESTAMPTZ(3),
  "received_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stock_transfers_distinct_stores" CHECK ("origin_store_id" <> "destination_store_id")
);

CREATE TABLE "stock_transfer_items" (
  "id" UUID NOT NULL,
  "transfer_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "lot_id" UUID NOT NULL,
  "quantity" DECIMAL(15,3) NOT NULL,
  "provenance_snapshot" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stock_transfer_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stock_transfer_items_positive_quantity" CHECK ("quantity" > 0)
);

CREATE TABLE "inventory_counts" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "created_by_id" UUID NOT NULL,
  "submitted_by_id" UUID,
  "approved_by_id" UUID,
  "status" "InventoryCountStatus" NOT NULL DEFAULT 'OPEN',
  "code" VARCHAR(40) NOT NULL,
  "notes" VARCHAR(500),
  "submitted_at" TIMESTAMPTZ(3),
  "approved_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "inventory_counts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory_count_items" (
  "id" UUID NOT NULL,
  "inventory_count_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "lot_id" UUID NOT NULL,
  "expected_quantity" DECIMAL(15,3) NOT NULL,
  "counted_quantity" DECIMAL(15,3),
  "difference_quantity" DECIMAL(15,3),
  "notes" VARCHAR(500),
  CONSTRAINT "inventory_count_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_count_items_nonnegative" CHECK ("expected_quantity" >= 0 AND ("counted_quantity" IS NULL OR "counted_quantity" >= 0))
);

CREATE TABLE "stock_adjustments" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "lot_id" UUID NOT NULL,
  "created_by_id" UUID NOT NULL,
  "approved_by_id" UUID,
  "status" "StockAdjustmentStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
  "reason" "StockAdjustmentReason" NOT NULL,
  "quantity_delta" DECIMAL(15,3) NOT NULL,
  "justification" VARCHAR(500) NOT NULL,
  "approved_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "stock_adjustments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stock_adjustments_nonzero" CHECK ("quantity_delta" <> 0),
  CONSTRAINT "stock_adjustments_reason_direction" CHECK ("reason" = 'CORRECTION' OR "quantity_delta" < 0)
);

CREATE UNIQUE INDEX "store_stock_balances_store_id_lot_id_key" ON "store_stock_balances"("store_id", "lot_id");
CREATE INDEX "store_stock_balances_company_id_store_id_product_id_idx" ON "store_stock_balances"("company_id", "store_id", "product_id");
CREATE INDEX "stock_reservations_company_id_status_expires_at_idx" ON "stock_reservations"("company_id", "status", "expires_at");
CREATE INDEX "stock_reservations_store_id_product_id_status_idx" ON "stock_reservations"("store_id", "product_id", "status");
CREATE UNIQUE INDEX "stock_transfers_company_id_code_key" ON "stock_transfers"("company_id", "code");
CREATE INDEX "stock_transfers_company_id_status_created_at_idx" ON "stock_transfers"("company_id", "status", "created_at");
CREATE INDEX "stock_transfers_origin_store_id_destination_store_id_status_idx" ON "stock_transfers"("origin_store_id", "destination_store_id", "status");
CREATE UNIQUE INDEX "stock_transfer_items_transfer_id_lot_id_key" ON "stock_transfer_items"("transfer_id", "lot_id");
CREATE INDEX "stock_transfer_items_product_id_lot_id_idx" ON "stock_transfer_items"("product_id", "lot_id");
CREATE UNIQUE INDEX "inventory_counts_company_id_code_key" ON "inventory_counts"("company_id", "code");
CREATE INDEX "inventory_counts_company_id_status_created_at_idx" ON "inventory_counts"("company_id", "status", "created_at");
CREATE UNIQUE INDEX "inventory_count_items_inventory_count_id_lot_id_key" ON "inventory_count_items"("inventory_count_id", "lot_id");
CREATE INDEX "inventory_count_items_product_id_lot_id_idx" ON "inventory_count_items"("product_id", "lot_id");
CREATE INDEX "stock_adjustments_company_id_status_created_at_idx" ON "stock_adjustments"("company_id", "status", "created_at");
CREATE INDEX "stock_adjustments_store_id_product_id_lot_id_idx" ON "stock_adjustments"("store_id", "product_id", "lot_id");
CREATE INDEX "stock_movements_store_id_occurred_at_idx" ON "stock_movements"("store_id", "occurred_at");

ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "store_stock_balances" ADD CONSTRAINT "store_stock_balances_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "store_stock_balances" ADD CONSTRAINT "store_stock_balances_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "store_stock_balances" ADD CONSTRAINT "store_stock_balances_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "store_stock_balances" ADD CONSTRAINT "store_stock_balances_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "inventory_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "inventory_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_origin_store_id_fkey" FOREIGN KEY ("origin_store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_destination_store_id_fkey" FOREIGN KEY ("destination_store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_dispatched_by_id_fkey" FOREIGN KEY ("dispatched_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_received_by_id_fkey" FOREIGN KEY ("received_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "stock_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "inventory_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_count_items" ADD CONSTRAINT "inventory_count_items_inventory_count_id_fkey" FOREIGN KEY ("inventory_count_id") REFERENCES "inventory_counts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_count_items" ADD CONSTRAINT "inventory_count_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_count_items" ADD CONSTRAINT "inventory_count_items_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "inventory_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "inventory_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "store_stock_balances" ("id", "company_id", "store_id", "product_id", "lot_id", "on_hand", "reserved", "updated_at")
SELECT gen_random_uuid(), p."company_id", selected_store."id", l."product_id", l."id", l."quantity", 0, CURRENT_TIMESTAMP
FROM "inventory_lots" l
JOIN "products" p ON p."id" = l."product_id"
JOIN LATERAL (
  SELECT s."id"
  FROM "stores" s
  WHERE s."company_id" = p."company_id" AND s."active" = true
  ORDER BY CASE WHEN s."type" = 'MAIN' THEN 0 ELSE 1 END, s."created_at"
  LIMIT 1
) selected_store ON true
WHERE l."quantity" > 0;

UPDATE "stock_movements" m
SET "store_id" = (
  SELECT s."id"
  FROM "stores" s
  WHERE s."company_id" = m."company_id"
  ORDER BY CASE WHEN s."type" = 'MAIN' THEN 0 ELSE 1 END, s."created_at"
  LIMIT 1
)
WHERE m."store_id" IS NULL
  AND EXISTS (SELECT 1 FROM "stores" s WHERE s."company_id" = m."company_id");

CREATE OR REPLACE FUNCTION reject_final_stock_workflow_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'FINAL_STOCK_WORKFLOW_IS_IMMUTABLE';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "stock_transfers_final_immutable" BEFORE UPDATE ON "stock_transfers"
FOR EACH ROW WHEN (OLD."status" IN ('RECEIVED', 'CANCELLED')) EXECUTE FUNCTION reject_final_stock_workflow_mutation();
CREATE TRIGGER "inventory_counts_final_immutable" BEFORE UPDATE ON "inventory_counts"
FOR EACH ROW WHEN (OLD."status" IN ('APPROVED', 'REJECTED', 'CANCELLED')) EXECUTE FUNCTION reject_final_stock_workflow_mutation();
CREATE TRIGGER "stock_adjustments_final_immutable" BEFORE UPDATE ON "stock_adjustments"
FOR EACH ROW WHEN (OLD."status" IN ('APPROVED', 'REJECTED', 'CANCELLED')) EXECUTE FUNCTION reject_final_stock_workflow_mutation();
