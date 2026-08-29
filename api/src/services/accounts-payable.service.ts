import { prisma } from "../infra/prisma.js";

const value = (input: unknown) => Number(input ?? 0);
const money = (input: number) => Math.round((input + Number.EPSILON) * 100) / 100;

export async function getAccountsPayableDashboard(input: { companyId: string; supplierId?: string; status?: "DRAFT" | "OPEN" | "PARTIAL" | "PAID" | "CANCELLED" | "DISPUTED" }) {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const inSevenDays = new Date(today); inSevenDays.setUTCDate(inSevenDays.getUTCDate() + 7);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [suppliers, payables, payments] = await Promise.all([
    prisma.supplier.findMany({ where: { companyId: input.companyId }, select: { id: true, tradeName: true, taxId: true }, orderBy: { tradeName: "asc" } }),
    prisma.accountPayable.findMany({
      where: { companyId: input.companyId, ...(input.supplierId ? { supplierId: input.supplierId } : {}), ...(input.status ? { status: input.status } : {}) },
      include: {
        supplier: { select: { id: true, tradeName: true, taxId: true } }, purchaseOrder: { select: { id: true, code: true, store: { select: { name: true } } } },
        approvedBy: { select: { name: true } }, createdBy: { select: { name: true } },
        installments: { include: { payments: { where: { reversedAt: null }, orderBy: { paidAt: "desc" } } }, orderBy: { number: "asc" } },
      },
      orderBy: { createdAt: "desc" }, take: 200,
    }),
    prisma.payablePayment.findMany({
      where: { installment: { payable: { companyId: input.companyId } } },
      include: { recordedBy: { select: { name: true } }, reversedBy: { select: { name: true } }, installment: { include: { payable: { include: { supplier: { select: { tradeName: true } } } } } } },
      orderBy: { paidAt: "desc" }, take: 100,
    }),
  ]);
  const enriched = payables.map((payable) => ({
    ...payable,
    outstandingAmount: money(value(payable.totalAmount) - value(payable.paidAmount)),
    installments: payable.installments.map((installment) => ({
      ...installment,
      outstandingAmount: money(value(installment.amount) - value(installment.paidAmount)),
      effectiveStatus: ["OPEN", "PARTIAL"].includes(installment.status) && installment.dueAt < today ? "OVERDUE" : installment.status,
    })),
  }));
  const activeInstallments = enriched.flatMap((payable) => payable.status === "CANCELLED" || payable.status === "DRAFT" ? [] : payable.installments.filter((installment) => ["OPEN", "PARTIAL"].includes(installment.status)));
  const overdue = activeInstallments.filter((installment) => installment.dueAt < today);
  const dueSoon = activeInstallments.filter((installment) => installment.dueAt >= today && installment.dueAt <= inSevenDays);
  const activePayments = payments.filter((payment) => !payment.reversedAt);
  return {
    indicators: {
      drafts: enriched.filter((entry) => entry.status === "DRAFT").length,
      draftAmount: money(enriched.filter((entry) => entry.status === "DRAFT").reduce((sum, entry) => sum + value(entry.totalAmount), 0)),
      overdueAmount: money(overdue.reduce((sum, entry) => sum + entry.outstandingAmount, 0)),
      overdueCount: overdue.length,
      dueSoonAmount: money(dueSoon.reduce((sum, entry) => sum + entry.outstandingAmount, 0)),
      dueSoonCount: dueSoon.length,
      paidThisMonth: money(activePayments.filter((entry) => entry.paidAt >= monthStart).reduce((sum, entry) => sum + value(entry.amount), 0)),
      openAmount: money(enriched.filter((entry) => ["OPEN", "PARTIAL", "DISPUTED"].includes(entry.status)).reduce((sum, entry) => sum + entry.outstandingAmount, 0)),
    },
    suppliers,
    payables: enriched,
    payments,
  };
}

