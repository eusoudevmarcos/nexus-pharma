import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../infra/prisma.js";
import { calculateCashExpected, type CashPaymentMethod } from "./cash-register.service.js";
import { incrementStoreBalance } from "./inventory-workflow.service.js";

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const quantity = (value: number) => Math.round((value + Number.EPSILON) * 1000) / 1000;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const allocationKey = (lotId: string | null, provenanceId: string | null) => `${lotId ?? "none"}:${provenanceId ?? "none"}`;

export type ReversalSource = { lotId: string | null; provenanceId: string | null; quantity: number };

export function allocateReversalQuantity(requested: number, sources: ReversalSource[], previouslyReversed: ReversalSource[]) {
  const used = new Map<string, number>();
  for (const entry of previouslyReversed) used.set(allocationKey(entry.lotId, entry.provenanceId), quantity((used.get(allocationKey(entry.lotId, entry.provenanceId)) ?? 0) + entry.quantity));
  let remaining = quantity(requested);
  const allocations: ReversalSource[] = [];
  for (const source of sources) {
    if (remaining <= 0) break;
    const key = allocationKey(source.lotId, source.provenanceId);
    const available = Math.max(0, quantity(source.quantity - (used.get(key) ?? 0)));
    if (available <= 0) continue;
    const amount = Math.min(remaining, available);
    allocations.push({ lotId: source.lotId, provenanceId: source.provenanceId, quantity: amount });
    remaining = quantity(remaining - amount);
    used.set(key, quantity((used.get(key) ?? 0) + amount));
  }
  if (remaining > 0) allocations.push({ lotId: null, provenanceId: null, quantity: remaining });
  return allocations;
}

export function allocateRefundAmount(amount: number, payments: Array<{ id: string; amount: number; refunded: number; method: CashPaymentMethod }>) {
  let remaining = money(amount);
  const allocations: Array<{ paymentId: string; method: CashPaymentMethod; amount: number }> = [];
  for (const payment of payments) {
    if (remaining <= 0) break;
    const available = money(payment.amount - payment.refunded);
    if (available <= 0) continue;
    const allocated = Math.min(remaining, available);
    allocations.push({ paymentId: payment.id, method: payment.method, amount: money(allocated) });
    remaining = money(remaining - allocated);
  }
  return { allocations, missing: remaining };
}

