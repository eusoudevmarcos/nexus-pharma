import { Schema, model, models, type Model } from "mongoose";
import { REGIMES, type RegimeTributario } from "./produto-regra-fiscal.model.js";

export const CLASSIFICACOES_FISCAIS = [
  "LISTA_POSITIVA",
  "LISTA_NEGATIVA",
  "LISTA_NEUTRA",
  "MONOFASICO",
  "TRIBUTACAO_NORMAL",
] as const;

const RegraCategoriaSchema = new Schema(
  {
    cfop: { type: Number, min: 1000, max: 9999, required: true },
    cst_icms: { type: String, required: true },
    csosn: { type: String, default: null },
    aliquota_icms: { type: Number, min: 0, max: 1, default: 0 },
    mva: { type: Number, min: 0, default: 0 },
    cst_pis: { type: String, required: true },
    cst_cofins: { type: String, required: true },
    natureza_receita_pis_cofins: { type: String, default: null },
    aliquota_pis: { type: Number, min: 0, max: 1, default: 0 },
    aliquota_cofins: { type: Number, min: 0, max: 1, default: 0 },
    cst_ibs_cbs: { type: String, required: true },
    classificacao_tributaria: { type: String, required: true },
    aliquota_cbs: { type: Number, min: 0, max: 1, required: true },
    aliquota_ibs: { type: Number, min: 0, max: 1, required: true },
    reducao_cbs: { type: Number, min: 0, max: 1, default: 0 },
    reducao_ibs: { type: Number, min: 0, max: 1, default: 0 },
    compensar_cbs_pis_cofins: { type: Boolean, default: true },
  },
  { _id: false },
);

const CategoriaFiscalSchema = new Schema(
  {
    codigo: { type: String, required: true, unique: true, index: true },
    nome: { type: String, required: true, index: true },
    descricao: { type: String, default: "" },
    ncm: { type: String, match: /^[0-9]{8}$/, required: true, index: true },
    cest: { type: String, match: /^[0-9]{7}$/, default: null },
    classificacao: {
      type: String,
      enum: CLASSIFICACOES_FISCAIS,
      required: true,
    },
    regras_por_regime: {
      SIMPLES_NACIONAL: { type: RegraCategoriaSchema, required: true },
      LUCRO_PRESUMIDO: { type: RegraCategoriaSchema, required: true },
      LUCRO_REAL: { type: RegraCategoriaSchema, required: true },
    },
    versao_regra: { type: String, required: true },
    vigencia_inicio: { type: Date, required: true },
    vigencia_fim: { type: Date, default: null },
    ativa: { type: Boolean, default: true, index: true },
  },
  {
    collection: "categorias_fiscais",
    timestamps: true,
    optimisticConcurrency: true,
  },
);

export type RegraFiscalCategoria = {
  cfop: number;
  cst_icms: string;
  csosn: string | null;
  aliquota_icms: number;
  mva: number;
  cst_pis: string;
  cst_cofins: string;
  natureza_receita_pis_cofins: string | null;
  aliquota_pis: number;
  aliquota_cofins: number;
  cst_ibs_cbs: string;
  classificacao_tributaria: string;
  aliquota_cbs: number;
  aliquota_ibs: number;
  reducao_cbs: number;
  reducao_ibs: number;
  compensar_cbs_pis_cofins: boolean;
};

export type CategoriaFiscal = {
  _id: Schema.Types.ObjectId;
  codigo: string;
  nome: string;
  ncm: string;
  cest: string | null;
  classificacao: (typeof CLASSIFICACOES_FISCAIS)[number];
  regras_por_regime: Record<RegimeTributario, RegraFiscalCategoria>;
  versao_regra: string;
  vigencia_inicio: Date;
  vigencia_fim: Date | null;
  ativa: boolean;
};

export const CategoriaFiscalModel =
  (models.CategoriaFiscal ??
    model("CategoriaFiscal", CategoriaFiscalSchema)) as Model<CategoriaFiscal>;

export function regraVigente(categoria: CategoriaFiscal, data = new Date()) {
  return (
    categoria.ativa &&
    categoria.vigencia_inicio <= data &&
    (!categoria.vigencia_fim || categoria.vigencia_fim >= data)
  );
}

export { REGIMES };