export async function configureAccountPayable(input: { companyId: string; payableId: string; installments: Array<{ dueAt: Date; amount: number; barcode?: string | null; externalRef?: string | null }>; notes?: string | null; userId: string; requestId?: string }) {
  const payable = await prisma.accountPayable.findFirst({ where: { id: input.payableId, companyId: input.companyId }, include: { installments: true } });
  if (!payable) throw new Error("TITULO_A_PAGAR_NAO_ENCONTRADO");
  if (payable.status !== "DRAFT" || payable.installments.length) throw new Error("TITULO_A_PAGAR_JA_CONFIGURADO");
  const installmentTotal = money(input.installments.reduce((sum, entry) => sum + entry.amount, 0));
  if (Math.abs(installmentTotal - value(payable.totalAmount)) > 0.009) throw new Error("SOMA_DAS_PARCELAS_DIFERE_DO_TITULO");
  return prisma.$transaction(async (tx) => {
    await tx.payableInstallment.createMany({ data: input.installments.map((entry, index) => ({ payableId: payable.id, number: index + 1, dueAt: entry.dueAt, amount: entry.amount, barcode: entry.barcode ?? null, externalRef: entry.externalRef ?? null })) });
    const saved = await tx.accountPayable.update({ where: { id: payable.id }, data: { status: "OPEN", approvedById: input.userId, configuredAt: new Date(), notes: input.notes ?? payable.notes }, include: { installments: { orderBy: { number: "asc" } } } });
    await tx.auditLog.create({ data: { companyId: input.companyId, userId: input.userId, action: "ACCOUNT_PAYABLE_CONFIGURED", entity: "AccountPayable", entityId: payable.id, requestId: input.requestId, before: { status: payable.status }, after: { status: saved.status, installmentCount: input.installments.length, totalAmount: installmentTotal } } });
    return saved;
  });
}

export async function recordPayablePayment(input: { companyId: string; installmentId: string; amount: number; method: "CASH" | "PIX" | "BANK_TRANSFER" | "BOLETO" | "CARD" | "OTHER"; paidAt: Date; reference?: string | null; notes?: string | null; userId: string; requestId?: string }) {
  return prisma.$transaction(async (tx) => {
    const installment = await tx.payableInstallment.findFirst({ where: { id: input.installmentId, payable: { companyId: input.companyId } }, include: { payable: true } });
    if (!installment) throw new Error("PARCELA_A_PAGAR_NAO_ENCONTRADA");
    if (!["OPEN", "PARTIAL"].includes(installment.status) || !["OPEN", "PARTIAL"].includes(installment.payable.status)) throw new Error("PARCELA_A_PAGAR_NAO_ACEITA_BAIXA");
    const outstanding = money(value(installment.amount) - value(installment.paidAmount));
    if (input.amount > outstanding + 0.009) throw new Error("PAGAMENTO_MAIOR_QUE_SALDO_DA_PARCELA");
    const payment = await tx.payablePayment.create({ data: { installmentId: installment.id, recordedById: input.userId, amount: input.amount, method: input.method, paidAt: input.paidAt, reference: input.reference ?? null, notes: input.notes ?? null } });
    const installmentPaid = money(value(installment.paidAmount) + input.amount);
    await tx.payableInstallment.update({ where: { id: installment.id }, data: { paidAmount: installmentPaid, status: installmentPaid >= value(installment.amount) - 0.009 ? "PAID" : "PARTIAL" } });
    const active = await tx.payablePayment.aggregate({ where: { reversedAt: null, installment: { payableId: installment.payableId } }, _sum: { amount: true } });
    const paidAmount = money(value(active._sum.amount));
    const payableStatus = paidAmount >= value(installment.payable.totalAmount) - 0.009 ? "PAID" : paidAmount > 0 ? "PARTIAL" : "OPEN";
    await tx.accountPayable.update({ where: { id: installment.payableId }, data: { paidAmount, status: payableStatus } });
    await tx.auditLog.create({ data: { companyId: input.companyId, userId: input.userId, action: "PAYABLE_PAYMENT_RECORDED", entity: "PayablePayment", entityId: payment.id, requestId: input.requestId, after: { payableId: installment.payableId, installmentId: installment.id, amount: input.amount, method: input.method, paidAt: input.paidAt, payableStatus } } });
    return payment;
  }, { isolationLevel: "Serializable", timeout: 15_000 });
}

