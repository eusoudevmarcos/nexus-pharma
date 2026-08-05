import type { PoolClient } from "pg";
import { postgres } from "../infra/postgres.js";
import {
  CategoriaFiscalModel,
  regraVigente,
  type CategoriaFiscal,
  type RegraFiscalCategoria,
} from "../models/categoria-fiscal.model.js";
import {
  ProdutoRegraFiscalModel,
  type ProdutoRegraFiscal,
  type RegimeTributario,
} from "../models/produto-regra-fiscal.model.js";

export type ProcessarVendaInput = {
  empresaId: string;
  idempotencyKey: string;
  modeloNota: "55" | "65";
  itens: Array<{ ean: string; quantidade: number }>;
};

type LinhaCalculada = {
  produto: ProdutoRegraFiscal;
  categoria: CategoriaFiscal;
  regra: RegraFiscalCategoria;
  quantidade: number;
  valor: number;
  custo: number;
  icms: number;
  pis: number;
  cofins: number;
  cbs: number;
  ibs: number;
  tributoTotal: number;
  lucro: number;
};

const roundMoney = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

async function findExistingSale(
  client: PoolClient,
  empresaId: string,
  idempotencyKey: string,
) {
  const result = await client.query(
    `SELECT id, valor_bruto, valor_imposto_provisionado_cbs,
            valor_imposto_provisionado_ibs, valor_tributo_total,
            valor_custo_total, lucro_liquido
       FROM venda_nota_fiscal
      WHERE empresa_id = $1 AND idempotency_key = $2`,
    [empresaId, idempotencyKey],
  );
  return result.rows[0] as Record<string, string> | undefined;
}

function calcularLinha(
  produto: ProdutoRegraFiscal,
  categoria: CategoriaFiscal,
  regra: RegraFiscalCategoria,
  quantidade: number,
): LinhaCalculada {
  const valor = roundMoney(produto.preco_venda * quantidade);
  const custo = roundMoney(produto.valor_entrada_unitario * quantidade);
  const icms = roundMoney(valor * regra.aliquota_icms);
  const pis = roundMoney(valor * regra.aliquota_pis);
  const cofins = roundMoney(valor * regra.aliquota_cofins);
  const cbs = roundMoney(valor * regra.aliquota_cbs * (1 - regra.reducao_cbs));
  const ibs = roundMoney(valor * regra.aliquota_ibs * (1 - regra.reducao_ibs));
  const compensacaoCbs = regra.compensar_cbs_pis_cofins ? Math.min(cbs, pis + cofins) : 0;
  const tributoTotal = roundMoney(icms + pis + cofins + cbs + ibs - compensacaoCbs);

  return {
    produto,
    categoria,
    regra,
    quantidade,
    valor,
    custo,
    icms,
    pis,
    cofins,
    cbs,
    ibs,
    tributoTotal,
    lucro: roundMoney(valor - custo - tributoTotal),
  };
}

