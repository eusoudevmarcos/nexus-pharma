CREATE TYPE "MfaStatus" AS ENUM ('PENDING', 'ACTIVE', 'DISABLED');

ALTER TABLE "auth_sessions"
  ADD COLUMN "mfa_verified_at" TIMESTAMPTZ(3),
  ADD COLUMN "assurance_level" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "user_mfa_methods" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "status" "MfaStatus" NOT NULL DEFAULT 'PENDING',
  "encrypted_secret" TEXT NOT NULL,
  "recovery_code_hashes" JSONB NOT NULL DEFAULT '[]',
  "last_used_counter" BIGINT,
  "verified_at" TIMESTAMPTZ(3),
  "disabled_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "user_mfa_methods_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "auth_mfa_challenges" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "used_at" TIMESTAMPTZ(3),
  "ip_address" VARCHAR(64),
  "user_agent" VARCHAR(500),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auth_mfa_challenges_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_mfa_methods_user_id_key" ON "user_mfa_methods"("user_id");
CREATE INDEX "user_mfa_methods_status_updated_at_idx" ON "user_mfa_methods"("status", "updated_at");
CREATE UNIQUE INDEX "auth_mfa_challenges_token_hash_key" ON "auth_mfa_challenges"("token_hash");
CREATE INDEX "auth_mfa_challenges_user_id_expires_at_used_at_idx" ON "auth_mfa_challenges"("user_id", "expires_at", "used_at");

ALTER TABLE "user_mfa_methods" ADD CONSTRAINT "user_mfa_methods_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auth_mfa_challenges" ADD CONSTRAINT "auth_mfa_challenges_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
