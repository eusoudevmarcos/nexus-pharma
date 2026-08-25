ALTER TABLE "auth_sessions"
  ADD COLUMN "previous_refresh_token_hash" VARCHAR(255),
  ADD COLUMN "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "rotated_at" TIMESTAMPTZ(3),
  ADD COLUMN "revoked_reason" VARCHAR(80);

CREATE INDEX "auth_sessions_previous_refresh_token_hash_idx" ON "auth_sessions"("previous_refresh_token_hash");
CREATE INDEX "auth_sessions_revoked_at_expires_at_idx" ON "auth_sessions"("revoked_at", "expires_at");
