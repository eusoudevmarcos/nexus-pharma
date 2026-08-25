-- CreateEnum
CREATE TYPE "EmailDeliveryStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BillingEventStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED');

-- CreateTable
CREATE TABLE "email_deliveries" (
    "id" UUID NOT NULL,
    "company_id" UUID,
    "invitation_id" UUID,
    "recipient" VARCHAR(254) NOT NULL,
    "template" VARCHAR(80) NOT NULL,
    "subject" VARCHAR(250) NOT NULL,
    "provider" VARCHAR(40) NOT NULL DEFAULT 'manual',
    "provider_message_id" VARCHAR(180),
    "status" "EmailDeliveryStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" VARCHAR(1000),
    "sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "email_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_webhook_events" (
    "id" UUID NOT NULL,
    "company_id" UUID,
    "subscription_id" UUID,
    "provider" VARCHAR(40) NOT NULL,
    "external_event_id" VARCHAR(180) NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "status" "BillingEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "payload" JSONB NOT NULL,
    "last_error" VARCHAR(2000),
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(3),

    CONSTRAINT "billing_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_deliveries_provider_message_id_key" ON "email_deliveries"("provider_message_id");
CREATE INDEX "email_deliveries_status_created_at_idx" ON "email_deliveries"("status", "created_at");
CREATE INDEX "email_deliveries_company_id_created_at_idx" ON "email_deliveries"("company_id", "created_at");
CREATE UNIQUE INDEX "billing_webhook_events_provider_external_event_id_key" ON "billing_webhook_events"("provider", "external_event_id");
CREATE INDEX "billing_webhook_events_status_received_at_idx" ON "billing_webhook_events"("status", "received_at");
CREATE INDEX "billing_webhook_events_company_id_received_at_idx" ON "billing_webhook_events"("company_id", "received_at");

-- AddForeignKey
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "invitations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "billing_webhook_events" ADD CONSTRAINT "billing_webhook_events_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "billing_webhook_events" ADD CONSTRAINT "billing_webhook_events_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
