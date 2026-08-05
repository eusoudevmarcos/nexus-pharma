import type { FastifyInstance, FastifyReply } from "fastify";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import {
  CategoriaFiscalModel,
  CLASSIFICACOES_FISCAIS,
  type CategoriaFiscal,
} from "../models/categoria-fiscal.model.js";
import { ProdutoRegraFiscalModel, REGIMES, type RegimeTributario } from "../models/produto-regra-fiscal.model.js";

const percentual = z.number().min(0).max(1);
const regraSchema = z.object({
  cfop: z.number().int().min(1000).max(9999),
  cst_icms: z.string().min(2).max(3),
  csosn: z.string().length(3).nullable(),
  aliquota_icms: percentual.default(0),
  mva: z.number().min(0).default(0),
  cst_pis: z.string().length(2),
  cst_cofins: z.string().length(2),
  natureza_receita_pis_cofins: z.string().max(20).nullable(),
  aliquota_pis: percentual.default(0),
  aliquota_cofins: percentual.default(0),
  cst_ibs_cbs: z.string().min(2).max(5),
  classificacao_tributaria: z.string().min(1).max(30),
  aliquota_cbs: percentual,
  aliquota_ibs: percentual,
  reducao_cbs: percentual.default(0),
  reducao_ibs: percentual.default(0),
  compensar_cbs_pis_cofins: z.boolean().default(true),
});

const categoriaSchema = z.object({
  codigo: z.string().min(2).max(50),
  nome: z.string().min(2).max(120),
  descricao: z.string().max(500).default(""),
  ncm: z.string().regex(/^[0-9]{8}$/),
  cest: z.string().regex(/^[0-9]{7}$/).nullable().default(null),
  classificacao: z.enum(CLASSIFICACOES_FISCAIS),
  regras_por_regime: z.object({
    SIMPLES_NACIONAL: regraSchema,
    LUCRO_PRESUMIDO: regraSchema,
    LUCRO_REAL: regraSchema,
  }),
  versao_regra: z.string().min(1).max(30),
  vigencia_inicio: z.coerce.date(),
  vigencia_fim: z.coerce.date().nullable().default(null),
  ativa: z.boolean().default(true),
}).refine((data) => !data.vigencia_fim || data.vigencia_fim >= data.vigencia_inicio, {
  message: "vigencia_fim deve ser posterior à vigencia_inicio",
  path: ["vigencia_fim"],
});

const produtoSchema = z.object({
  ean: z.string().regex(/^[0-9]{8,14}$/),
  nome: z.string().min(2).max(180),
  principio_ativo: z.string().max(180).default(""),
  laboratorio: z.string().max(120).default(""),
  categoria_fiscal_id: z.string().refine(isValidObjectId, "Categoria inválida"),
  lote: z.string().min(1).max(60),
  quantidade_entrada: z.number().min(0),
  valor_entrada_unitario: z.number().min(0),
  preco_venda: z.number().min(0),
  estoque_atual: z.number().min(0),
  estoque_minimo_critico: z.number().min(0),
  media_venda_diaria: z.number().min(0),
  data_fabricacao: z.coerce.date(),
  data_vencimento: z.coerce.date(),
  is_cimed: z.boolean().default(false),
  ativo: z.boolean().default(true),
}).refine((data) => data.data_vencimento > data.data_fabricacao, {
  message: "data_vencimento deve ser posterior à data_fabricacao",
  path: ["data_vencimento"],
});

function erroValidacao(reply: FastifyReply, error: z.ZodError) {
  return reply.status(400).send({ erro: "CADASTRO_INVALIDO", detalhes: error.flatten() });
}