export async function processarVenda(input: ProcessarVendaInput) {
  const client = await postgres.connect();
  const estoqueDecrementado: Array<{ ean: string; quantidade: number }> = [];
  let committed = false;
  try {
    await client.query("BEGIN");

    const existing = await findExistingSale(client, input.empresaId, input.idempotencyKey);
    if (existing) {
      await client.query("COMMIT");
      committed = true;
      return { vendaId: existing.id, idempotente: true, totais: existing };
    }

    const empresaResult = await client.query<{ regime_tributario: RegimeTributario }>(
      `SELECT regime_tributario FROM empresa_farmacia WHERE id = $1 FOR SHARE`,
      [input.empresaId],
    );
    const empresa = empresaResult.rows[0];
    if (!empresa) throw new Error("EMPRESA_NAO_ENCONTRADA");

    const eans = input.itens.map((item) => item.ean);
    const produtos = (await ProdutoRegraFiscalModel.find({
      ean: { $in: eans },
      ativo: true,
    }).lean()) as ProdutoRegraFiscal[];
    const porEan = new Map(produtos.map((produto) => [produto.ean, produto]));
    const categoriaIds = [...new Set(produtos.map((produto) => produto.categoria_fiscal_id.toString()))];
    const categorias = (await CategoriaFiscalModel.find({
      _id: { $in: categoriaIds },
      ativa: true,
    }).lean()) as CategoriaFiscal[];
    const porCategoria = new Map(categorias.map((categoria) => [categoria._id.toString(), categoria]));

    const linhas: LinhaCalculada[] = input.itens.map((item) => {
      const produto = porEan.get(item.ean);
      if (!produto) throw new Error(`PRODUTO_NAO_ENCONTRADO:${item.ean}`);
      if (produto.data_vencimento <= new Date()) throw new Error(`PRODUTO_VENCIDO:${item.ean}`);

      const categoria = porCategoria.get(produto.categoria_fiscal_id.toString());
      if (!categoria || !regraVigente(categoria)) {
        throw new Error(`CATEGORIA_FISCAL_SEM_VIGENCIA:${item.ean}`);
      }
      const regra = categoria.regras_por_regime[empresa.regime_tributario];
      if (!regra) throw new Error(`REGRA_FISCAL_INCOMPLETA:${item.ean}`);
      if (empresa.regime_tributario === "SIMPLES_NACIONAL" && !regra.csosn) {
        throw new Error(`CSOSN_OBRIGATORIO:${item.ean}`);
      }

      return calcularLinha(produto, categoria, regra, item.quantidade);
    });

    const totais = linhas.reduce(
      (acc, linha) => ({
        bruto: roundMoney(acc.bruto + linha.valor),
        custo: roundMoney(acc.custo + linha.custo),
        icms: roundMoney(acc.icms + linha.icms),
        pis: roundMoney(acc.pis + linha.pis),
        cofins: roundMoney(acc.cofins + linha.cofins),
        cbs: roundMoney(acc.cbs + linha.cbs),
        ibs: roundMoney(acc.ibs + linha.ibs),
        tributoTotal: roundMoney(acc.tributoTotal + linha.tributoTotal),
        lucro: roundMoney(acc.lucro + linha.lucro),
      }),
      { bruto: 0, custo: 0, icms: 0, pis: 0, cofins: 0, cbs: 0, ibs: 0, tributoTotal: 0, lucro: 0 },
    );

    const vendaResult = await client.query<{ id: string; data_venda: Date }>(
      `INSERT INTO venda_nota_fiscal (
         empresa_id, idempotency_key, modelo_nota, valor_bruto,
         valor_imposto_provisionado_cbs, valor_imposto_provisionado_ibs,
         valor_tributo_total, valor_custo_total, lucro_liquido,
         valor_economia_tributaria, faturamento_segregado_isento
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,0)
       RETURNING id, data_venda`,
      [input.empresaId, input.idempotencyKey, input.modeloNota, totais.bruto,
        totais.cbs, totais.ibs, totais.tributoTotal, totais.custo, totais.lucro],
    );
    const venda = vendaResult.rows[0]!;

    for (const linha of linhas) {
      await client.query(
        `INSERT INTO venda_item_fiscal (
          venda_id, ean, produto_nome, categoria_codigo, categoria_nome,
          ncm, quantidade, valor_unitario, valor_custo_unitario,
          cfop, cst_icms, csosn, cst_pis, cst_cofins,
          natureza_receita, cst_ibs_cbs, classificacao_tributaria,
          valor_icms, valor_pis, valor_cofins, valor_cbs, valor_ibs,
          valor_tributo_total, valor_lucro, versao_regra
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)`,
        [venda.id, linha.produto.ean, linha.produto.nome, linha.categoria.codigo,
          linha.categoria.nome, linha.categoria.ncm, linha.quantidade,
          linha.produto.preco_venda, linha.produto.valor_entrada_unitario,
          linha.regra.cfop, linha.regra.cst_icms, linha.regra.csosn,
          linha.regra.cst_pis, linha.regra.cst_cofins,
          linha.regra.natureza_receita_pis_cofins, linha.regra.cst_ibs_cbs,
          linha.regra.classificacao_tributaria, linha.icms, linha.pis,
          linha.cofins, linha.cbs, linha.ibs, linha.tributoTotal,
          linha.lucro, linha.categoria.versao_regra],
      );
    }

    await client.query(
      `INSERT INTO dre_provisionamento_mensal (
         empresa_id, competencia, receita_bruta_total,
         faturamento_segregado_isento, imposto_total_devido, lucro_liquido_real
       ) VALUES ($1, date_trunc('month', $2::timestamptz)::date, $3, 0, $4, $5)
       ON CONFLICT (empresa_id, competencia) DO UPDATE SET
         receita_bruta_total = dre_provisionamento_mensal.receita_bruta_total + EXCLUDED.receita_bruta_total,
         imposto_total_devido = dre_provisionamento_mensal.imposto_total_devido + EXCLUDED.imposto_total_devido,
         lucro_liquido_real = dre_provisionamento_mensal.lucro_liquido_real + EXCLUDED.lucro_liquido_real,
         updated_at = now()`,
      [input.empresaId, venda.data_venda, totais.bruto, totais.tributoTotal, totais.lucro],
    );

    const alertasVmi: Array<{ ean: string; estoqueAtual: number }> = [];
    for (const linha of linhas) {
      const atualizado = await ProdutoRegraFiscalModel.findOneAndUpdate(
        { ean: linha.produto.ean, estoque_atual: { $gte: linha.quantidade }, ativo: true },
        { $inc: { estoque_atual: -linha.quantidade } },
        { new: true },
      ).lean<ProdutoRegraFiscal | null>();
      if (!atualizado) throw new Error(`ESTOQUE_INSUFICIENTE:${linha.produto.ean}`);
      estoqueDecrementado.push({ ean: linha.produto.ean, quantidade: linha.quantidade });
      if (atualizado.is_cimed && atualizado.estoque_atual < atualizado.estoque_minimo_critico) {
        alertasVmi.push({ ean: atualizado.ean, estoqueAtual: atualizado.estoque_atual });
      }
    }

    for (const alerta of alertasVmi) {
      await client.query(
        `INSERT INTO evento_vmi (venda_id, empresa_id, ean, estoque_apos_venda, payload)
         VALUES ($1,$2,$3,$4,$5::jsonb) ON CONFLICT (venda_id, ean) DO NOTHING`,
        [venda.id, input.empresaId, alerta.ean, alerta.estoqueAtual,
          JSON.stringify({ tipo: "RUPTURA_ZERO_CIMED", canal: "CENTRAL_CIMED_SIMULADA", ...alerta })],
      );
    }

    await client.query("COMMIT");
    committed = true;
    return { vendaId: venda.id, idempotente: false, regimeTributario: empresa.regime_tributario, totais, alertasVmi };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (!committed && estoqueDecrementado.length > 0) {
      await Promise.all(estoqueDecrementado.map((item) =>
        ProdutoRegraFiscalModel.updateOne({ ean: item.ean }, { $inc: { estoque_atual: item.quantidade } }),
      )).catch((compensationError) => console.error("[ESTOQUE:COMPENSACAO_FALHOU]", compensationError));
    }
    throw error;
  } finally {
    client.release();
  }
}
