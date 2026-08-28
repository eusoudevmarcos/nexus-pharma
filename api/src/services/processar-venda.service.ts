import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../infra/prisma.js";
import {
  allocateQuantity,
  evaluateTaxExit,
  isHighRiskTaxRule,
  TaxGuardError,
} from "./tax-chain.service.js";

export type ProcessarVendaInput = {
  empresaId: string;
  usuarioId: string;
  requestId: string;
  idempotencyKey: string;
  modeloNota: "55" | "65";
  ufDestino?: string | null;
  tipoOperacao?: string;
  itens: Array<{ ean: string; quantidade: number }>;
};

const roundMoney = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;
const toJson = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export async function processarVenda(input: ProcessarVendaInput) {
  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.sale.findUnique({
        where: {
          companyId_idempotencyKey: {
            companyId: input.empresaId,
            idempotencyKey: input.idempotencyKey,
          },
        },
        include: { items: true },
      });
      if (existing)
        return { vendaId: existing.id, idempotente: true, totais: existing };

      const company = await tx.company.findUnique({
        where: { id: input.empresaId },
      });
      if (!company) throw new Error("EMPRESA_NAO_ENCONTRADA");

      const eans = input.itens.map((item) => item.ean);
      const products = await tx.product.findMany({
        where: { companyId: input.empresaId, ean: { in: eans }, active: true },
        include: {
          category: { include: { rules: true } },
          lots: {
            where: { quantity: { gt: 0 } },
            orderBy: { expiresAt: "asc" },
            include: {
              taxProvenances: {
                where: { status: "APPROVED", remainingQuantity: { gt: 0 } },
                orderBy: [{ operationDate: "asc" }, { createdAt: "asc" }],
              },
            },
          },
        },
      });
      const byEan = new Map(products.map((product) => [product.ean, product]));
      const now = new Date();

      const lines = input.itens.map((item) => {
        const product = byEan.get(item.ean);
        if (!product) throw new Error(`PRODUTO_NAO_ENCONTRADO:${item.ean}`);
        const category = product.category;
        if (
          !category.active ||
          category.status !== "APPROVED" ||
          category.validFrom > now ||
          (category.validUntil && category.validUntil < now)
        ) {
          throw new Error(`CATEGORIA_FISCAL_SEM_VIGENCIA:${item.ean}`);
        }
        const rule = category.rules.find(
          (candidate) => candidate.regime === company.taxRegime,
        );
        if (!rule) throw new Error(`REGRA_FISCAL_INCOMPLETA:${item.ean}`);
        if (company.taxRegime === "SIMPLES_NACIONAL" && !rule.csosn)
          throw new Error(`CSOSN_OBRIGATORIO:${item.ean}`);
        if (Number(product.stockQuantity) < item.quantidade)
          throw new Error(`ESTOQUE_INSUFICIENTE:${item.ean}`);
        const usableLots = product.lots.filter((lot) => lot.expiresAt > now);
        if (
          product.lots.length &&
          usableLots.reduce((sum, lot) => sum + Number(lot.quantity), 0) <
            item.quantidade
        ) {
          throw new Error(`LOTE_VALIDO_INSUFICIENTE:${item.ean}`);
        }

        const unitPrice = Number(product.salePrice);
        const unitCost = Number(product.currentCost);
        const gross = roundMoney(unitPrice * item.quantidade);
        const cost = roundMoney(unitCost * item.quantidade);
        const icms = roundMoney(gross * Number(rule.icmsRate));
        const pis = roundMoney(gross * Number(rule.pisRate));
        const cofins = roundMoney(gross * Number(rule.cofinsRate));
        const cbs = roundMoney(
          gross * Number(rule.cbsRate) * (1 - Number(rule.cbsReduction)),
        );
        const ibs = roundMoney(
          gross * Number(rule.ibsRate) * (1 - Number(rule.ibsReduction)),
        );
        const cbsOffset = rule.offsetCbsPisCofins
          ? Math.min(cbs, pis + cofins)
          : 0;
        const tax = roundMoney(icms + pis + cofins + cbs + ibs - cbsOffset);
        const lotAllocation = allocateQuantity(
          item.quantidade,
          usableLots,
          (lot) => Number(lot.quantity),
        );
        const highRiskRule = isHighRiskTaxRule({
          classification: category.classification,
          cstIcms: rule.cstIcms,
          csosn: rule.csosn,
          cstPisCofins: rule.cstPisCofins,
        });
        const taxAllocations: Array<{
          lotId: string | null;
          provenanceId: string | null;
          quantity: number;
          evaluation: ReturnType<typeof evaluateTaxExit>;
        }> = [];
        const evaluateAllocation = (
          quantity: number,
          lotId: string | null,
          provenance: (typeof usableLots)[number]["taxProvenances"][number] | null,
        ) => {
          const grossAmount = roundMoney(
            gross * (quantity / item.quantidade),
          );
          const evaluation = evaluateTaxExit({
            productId: product.id,
            lotId,
            classification: category.classification,
            regime: company.taxRegime,
            operationType: input.tipoOperacao ?? "REVENDA_INTERNA",
            originState: company.state,
            destinationState: input.ufDestino ?? company.state,
            quantity,
            grossAmount,
            output: {
              cfop: rule.cfop,
              cstIcms: rule.cstIcms,
              csosn: rule.csosn,
              cstPisCofins: rule.cstPisCofins,
              revenueNature: rule.revenueNature,
              cstIbsCbs: rule.cstIbsCbs,
              cClassTrib: rule.cClassTrib,
              icmsRate: Number(rule.icmsRate),
              pisRate: Number(rule.pisRate),
              cofinsRate: Number(rule.cofinsRate),
              cbsRate: Number(rule.cbsRate),
              ibsRate: Number(rule.ibsRate),
              ruleVersion: category.ruleVersion,
            },
            provenance: provenance
              ? {
                  id: provenance.id,
                  status: provenance.status,
                  stCollectedPreviously: provenance.stCollectedPreviously,
                  monophaseApplicable: provenance.monophaseApplicable,
                  pisCreditTreatment: provenance.pisCreditTreatment,
                  cofinsCreditTreatment: provenance.cofinsCreditTreatment,
                  evidence: provenance.evidence,
                  ruleVersion: provenance.ruleVersion,
                }
              : null,
          });
          taxAllocations.push({
            lotId,
            provenanceId: provenance?.id ?? null,
            quantity,
            evaluation,
          });
        };

        for (const lotItem of lotAllocation.allocations) {
          const provenanceAllocation = allocateQuantity(
            lotItem.quantity,
            lotItem.source.taxProvenances,
            (provenance) => Number(provenance.remainingQuantity),
          );
          for (const provenanceItem of provenanceAllocation.allocations) {
            evaluateAllocation(
              provenanceItem.quantity,
              lotItem.source.id,
              provenanceItem.source,
            );
          }
          if (provenanceAllocation.missingQuantity > 0) {
            evaluateAllocation(
              provenanceAllocation.missingQuantity,
              lotItem.source.id,
              null,
            );
          }
        }
        if (!usableLots.length) {
          evaluateAllocation(item.quantidade, null, null);
        } else if (lotAllocation.missingQuantity > 0 && highRiskRule) {
          evaluateAllocation(lotAllocation.missingQuantity, null, null);
        }
        const unsafeEvaluations = taxAllocations
          .map((allocation) => allocation.evaluation)
          .filter((evaluation) => evaluation.status !== "ALLOWED");
        if (unsafeEvaluations.length) throw new TaxGuardError(unsafeEvaluations);
        return {
          product,
          category,
          rule,
          quantity: item.quantidade,
          unitPrice,
          unitCost,
          gross,
          cost,
          icms,
          pis,
          cofins,
          cbs,
          ibs,
          tax,
          profit: roundMoney(gross - cost - tax),
          usableLots,
          taxAllocations,
        };
      });

      const totals = lines.reduce(
        (sum, line) => ({
          gross: roundMoney(sum.gross + line.gross),
          cost: roundMoney(sum.cost + line.cost),
          icms: roundMoney(sum.icms + line.icms),
          pis: roundMoney(sum.pis + line.pis),
          cofins: roundMoney(sum.cofins + line.cofins),
          cbs: roundMoney(sum.cbs + line.cbs),
          ibs: roundMoney(sum.ibs + line.ibs),
          tax: roundMoney(sum.tax + line.tax),
          profit: roundMoney(sum.profit + line.profit),
        }),
        {
          gross: 0,
          cost: 0,
          icms: 0,
          pis: 0,
          cofins: 0,
          cbs: 0,
          ibs: 0,
          tax: 0,
          profit: 0,
        },
      );

      const sale = await tx.sale.create({
        data: {
          companyId: input.empresaId,
          idempotencyKey: input.idempotencyKey,
          invoiceModel: input.modeloNota === "55" ? "NF55" : "NFC65",
          status: "COMPLETED",
          grossAmount: totals.gross,
          costAmount: totals.cost,
          icmsAmount: totals.icms,
          pisAmount: totals.pis,
          cofinsAmount: totals.cofins,
          cbsAmount: totals.cbs,
          ibsAmount: totals.ibs,
          taxAmount: totals.tax,
          netProfit: totals.profit,
        },
      });

      for (const line of lines) {
        const saleItem = await tx.saleItem.create({
          data: {
              saleId: sale.id,
              productId: line.product.id,
              ean: line.product.ean,
              productName: line.product.name,
              categoryCode: line.category.code,
              categoryName: line.category.name,
              ncm: line.category.ncm,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              unitCost: line.unitCost,
              cfop: line.rule.cfop,
              cstIcms: line.rule.cstIcms,
              csosn: line.rule.csosn,
              cstPis: line.rule.cstPis,
              cstCofins: line.rule.cstCofins,
              revenueNature: line.rule.revenueNature,
              cstIbsCbs: line.rule.cstIbsCbs,
              taxClassification: line.rule.taxClassification,
              icmsAmount: line.icms,
              pisAmount: line.pis,
              cofinsAmount: line.cofins,
              cbsAmount: line.cbs,
              ibsAmount: line.ibs,
              taxAmount: line.tax,
              profitAmount: line.profit,
              ruleVersion: line.category.ruleVersion,
              fiscalSnapshot: {
                category_id: line.category.id,
                regime: company.taxRegime,
                source_references: line.category.sourceReferences,
                rates: {
                  icms: Number(line.rule.icmsRate),
                  pis: Number(line.rule.pisRate),
                  cofins: Number(line.rule.cofinsRate),
                  cbs: Number(line.rule.cbsRate),
                  ibs: Number(line.rule.ibsRate),
                },
                tax_traceability: line.taxAllocations.map((allocation) => ({
                  lot_id: allocation.lotId,
                  provenance_id: allocation.provenanceId,
                  decision_hash: allocation.evaluation.decisionHash,
                  status: allocation.evaluation.status,
                })),
              },
          },
        });
        for (const allocation of line.taxAllocations) {
          await tx.taxExitAssessment.create({
            data: {
              companyId: input.empresaId,
              productId: line.product.id,
              lotId: allocation.lotId,
              provenanceId: allocation.provenanceId,
              saleItemId: saleItem.id,
              requestedById: input.usuarioId,
              requestId: input.requestId,
              status: allocation.evaluation.status,
              operationType: input.tipoOperacao ?? "REVENDA_INTERNA",
              originState: company.state,
              destinationState: input.ufDestino ?? company.state,
              quantity: allocation.quantity,
              grossAmount: roundMoney(
                line.gross * (allocation.quantity / line.quantity),
              ),
              outputCfop: line.rule.cfop,
              outputCstIcms: line.rule.cstIcms,
              outputCsosn: line.rule.csosn,
              outputCstPisCofins: line.rule.cstPisCofins,
              outputRevenueNature: line.rule.revenueNature,
              outputCstIbsCbs: line.rule.cstIbsCbs,
              outputCClassTrib: line.rule.cClassTrib,
              icmsRate: line.rule.icmsRate,
              pisRate: line.rule.pisRate,
              cofinsRate: line.rule.cofinsRate,
              cbsRate: line.rule.cbsRate,
              ibsRate: line.rule.ibsRate,
              preventedTaxAmount: allocation.evaluation.preventedTaxAmount,
              findings: toJson(allocation.evaluation.findings),
              evidence: toJson(allocation.evaluation.evidence),
              ruleVersion: line.category.ruleVersion,
              decisionHash: allocation.evaluation.decisionHash,
            },
          });
        }
      }

      const reorderAlerts = [];
      for (const line of lines) {
        for (const allocation of line.taxAllocations) {
          if (!allocation.provenanceId) continue;
          const changed = await tx.taxProvenance.updateMany({
            where: {
              id: allocation.provenanceId,
              companyId: input.empresaId,
              status: "APPROVED",
              remainingQuantity: { gte: allocation.quantity },
            },
            data: { remainingQuantity: { decrement: allocation.quantity } },
          });
          if (changed.count !== 1)
            throw new Error(
              `SALDO_FISCAL_INSUFICIENTE:${line.product.ean}`,
            );
        }
        const changed = await tx.product.updateMany({
          where: {
            id: line.product.id,
            companyId: input.empresaId,
            stockQuantity: { gte: line.quantity },
          },
          data: { stockQuantity: { decrement: line.quantity } },
        });
        if (changed.count !== 1)
          throw new Error(`ESTOQUE_INSUFICIENTE:${line.product.ean}`);

        let remaining = line.quantity;
        for (const lot of line.usableLots) {
          if (remaining <= 0) break;
          const amount = Math.min(remaining, Number(lot.quantity));
          const lotChanged = await tx.inventoryLot.updateMany({
            where: { id: lot.id, quantity: { gte: amount } },
            data: { quantity: { decrement: amount } },
          });
          if (lotChanged.count !== 1)
            throw new Error(`ESTOQUE_INSUFICIENTE:${line.product.ean}`);
          await tx.stockMovement.create({
            data: {
              companyId: input.empresaId,
              productId: line.product.id,
              lotId: lot.id,
              type: "SALE",
              quantity: -amount,
              unitCost: line.unitCost,
              originType: "SALE",
              originId: sale.id,
            },
          });
          remaining -= amount;
        }
        if (!line.usableLots.length) {
          await tx.stockMovement.create({
            data: {
              companyId: input.empresaId,
              productId: line.product.id,
              type: "SALE",
              quantity: -line.quantity,
              unitCost: line.unitCost,
              originType: "SALE",
              originId: sale.id,
            },
          });
        }

        const stockAfter = Number(line.product.stockQuantity) - line.quantity;
        if (
          stockAfter < Number(line.product.minimumStock) &&
          Number(line.product.dailySalesAverage) > 0
        ) {
          const suggested = Math.max(
            0,
            Math.ceil(Number(line.product.dailySalesAverage) * 35 - stockAfter),
          );
          const alert = await tx.reorderAlert.create({
            data: {
              companyId: input.empresaId,
              productId: line.product.id,
              stockAtTrigger: stockAfter,
              suggestedQuantity: suggested,
              estimatedMargin: line.unitPrice ? line.profit / line.gross : 0,
              reason: "Estoque abaixo do mínimo com giro de vendas ativo.",
            },
          });
          reorderAlerts.push(alert);
        }
      }

      const period = new Date(
        Date.UTC(sale.soldAt.getUTCFullYear(), sale.soldAt.getUTCMonth(), 1),
      );
      await tx.monthlyProvision.upsert({
        where: { companyId_period: { companyId: input.empresaId, period } },
        create: {
          companyId: input.empresaId,
          period,
          grossRevenue: totals.gross,
          taxAmount: totals.tax,
          costAmount: totals.cost,
          netProfit: totals.profit,
        },
        update: {
          grossRevenue: { increment: totals.gross },
          taxAmount: { increment: totals.tax },
          costAmount: { increment: totals.cost },
          netProfit: { increment: totals.profit },
        },
      });
      await tx.auditLog.create({
        data: {
          companyId: input.empresaId,
          userId: input.usuarioId,
          action: "PROCESS",
          entity: "SALE",
          entityId: sale.id,
          requestId: input.requestId,
          after: {
            totals,
            item_count: lines.length,
            tax_decisions: lines.flatMap((line) =>
              line.taxAllocations.map((allocation) => ({
                decision_hash: allocation.evaluation.decisionHash,
                provenance_id: allocation.provenanceId,
                status: allocation.evaluation.status,
              })),
            ),
          },
        },
      });

      return {
        vendaId: sale.id,
        idempotente: false,
        regimeTributario: company.taxRegime,
        totais: totals,
        alertasReposicao: reorderAlerts,
      };
    },
    { isolationLevel: "Serializable", timeout: 15_000 },
  );
}
