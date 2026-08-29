import { createHash } from "node:crypto";
import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../infra/prisma.js";

export const cashPaymentMethods = ["CASH", "PIX", "CREDIT_CARD", "DEBIT_CARD", "VOUCHER", "OTHER"] as const;
export type CashPaymentMethod = typeof cashPaymentMethods[number];
export type AmountsByMethod = Record<CashPaymentMethod, number>;

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const zeroAmounts = (): AmountsByMethod => ({ CASH: 0, PIX: 0, CREDIT_CARD: 0, DEBIT_CARD: 0, VOUCHER: 0, OTHER: 0 });

export function calculateCashExpected(input: {
  openingAmount: number;
  movements: Array<{ type: "SUPPLY" | "WITHDRAWAL"; amount: number }>;
  payments: Array<{ method: CashPaymentMethod; status: "RECORDED" | "CONFIRMED" | "CANCELLED" | "REFUNDED"; amount: number }>;
  refunds?: Array<{ method: CashPaymentMethod; status: "RECORDED" | "BLOCKED" | "CONFIRMED" | "FAILED"; amount: number }>;
}) {
  const amounts = zeroAmounts();
  amounts.CASH = money(input.openingAmount);
  for (const movement of input.movements) {
    amounts.CASH = money(amounts.CASH + (movement.type === "SUPPLY" ? movement.amount : -movement.amount));
  }
  for (const payment of input.payments) {
    if (payment.status === "CANCELLED") continue;
    amounts[payment.method] = money(amounts[payment.method] + payment.amount);
  }
  for (const refund of input.refunds ?? []) {
    if (refund.status !== "RECORDED" && refund.status !== "CONFIRMED") continue;
    amounts[refund.method] = money(amounts[refund.method] - refund.amount);
  }
  return amounts;
}

export function reconcileCashAmounts(expected: AmountsByMethod, declared: AmountsByMethod) {
  const differences = zeroAmounts();
  for (const method of cashPaymentMethods) differences[method] = money(declared[method] - expected[method]);
  const expectedTotal = money(cashPaymentMethods.reduce((sum, method) => sum + expected[method], 0));
  const declaredTotal = money(cashPaymentMethods.reduce((sum, method) => sum + declared[method], 0));
  const differenceTotal = money(declaredTotal - expectedTotal);
  return { differences, expectedTotal, declaredTotal, differenceTotal, matched: cashPaymentMethods.every((method) => Math.abs(differences[method]) < 0.01) };
}

function summaryFromSession(session: {
  openingAmount: unknown;
  movements: Array<{ type: "SUPPLY" | "WITHDRAWAL"; amount: unknown }>;
  payments: Array<{ method: CashPaymentMethod; status: "RECORDED" | "CONFIRMED" | "CANCELLED" | "REFUNDED"; amount: unknown }>;
  paymentRefunds?: Array<{ status: "RECORDED" | "BLOCKED" | "CONFIRMED" | "FAILED"; amount: unknown; salePayment: { method: CashPaymentMethod } }>;
  sales: Array<{ grossAmount: unknown }>;
}) {
  const expected = calculateCashExpected({
    openingAmount: Number(session.openingAmount),
    movements: session.movements.map((entry) => ({ type: entry.type, amount: Number(entry.amount) })),
    payments: session.payments.map((entry) => ({ method: entry.method, status: entry.status, amount: Number(entry.amount) })),
    refunds: (session.paymentRefunds ?? []).map((entry) => ({ method: entry.salePayment.method, status: entry.status, amount: Number(entry.amount) })),
  });
  return {
    expected,
    salesTotal: money(session.sales.reduce((sum, sale) => sum + Number(sale.grossAmount), 0)),
    salesCount: session.sales.length,
    externalUnconfirmed: session.payments.filter((payment) => payment.method !== "CASH" && payment.status === "RECORDED").length
      + (session.paymentRefunds ?? []).filter((refund) => refund.salePayment.method !== "CASH" && refund.status === "BLOCKED").length,
  };
}

