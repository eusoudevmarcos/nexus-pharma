CREATE TYPE "RecommendationStatus" AS ENUM ('OPEN', 'ADOPTED', 'MEASURED', 'EXPIRED');
CREATE TYPE "SeasonalitySource" AS ENUM ('MANUAL', 'CALCULATED');
CREATE TYPE "SupportAccessStatus" AS ENUM ('REQUESTED', 'APPROVED', 'ACTIVE', 'EXPIRED', 'REJECTED', 'REVOKED');

CREATE TABLE "purchase_policies" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "default_coverage_days" INTEGER NOT NULL DEFAULT 30,
  "promotion_lift_percent" DECIMAL(7,4) NOT NULL DEFAULT 0.25,
  "manager_approval_limit" DECIMAL(15,2) NOT NULL DEFAULT 5000,
  "owner_approval_above_limit" BOOLEAN NOT NULL DEFAULT true,
  "seasonality_enabled" BOOLEAN NOT NULL DEFAULT true,
  "updated_by_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "purchase_policies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "demand_seasonalities" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "month" INTEGER NOT NULL,
  "factor" DECIMAL(7,4) NOT NULL DEFAULT 1,
  "source" "SeasonalitySource" NOT NULL DEFAULT 'MANUAL',
  "reason" VARCHAR(500),
  "updated_by_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "demand_seasonalities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "demand_seasonalities_month_check" CHECK ("month" BETWEEN 1 AND 12),
  CONSTRAINT "demand_seasonalities_factor_check" CHECK ("factor" BETWEEN 0.10 AND 10.00)
);

CREATE TABLE "purchase_recommendations" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "recommendation_date" DATE NOT NULL,
  "status" "RecommendationStatus" NOT NULL DEFAULT 'OPEN',
  "base_daily_average" DECIMAL(15,4) NOT NULL,
  "seasonal_factor" DECIMAL(7,4) NOT NULL DEFAULT 1,
  "promotion_factor" DECIMAL(7,4) NOT NULL DEFAULT 1,
  "forecast_daily_average" DECIMAL(15,4) NOT NULL,
  "effective_available" DECIMAL(15,3) NOT NULL,
  "incoming_quantity" DECIMAL(15,3) NOT NULL DEFAULT 0,
  "expiry_risk_quantity" DECIMAL(15,3) NOT NULL DEFAULT 0,
  "suggested_quantity" DECIMAL(15,3) NOT NULL,
  "estimated_investment" DECIMAL(15,2) NOT NULL,
  "expected_stockout_at" DATE,
  "adopted_order_item_id" UUID,
  "adopted_at" TIMESTAMPTZ(3),
  "measured_at" TIMESTAMPTZ(3),
  "actual_purchased" DECIMAL(15,3),
  "recommendation_accuracy" DECIMAL(7,4),
  "avoided_stockout" BOOLEAN,
  "avoided_loss_quantity" DECIMAL(15,3),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "purchase_recommendations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "support_access_sessions" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "requested_by_id" UUID NOT NULL,
  "approved_by_id" UUID,
  "revoked_by_id" UUID,
  "ticket_id" UUID,
  "status" "SupportAccessStatus" NOT NULL DEFAULT 'REQUESTED',
  "reason" VARCHAR(1000) NOT NULL,
  "scope" JSONB NOT NULL DEFAULT '["READ_DIAGNOSTICS"]',
  "duration_minutes" INTEGER NOT NULL DEFAULT 30,
  "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approved_at" TIMESTAMPTZ(3),
  "started_at" TIMESTAMPTZ(3),
  "expires_at" TIMESTAMPTZ(3),
  "revoked_at" TIMESTAMPTZ(3),
  "consent_snapshot" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "support_access_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "support_access_sessions_duration_check" CHECK ("duration_minutes" BETWEEN 5 AND 120)
);

CREATE UNIQUE INDEX "purchase_policies_company_id_key" ON "purchase_policies"("company_id");
CREATE UNIQUE INDEX "demand_seasonalities_store_id_product_id_month_key" ON "demand_seasonalities"("store_id", "product_id", "month");
CREATE INDEX "demand_seasonalities_company_id_month_idx" ON "demand_seasonalities"("company_id", "month");
CREATE UNIQUE INDEX "purchase_recommendations_adopted_order_item_id_key" ON "purchase_recommendations"("adopted_order_item_id");
CREATE UNIQUE INDEX "purchase_recommendations_store_id_product_id_recommendation_date_key" ON "purchase_recommendations"("store_id", "product_id", "recommendation_date");
CREATE INDEX "purchase_recommendations_company_id_status_recommendation_date_idx" ON "purchase_recommendations"("company_id", "status", "recommendation_date");
CREATE INDEX "purchase_recommendations_product_id_recommendation_date_idx" ON "purchase_recommendations"("product_id", "recommendation_date");
CREATE INDEX "support_access_sessions_company_id_status_requested_at_idx" ON "support_access_sessions"("company_id", "status", "requested_at");
CREATE INDEX "support_access_sessions_requested_by_id_status_expires_at_idx" ON "support_access_sessions"("requested_by_id", "status", "expires_at");

ALTER TABLE "purchase_policies" ADD CONSTRAINT "purchase_policies_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_policies" ADD CONSTRAINT "purchase_policies_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "demand_seasonalities" ADD CONSTRAINT "demand_seasonalities_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "demand_seasonalities" ADD CONSTRAINT "demand_seasonalities_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "demand_seasonalities" ADD CONSTRAINT "demand_seasonalities_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "demand_seasonalities" ADD CONSTRAINT "demand_seasonalities_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchase_recommendations" ADD CONSTRAINT "purchase_recommendations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_recommendations" ADD CONSTRAINT "purchase_recommendations_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_recommendations" ADD CONSTRAINT "purchase_recommendations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_recommendations" ADD CONSTRAINT "purchase_recommendations_adopted_order_item_id_fkey" FOREIGN KEY ("adopted_order_item_id") REFERENCES "purchase_order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "support_access_sessions" ADD CONSTRAINT "support_access_sessions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "support_access_sessions" ADD CONSTRAINT "support_access_sessions_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "support_access_sessions" ADD CONSTRAINT "support_access_sessions_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "support_access_sessions" ADD CONSTRAINT "support_access_sessions_revoked_by_id_fkey" FOREIGN KEY ("revoked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "support_access_sessions" ADD CONSTRAINT "support_access_sessions_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
