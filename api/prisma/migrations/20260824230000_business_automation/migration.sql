CREATE TYPE "BusinessAlertType" AS ENUM ('STOCK_LOW', 'HIGH_MARGIN_REORDER', 'EXPIRY_90', 'EXPIRY_60', 'EXPIRY_30', 'BILLING_OVERDUE');
CREATE TYPE "BusinessAlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED');
CREATE TYPE "JobRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');
ALTER TYPE "ReorderAlertStatus" ADD VALUE 'RESOLVED';

CREATE TABLE "business_alerts" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "product_id" UUID,
    "lot_id" UUID,
    "invoice_id" UUID,
    "acknowledged_by_id" UUID,
    "type" "BusinessAlertType" NOT NULL,
    "severity" "IncidentSeverity" NOT NULL DEFAULT 'WARNING',
    "status" "BusinessAlertStatus" NOT NULL DEFAULT 'OPEN',
    "deduplication_key" VARCHAR(180) NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "message" VARCHAR(1000) NOT NULL,
    "action_data" JSONB NOT NULL DEFAULT '{}',
    "detected_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_at" TIMESTAMPTZ(3),
    "acknowledged_at" TIMESTAMPTZ(3),
    "resolved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "business_alerts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "background_job_runs" (
    "id" UUID NOT NULL,
    "job_name" VARCHAR(100) NOT NULL,
    "idempotency_key" VARCHAR(160) NOT NULL,
    "status" "JobRunStatus" NOT NULL DEFAULT 'RUNNING',
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "counters" JSONB NOT NULL DEFAULT '{}',
    "result" JSONB NOT NULL DEFAULT '{}',
    "error" VARCHAR(2000),
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(3),
    CONSTRAINT "background_job_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "business_alerts_deduplication_key_key" ON "business_alerts"("deduplication_key");
CREATE INDEX "business_alerts_company_id_status_severity_detected_at_idx" ON "business_alerts"("company_id", "status", "severity", "detected_at");
CREATE INDEX "business_alerts_product_id_status_idx" ON "business_alerts"("product_id", "status");
CREATE INDEX "business_alerts_due_at_status_idx" ON "business_alerts"("due_at", "status");
CREATE UNIQUE INDEX "background_job_runs_idempotency_key_key" ON "background_job_runs"("idempotency_key");
CREATE INDEX "background_job_runs_job_name_started_at_idx" ON "background_job_runs"("job_name", "started_at");
CREATE INDEX "background_job_runs_status_started_at_idx" ON "background_job_runs"("status", "started_at");

ALTER TABLE "business_alerts" ADD CONSTRAINT "business_alerts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "business_alerts" ADD CONSTRAINT "business_alerts_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "business_alerts" ADD CONSTRAINT "business_alerts_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "inventory_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "business_alerts" ADD CONSTRAINT "business_alerts_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "business_alerts" ADD CONSTRAINT "business_alerts_acknowledged_by_id_fkey" FOREIGN KEY ("acknowledged_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
