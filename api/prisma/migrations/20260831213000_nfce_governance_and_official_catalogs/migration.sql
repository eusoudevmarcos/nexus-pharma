CREATE TYPE "FiscalCatalogReleaseStatus" AS ENUM ('DISCOVERED', 'UNDER_REVIEW', 'ACTIVE', 'REJECTED', 'SUPERSEDED');

CREATE TABLE "fiscal_catalog_releases" (
  "id" UUID NOT NULL,
  "catalog" VARCHAR(40) NOT NULL,
  "source_version" VARCHAR(120) NOT NULL,
  "source_url" VARCHAR(500) NOT NULL,
  "source_published_at" DATE,
  "payload_hash" CHAR(64),
  "item_count" INTEGER NOT NULL DEFAULT 0,
  "status" "FiscalCatalogReleaseStatus" NOT NULL DEFAULT 'DISCOVERED',
  "notes" VARCHAR(1000),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "imported_by_id" UUID,
  "reviewed_by_id" UUID,
  "imported_at" TIMESTAMPTZ(3),
  "reviewed_at" TIMESTAMPTZ(3),
  "activated_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "fiscal_catalog_releases_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "fiscal_catalog_entries" ADD COLUMN "release_id" UUID;

CREATE TABLE "nfce_configurations" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "edited_by_id" UUID NOT NULL,
  "environment" "NfceEnvironment" NOT NULL,
  "state" CHAR(2) NOT NULL,
  "series" INTEGER NOT NULL DEFAULT 1,
  "qr_code_version" INTEGER NOT NULL DEFAULT 3,
  "csc_identifier" VARCHAR(20),
  "encrypted_csc" TEXT,
  "authorization_url" VARCHAR(500),
  "status_service_url" VARCHAR(500),
  "event_url" VARCHAR(500),
  "qr_code_base_url" VARCHAR(500),
  "consultation_url" VARCHAR(500),
  "official_schema_version" VARCHAR(40),
  "catalog_snapshot" JSONB NOT NULL DEFAULT '{}',
  "homologated_at" TIMESTAMPTZ(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "nfce_configurations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "nfce_configurations_series_check" CHECK ("series" BETWEEN 1 AND 999),
  CONSTRAINT "nfce_configurations_qr_code_version_check" CHECK ("qr_code_version" IN (2, 3)),
  CONSTRAINT "nfce_configurations_csc_check" CHECK ("qr_code_version" <> 2 OR ("csc_identifier" IS NOT NULL AND "encrypted_csc" IS NOT NULL))
);

CREATE UNIQUE INDEX "fiscal_catalog_releases_catalog_source_version_key" ON "fiscal_catalog_releases"("catalog", "source_version");
CREATE INDEX "fiscal_catalog_releases_catalog_status_source_published_at_idx" ON "fiscal_catalog_releases"("catalog", "status", "source_published_at");
CREATE INDEX "fiscal_catalog_releases_status_created_at_idx" ON "fiscal_catalog_releases"("status", "created_at");
CREATE INDEX "fiscal_catalog_entries_release_id_idx" ON "fiscal_catalog_entries"("release_id");
CREATE UNIQUE INDEX "nfce_configurations_company_id_environment_key" ON "nfce_configurations"("company_id", "environment");
CREATE INDEX "nfce_configurations_state_environment_active_idx" ON "nfce_configurations"("state", "environment", "active");

ALTER TABLE "fiscal_catalog_releases" ADD CONSTRAINT "fiscal_catalog_releases_imported_by_id_fkey" FOREIGN KEY ("imported_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fiscal_catalog_releases" ADD CONSTRAINT "fiscal_catalog_releases_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fiscal_catalog_entries" ADD CONSTRAINT "fiscal_catalog_entries_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "fiscal_catalog_releases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "nfce_configurations" ADD CONSTRAINT "nfce_configurations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "nfce_configurations" ADD CONSTRAINT "nfce_configurations_edited_by_id_fkey" FOREIGN KEY ("edited_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "fiscal_catalog_releases" (
  "id", "catalog", "source_version", "source_url", "source_published_at", "status", "notes", "metadata", "updated_at"
) VALUES
  ('a64aa904-e082-4ad4-aef1-5f2982600001', 'CCLASS_TRIB', 'IT 2025.002 v1.60', 'https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=/NJarYc9nus=', DATE '2026-06-23', 'DISCOVERED', 'Publicação oficial identificada; conteúdo ainda precisa ser importado, conferido e ativado.', '{"authority":"Portal Nacional da NF-e"}', CURRENT_TIMESTAMP),
  ('a64aa904-e082-4ad4-aef1-5f2982600002', 'ALIQUOTAS_CBS', 'publicada-2026-05-12', 'https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=/NJarYc9nus=', DATE '2026-05-12', 'DISCOVERED', 'Publicação oficial identificada; conteúdo ainda precisa ser importado, conferido e ativado.', '{"authority":"Portal Nacional da NF-e"}', CURRENT_TIMESTAMP),
  ('a64aa904-e082-4ad4-aef1-5f2982600003', 'MEIOS_PAGAMENTO', 'publicada-2026-03-06', 'https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=/NJarYc9nus=', DATE '2026-03-06', 'DISCOVERED', 'Publicação oficial identificada; conteúdo ainda precisa ser importado, conferido e ativado.', '{"authority":"Portal Nacional da NF-e"}', CURRENT_TIMESTAMP)
ON CONFLICT ("catalog", "source_version") DO NOTHING;
