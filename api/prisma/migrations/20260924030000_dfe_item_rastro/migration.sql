-- Rastreabilidade (grupo rastro da NF-e): lote, fabricação e validade por item,
-- capturados na importação da NF-e para pré-preencher o recebimento.
ALTER TABLE "dfe_document_items" ADD COLUMN "rastro" JSONB NOT NULL DEFAULT '[]';
