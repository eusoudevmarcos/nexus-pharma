CREATE TYPE "ProductSalesStrategy" AS ENUM (
  'NORMAL',
  'FEATURED',
  'PROMOTION',
  'HIGH_MARGIN',
  'FAST_MOVING',
  'CLEARANCE',
  'EXPIRY_PRIORITY',
  'LAUNCH'
);

ALTER TABLE "products"
  ADD COLUMN "sales_strategy" "ProductSalesStrategy" NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN "promotion_price" DECIMAL(15,2),
  ADD COLUMN "strategy_starts_at" TIMESTAMPTZ(3),
  ADD COLUMN "strategy_ends_at" TIMESTAMPTZ(3),
  ADD COLUMN "strategy_reason" VARCHAR(500),
  ADD COLUMN "strategy_metadata" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "strategy_updated_at" TIMESTAMPTZ(3);

ALTER TABLE "products" ADD CONSTRAINT "products_sales_strategy_check" CHECK (
  ("promotion_price" IS NULL OR "promotion_price" >= 0)
  AND ("strategy_ends_at" IS NULL OR "strategy_starts_at" IS NULL OR "strategy_ends_at" >= "strategy_starts_at")
  AND ("sales_strategy" <> 'PROMOTION' OR "promotion_price" IS NOT NULL)
);

CREATE INDEX "products_company_id_sales_strategy_active_idx"
  ON "products"("company_id", "sales_strategy", "active");
