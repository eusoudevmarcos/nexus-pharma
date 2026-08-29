CREATE TABLE "managerial_period_closes" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "period" DATE NOT NULL,
  "period_start" TIMESTAMPTZ(3) NOT NULL,
  "period_end" TIMESTAMPTZ(3) NOT NULL,
  "closed_by_id" UUID NOT NULL,
  "note" VARCHAR(1000) NOT NULL,
  "snapshot" JSONB NOT NULL,
  "snapshot_hash" CHAR(64) NOT NULL,
  "closed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "managerial_period_closes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "managerial_period_closes_valid_period" CHECK ("period_start" <= "period_end")
);

CREATE UNIQUE INDEX "managerial_period_closes_company_id_period_key" ON "managerial_period_closes"("company_id", "period");
CREATE INDEX "managerial_period_closes_company_id_closed_at_idx" ON "managerial_period_closes"("company_id", "closed_at");
CREATE UNIQUE INDEX "managerial_period_closes_snapshot_hash_key" ON "managerial_period_closes"("snapshot_hash");

ALTER TABLE "managerial_period_closes" ADD CONSTRAINT "managerial_period_closes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "managerial_period_closes" ADD CONSTRAINT "managerial_period_closes_closed_by_id_fkey" FOREIGN KEY ("closed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION reject_managerial_period_close_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'MANAGERIAL_PERIOD_CLOSE_IS_IMMUTABLE';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "managerial_period_close_immutable_update" BEFORE UPDATE ON "managerial_period_closes"
FOR EACH ROW EXECUTE FUNCTION reject_managerial_period_close_mutation();
CREATE TRIGGER "managerial_period_close_immutable_delete" BEFORE DELETE ON "managerial_period_closes"
FOR EACH ROW EXECUTE FUNCTION reject_managerial_period_close_mutation();
