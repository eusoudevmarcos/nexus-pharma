CREATE TYPE "PrimeOrganizationKind" AS ENUM ('PLATFORM', 'LABORATORY', 'DISTRIBUTOR', 'WHOLESALER');
CREATE TYPE "PrimeOrganizationStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CANCELLED');
CREATE TYPE "PrimeRole" AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'SALES', 'LOGISTICS', 'ANALYST');
CREATE TYPE "PrimeConnectionStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'TERMINATED');
CREATE TYPE "PrimeOpportunityType" AS ENUM ('OUT_OF_STOCK', 'LOW_COVERAGE', 'EXPIRING', 'HIGH_DEMAND');
CREATE TYPE "PrimeOpportunityStatus" AS ENUM ('NEW', 'ASSIGNED', 'CONTACTED', 'PROPOSAL_SENT', 'WON', 'DECLINED', 'DISMISSED', 'RESOLVED');
CREATE TYPE "PrimeOpportunityPriority" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

CREATE TABLE "prime_organizations" (
  "id" UUID NOT NULL,
  "code" VARCHAR(50) NOT NULL,
  "legal_name" VARCHAR(180) NOT NULL,
  "trade_name" VARCHAR(180) NOT NULL,
  "tax_id" CHAR(14),
  "kind" "PrimeOrganizationKind" NOT NULL,
  "status" "PrimeOrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
  "logistics_window_days" INTEGER NOT NULL DEFAULT 3,
  "target_coverage_days" INTEGER NOT NULL DEFAULT 30,
  "low_coverage_days" INTEGER NOT NULL DEFAULT 12,
  "expiry_window_days" INTEGER NOT NULL DEFAULT 90,
  "high_demand_growth_percent" DECIMAL(7,4) NOT NULL DEFAULT 0.2,
  "alert_out_of_stock" BOOLEAN NOT NULL DEFAULT true,
  "alert_low_coverage" BOOLEAN NOT NULL DEFAULT true,
  "alert_expiring" BOOLEAN NOT NULL DEFAULT true,
  "alert_high_demand" BOOLEAN NOT NULL DEFAULT true,
  "allowed_states" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "settings" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "prime_organizations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "prime_organizations_logistics_window" CHECK ("logistics_window_days" BETWEEN 2 AND 5),
  CONSTRAINT "prime_organizations_coverage" CHECK ("target_coverage_days" BETWEEN 7 AND 90 AND "low_coverage_days" BETWEEN 1 AND 45),
  CONSTRAINT "prime_organizations_expiry_window" CHECK ("expiry_window_days" BETWEEN 15 AND 180),
  CONSTRAINT "prime_organizations_growth" CHECK ("high_demand_growth_percent" BETWEEN 0 AND 5)
);

CREATE TABLE "prime_memberships" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "role" "PrimeRole" NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "prime_memberships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "prime_connections" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "status" "PrimeConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
  "starts_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ends_at" TIMESTAMPTZ(3),
  "settings" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "prime_connections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "prime_opportunities" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "connection_id" UUID,
  "company_id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "type" "PrimeOpportunityType" NOT NULL,
  "status" "PrimeOpportunityStatus" NOT NULL DEFAULT 'NEW',
  "priority" "PrimeOpportunityPriority" NOT NULL,
  "current_stock" DECIMAL(15,3) NOT NULL,
  "minimum_stock" DECIMAL(15,3) NOT NULL,
  "expiring_quantity" DECIMAL(15,3) NOT NULL DEFAULT 0,
  "sales_last_30_days" DECIMAL(15,3) NOT NULL DEFAULT 0,
  "sales_previous_30_days" DECIMAL(15,3) NOT NULL DEFAULT 0,
  "coverage_days" DECIMAL(10,2),
  "suggested_quantity" DECIMAL(15,3) NOT NULL,
  "logistics_window_days" INTEGER NOT NULL,
  "detected_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "due_at" TIMESTAMPTZ(3) NOT NULL,
  "assigned_to_id" UUID,
  "assigned_at" TIMESTAMPTZ(3),
  "contacted_at" TIMESTAMPTZ(3),
  "outcome" VARCHAR(500),
  "snapshot" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "prime_opportunities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "prime_opportunities_logistics_window" CHECK ("logistics_window_days" BETWEEN 2 AND 5),
  CONSTRAINT "prime_opportunities_quantities" CHECK ("current_stock" >= 0 AND "minimum_stock" >= 0 AND "expiring_quantity" >= 0 AND "suggested_quantity" >= 0)
);

CREATE TABLE "prime_opportunity_events" (
  "id" UUID NOT NULL,
  "opportunity_id" UUID NOT NULL,
  "actor_id" UUID,
  "action" VARCHAR(60) NOT NULL,
  "note" VARCHAR(500),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "prime_opportunity_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "prime_organizations_code_key" ON "prime_organizations"("code");
CREATE UNIQUE INDEX "prime_organizations_tax_id_key" ON "prime_organizations"("tax_id");
CREATE INDEX "prime_organizations_status_kind_trade_name_idx" ON "prime_organizations"("status", "kind", "trade_name");
CREATE UNIQUE INDEX "prime_memberships_organization_id_user_id_key" ON "prime_memberships"("organization_id", "user_id");
CREATE INDEX "prime_memberships_user_id_active_idx" ON "prime_memberships"("user_id", "active");
CREATE UNIQUE INDEX "prime_connections_organization_id_company_id_key" ON "prime_connections"("organization_id", "company_id");
CREATE INDEX "prime_connections_company_id_status_idx" ON "prime_connections"("company_id", "status");
CREATE UNIQUE INDEX "prime_opportunities_identity_key" ON "prime_opportunities"("organization_id", "company_id", "store_id", "product_id", "type");
CREATE INDEX "prime_opportunities_organization_status_priority_due_idx" ON "prime_opportunities"("organization_id", "status", "priority", "due_at");
CREATE INDEX "prime_opportunities_company_store_status_idx" ON "prime_opportunities"("company_id", "store_id", "status");
CREATE INDEX "prime_opportunities_product_type_status_idx" ON "prime_opportunities"("product_id", "type", "status");
CREATE INDEX "prime_opportunity_events_opportunity_created_idx" ON "prime_opportunity_events"("opportunity_id", "created_at");
CREATE INDEX "prime_opportunity_events_actor_created_idx" ON "prime_opportunity_events"("actor_id", "created_at");

ALTER TABLE "prime_memberships" ADD CONSTRAINT "prime_memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "prime_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prime_memberships" ADD CONSTRAINT "prime_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prime_connections" ADD CONSTRAINT "prime_connections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "prime_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prime_connections" ADD CONSTRAINT "prime_connections_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prime_opportunities" ADD CONSTRAINT "prime_opportunities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "prime_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prime_opportunities" ADD CONSTRAINT "prime_opportunities_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "prime_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "prime_opportunities" ADD CONSTRAINT "prime_opportunities_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prime_opportunities" ADD CONSTRAINT "prime_opportunities_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prime_opportunities" ADD CONSTRAINT "prime_opportunities_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prime_opportunities" ADD CONSTRAINT "prime_opportunities_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "prime_opportunity_events" ADD CONSTRAINT "prime_opportunity_events_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "prime_opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prime_opportunity_events" ADD CONSTRAINT "prime_opportunity_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