export async function cadastrosRoutes(app: FastifyInstance) {
  app.get("/categorias", async () => CategoriaFiscalModel.find().sort({ nome: 1 }).lean());

  app.post("/categorias", async (request, reply) => {
    const parsed = categoriaSchema.safeParse(request.body);
    if (!parsed.success) return erroValidacao(reply, parsed.error);
    if (parsed.data.regras_por_regime.SIMPLES_NACIONAL.csosn === null) {
      return reply.status(400).send({ erro: "CSOSN_OBRIGATORIO_NO_SIMPLES" });
    }
    const categoria = await CategoriaFiscalModel.create(parsed.data);
    return reply.status(201).send(categoria);
  });

  app.put<{ Params: { id: string } }>("/categorias/:id", async (request, reply) => {
    if (!isValidObjectId(request.params.id)) return reply.status(400).send({ erro: "ID_INVALIDO" });
    const parsed = categoriaSchema.safeParse(request.body);
    if (!parsed.success) return erroValidacao(reply, parsed.error);
    if (parsed.data.regras_por_regime.SIMPLES_NACIONAL.csosn === null) {
      return reply.status(400).send({ erro: "CSOSN_OBRIGATORIO_NO_SIMPLES" });
    }
    const categoria = await CategoriaFiscalModel.findByIdAndUpdate(request.params.id, parsed.data, {
      new: true, runValidators: true,
    });
    return categoria ? reply.send(categoria) : reply.status(404).send({ erro: "CATEGORIA_NAO_ENCONTRADA" });
  });

  app.get<{ Querystring: { regime?: RegimeTributario } }>("/produtos", async (request, reply) => {
    const regime = request.query.regime ?? "SIMPLES_NACIONAL";
    if (!REGIMES.includes(regime)) return reply.status(400).send({ erro: "REGIME_INVALIDO" });
    const produtos = await ProdutoRegraFiscalModel.find().sort({ nome: 1 }).lean();
    const ids = [...new Set(produtos.map((produto) => produto.categoria_fiscal_id.toString()))];
    const categorias = await CategoriaFiscalModel.find({ _id: { $in: ids } }).lean();
    const mapa = new Map(categorias.map((categoria) => [categoria._id.toString(), categoria as CategoriaFiscal]));
    return produtos.map((produto) => {
      const categoria = mapa.get(produto.categoria_fiscal_id.toString());
      const regra = categoria?.regras_por_regime[regime];
      const valor = produto.preco_venda;
      const cbs = regra ? valor * regra.aliquota_cbs * (1 - regra.reducao_cbs) : 0;
      const ibs = regra ? valor * regra.aliquota_ibs * (1 - regra.reducao_ibs) : 0;
      const pisCofins = regra ? valor * (regra.aliquota_pis + regra.aliquota_cofins) : 0;
      const compensacaoCbs = regra?.compensar_cbs_pis_cofins ? Math.min(cbs, pisCofins) : 0;
      const tributoTotal = regra ? valor * regra.aliquota_icms + pisCofins + cbs + ibs - compensacaoCbs : 0;
      return {
        ...produto,
        categoria: categoria ? { id: categoria._id, nome: categoria.nome, ncm: categoria.ncm, classificacao: categoria.classificacao, versao_regra: categoria.versao_regra } : null,
        calculados: {
          valor_entrada_total: produto.quantidade_entrada * produto.valor_entrada_unitario,
          cbs_total: cbs,
          ibs_total: ibs,
          valor_tributo_total: tributoTotal,
          lucro_unitario: valor - produto.valor_entrada_unitario - tributoTotal,
          margem_lucro: valor ? (valor - produto.valor_entrada_unitario - tributoTotal) / valor : 0,
        },
      };
    });
  });

  app.post("/produtos", async (request, reply) => {
    const parsed = produtoSchema.safeParse(request.body);
    if (!parsed.success) return erroValidacao(reply, parsed.error);
    const categoria = await CategoriaFiscalModel.findOne({ _id: parsed.data.categoria_fiscal_id, ativa: true });
    if (!categoria) return reply.status(409).send({ erro: "CATEGORIA_FISCAL_INVALIDA" });
    const produto = await ProdutoRegraFiscalModel.create(parsed.data);
    return reply.status(201).send(produto);
  });

  app.put<{ Params: { id: string } }>("/produtos/:id", async (request, reply) => {
    if (!isValidObjectId(request.params.id)) return reply.status(400).send({ erro: "ID_INVALIDO" });
    const parsed = produtoSchema.safeParse(request.body);
    if (!parsed.success) return erroValidacao(reply, parsed.error);
    const categoria = await CategoriaFiscalModel.findOne({ _id: parsed.data.categoria_fiscal_id, ativa: true });
    if (!categoria) return reply.status(409).send({ erro: "CATEGORIA_FISCAL_INVALIDA" });
    const produto = await ProdutoRegraFiscalModel.findByIdAndUpdate(request.params.id, parsed.data, {
      new: true, runValidators: true,
    });
    return produto ? reply.send(produto) : reply.status(404).send({ erro: "PRODUTO_NAO_ENCONTRADO" });
  });
}
