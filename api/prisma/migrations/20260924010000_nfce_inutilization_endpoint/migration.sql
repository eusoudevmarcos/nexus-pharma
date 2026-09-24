-- Endpoint dedicado do webservice de inutilização de numeração (NFeInutilizacao4).
ALTER TABLE "nfce_configurations" ADD COLUMN "inutilization_url" VARCHAR(500);