const sessionInclude = {
  store: { select: { id: true, code: true, name: true } },
  pointOfSale: { select: { id: true, code: true, name: true } },
  openedBy: { select: { id: true, name: true } },
  closedBy: { select: { id: true, name: true } },
  movements: { orderBy: { occurredAt: "desc" as const }, include: { createdBy: { select: { name: true } } } },
  payments: { orderBy: { paidAt: "desc" as const }, include: { sale: { select: { id: true, soldAt: true, grossAmount: true } } } },
  paymentRefunds: { orderBy: { createdAt: "desc" as const }, include: { salePayment: { select: { method: true } }, reversal: { select: { id: true, type: true, status: true } } } },
  sales: { orderBy: { soldAt: "desc" as const }, select: { id: true, soldAt: true, grossAmount: true, taxAmount: true, status: true, _count: { select: { items: true } }, nfceDocuments: { select: { id: true, status: true, number: true, series: true } } } },
  reconciliation: true,
} satisfies Prisma.CashSessionInclude;

export async function openCashSession(input: { companyId: string; pointOfSaleId: string; openingAmount: number; userId: string; requestId: string }) {
  const pointOfSale = await prisma.pointOfSale.findFirst({
    where: { id: input.pointOfSaleId, active: true, store: { companyId: input.companyId, active: true } }, include: { store: true },
  });
  if (!pointOfSale) throw new Error("PDV_ATIVO_NAO_ENCONTRADO");
  const existing = await prisma.cashSession.findFirst({ where: { pointOfSaleId: pointOfSale.id, status: "OPEN" }, include: sessionInclude });
  if (existing) return { session: existing, summary: summaryFromSession(existing), idempotent: true };
  try {
    const session = await prisma.$transaction(async (tx) => {
      const created = await tx.cashSession.create({ data: {
        companyId: input.companyId, storeId: pointOfSale.storeId, pointOfSaleId: pointOfSale.id,
        openedById: input.userId, openingAmount: money(input.openingAmount),
      } });
      await tx.auditLog.create({ data: {
        companyId: input.companyId, userId: input.userId, action: "OPEN", entity: "CASH_SESSION",
        entityId: created.id, requestId: input.requestId,
        after: { pointOfSaleId: pointOfSale.id, storeId: pointOfSale.storeId, openingAmount: money(input.openingAmount) },
      } });
      return tx.cashSession.findUniqueOrThrow({ where: { id: created.id }, include: sessionInclude });
    }, { isolationLevel: "Serializable" });
    return { session, summary: summaryFromSession(session), idempotent: false };
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") throw new Error("PDV_JA_POSSUI_CAIXA_ABERTO");
    throw error;
  }
}

export async function getCashSession(companyId: string, sessionId: string) {
  const session = await prisma.cashSession.findFirst({ where: { id: sessionId, companyId }, include: sessionInclude });
  if (!session) throw new Error("SESSAO_CAIXA_NAO_ENCONTRADA");
  return { session, summary: summaryFromSession(session) };
}

export async function addCashMovement(input: {
  companyId: string; sessionId: string; userId: string; requestId: string;
  type: "SUPPLY" | "WITHDRAWAL"; amount: number; reason: string; idempotencyKey: string;
}) {
  return prisma.$transaction(async (tx) => {
    const session = await tx.cashSession.findFirst({ where: { id: input.sessionId, companyId: input.companyId, status: "OPEN" }, include: { movements: true, payments: true, paymentRefunds: { include: { salePayment: { select: { method: true } } } }, sales: true } });
    if (!session) throw new Error("SESSAO_CAIXA_NAO_ENCONTRADA_OU_FECHADA");
    const existing = await tx.cashMovement.findUnique({ where: { cashSessionId_idempotencyKey: { cashSessionId: session.id, idempotencyKey: input.idempotencyKey } } });
    if (existing) return { movement: existing, idempotent: true };
    if (input.type === "WITHDRAWAL") {
      const available = summaryFromSession({ ...session, movements: session.movements as Array<{ type: "SUPPLY" | "WITHDRAWAL"; amount: unknown }>, payments: session.payments as Array<{ method: CashPaymentMethod; status: "RECORDED" | "CONFIRMED" | "CANCELLED" | "REFUNDED"; amount: unknown }> }).expected.CASH;
      if (input.amount > available) throw new Error(`SANGRIA_SUPERIOR_AO_DINHEIRO_ESPERADO:${available.toFixed(2)}`);
    }
    const movement = await tx.cashMovement.create({ data: {
      cashSessionId: session.id, createdById: input.userId, type: input.type,
      amount: money(input.amount), reason: input.reason, idempotencyKey: input.idempotencyKey,
    } });
    await tx.auditLog.create({ data: {
      companyId: input.companyId, userId: input.userId, action: input.type, entity: "CASH_MOVEMENT",
      entityId: movement.id, requestId: input.requestId, after: { sessionId: session.id, amount: money(input.amount), reason: input.reason },
    } });
    return { movement, idempotent: false };
  }, { isolationLevel: "Serializable" });
}

