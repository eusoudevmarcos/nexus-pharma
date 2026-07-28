CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE regime_tributario AS ENUM (
    'SIMPLES_NACIONAL',
    'LUCRO_PRESUMIDO',
    'LUCRO_REAL'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE modelo_nota AS ENUM ('55', '65');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS empresa_farmacia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cnpj CHAR(14) NOT NULL UNIQUE CHECK (cnpj ~ '^[0-9]{14}$'),
  razao_social VARCHAR(180) NOT NULL,
  regime_tributario regime_tributario NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS venda_nota_fiscal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresa_farmacia(id),
  idempotency_key UUID NOT NULL,
  data_venda TIMESTAMPTZ NOT NULL DEFAULT now(),
  modelo_nota modelo_nota NOT NULL DEFAULT '65',
  valor_bruto NUMERIC(15, 2) NOT NULL CHECK (valor_bruto >= 0),
  valor_imposto_provisionado_cbs NUMERIC(15, 2) NOT NULL DEFAULT 0,
  valor_imposto_provisionado_ibs NUMERIC(15, 2) NOT NULL DEFAULT 0,
  valor_economia_tributaria NUMERIC(15, 2) NOT NULL DEFAULT 0,
  faturamento_segregado_isento NUMERIC(15, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS dre_provisionamento_mensal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresa_farmacia(id),
  competencia DATE NOT NULL CHECK (date_trunc('month', competencia)::date = competencia),
  receita_bruta_total NUMERIC(15, 2) NOT NULL DEFAULT 0,
  faturamento_segregado_isento NUMERIC(15, 2) NOT NULL DEFAULT 0,
  imposto_total_devido NUMERIC(15, 2) NOT NULL DEFAULT 0,
  lucro_liquido_real NUMERIC(15, 2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, competencia)
);

CREATE TABLE IF NOT EXISTS evento_vmi (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id UUID NOT NULL REFERENCES venda_nota_fiscal(id),
  empresa_id UUID NOT NULL REFERENCES empresa_farmacia(id),
  ean VARCHAR(14) NOT NULL,
  estoque_apos_venda NUMERIC(15, 3) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDENTE',
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (venda_id, ean)
);

CREATE INDEX IF NOT EXISTS idx_venda_empresa_data
  ON venda_nota_fiscal (empresa_id, data_venda DESC);
CREATE INDEX IF NOT EXISTS idx_dre_empresa_competencia
  ON dre_provisionamento_mensal (empresa_id, competencia DESC);
CREATE INDEX IF NOT EXISTS idx_evento_vmi_pendente
  ON evento_vmi (status, created_at) WHERE status = 'PENDENTE';