export async function getPostSaleDetail(companyId: string, saleId: string) {
  const sale = await prisma.sale.findFirst({
    where: { id: saleId, companyId },
    include: {
      items: { include: { reversalItems: { select: { quantity: true } } } },
      payments: { include: { refunds: { select: { amount: true, status: true } } } },
      nfceDocuments: { select: { id: true, status: true, series: true, number: true, accessKey: true } },
      reversals: { include: { items: true, paymentRefunds: true, createdBy: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!sale) throw new Error("VENDA_NAO_ENCONTRADA");
  return {
    sale,
    items: sale.items.map((item) => ({
      ...item,
      reversedQuantity: quantity(item.reversalItems.reduce((sum, entry) => sum + Number(entry.quantity), 0)),
      remainingQuantity: quantity(Number(item.quantity) - item.reversalItems.reduce((sum, entry) => sum + Number(entry.quantity), 0)),
    })),
    financial: {
      paid: money(sale.payments.reduce((sum, entry) => sum + Number(entry.amount), 0)),
      refundedOrReserved: money(sale.payments.flatMap((entry) => entry.refunds).filter((entry) => entry.status !== "FAILED").reduce((sum, entry) => sum + Number(entry.amount), 0)),
    },
  };
}

async function reverseSaleOnce(input: {
  companyId: string; saleId: string; cashSessionId: string; userId: string; requestId: string;
  type: "FULL_CANCELLATION" | "PARTIAL_RETURN"; idempotencyKey: string; reason: string;
  items?: Array<{ saleItemId: string; quantity: number; condition: "RESALABLE" | "DAMAGED" | "EXPIRED" | "OTHER" }>;
}) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.saleReversal.findUnique({ where: { companyId_idempotencyKey: { companyId: input.companyId, idempotencyKey: input.idempotencyKey } }, include: { items: { include: { allocations: true } }, paymentRefunds: true } });
    if (existing) return { reversal: existing, idempotent: true };
    const cashSession = await tx.cashSession.findFirst({
      where: { id: input.cashSessionId, companyId: input.companyId, status: "OPEN" },
      include: { movements: true, payments: true, paymentRefunds: { include: { salePayment: { select: { method: true } } } }, sales: true },
    });
    if (!cashSession) throw new Error("SESSAO_CAIXA_NAO_ENCONTRADA_OU_FECHADA");
    const sale = await tx.sale.findFirst({
      where: { id: input.saleId, companyId: input.companyId },
      include: {
        items: {
          include: {
            taxAssessments: { include: { lot: true }, orderBy: { evaluatedAt: "asc" } },
            reversalItems: { include: { allocations: true } },
          },
        },
        payments: { include: { refunds: true }, orderBy: { paidAt: "asc" } },
        nfceDocuments: true,
      },
    });
    if (!sale) throw new Error("VENDA_NAO_ENCONTRADA");
    if (sale.status === "CANCELLED") throw new Error("VENDA_JA_CANCELADA");
    if (!sale.payments.length) throw new Error("VENDA_SEM_PAGAMENTOS_REGISTRADOS");

    const requested = input.type === "FULL_CANCELLATION"
      ? sale.items.map((item) => ({
          saleItemId: item.id,
          quantity: quantity(Number(item.quantity) - item.reversalItems.reduce((sum, entry) => sum + Number(entry.quantity), 0)),
          condition: "RESALABLE" as const,
        })).filter((item) => item.quantity > 0)
      : input.items ?? [];
    if (!requested.length) throw new Error("ESTORNO_SEM_ITENS");
    const seen = new Set<string>();
    const prepared = requested.map((entry) => {
      if (seen.has(entry.saleItemId)) throw new Error("ITEM_ESTORNO_DUPLICADO");
      seen.add(entry.saleItemId);
      const item = sale.items.find((candidate) => candidate.id === entry.saleItemId);
      if (!item) throw new Error("ITEM_VENDA_NAO_ENCONTRADO");
      const previouslyReversed = item.reversalItems.reduce((sum, reversed) => sum + Number(reversed.quantity), 0);
      const remaining = quantity(Number(item.quantity) - previouslyReversed);
      if (entry.quantity <= 0 || entry.quantity > remaining) throw new Error(`QUANTIDADE_DEVOLUCAO_INVALIDA:${remaining}`);
      const ratio = entry.quantity / Number(item.quantity);
      const allocations = allocateReversalQuantity(
        entry.quantity,
        item.taxAssessments.map((assessment) => ({ lotId: assessment.lotId, provenanceId: assessment.provenanceId, quantity: Number(assessment.quantity) })),
        item.reversalItems.flatMap((reversed) => reversed.allocations.map((allocation) => ({ lotId: allocation.lotId, provenanceId: allocation.provenanceId, quantity: Number(allocation.quantity) }))),
      );
      if (entry.condition === "RESALABLE") {
        for (const allocation of allocations) {
          const source = item.taxAssessments.find((assessment) => assessment.lotId === allocation.lotId && assessment.provenanceId === allocation.provenanceId);
          if (allocation.lotId && source?.lot && source.lot.expiresAt <= new Date()) throw new Error("LOTE_DEVOLVIDO_VENCIDO_NAO_PODE_RETORNAR_AO_ESTOQUE");
        }
      }
      return {
        item, condition: entry.condition, quantity: entry.quantity, allocations,
        gross: money(Number(item.unitPrice) * entry.quantity),
        cost: money(Number(item.unitCost) * entry.quantity),
        tax: money(Number(item.taxAmount) * ratio),
      };
    });
    const totals = prepared.reduce((sum, item) => ({ gross: money(sum.gross + item.gross), cost: money(sum.cost + item.cost), tax: money(sum.tax + item.tax) }), { gross: 0, cost: 0, tax: 0 });
    const refundPlan = allocateRefundAmount(totals.gross, sale.payments.map((payment) => ({
      id: payment.id, amount: Number(payment.amount), method: payment.method,
      refunded: payment.refunds.filter((refund) => refund.status !== "FAILED").reduce((sum, refund) => sum + Number(refund.amount), 0),
    })));
    if (refundPlan.missing > 0.009) throw new Error(`SALDO_PAGAMENTO_INSUFICIENTE_PARA_ESTORNO:${refundPlan.missing.toFixed(2)}`);
    const cashRefund = money(refundPlan.allocations.filter((entry) => entry.method === "CASH").reduce((sum, entry) => sum + entry.amount, 0));
    if (cashRefund > 0) {
      const expected = calculateCashExpected({
        openingAmount: Number(cashSession.openingAmount),
        movements: cashSession.movements.map((entry) => ({ type: entry.type, amount: Number(entry.amount) })),
        payments: cashSession.payments.map((entry) => ({ method: entry.method, status: entry.status, amount: Number(entry.amount) })),
        refunds: cashSession.paymentRefunds.map((entry) => ({ method: entry.salePayment.method, status: entry.status, amount: Number(entry.amount) })),
      });
      if (cashRefund > expected.CASH) throw new Error(`DINHEIRO_INSUFICIENTE_PARA_REEMBOLSO:${expected.CASH.toFixed(2)}`);
    }
    const hasAuthorizedNfce = sale.nfceDocuments.some((document) => document.status === "AUTHORIZED");
    const externalPending = refundPlan.allocations.some((entry) => entry.method !== "CASH");
    const reversal = await tx.saleReversal.create({ data: {
      companyId: input.companyId, saleId: sale.id, cashSessionId: cashSession.id, createdById: input.userId,
      type: input.type, status: externalPending ? "PENDING_EXTERNAL_REFUND" : "COMPLETED",
      fiscalStatus: hasAuthorizedNfce ? "PENDING" : "NOT_REQUIRED", idempotencyKey: input.idempotencyKey,
      reason: input.reason, grossAmount: totals.gross, costAmount: totals.cost, taxAmount: totals.tax,
    } });
    for (const entry of prepared) {
      const restocked = entry.condition === "RESALABLE";
      const reversalItem = await tx.saleReversalItem.create({ data: {
        reversalId: reversal.id, saleItemId: entry.item.id, condition: entry.condition,
        quantity: entry.quantity, restocked, grossAmount: entry.gross, costAmount: entry.cost, taxAmount: entry.tax,
      } });
      for (const allocation of entry.allocations) {
        await tx.saleReversalAllocation.create({ data: {
          reversalItemId: reversalItem.id, lotId: allocation.lotId, provenanceId: allocation.provenanceId,
          quantity: allocation.quantity, restocked,
        } });
        if (!restocked) continue;
        if (allocation.lotId) {
          await tx.inventoryLot.update({ where: { id: allocation.lotId }, data: { quantity: { increment: allocation.quantity } } });
          if (entry.item.productId) await incrementStoreBalance(tx, { companyId: input.companyId, storeId: cashSession.storeId, productId: entry.item.productId, lotId: allocation.lotId, quantity: allocation.quantity });
        }
        if (allocation.provenanceId) await tx.taxProvenance.update({ where: { id: allocation.provenanceId }, data: { remainingQuantity: { increment: allocation.quantity } } });
        if (entry.item.productId) await tx.stockMovement.create({ data: {
          companyId: input.companyId, storeId: cashSession.storeId, productId: entry.item.productId, lotId: allocation.lotId,
          type: "RETURN", quantity: allocation.quantity, unitCost: entry.item.unitCost,
          originType: "SALE_REVERSAL", originId: reversal.id, notes: input.reason,
        } });
      }
      if (restocked && entry.item.productId) await tx.product.update({ where: { id: entry.item.productId }, data: { stockQuantity: { increment: entry.quantity } } });
    }
    for (const refund of refundPlan.allocations) {
      await tx.paymentRefund.create({ data: {
        salePaymentId: refund.paymentId, reversalId: reversal.id, cashSessionId: cashSession.id,
        status: refund.method === "CASH" ? "RECORDED" : "BLOCKED", amount: refund.amount,
        reason: refund.method === "CASH" ? input.reason : "Aguardando integração homologada com o provedor do pagamento.",
      } });
    }
    if (!hasAuthorizedNfce) await tx.nfceDocument.updateMany({ where: { saleId: sale.id, status: { in: ["DRAFT", "VALIDATED", "TRANSMISSION_BLOCKED", "QUEUED", "REJECTED"] } }, data: { status: "CANCELLED" } });
    if (input.type === "FULL_CANCELLATION") await tx.sale.update({ where: { id: sale.id }, data: { status: "CANCELLED" } });
    const now = new Date();
    const period = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    await tx.monthlyProvision.upsert({
      where: { companyId_period: { companyId: input.companyId, period } },
      create: { companyId: input.companyId, period, grossRevenue: -totals.gross, taxAmount: -totals.tax, costAmount: -totals.cost, netProfit: -money(totals.gross - totals.cost - totals.tax) },
      update: { grossRevenue: { decrement: totals.gross }, taxAmount: { decrement: totals.tax }, costAmount: { decrement: totals.cost }, netProfit: { decrement: money(totals.gross - totals.cost - totals.tax) } },
    });
    await tx.auditLog.create({ data: {
      companyId: input.companyId, userId: input.userId, action: input.type, entity: "SALE_REVERSAL",
      entityId: reversal.id, requestId: input.requestId,
      after: json({ saleId: sale.id, cashSessionId: cashSession.id, totals, fiscalStatus: reversal.fiscalStatus, externalPending, items: prepared.map((entry) => ({ saleItemId: entry.item.id, quantity: entry.quantity, condition: entry.condition, restocked: entry.condition === "RESALABLE" })) }),
    } });
    return { reversal: await tx.saleReversal.findUniqueOrThrow({ where: { id: reversal.id }, include: { items: { include: { allocations: true } }, paymentRefunds: true } }), idempotent: false };
  }, { isolationLevel: "Serializable", timeout: 20_000 });
}

export async function reverseSale(input: Parameters<typeof reverseSaleOnce>[0]) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await reverseSaleOnce(input);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (attempt < 3 && (code === "P2002" || code === "P2034")) continue;
      throw error;
    }
  }
  throw new Error("ESTORNO_CONCORRENCIA_NAO_RESOLVIDA");
}
