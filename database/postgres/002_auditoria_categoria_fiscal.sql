ALTER TABLE venda_nota_fiscal
  ADD COLUMN IF NOT EXISTS valor_tributo_total NUMERIC(15, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_custo_total NUMERIC(15, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lucro_liquido NUMERIC(15, 2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS venda_item_fiscal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id UUID NOT NULL REFERENCES venda_nota_fiscal(id),
  ean VARCHAR(14) NOT NULL,
  produto_nome VARCHAR(180) NOT NULL,
  categoria_codigo VARCHAR(50) NOT NULL,
  categoria_nome VARCHAR(120) NOT NULL,
  ncm CHAR(8) NOT NULL CHECK (ncm ~ '^[0-9]{8}$'),
  quantidade NUMERIC(15, 3) NOT NULL CHECK (quantidade > 0),
  valor_unitario NUMERIC(15, 2) NOT NULL CHECK (valor_unitario >= 0),
  valor_custo_unitario NUMERIC(15, 2) NOT NULL CHECK (valor_custo_unitario >= 0),
  cfop SMALLINT NOT NULL,
  cst_icms VARCHAR(3) NOT NULL,
  csosn VARCHAR(3),
  cst_pis VARCHAR(2) NOT NULL,
  cst_cofins VARCHAR(2) NOT NULL,
  natureza_receita VARCHAR(20),
  cst_ibs_cbs VARCHAR(5) NOT NULL,
  classificacao_tributaria VARCHAR(30) NOT NULL,
  valor_icms NUMERIC(15, 2) NOT NULL DEFAULT 0,
  valor_pis NUMERIC(15, 2) NOT NULL DEFAULT 0,
  valor_cofins NUMERIC(15, 2) NOT NULL DEFAULT 0,
  valor_cbs NUMERIC(15, 2) NOT NULL DEFAULT 0,
  valor_ibs NUMERIC(15, 2) NOT NULL DEFAULT 0,
  valor_tributo_total NUMERIC(15, 2) NOT NULL DEFAULT 0,
  valor_lucro NUMERIC(15, 2) NOT NULL DEFAULT 0,
  versao_regra VARCHAR(30) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_venda_item_fiscal_venda ON venda_item_fiscal (venda_id);
CREATE INDEX IF NOT EXISTS idx_venda_item_fiscal_ncm ON venda_item_fiscal (ncm);