export async function reversePayablePayment(input: { companyId: string; paymentId: string; reason: string; userId: string; requestId?: string }) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payablePayment.findFirst({ where: { id: input.paymentId, installment: { payable: { companyId: input.companyId } } }, include: { installment: { include: { payable: true } } } });
    if (!payment) throw new Error("PAGAMENTO_DO_TITULO_NAO_ENCONTRADO");
    if (payment.reversedAt) throw new Error("PAGAMENTO_DO_TITULO_JA_ESTORNADO");
    if (payment.recordedById === input.userId) throw new Error("ESTORNO_PAGAMENTO_EXIGE_SEGUNDO_USUARIO");
    await tx.payablePayment.update({ where: { id: payment.id }, data: { reversedAt: new Date(), reversedById: input.userId, reversalReason: input.reason } });
    const installmentPaid = money(Math.max(0, value(payment.installment.paidAmount) - value(payment.amount)));
    await tx.payableInstallment.update({ where: { id: payment.installmentId }, data: { paidAmount: installmentPaid, status: installmentPaid <= 0.009 ? "OPEN" : installmentPaid >= value(payment.installment.amount) - 0.009 ? "PAID" : "PARTIAL" } });
    const active = await tx.payablePayment.aggregate({ where: { reversedAt: null, installment: { payableId: payment.installment.payableId } }, _sum: { amount: true } });
    const paidAmount = money(value(active._sum.amount));
    const payableStatus = paidAmount >= value(payment.installment.payable.totalAmount) - 0.009 ? "PAID" : paidAmount > 0 ? "PARTIAL" : "OPEN";
    await tx.accountPayable.update({ where: { id: payment.installment.payableId }, data: { paidAmount, status: payableStatus } });
    await tx.auditLog.create({ data: { companyId: input.companyId, userId: input.userId, action: "PAYABLE_PAYMENT_REVERSED", entity: "PayablePayment", entityId: payment.id, requestId: input.requestId, before: { amount: payment.amount, payableStatus: payment.installment.payable.status }, after: { reason: input.reason, payableStatus } } });
    return { id: payment.id, reversed: true, payableStatus };
  }, { isolationLevel: "Serializable", timeout: 15_000 });
}

export async function cancelAccountPayable(input: { companyId: string; payableId: string; reason: string; userId: string; requestId?: string }) {
  const payable = await prisma.accountPayable.findFirst({ where: { id: input.payableId, companyId: input.companyId }, include: { installments: true } });
  if (!payable) throw new Error("TITULO_A_PAGAR_NAO_ENCONTRADO");
  if (!["DRAFT", "OPEN", "DISPUTED"].includes(payable.status)) throw new Error("TITULO_A_PAGAR_NAO_PODE_SER_CANCELADO");
  if (value(payable.paidAmount) > 0) throw new Error("TITULO_COM_PAGAMENTO_NAO_PODE_SER_CANCELADO");
  return prisma.$transaction(async (tx) => {
    if (payable.installments.length) await tx.payableInstallment.updateMany({ where: { payableId: payable.id }, data: { status: "CANCELLED" } });
    const saved = await tx.accountPayable.update({ where: { id: payable.id }, data: { status: "CANCELLED", cancelledAt: new Date(), notes: [payable.notes, `Cancelamento: ${input.reason}`].filter(Boolean).join("\n") } });
    await tx.auditLog.create({ data: { companyId: input.companyId, userId: input.userId, action: "ACCOUNT_PAYABLE_CANCELLED", entity: "AccountPayable", entityId: payable.id, requestId: input.requestId, before: { status: payable.status }, after: { status: saved.status, reason: input.reason } } });
    return saved;
  });
}
