import { Schema, model, models, type Model } from "mongoose";

export const REGIMES = [
  "SIMPLES_NACIONAL",
  "LUCRO_PRESUMIDO",
  "LUCRO_REAL",
] as const;

export type RegimeTributario = (typeof REGIMES)[number];

const RegraRegimeSchema = new Schema(
  {
    cfop: { type: Number, enum: [5102, 5405], required: true },
    cst_icms: { type: String, required: true },
    csosn: { type: String, default: null },
    cst_pis_cofins: { type: String, required: true },
    natureza_receita_pis_cofins: { type: String, default: null },
    aliquota_base_cbs: { type: Number, min: 0, max: 1, required: true },
    aliquota_base_ibs: { type: Number, min: 0, max: 1, required: true },
  },
  { _id: false },
);

const ProdutoRegraFiscalSchema = new Schema(
  {
    ean: { type: String, required: true, unique: true, index: true },
    nome: { type: String, required: true },
    principio_ativo: { type: String, required: true },
    ncm: { type: String, required: true },
    is_cimed: { type: Boolean, required: true, default: false, index: true },
    preco_venda: { type: Number, min: 0, required: true },
    estoque_atual: { type: Number, min: 0, required: true },
    estoque_minimo_critico: { type: Number, min: 0, required: true },
    media_venda_diaria: { type: Number, min: 0, required: true },
    categoria_medicamento: {
      type: String,
      enum: [
        "LISTA_POSITIVA",
        "LISTA_NEGATIVA",
        "LISTA_NEUTRA",
        "CORRELATO_SUPLEMENTO",
      ],
      required: true,
      index: true,
    },
    regras_por_regime: {
      SIMPLES_NACIONAL: { type: RegraRegimeSchema, required: true },
      LUCRO_PRESUMIDO: { type: RegraRegimeSchema, required: true },
      LUCRO_REAL: { type: RegraRegimeSchema, required: true },
    },
    versao_regra: { type: String, required: true },
    vigencia_inicio: { type: Date, required: true },
  },
  {
    collection: "produtos_regras_fiscais",
    timestamps: true,
    optimisticConcurrency: true,
  },
);

export type ProdutoRegraFiscal = {
  ean: string;
  nome: string;
  is_cimed: boolean;
  preco_venda: number;
  estoque_atual: number;
  estoque_minimo_critico: number;
  categoria_medicamento:
    | "LISTA_POSITIVA"
    | "LISTA_NEGATIVA"
    | "LISTA_NEUTRA"
    | "CORRELATO_SUPLEMENTO";
  regras_por_regime: Record<
    RegimeTributario,
    {
      cfop: 5102 | 5405;
      cst_icms: string;
      csosn: string | null;
      cst_pis_cofins: string;
      natureza_receita_pis_cofins: string | null;
      aliquota_base_cbs: number;
      aliquota_base_ibs: number;
    }
  >;
};

export const ProdutoRegraFiscalModel =
  (models.ProdutoRegraFiscal ??
    model("ProdutoRegraFiscal", ProdutoRegraFiscalSchema)) as unknown as Model<ProdutoRegraFiscal>;
