CREATE TYPE "PosDeviceStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED');
CREATE TYPE "OfflineCommandType" AS ENUM ('SALE');
CREATE TYPE "OfflineCommandStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'APPLIED', 'CONFLICT', 'REJECTED');

CREATE TABLE "pos_devices" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "point_of_sale_id" UUID NOT NULL,
  "registered_by_id" UUID NOT NULL,
  "installation_id" VARCHAR(80) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "status" "PosDeviceStatus" NOT NULL DEFAULT 'ACTIVE',
  "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_synchronized_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "pos_devices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "offline_pos_snapshots" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "point_of_sale_id" UUID NOT NULL,
  "cash_session_id" UUID NOT NULL,
  "device_id" UUID NOT NULL,
  "created_by_id" UUID NOT NULL,
  "version" CHAR(64) NOT NULL,
  "payload" JSONB NOT NULL,
  "payload_hash" CHAR(64) NOT NULL,
  "valid_from" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "offline_pos_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "offline_pos_commands" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "device_id" UUID NOT NULL,
  "snapshot_id" UUID NOT NULL,
  "cash_session_id" UUID NOT NULL,
  "submitted_by_id" UUID NOT NULL,
  "sale_id" UUID,
  "type" "OfflineCommandType" NOT NULL,
  "status" "OfflineCommandStatus" NOT NULL DEFAULT 'RECEIVED',
  "payload" JSONB NOT NULL,
  "payload_hash" CHAR(64) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "error_code" VARCHAR(500),
  "occurred_at" TIMESTAMPTZ(3) NOT NULL,
  "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMPTZ(3),
  CONSTRAINT "offline_pos_commands_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pos_devices_company_id_installation_id_key" ON "pos_devices"("company_id", "installation_id");
CREATE INDEX "pos_devices_point_of_sale_id_status_idx" ON "pos_devices"("point_of_sale_id", "status");
CREATE INDEX "offline_pos_snapshots_company_id_point_of_sale_id_expires_at_idx" ON "offline_pos_snapshots"("company_id", "point_of_sale_id", "expires_at");
CREATE INDEX "offline_pos_snapshots_device_id_created_at_idx" ON "offline_pos_snapshots"("device_id", "created_at");
CREATE INDEX "offline_pos_commands_company_id_status_received_at_idx" ON "offline_pos_commands"("company_id", "status", "received_at");
CREATE INDEX "offline_pos_commands_device_id_occurred_at_idx" ON "offline_pos_commands"("device_id", "occurred_at");
CREATE INDEX "offline_pos_commands_cash_session_id_status_idx" ON "offline_pos_commands"("cash_session_id", "status");

ALTER TABLE "pos_devices" ADD CONSTRAINT "pos_devices_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pos_devices" ADD CONSTRAINT "pos_devices_point_of_sale_id_fkey" FOREIGN KEY ("point_of_sale_id") REFERENCES "points_of_sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_devices" ADD CONSTRAINT "pos_devices_registered_by_id_fkey" FOREIGN KEY ("registered_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "offline_pos_snapshots" ADD CONSTRAINT "offline_pos_snapshots_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "offline_pos_snapshots" ADD CONSTRAINT "offline_pos_snapshots_point_of_sale_id_fkey" FOREIGN KEY ("point_of_sale_id") REFERENCES "points_of_sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "offline_pos_snapshots" ADD CONSTRAINT "offline_pos_snapshots_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "offline_pos_snapshots" ADD CONSTRAINT "offline_pos_snapshots_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "pos_devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "offline_pos_snapshots" ADD CONSTRAINT "offline_pos_snapshots_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "offline_pos_commands" ADD CONSTRAINT "offline_pos_commands_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "offline_pos_commands" ADD CONSTRAINT "offline_pos_commands_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "pos_devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "offline_pos_commands" ADD CONSTRAINT "offline_pos_commands_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "offline_pos_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "offline_pos_commands" ADD CONSTRAINT "offline_pos_commands_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "offline_pos_commands" ADD CONSTRAINT "offline_pos_commands_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "offline_pos_commands" ADD CONSTRAINT "offline_pos_commands_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
