import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../infra/prisma.js";
import {
  allocateQuantity,
  evaluateTaxExit,
  isHighRiskTaxRule,
  TaxGuardError,
} from "./tax-chain.service.js";
import { onlyDigits, validateControlledSaleLine, type BuyerContext, type PrescriptionContext } from "./sale-control.service.js";
import { validateBrazilianTaxId } from "./nfce.service.js";
import { availableQuantity, decrementStoreBalance } from "./inventory-workflow.service.js";

export type ProcessarVendaInput = {
  empresaId: string;
  usuarioId: string;
  requestId: string;
  idempotencyKey: string;
  modeloNota: "55" | "65";
  ufDestino?: string | null;
  tipoOperacao?: string;
  itens: Array<{ ean: string; quantidade: number; prescricao?: PrescriptionContext | null }>;
  cashSessionId?: string | null;
  pagamentos?: Array<{
    metodo: "CASH" | "PIX" | "CREDIT_CARD" | "DEBIT_CARD" | "VOUCHER" | "OTHER";
    valor: number;
    referenciaExterna?: string | null;
  }>;
  actorRole?: string;
  discountPercent?: number;
  sellerId?: string | null;
  pharmacistCredentialId?: string | null;
  counterOrderId?: string | null;
  buyer?: BuyerContext | null;
  operationAt?: Date;
};

const roundMoney = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;
const toJson = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

const defaultDiscountLimits: Record<string, number> = {
  VIEWER: 0,
  OPERATOR: 5,
  PHARMACIST: 10,
  ATTENDANT: 5,
  MANAGER: 15,
  ADMIN: 20,
  OWNER: 20,
  FINANCE: 0,
};

export function discountLimitForRole(role: string, settings: unknown) {
  const configured = settings && typeof settings === "object"
    ? (settings as { posDiscountLimits?: Record<string, unknown> }).posDiscountLimits
    : undefined;
  const value = Number(configured?.[role] ?? defaultDiscountLimits[role] ?? 0);
  return Number.isFinite(value) ? Math.max(0, Math.min(50, value)) : 0;
}

function commercialPriceForProduct(product: {
  salePrice: unknown;
  salesStrategy: string;
  promotionPrice: unknown | null;
  strategyStartsAt: Date | null;
  strategyEndsAt: Date | null;
}, now: Date) {
  const listPrice = Number(product.salePrice);
  const promotionIsActive =
    product.salesStrategy === "PROMOTION" &&
    product.promotionPrice !== null &&
    (!product.strategyStartsAt || product.strategyStartsAt <= now) &&
    (!product.strategyEndsAt || product.strategyEndsAt >= now);
  return {
    listPrice,
    commercialPrice: promotionIsActive ? Number(product.promotionPrice) : listPrice,
    promotionIsActive,
  };
}

