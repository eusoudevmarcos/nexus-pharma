-- Unifica PIS/COFINS sem remover as colunas legadas usadas pelos snapshots de venda.
ALTER TABLE "fiscal_rules"
  ADD COLUMN "cst_pis_cofins" CHAR(2) NOT NULL DEFAULT '01',
  ADD COLUMN "cclass_trib" CHAR(6) NOT NULL DEFAULT '000001';

UPDATE "fiscal_rules"
SET "cst_pis_cofins" = CASE
  WHEN "cst_pis" = "cst_cofins" THEN "cst_pis"
  ELSE '01'
END;

UPDATE "fiscal_rules"
SET "cclass_trib" = CASE
  WHEN "tax_classification" ~ '^[0-9]{6}$' THEN "tax_classification"::CHAR(6)
  ELSE '000001'
END;

CREATE TABLE "fiscal_catalog_entries" (
  "id" UUID NOT NULL,
  "catalog" VARCHAR(40) NOT NULL,
  "code" VARCHAR(20) NOT NULL,
  "parent_code" VARCHAR(40),
  "description" VARCHAR(800) NOT NULL,
  "ncm_patterns" JSONB NOT NULL DEFAULT '[]',
  "source_url" VARCHAR(500) NOT NULL,
  "source_version" VARCHAR(120) NOT NULL,
  "valid_from" DATE,
  "valid_until" DATE,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fiscal_catalog_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fiscal_catalog_entries_catalog_code_source_version_key"
  ON "fiscal_catalog_entries"("catalog", "code", "source_version");
CREATE INDEX "fiscal_catalog_entries_catalog_active_idx"
  ON "fiscal_catalog_entries"("catalog", "active");
CREATE INDEX "fiscal_catalog_entries_code_active_idx"
  ON "fiscal_catalog_entries"("code", "active");

INSERT INTO "fiscal_catalog_entries" ("id", "catalog", "code", "description", "source_url", "source_version")
SELECT gen_random_uuid(), 'PIS_COFINS_CST', code, description,
  'https://sped.rfb.gov.br/item/show/1616', 'EFD 4.3.3/4.3.4 v1.0.0'
FROM (VALUES
  ('01','Operação tributável com alíquota básica'), ('02','Operação tributável com alíquota diferenciada'),
  ('03','Operação tributável por unidade de medida'), ('04','Operação tributável monofásica — revenda a alíquota zero'),
  ('05','Operação tributável por substituição tributária'), ('06','Operação tributável a alíquota zero'),
  ('07','Operação isenta'), ('08','Operação sem incidência'), ('09','Operação com suspensão'),
  ('49','Outras operações de saída'), ('50','Crédito vinculado a receita tributada no mercado interno'),
  ('51','Crédito vinculado a receita não tributada no mercado interno'), ('52','Crédito vinculado a receita de exportação'),
  ('53','Crédito vinculado a receitas tributadas e não tributadas'), ('54','Crédito vinculado a receitas tributadas e de exportação'),
  ('55','Crédito vinculado a receitas não tributadas e de exportação'), ('56','Crédito vinculado a receitas tributadas, não tributadas e de exportação'),
  ('60','Crédito presumido vinculado a receita tributada'), ('61','Crédito presumido vinculado a receita não tributada'),
  ('62','Crédito presumido vinculado a receita de exportação'), ('63','Crédito presumido vinculado a receitas tributadas e não tributadas'),
  ('64','Crédito presumido vinculado a receitas tributadas e de exportação'), ('65','Crédito presumido vinculado a receitas não tributadas e de exportação'),
  ('66','Crédito presumido vinculado a receitas tributadas, não tributadas e de exportação'), ('67','Crédito presumido — outras operações'),
  ('70','Aquisição sem direito a crédito'), ('71','Aquisição com isenção'), ('72','Aquisição com suspensão'),
  ('73','Aquisição a alíquota zero'), ('74','Aquisição sem incidência'), ('75','Aquisição por substituição tributária'),
  ('98','Outras operações de entrada'), ('99','Outras operações')
) AS source(code, description);

INSERT INTO "fiscal_catalog_entries" ("id", "catalog", "code", "description", "source_url", "source_version")
SELECT gen_random_uuid(), 'ICMS_CST', code, description,
  'https://www.confaz.fazenda.gov.br/legislacao/arquivo-manuais/moc7-anexo-i-leiaute-e-rv.pdf', 'MOC 7.0'
FROM (VALUES
  ('00','Tributada integralmente'), ('10','Tributada e com cobrança do ICMS-ST'),
  ('20','Com redução da base de cálculo'), ('30','Isenta ou não tributada e com cobrança do ICMS-ST'),
  ('40','Isenta'), ('41','Não tributada'), ('50','Suspensão'), ('51','Diferimento'),
  ('60','ICMS cobrado anteriormente por substituição tributária'),
  ('70','Com redução da base e cobrança do ICMS-ST'), ('90','Outras')
) AS source(code, description);

INSERT INTO "fiscal_catalog_entries" ("id", "catalog", "code", "description", "source_url", "source_version")
SELECT gen_random_uuid(), 'ICMS_CSOSN', code, description,
  'https://www.confaz.fazenda.gov.br/legislacao/arquivo-manuais/moc7-anexo-i-leiaute-e-rv.pdf', 'MOC 7.0'
FROM (VALUES
  ('101','Tributada pelo Simples com permissão de crédito'), ('102','Tributada pelo Simples sem permissão de crédito'),
  ('103','Isenção do Simples para faixa de receita'), ('201','Com crédito e cobrança do ICMS-ST'),
  ('202','Sem crédito e com cobrança do ICMS-ST'), ('203','Isenção e cobrança do ICMS-ST'),
  ('300','Imune'), ('400','Não tributada pelo Simples'),
  ('500','ICMS cobrado anteriormente por substituição tributária'), ('900','Outros')
) AS source(code, description);

INSERT INTO "fiscal_catalog_entries" ("id", "catalog", "code", "parent_code", "description", "ncm_patterns", "source_url", "source_version") VALUES
  (gen_random_uuid(), 'PIS_COFINS_NATUREZA', '201', '02,04', 'Produtos farmacêuticos', '["3001","3003","3004","3002101","3002102","3002103","3002201","3002202","30029020","30029092","30029099","30051010","3006301","3006302","30066000"]', 'https://sped.rfb.gov.br/item/show/8124', 'EFD 4.3.10 v1.25 — 30/03/2026'),
  (gen_random_uuid(), 'PIS_COFINS_NATUREZA', '202', '02,04', 'Produtos de perfumaria, de toucador ou de higiene pessoal', '["3303","3304","3305","3306","3307","34011190","34012010","96032100"]', 'https://sped.rfb.gov.br/item/show/8124', 'EFD 4.3.10 v1.25 — 30/03/2026'),
  (gen_random_uuid(), 'IBS_CBS_CCLASSTRIB', '000001', '000', 'Situações tributadas integralmente pelo IBS e CBS', '["*"]', 'https://dfe-portal.svrs.rs.gov.br/CFF/ClassificacaoTributariaNcm', 'Portal Conformidade Fácil — 28/08/2026'),
  (gen_random_uuid(), 'IBS_CBS_CCLASSTRIB', '200013', '200', 'Tampões, absorventes, calcinhas absorventes e coletores menstruais', '["96190000"]', 'https://dfe-portal.svrs.rs.gov.br/CFF/ClassificacaoTributariaNcm', 'Portal Conformidade Fácil — 28/08/2026'),
  (gen_random_uuid(), 'IBS_CBS_CCLASSTRIB', '200032', '200', 'Medicamentos registrados na Anvisa ou produzidos por farmácia de manipulação, exceto alíquota zero', '["3001","3002","3003","3004","3005","3006"]', 'https://dfe-portal.svrs.rs.gov.br/CFF/ClassificacaoTributariaNcm', 'Portal Conformidade Fácil — 28/08/2026'),
  (gen_random_uuid(), 'IBS_CBS_CCLASSTRIB', '200035', '200', 'Produtos de higiene pessoal e limpeza listados no Anexo VIII', '["34011190","33061000","96032100","48181000","38089419","34011900","96190000"]', 'https://dfe-portal.svrs.rs.gov.br/CFF/ClassificacaoTributariaNcm', 'Portal Conformidade Fácil — 28/08/2026');
