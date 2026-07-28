import type { PoolClient } from "pg";
import { postgres } from "../infra/postgres.js";
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
  quantidade: number;
  valor: number;
  segregado: boolean;
  cbs: number;
  ibs: number;
  economia: number;
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
            valor_imposto_provisionado_ibs, valor_economia_tributaria
       FROM venda_nota_fiscal
      WHERE empresa_id = $1 AND idempotency_key = $2`,
    [empresaId, idempotencyKey],
  );
  return result.rows[0] as Record<string, string> | undefined;
}

export async function processarVenda(input: ProcessarVendaInput) {
  const client = await postgres.connect();
  const estoqueDecrementado: Array<{ ean: string; quantidade: number }> = [];
  let committed = false;
  try {
    await client.query("BEGIN");

    const existing = await findExistingSale(
      client,
      input.empresaId,
      input.idempotencyKey,
    );
    if (existing) {
      await client.query("COMMIT");
      committed = true;
      return { vendaId: existing.id, idempotente: true, totais: existing };
    }

    const empresaResult = await client.query<{ regime_tributario: RegimeTributario }>(
      `SELECT regime_tributario
         FROM empresa_farmacia
        WHERE id = $1
        FOR SHARE`,
      [input.empresaId],
    );
    const empresa = empresaResult.rows[0];
    if (!empresa) throw new Error("EMPRESA_NAO_ENCONTRADA");

    const eans = input.itens.map((item) => item.ean);
    const produtos = (await ProdutoRegraFiscalModel.find({
      ean: { $in: eans },
    }).lean()) as ProdutoRegraFiscal[];
    const porEan = new Map(produtos.map((produto) => [produto.ean, produto]));

    const linhas: LinhaCalculada[] = input.itens.map((item) => {
      const produto = porEan.get(item.ean);
      if (!produto) throw new Error(`PRODUTO_NAO_ENCONTRADO:${item.ean}`);

      const regra = produto.regras_por_regime[empresa.regime_tributario];
      const segregado =
        produto.categoria_medicamento === "LISTA_POSITIVA" ||
        produto.categoria_medicamento === "LISTA_NEGATIVA";
      if (segregado && (regra.cfop !== 5405 || regra.cst_pis_cofins !== "05")) {
        throw new Error(`REGRA_FISCAL_INCONSISTENTE:${item.ean}`);
      }

      const valor = roundMoney(produto.preco_venda * item.quantidade);
      const aliquotaCbs = regra.aliquota_base_cbs;
      const aliquotaIbs = regra.aliquota_base_ibs;
      return {
        produto,
        quantidade: item.quantidade,
        valor,
        segregado,
        cbs: segregado ? 0 : roundMoney(valor * aliquotaCbs),
        ibs: segregado ? 0 : roundMoney(valor * aliquotaIbs),
        economia: segregado
          ? roundMoney(valor * (aliquotaCbs + aliquotaIbs))
          : 0,
      };
    });

    const totais = linhas.reduce(
      (acc, linha) => ({
        bruto: roundMoney(acc.bruto + linha.valor),
        segregado: roundMoney(acc.segregado + (linha.segregado ? linha.valor : 0)),
        cbs: roundMoney(acc.cbs + linha.cbs),
        ibs: roundMoney(acc.ibs + linha.ibs),
        economia: roundMoney(acc.economia + linha.economia),
      }),
      { bruto: 0, segregado: 0, cbs: 0, ibs: 0, economia: 0 },
    );

    const vendaResult = await client.query<{ id: string; data_venda: Date }>(
      `INSERT INTO venda_nota_fiscal (
         empresa_id, idempotency_key, modelo_nota, valor_bruto,
         valor_imposto_provisionado_cbs, valor_imposto_provisionado_ibs,
         valor_economia_tributaria, faturamento_segregado_isento
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, data_venda`,
      [
        input.empresaId,
        input.idempotencyKey,
        input.modeloNota,
        totais.bruto,
        totais.cbs,
        totais.ibs,
        totais.economia,
        totais.segregado,
      ],
    );
    const venda = vendaResult.rows[0]!;

    await client.query(
      `INSERT INTO dre_provisionamento_mensal (
         empresa_id, competencia, receita_bruta_total,
         faturamento_segregado_isento, imposto_total_devido, lucro_liquido_real
       ) VALUES ($1, date_trunc('month', $2::timestamptz)::date, $3, $4, $5, $6)
       ON CONFLICT (empresa_id, competencia) DO UPDATE SET
         receita_bruta_total = dre_provisionamento_mensal.receita_bruta_total + EXCLUDED.receita_bruta_total,
         faturamento_segregado_isento = dre_provisionamento_mensal.faturamento_segregado_isento + EXCLUDED.faturamento_segregado_isento,
         imposto_total_devido = dre_provisionamento_mensal.imposto_total_devido + EXCLUDED.imposto_total_devido,
         lucro_liquido_real = dre_provisionamento_mensal.lucro_liquido_real + EXCLUDED.lucro_liquido_real,
         updated_at = now()`,
      [
        input.empresaId,
        venda.data_venda,
        totais.bruto,
        totais.segregado,
        roundMoney(totais.cbs + totais.ibs),
        roundMoney(totais.bruto - totais.cbs - totais.ibs),
      ],
    );

    const alertasVmi: Array<{ ean: string; estoqueAtual: number }> = [];
    for (const linha of linhas) {
      const atualizado = await ProdutoRegraFiscalModel.findOneAndUpdate(
        { ean: linha.produto.ean, estoque_atual: { $gte: linha.quantidade } },
        { $inc: { estoque_atual: -linha.quantidade } },
        { new: true },
      ).lean<ProdutoRegraFiscal | null>();
      if (!atualizado) {
        throw new Error(`ESTOQUE_INSUFICIENTE:${linha.produto.ean}`);
      }
      estoqueDecrementado.push({
        ean: linha.produto.ean,
        quantidade: linha.quantidade,
      });
      if (
        atualizado.is_cimed &&
        atualizado.estoque_atual < atualizado.estoque_minimo_critico
      ) {
        alertasVmi.push({
          ean: atualizado.ean,
          estoqueAtual: atualizado.estoque_atual,
        });
      }
    }

    for (const alerta of alertasVmi) {
      await client.query(
        `INSERT INTO evento_vmi
          (venda_id, empresa_id, ean, estoque_apos_venda, payload)
         VALUES ($1,$2,$3,$4,$5::jsonb)
         ON CONFLICT (venda_id, ean) DO NOTHING`,
        [
          venda.id,
          input.empresaId,
          alerta.ean,
          alerta.estoqueAtual,
          JSON.stringify({
            tipo: "RUPTURA_ZERO_CIMED",
            canal: "CENTRAL_CIMED_SIMULADA",
            ean: alerta.ean,
            estoqueAtual: alerta.estoqueAtual,
          }),
        ],
      );
    }

    await client.query("COMMIT");
    committed = true;
    for (const alerta of alertasVmi) {
      console.info("[VMI:CIMED]", {
        vendaId: venda.id,
        empresaId: input.empresaId,
        ...alerta,
      });
    }

    return {
      vendaId: venda.id,
      idempotente: false,
      regimeTributario: empresa.regime_tributario,
      totais,
      alertasVmi,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (!committed && estoqueDecrementado.length > 0) {
      await Promise.all(
        estoqueDecrementado.map((item) =>
          ProdutoRegraFiscalModel.updateOne(
            { ean: item.ean },
            { $inc: { estoque_atual: item.quantidade } },
          ),
        ),
      ).catch((compensationError) => {
        console.error("[ESTOQUE:COMPENSACAO_FALHOU]", compensationError);
      });
    }
    throw error;
  } finally {
    client.release();
  }
}
