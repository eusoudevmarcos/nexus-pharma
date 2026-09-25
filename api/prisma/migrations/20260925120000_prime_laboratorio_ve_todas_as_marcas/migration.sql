-- Política de 25/09: o laboratório vê todo o estoque baixo das farmácias
-- vinculadas (todas as marcas) e decide por si mesmo o que oferecer.
-- Laboratórios cadastrados com a restrição antiga gravada como padrão passam
-- para "ALL". A restrição por prefixo GS1 continua opcional na Central.
UPDATE "prime_organizations"
SET "settings" = jsonb_set(COALESCE("settings", '{}'::jsonb), '{productScope}', '"ALL"'),
    "updated_at" = NOW()
WHERE "kind" = 'LABORATORY'
  AND "settings"->>'productScope' = 'OWN';