async function processarVendaOnce(input: ProcessarVendaInput) {
  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.sale.findUnique({
        where: {
          companyId_idempotencyKey: {
            companyId: input.empresaId,
            idempotencyKey: input.idempotencyKey,
          },
        },
        include: { items: true, payments: true },
      });
      if (existing)
        return { vendaId: existing.id, idempotente: true, totais: existing };

      const company = await tx.company.findUnique({
        where: { id: input.empresaId },
      });
      if (!company) throw new Error("EMPRESA_NAO_ENCONTRADA");
      const operationNow = input.operationAt ?? new Date();
      const sellerId = input.sellerId ?? input.usuarioId;
      const sellerMembership = await tx.membership.findFirst({
        where: { companyId: input.empresaId, userId: sellerId, active: true, role: { in: ["OWNER", "ADMIN", "MANAGER", "PHARMACIST", "ATTENDANT", "OPERATOR"] }, user: { status: "ACTIVE" } },
        include: { user: { select: { name: true } } },
      });
      if (!sellerMembership) throw new Error("VENDEDOR_ATIVO_NAO_ENCONTRADO");
      const pharmacistCredential = input.pharmacistCredentialId
        ? await tx.pharmacistCredential.findFirst({
            where: {
              id: input.pharmacistCredentialId, companyId: input.empresaId, status: "VERIFIED",
              validFrom: { lte: operationNow }, OR: [{ validUntil: null }, { validUntil: { gte: operationNow } }],
              user: { status: "ACTIVE", memberships: { some: { companyId: input.empresaId, active: true, role: "PHARMACIST" } } },
            },
          })
        : null;
      if (input.pharmacistCredentialId && !pharmacistCredential) throw new Error("CREDENCIAL_FARMACEUTICA_NAO_VERIFICADA_OU_FORA_DA_VIGENCIA");
      const normalizedBuyer = input.buyer?.taxId
        ? { taxId: onlyDigits(input.buyer.taxId), name: input.buyer.name?.trim() || null, birthDate: input.buyer.birthDate ?? null }
        : null;
      if (normalizedBuyer && !validateBrazilianTaxId(normalizedBuyer.taxId)) throw new Error("DOCUMENTO_DO_COMPRADOR_INVALIDO");
      const customer = normalizedBuyer
        ? await tx.customer.upsert({
            where: { companyId_taxId: { companyId: input.empresaId, taxId: normalizedBuyer.taxId } },
            create: { companyId: input.empresaId, taxId: normalizedBuyer.taxId, name: normalizedBuyer.name, birthDate: normalizedBuyer.birthDate },
            update: { ...(normalizedBuyer.name ? { name: normalizedBuyer.name } : {}), ...(normalizedBuyer.birthDate ? { birthDate: normalizedBuyer.birthDate } : {}), active: true },
          })
        : null;
      const requestedDiscount = input.discountPercent ?? 0;
      const discountLimit = discountLimitForRole(input.counterOrderId ? sellerMembership.role : input.actorRole ?? "OPERATOR", company.settings);
      if (requestedDiscount < 0 || requestedDiscount > discountLimit)
        throw new Error(`DESCONTO_ACIMA_DO_LIMITE:${discountLimit.toFixed(2)}`);
      const discountRate = requestedDiscount / 100;

      const cashSession = input.cashSessionId
        ? await tx.cashSession.findFirst({
            where: {
              id: input.cashSessionId,
              companyId: input.empresaId,
              status: "OPEN",
              pointOfSale: { active: true, store: { active: true } },
            },
          })
        : null;
      if (input.cashSessionId && !cashSession)
        throw new Error("SESSAO_CAIXA_NAO_ENCONTRADA_OU_FECHADA");
      if (Boolean(input.cashSessionId) !== Boolean(input.pagamentos?.length))
        throw new Error("CAIXA_E_PAGAMENTOS_DEVEM_SER_INFORMADOS_JUNTOS");
      const counterOrder = input.counterOrderId
        ? await tx.counterOrder.findFirst({
            where: {
              id: input.counterOrderId,
              companyId: input.empresaId,
              status: "IN_CHECKOUT",
              cashSessionId: cashSession?.id,
              expiresAt: { gt: operationNow },
            },
          })
        : null;
      if (input.counterOrderId && !counterOrder)
        throw new Error("PRE_VENDA_NAO_ASSUMIDA_NESTE_CAIXA");

      const eans = input.itens.map((item) => item.ean);
      const products = await tx.product.findMany({
        where: { companyId: input.empresaId, ean: { in: eans }, active: true },
        include: {
          category: { include: { rules: true } },
          lots: {
            where: { quantity: { gt: 0 } },
            orderBy: { expiresAt: "asc" },
            include: {
              storeStockBalances: true,
              taxProvenances: {
                where: { status: "APPROVED", remainingQuantity: { gt: 0 } },
                orderBy: [{ operationDate: "asc" }, { createdAt: "asc" }],
              },
            },
          },
        },
      });
      const byEan = new Map(products.map((product) => [product.ean, product]));
      const now = operationNow;

      const lines = input.itens.map((item) => {
        const product = byEan.get(item.ean);
        if (!product) throw new Error(`PRODUTO_NAO_ENCONTRADO:${item.ean}`);
        const controlPolicy = {
          controlLevel: product.controlLevel,
          requiresBuyerId: product.requiresBuyerId,
          requiresPrescription: product.requiresPrescription,
          requiresPharmacist: product.requiresPharmacist,
          retainsPrescription: product.retainsPrescription,
          minimumBuyerAge: product.minimumBuyerAge,
          controlRuleVersion: product.controlRuleVersion,
          controlLegalBasis: product.controlLegalBasis,
        };
        const controlErrors = validateControlledSaleLine({
          policy: controlPolicy,
          buyer: normalizedBuyer,
          prescription: item.prescricao,
          hasVerifiedPharmacist: Boolean(pharmacistCredential),
          now,
        });
        if (controlErrors.length) throw new Error(`VENDA_CONTROLADA_BLOQUEADA:${item.ean}:${controlErrors.join(",")}`);
        const controlSnapshot = {
          policy: controlPolicy,
          legalBasis: product.controlLegalBasis,
          metadata: product.controlMetadata,
          validatedAt: now.toISOString(),
          buyerIdentified: Boolean(normalizedBuyer),
          pharmacistCredentialId: pharmacistCredential?.id ?? null,
          pharmacist: pharmacistCredential ? { userId: pharmacistCredential.userId, council: pharmacistCredential.council, registration: pharmacistCredential.registration, state: pharmacistCredential.state, validFrom: pharmacistCredential.validFrom.toISOString().slice(0, 10), validUntil: pharmacistCredential.validUntil?.toISOString().slice(0, 10) ?? null } : null,
          prescription: item.prescricao ? {
            number: item.prescricao.number ?? null,
            prescriberName: item.prescricao.prescriberName ?? null,
            prescriberRegistration: item.prescricao.prescriberRegistration ?? null,
            prescriberState: item.prescricao.prescriberState ?? null,
            issuedAt: item.prescricao.issuedAt?.toISOString() ?? null,
            retained: Boolean(item.prescricao.retained),
          } : null,
        };
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
        const usableLots = product.lots
          .filter((lot) => lot.expiresAt > now)
          .map((lot) => {
            const location = cashSession ? lot.storeStockBalances.find((balance) => balance.storeId === cashSession.storeId) : null;
            return { ...lot, storeAvailable: cashSession ? availableQuantity(Number(location?.onHand ?? 0), Number(location?.reserved ?? 0)) : Number(lot.quantity) };
          })
          .filter((lot) => lot.storeAvailable > 0);
        if (
          (cashSession || product.lots.length > 0) &&
          usableLots.reduce((sum, lot) => sum + lot.storeAvailable, 0) <
            item.quantidade
        ) {
          throw new Error(`LOTE_VALIDO_INSUFICIENTE:${item.ean}`);
        }

        const commercialPricing = commercialPriceForProduct(product, now);
        const originalUnitPrice = commercialPricing.listPrice;
        const unitPrice = roundMoney(commercialPricing.commercialPrice * (1 - discountRate));
        const unitCost = Number(product.currentCost);
        const originalGross = roundMoney(originalUnitPrice * item.quantidade);
        const gross = roundMoney(unitPrice * item.quantidade);
        const discount = roundMoney(originalGross - gross);
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
          (lot) => lot.storeAvailable,
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
          originalUnitPrice,
          originalGross,
          discount,
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
          controlPolicy,
          controlSnapshot,
          commercialPricing,
          prescription: item.prescricao ?? null,
        };
      });

      const totals = lines.reduce(
        (sum, line) => ({
          gross: roundMoney(sum.gross + line.gross),
          originalGross: roundMoney(sum.originalGross + line.originalGross),
          discount: roundMoney(sum.discount + line.discount),
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
          originalGross: 0,
          discount: 0,
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

      if (input.pagamentos?.length) {
        const paymentTotal = roundMoney(
          input.pagamentos.reduce((sum, payment) => sum + payment.valor, 0),
        );
        if (Math.abs(paymentTotal - totals.gross) > 0.009)
          throw new Error(
            `TOTAL_PAGAMENTOS_DIVERGENTE:${paymentTotal.toFixed(2)}:${totals.gross.toFixed(2)}`,
          );
      }

      const sale = await tx.sale.create({
        data: {
          companyId: input.empresaId,
          cashSessionId: cashSession?.id,
          customerId: customer?.id,
          sellerId,
          pharmacistCredentialId: pharmacistCredential?.id,
          counterOrderId: counterOrder?.id,
          idempotencyKey: input.idempotencyKey,
          invoiceModel: input.modeloNota === "55" ? "NF55" : "NFC65",
          status: "COMPLETED",
          originalGrossAmount: totals.originalGross,
          discountAmount: totals.discount,
          grossAmount: totals.gross,
          costAmount: totals.cost,
          icmsAmount: totals.icms,
          pisAmount: totals.pis,
          cofinsAmount: totals.cofins,
          cbsAmount: totals.cbs,
          ibsAmount: totals.ibs,
          taxAmount: totals.tax,
          netProfit: totals.profit,
          customerTaxId: normalizedBuyer?.taxId,
          customerName: normalizedBuyer?.name,
          customerBirthDate: normalizedBuyer?.birthDate,
          sellerName: sellerMembership.user.name,
          pharmacistSnapshot: toJson(pharmacistCredential ? { id: pharmacistCredential.id, userId: pharmacistCredential.userId, council: pharmacistCredential.council, registration: pharmacistCredential.registration, state: pharmacistCredential.state, status: pharmacistCredential.status, validFrom: pharmacistCredential.validFrom, validUntil: pharmacistCredential.validUntil } : {}),
          soldAt: operationNow,
        },
      });

      if (counterOrder) {
        const completed = await tx.counterOrder.updateMany({
          where: { id: counterOrder.id, status: "IN_CHECKOUT", cashSessionId: cashSession?.id },
          data: { status: "COMPLETED", completedAt: operationNow },
        });
        if (completed.count !== 1) throw new Error("PRE_VENDA_JA_FINALIZADA_OU_CANCELADA");
      }

      if (cashSession && input.pagamentos?.length) {
        await tx.salePayment.createMany({
          data: input.pagamentos.map((payment, index) => ({
            companyId: input.empresaId,
            saleId: sale.id,
            cashSessionId: cashSession.id,
            createdById: input.usuarioId,
            method: payment.metodo,
            status: "RECORDED",
            amount: payment.valor,
            idempotencyKey: `${input.idempotencyKey}:${index + 1}`,
            externalReference: payment.referenciaExterna ?? null,
            metadata: toJson({
              integration: "LOCAL_RECORD_ONLY",
              providerConfirmation: false,
            }),
          })),
        });
      }

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
              originalUnitPrice: line.originalUnitPrice,
              unitPrice: line.unitPrice,
              discountAmount: line.discount,
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
              controlLevel: line.controlPolicy.controlLevel,
              controlRuleVersion: line.controlPolicy.controlRuleVersion,
              controlSnapshot: toJson(line.controlSnapshot),
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
                commercial_strategy: {
                  type: line.product.salesStrategy,
                  reason: line.product.strategyReason,
                  promotion_active: line.commercialPricing.promotionIsActive,
                  list_price: line.commercialPricing.listPrice,
                  commercial_price: line.commercialPricing.commercialPrice,
                  starts_at: line.product.strategyStartsAt,
                  ends_at: line.product.strategyEndsAt,
                },
              },
          },
        });
        if (line.controlPolicy.controlLevel !== "NONE" || line.controlPolicy.requiresBuyerId || line.controlPolicy.requiresPrescription || line.controlPolicy.requiresPharmacist) {
          await tx.controlledSaleRecord.create({
            data: {
              companyId: input.empresaId,
              saleId: sale.id,
              saleItemId: saleItem.id,
              pharmacistCredentialId: pharmacistCredential?.id,
              createdById: input.usuarioId,
              controlLevel: line.controlPolicy.controlLevel,
              buyerTaxId: normalizedBuyer?.taxId,
              buyerName: normalizedBuyer?.name,
              buyerBirthDate: normalizedBuyer?.birthDate,
              prescriptionNumber: line.prescription?.number?.trim() || null,
              prescriberName: line.prescription?.prescriberName?.trim() || null,
              prescriberRegistration: line.prescription?.prescriberRegistration?.trim() || null,
              prescriberState: line.prescription?.prescriberState ?? null,
              prescriptionIssuedAt: line.prescription?.issuedAt ?? null,
              prescriptionRetained: Boolean(line.prescription?.retained),
              ruleVersion: line.controlPolicy.controlRuleVersion ?? "LOCAL-NONE",
              evidence: toJson(line.controlSnapshot),
            },
          });
        }
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
          const amount = Math.min(remaining, lot.storeAvailable);
          const lotChanged = await tx.inventoryLot.updateMany({
            where: { id: lot.id, quantity: { gte: amount } },
            data: { quantity: { decrement: amount } },
          });
          if (lotChanged.count !== 1)
            throw new Error(`ESTOQUE_INSUFICIENTE:${line.product.ean}`);
          if (cashSession) await decrementStoreBalance(tx, { companyId: input.empresaId, storeId: cashSession.storeId, productId: line.product.id, lotId: lot.id, quantity: amount });
          await tx.stockMovement.create({
            data: {
              companyId: input.empresaId,
              storeId: cashSession?.storeId,
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
              storeId: cashSession?.storeId,
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
            discount: { percent: requestedDiscount, limit: discountLimit, amount: totals.discount },
            item_count: lines.length,
            seller_id: sellerId,
            customer_id: customer?.id ?? null,
            customer_identified: Boolean(customer),
            pharmacist_credential_id: pharmacistCredential?.id ?? null,
            counter_order_id: counterOrder?.id ?? null,
            controlled_items: lines.filter((line) => line.controlPolicy.controlLevel !== "NONE").map((line) => ({ ean: line.product.ean, level: line.controlPolicy.controlLevel, rule_version: line.controlPolicy.controlRuleVersion })),
            cash_session_id: cashSession?.id ?? null,
            payments: input.pagamentos?.map((payment) => ({
              method: payment.metodo,
              amount: payment.valor,
              provider_confirmed: false,
            })) ?? [],
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
        pagamentosRegistrados: input.pagamentos?.length ?? 0,
        itensControlados: lines.filter((line) => line.controlPolicy.controlLevel !== "NONE").length,
      };
    },
    { isolationLevel: "Serializable", timeout: 15_000 },
  );
}

export async function processarVenda(input: ProcessarVendaInput) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await processarVendaOnce(input);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (attempt < 3 && (code === "P2002" || code === "P2034")) continue;
      throw error;
    }
  }
  throw new Error("VENDA_CONCORRENCIA_NAO_RESOLVIDA");
}
