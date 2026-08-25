CREATE TYPE "IncidentSeverity" AS ENUM ('INFO', 'WARNING', 'ERROR', 'CRITICAL');
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

CREATE TABLE "operational_incidents" (
    "id" UUID NOT NULL,
    "fingerprint" CHAR(64) NOT NULL,
    "source" VARCHAR(80) NOT NULL,
    "severity" "IncidentSeverity" NOT NULL DEFAULT 'ERROR',
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "title" VARCHAR(180) NOT NULL,
    "detail" VARCHAR(2000),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "occurrence_count" INTEGER NOT NULL DEFAULT 1,
    "first_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),
    "resolved_by_id" UUID,
    CONSTRAINT "operational_incidents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "operational_incidents_fingerprint_key" ON "operational_incidents"("fingerprint");
CREATE INDEX "operational_incidents_status_severity_last_seen_at_idx" ON "operational_incidents"("status", "severity", "last_seen_at");
CREATE INDEX "operational_incidents_source_last_seen_at_idx" ON "operational_incidents"("source", "last_seen_at");

ALTER TABLE "operational_incidents" ADD CONSTRAINT "operational_incidents_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