export async function closeCashSession(input: {
  companyId: string; sessionId: string; userId: string; requestId: string;
  declared: AmountsByMethod; note?: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const session = await tx.cashSession.findFirst({ where: { id: input.sessionId, companyId: input.companyId, status: "OPEN" }, include: { movements: true, payments: true, paymentRefunds: { include: { salePayment: { select: { method: true } } } }, sales: true } });
    if (!session) throw new Error("SESSAO_CAIXA_NAO_ENCONTRADA_OU_FECHADA");
    const pendingOffline = await tx.offlinePosCommand.count({ where: { cashSessionId: session.id, status: { in: ["RECEIVED", "PROCESSING"] } } });
    if (pendingOffline > 0) throw new Error(`CAIXA_POSSUI_COMANDOS_OFFLINE_PENDENTES:${pendingOffline}`);
    const expected = summaryFromSession({ ...session, movements: session.movements as Array<{ type: "SUPPLY" | "WITHDRAWAL"; amount: unknown }>, payments: session.payments as Array<{ method: CashPaymentMethod; status: "RECORDED" | "CONFIRMED" | "CANCELLED" | "REFUNDED"; amount: unknown }> }).expected;
    const reconciliation = reconcileCashAmounts(expected, input.declared);
    if (!reconciliation.matched && (input.note?.trim().length ?? 0) < 10) throw new Error("DIVERGENCIA_CAIXA_EXIGE_JUSTIFICATIVA");
    const snapshot = {
      sessionId: session.id, pointOfSaleId: session.pointOfSaleId, openedAt: session.openedAt.toISOString(),
      expected, declared: input.declared, differences: reconciliation.differences,
      expectedTotal: reconciliation.expectedTotal, declaredTotal: reconciliation.declaredTotal,
      differenceTotal: reconciliation.differenceTotal, sales: session.sales.length,
      payments: session.payments.length, movements: session.movements.length,
    };
    const snapshotHash = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
    const saved = await tx.cashReconciliation.create({ data: {
      cashSessionId: session.id, status: reconciliation.matched ? "MATCHED" : "DIVERGENT",
      expectedAmounts: json(expected), declaredAmounts: json(input.declared), differences: json(reconciliation.differences),
      expectedTotal: reconciliation.expectedTotal, declaredTotal: reconciliation.declaredTotal,
      differenceTotal: reconciliation.differenceTotal, snapshotHash,
    } });
    const closed = await tx.cashSession.updateMany({
      where: { id: session.id, status: "OPEN" },
      data: { status: "CLOSED", closedById: input.userId, closedAt: new Date(), closingNote: input.note?.trim() || null },
    });
    if (closed.count !== 1) throw new Error("SESSAO_CAIXA_JA_FECHADA");
    await tx.auditLog.create({ data: {
      companyId: input.companyId, userId: input.userId, action: "CLOSE", entity: "CASH_SESSION",
      entityId: session.id, requestId: input.requestId,
      after: json({ reconciliationId: saved.id, status: saved.status, snapshotHash, differenceTotal: reconciliation.differenceTotal }),
    } });
    return { reconciliation: saved, snapshot };
  }, { isolationLevel: "Serializable" });
}

export async function reviewCashReconciliation(input: { companyId: string; reconciliationId: string; userId: string; requestId: string; note: string }) {
  return prisma.$transaction(async (tx) => {
    const reconciliation = await tx.cashReconciliation.findFirst({ where: { id: input.reconciliationId, status: "DIVERGENT", cashSession: { companyId: input.companyId } } });
    if (!reconciliation) throw new Error("CONCILIACAO_DIVERGENTE_NAO_ENCONTRADA");
    const reviewed = await tx.cashReconciliation.update({ where: { id: reconciliation.id }, data: { status: "REVIEWED", reviewedById: input.userId, reviewedAt: new Date(), reviewNote: input.note } });
    await tx.auditLog.create({ data: {
      companyId: input.companyId, userId: input.userId, action: "REVIEW", entity: "CASH_RECONCILIATION",
      entityId: reviewed.id, requestId: input.requestId, before: { status: "DIVERGENT" }, after: { status: "REVIEWED", note: input.note },
    } });
    return reviewed;
  });
}
