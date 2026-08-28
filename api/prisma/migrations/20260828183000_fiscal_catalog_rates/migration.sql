ALTER TABLE "fiscal_catalog_entries"
  ADD COLUMN "parameters" JSONB NOT NULL DEFAULT '{}';

UPDATE "fiscal_rules"
SET "pis_rate" = 0, "cofins_rate" = 0
WHERE "cst_pis_cofins" = '04' AND "revenue_nature" IN ('201', '202');

UPDATE "fiscal_rules"
SET "cst_ibs_cbs" = substring("cclass_trib" from 1 for 3),
    "cbs_rate" = 0.009,
    "ibs_rate" = 0.001,
    "cbs_reduction" = CASE
      WHEN "cclass_trib" = '200013' THEN 1
      WHEN "cclass_trib" IN ('200032', '200035') THEN 0.6
      ELSE 0
    END,
    "ibs_reduction" = CASE
      WHEN "cclass_trib" = '200013' THEN 1
      WHEN "cclass_trib" IN ('200032', '200035') THEN 0.6
      ELSE 0
    END
WHERE "cclass_trib" IN ('000001', '200013', '200032', '200035');

UPDATE "fiscal_catalog_entries"
SET "parameters" = CASE
  WHEN "catalog" = 'PIS_COFINS_NATUREZA' AND "code" = '201' THEN '{"CST02_FABRICANTE_IMPORTADOR":{"pis":0.021,"cofins":0.099},"CST04_REVENDA":{"pis":0,"cofins":0}}'::jsonb
  WHEN "catalog" = 'PIS_COFINS_NATUREZA' AND "code" = '202' THEN '{"CST02_FABRICANTE_IMPORTADOR":{"pis":0.022,"cofins":0.103},"CST04_REVENDA":{"pis":0,"cofins":0}}'::jsonb
  WHEN "catalog" = 'IBS_CBS_CCLASSTRIB' AND "code" = '000001' THEN '{"ano":2026,"cbs":0.009,"ibs":0.001,"reducao":0}'::jsonb
  WHEN "catalog" = 'IBS_CBS_CCLASSTRIB' AND "code" = '200013' THEN '{"ano":2026,"cbs":0.009,"ibs":0.001,"reducao":1}'::jsonb
  WHEN "catalog" = 'IBS_CBS_CCLASSTRIB' AND "code" IN ('200032', '200035') THEN '{"ano":2026,"cbs":0.009,"ibs":0.001,"reducao":0.6}'::jsonb
  ELSE "parameters"
END;
