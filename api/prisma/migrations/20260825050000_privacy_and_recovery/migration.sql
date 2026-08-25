CREATE TYPE "PrivacyRequestType" AS ENUM (
  'CONFIRMATION_ACCESS',
  'CORRECTION',
  'ANONYMIZATION_BLOCK_DELETION',
  'PORTABILITY',
  'CONSENT_REVOCATION',
  'DATA_SHARING_INFO',
  'AUTOMATED_DECISION_REVIEW'
);

CREATE TYPE "PrivacyRequestStatus" AS ENUM (
  'RECEIVED',
  'IDENTITY_CHECK',
  'IN_PROGRESS',
  'WAITING_LEGAL_REVIEW',
  'COMPLETED',
  'REJECTED',
  'CANCELLED'
);

CREATE TYPE "RecoveryDrillStatus" AS ENUM (
  'SCHEDULED',
  'RUNNING',
  'PASSED',
  'FAILED',
  'CANCELLED'
);

CREATE TABLE "privacy_requests" (
  "id" UUID NOT NULL,
  "protocol" VARCHAR(32) NOT NULL,
  "company_id" UUID NOT NULL,
  "subject_user_id" UUID NOT NULL,
  "requested_by_id" UUID NOT NULL,
  "handled_by_id" UUID,
  "type" "PrivacyRequestType" NOT NULL,
  "status" "PrivacyRequestStatus" NOT NULL DEFAULT 'RECEIVED',
  "details" TEXT,
  "due_at" TIMESTAMPTZ(3) NOT NULL,
  "identity_verified_at" TIMESTAMPTZ(3),
  "resolution_summary" TEXT,
  "retention_reason" TEXT,
  "completed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "privacy_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "recovery_drills" (
  "id" UUID NOT NULL,
  "status" "RecoveryDrillStatus" NOT NULL DEFAULT 'SCHEDULED',
  "environment" VARCHAR(40) NOT NULL,
  "backup_reference" VARCHAR(200),
  "objective" TEXT NOT NULL,
  "scheduled_at" TIMESTAMPTZ(3) NOT NULL,
  "started_at" TIMESTAMPTZ(3),
  "completed_at" TIMESTAMPTZ(3),
  "rpo_minutes" INTEGER,
  "rto_minutes" INTEGER,
  "integrity_checks" JSONB NOT NULL DEFAULT '[]',
  "notes" TEXT,
  "performed_by_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "recovery_drills_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "privacy_requests_protocol_key" ON "privacy_requests"("protocol");
CREATE INDEX "privacy_requests_company_id_created_at_idx" ON "privacy_requests"("company_id", "created_at");
CREATE INDEX "privacy_requests_subject_user_id_status_idx" ON "privacy_requests"("subject_user_id", "status");
CREATE INDEX "privacy_requests_status_due_at_idx" ON "privacy_requests"("status", "due_at");
CREATE INDEX "recovery_drills_status_scheduled_at_idx" ON "recovery_drills"("status", "scheduled_at");
CREATE INDEX "recovery_drills_completed_at_idx" ON "recovery_drills"("completed_at");

ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_subject_user_id_fkey" FOREIGN KEY ("subject_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_handled_by_id_fkey" FOREIGN KEY ("handled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "recovery_drills" ADD CONSTRAINT "recovery_drills_performed_by_id_fkey" FOREIGN KEY ("performed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
