import { Schema, model, models, type Model, type Types } from "mongoose";

export const REGIMES = [
  "SIMPLES_NACIONAL",
  "LUCRO_PRESUMIDO",
  "LUCRO_REAL",
] as const;

export type RegimeTributario = (typeof REGIMES)[number];

const ProdutoRegraFiscalSchema = new Schema(
  {
    ean: { type: String, match: /^[0-9]{8,14}$/, required: true, unique: true, index: true },
    nome: { type: String, required: true },
    principio_ativo: { type: String, default: "" },
    laboratorio: { type: String, default: "" },
    categoria_fiscal_id: {
      type: Schema.Types.ObjectId,
      ref: "CategoriaFiscal",
      required: true,
      index: true,
    },
    lote: { type: String, required: true },
    quantidade_entrada: { type: Number, min: 0, required: true },
    valor_entrada_unitario: { type: Number, min: 0, required: true },
    preco_venda: { type: Number, min: 0, required: true },
    estoque_atual: { type: Number, min: 0, required: true },
    estoque_minimo_critico: { type: Number, min: 0, required: true },
    media_venda_diaria: { type: Number, min: 0, required: true },
    data_fabricacao: { type: Date, required: true },
    data_vencimento: { type: Date, required: true, index: true },
    is_cimed: { type: Boolean, required: true, default: false, index: true },
    ativo: { type: Boolean, required: true, default: true, index: true },
  },
  {
    collection: "produtos_regras_fiscais",
    timestamps: true,
    optimisticConcurrency: true,
  },
);

ProdutoRegraFiscalSchema.index({ categoria_fiscal_id: 1, ativo: 1 });
ProdutoRegraFiscalSchema.index({ data_vencimento: 1, estoque_atual: 1 });
ProdutoRegraFiscalSchema.path("data_vencimento").validate(function (value: Date) {
  return !this.data_fabricacao || value > this.data_fabricacao;
}, "A data de vencimento deve ser posterior à fabricação");

export type ProdutoRegraFiscal = {
  _id: Types.ObjectId;
  ean: string;
  nome: string;
  principio_ativo: string;
  laboratorio: string;
  categoria_fiscal_id: Types.ObjectId;
  lote: string;
  quantidade_entrada: number;
  valor_entrada_unitario: number;
  preco_venda: number;
  estoque_atual: number;
  estoque_minimo_critico: number;
  media_venda_diaria: number;
  data_fabricacao: Date;
  data_vencimento: Date;
  is_cimed: boolean;
  ativo: boolean;
};

export const ProdutoRegraFiscalModel =
  (models.ProdutoRegraFiscal ??
    model("ProdutoRegraFiscal", ProdutoRegraFiscalSchema)) as Model<ProdutoRegraFiscal>;
