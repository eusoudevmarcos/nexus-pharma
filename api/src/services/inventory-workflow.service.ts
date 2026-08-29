import { randomUUID } from "node:crypto";
import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../infra/prisma.js";

const q = (value: number) => Math.round((value + Number.EPSILON) * 1000) / 1000;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
type Tx = Prisma.TransactionClient;

export function availableQuantity(onHand: number, reserved: number) {
  return q(Math.max(0, onHand - reserved));
}

export function inventoryDifference(expected: number, counted: number) {
  return q(counted - expected);
}

export function movementTypeForAdjustment(reason: "LOSS" | "DAMAGE" | "EXPIRED" | "CORRECTION") {
  return reason === "CORRECTION" ? "ADJUSTMENT" as const : "LOSS" as const;
}

function code(prefix: string) {
  const day = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `${prefix}-${day}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

async function activeStore(tx: Tx, companyId: string, storeId: string) {
  const store = await tx.store.findFirst({ where: { id: storeId, companyId, active: true } });
  if (!store) throw new Error("LOJA_ATIVA_NAO_ENCONTRADA");
  return store;
}

async function lotInCompany(tx: Tx, companyId: string, lotId: string) {
  const lot = await tx.inventoryLot.findFirst({
    where: { id: lotId, product: { companyId } },
    include: { product: true, taxProvenances: { where: { status: "APPROVED" }, orderBy: { createdAt: "asc" } }, },
  });
  if (!lot) throw new Error("LOTE_NAO_ENCONTRADO");
  return lot;
}

async function changeLocationBalance(tx: Tx, input: {
  companyId: string; storeId: string; productId: string; lotId: string; delta: number; respectReservations?: boolean;
}) {
  const delta = q(input.delta);
  const current = await tx.storeStockBalance.findUnique({ where: { storeId_lotId: { storeId: input.storeId, lotId: input.lotId } } });
  if (!current) {
    if (delta < 0) throw new Error("SALDO_DA_LOJA_INSUFICIENTE");
    return tx.storeStockBalance.create({ data: { companyId: input.companyId, storeId: input.storeId, productId: input.productId, lotId: input.lotId, onHand: delta } });
  }
  const onHand = Number(current.onHand);
  const reserved = Number(current.reserved);
  if (delta < 0 && (input.respectReservations !== false ? availableQuantity(onHand, reserved) : onHand) < Math.abs(delta)) {
    throw new Error("SALDO_DISPONIVEL_DA_LOJA_INSUFICIENTE");
  }
  const changed = await tx.storeStockBalance.updateMany({
    where: { id: current.id, onHand: current.onHand, reserved: current.reserved },
    data: { onHand: { increment: delta } },
  });
  if (changed.count !== 1) throw new Error("ESTOQUE_ALTERADO_POR_OUTRA_OPERACAO");
  return tx.storeStockBalance.findUniqueOrThrow({ where: { id: current.id } });
}

export async function incrementStoreBalance(tx: Tx, input: { companyId: string; storeId: string; productId: string; lotId: string; quantity: number }) {
  return changeLocationBalance(tx, { ...input, delta: q(input.quantity), respectReservations: false });
}

export async function decrementStoreBalance(tx: Tx, input: { companyId: string; storeId: string; productId: string; lotId: string; quantity: number }) {
  return changeLocationBalance(tx, { ...input, delta: -q(input.quantity), respectReservations: true });
}

export async function releaseExpiredReservations(companyId: string) {
  const now = new Date();
  const expired = await prisma.stockReservation.findMany({ where: { companyId, status: "ACTIVE", expiresAt: { lte: now } } });
  if (!expired.length) return 0;
  return prisma.$transaction(async (tx) => {
    let released = 0;
    for (const reservation of expired) {
      const changed = await tx.stockReservation.updateMany({ where: { id: reservation.id, status: "ACTIVE" }, data: { status: "EXPIRED", finalizedAt: now } });
      if (!changed.count) continue;
      await tx.storeStockBalance.update({ where: { storeId_lotId: { storeId: reservation.storeId, lotId: reservation.lotId } }, data: { reserved: { decrement: reservation.quantity } } });
      released += 1;
    }
    return released;
  });
}

export async function createStockReservation(input: {
  companyId: string; storeId: string; lotId: string; quantity: number; expiresAt: Date; reference?: string | null; notes?: string | null; userId: string; requestId: string;
}) {
  if (input.expiresAt <= new Date()) throw new Error("RESERVA_EXIGE_EXPIRACAO_FUTURA");
  return prisma.$transaction(async (tx) => {
    await activeStore(tx, input.companyId, input.storeId);
    const lot = await lotInCompany(tx, input.companyId, input.lotId);
    if (lot.expiresAt <= new Date()) throw new Error("LOTE_VENCIDO_NAO_PODE_SER_RESERVADO");
    const balance = await tx.storeStockBalance.findUnique({ where: { storeId_lotId: { storeId: input.storeId, lotId: input.lotId } } });
    if (!balance || availableQuantity(Number(balance.onHand), Number(balance.reserved)) < input.quantity) throw new Error("SALDO_DISPONIVEL_DA_LOJA_INSUFICIENTE");
    const changed = await tx.storeStockBalance.updateMany({ where: { id: balance.id, onHand: balance.onHand, reserved: balance.reserved }, data: { reserved: { increment: q(input.quantity) } } });
    if (changed.count !== 1) throw new Error("ESTOQUE_ALTERADO_POR_OUTRA_OPERACAO");
    const reservation = await tx.stockReservation.create({ data: {
      companyId: input.companyId, storeId: input.storeId, productId: lot.productId, lotId: lot.id, createdById: input.userId,
      quantity: q(input.quantity), expiresAt: input.expiresAt, reference: input.reference, notes: input.notes,
    } });
    await tx.auditLog.create({ data: { companyId: input.companyId, userId: input.userId, action: "STOCK_RESERVATION_CREATED", entity: "StockReservation", entityId: reservation.id, requestId: input.requestId, after: json({ storeId: input.storeId, lotId: lot.id, quantity: input.quantity, expiresAt: input.expiresAt }) } });
    return reservation;
  });
}

export async function finalizeStockReservation(input: { companyId: string; reservationId: string; status: "FULFILLED" | "RELEASED"; userId: string; requestId: string }) {
  return prisma.$transaction(async (tx) => {
    const reservation = await tx.stockReservation.findFirst({ where: { id: input.reservationId, companyId: input.companyId } });
    if (!reservation) throw new Error("RESERVA_NAO_ENCONTRADA");
    if (reservation.status !== "ACTIVE") throw new Error("RESERVA_NAO_ESTA_ATIVA");
    const claimed = await tx.stockReservation.updateMany({ where: { id: reservation.id, status: "ACTIVE" }, data: { status: input.status, finalizedAt: new Date() } });
    if (claimed.count !== 1) throw new Error("RESERVA_NAO_ESTA_ATIVA");
    await tx.storeStockBalance.update({ where: { storeId_lotId: { storeId: reservation.storeId, lotId: reservation.lotId } }, data: { reserved: { decrement: reservation.quantity } } });
    const saved = await tx.stockReservation.findUniqueOrThrow({ where: { id: reservation.id } });
    await tx.auditLog.create({ data: { companyId: input.companyId, userId: input.userId, action: `STOCK_RESERVATION_${input.status}`, entity: "StockReservation", entityId: saved.id, requestId: input.requestId, before: json({ status: reservation.status }), after: json({ status: saved.status }) } });
    return saved;
  });
}

export async function createStockTransfer(input: {
  companyId: string; originStoreId: string; destinationStoreId: string; items: Array<{ lotId: string; quantity: number }>; notes?: string | null; userId: string; requestId: string;
}) {
  if (input.originStoreId === input.destinationStoreId) throw new Error("TRANSFERENCIA_EXIGE_LOJAS_DIFERENTES");
  return prisma.$transaction(async (tx) => {
    await Promise.all([activeStore(tx, input.companyId, input.originStoreId), activeStore(tx, input.companyId, input.destinationStoreId)]);
    const prepared = [];
    const seen = new Set<string>();
    for (const item of input.items) {
      if (seen.has(item.lotId)) throw new Error("LOTE_DUPLICADO_NA_TRANSFERENCIA");
      seen.add(item.lotId);
      const lot = await lotInCompany(tx, input.companyId, item.lotId);
      const balance = await tx.storeStockBalance.findUnique({ where: { storeId_lotId: { storeId: input.originStoreId, lotId: item.lotId } } });
      if (!balance || availableQuantity(Number(balance.onHand), Number(balance.reserved)) < item.quantity) throw new Error("SALDO_DISPONIVEL_DA_LOJA_INSUFICIENTE");
      prepared.push({ lot, quantity: q(item.quantity) });
    }
    const transfer = await tx.stockTransfer.create({ data: {
      companyId: input.companyId, originStoreId: input.originStoreId, destinationStoreId: input.destinationStoreId,
      createdById: input.userId, code: code("TRF"), notes: input.notes,
      items: { create: prepared.map(({ lot, quantity }) => ({ productId: lot.productId, lotId: lot.id, quantity, provenanceSnapshot: json(lot.taxProvenances.map((entry) => ({ id: entry.id, sourceAccessKey: entry.sourceAccessKey, sourceItemNumber: entry.sourceItemNumber, ruleVersion: entry.ruleVersion, evidence: entry.evidence }))) })) },
    }, include: { items: true } });
    await tx.auditLog.create({ data: { companyId: input.companyId, userId: input.userId, action: "STOCK_TRANSFER_CREATED", entity: "StockTransfer", entityId: transfer.id, requestId: input.requestId, after: json({ code: transfer.code, originStoreId: input.originStoreId, destinationStoreId: input.destinationStoreId, items: input.items }) } });
    return transfer;
  });
}

export async function dispatchStockTransfer(input: { companyId: string; transferId: string; userId: string; requestId: string }) {
  return prisma.$transaction(async (tx) => {
    const transfer = await tx.stockTransfer.findFirst({ where: { id: input.transferId, companyId: input.companyId }, include: { items: { include: { lot: true } } } });
    if (!transfer) throw new Error("TRANSFERENCIA_NAO_ENCONTRADA");
    if (transfer.status !== "DRAFT") throw new Error("TRANSFERENCIA_NAO_ESTA_EM_RASCUNHO");
    const claimed = await tx.stockTransfer.updateMany({ where: { id: transfer.id, status: "DRAFT" }, data: { status: "IN_TRANSIT", dispatchedById: input.userId, dispatchedAt: new Date() } });
    if (claimed.count !== 1) throw new Error("TRANSFERENCIA_NAO_ESTA_EM_RASCUNHO");
    for (const item of transfer.items) {
      await changeLocationBalance(tx, { companyId: input.companyId, storeId: transfer.originStoreId, productId: item.productId, lotId: item.lotId, delta: -Number(item.quantity) });
      await tx.stockMovement.create({ data: { companyId: input.companyId, storeId: transfer.originStoreId, productId: item.productId, lotId: item.lotId, type: "TRANSFER", quantity: -Number(item.quantity), unitCost: item.lot.unitCost, originType: "TRANSFER_DISPATCH", originId: transfer.id } });
    }
    const saved = await tx.stockTransfer.findUniqueOrThrow({ where: { id: transfer.id }, include: { items: true } });
    await tx.auditLog.create({ data: { companyId: input.companyId, userId: input.userId, action: "STOCK_TRANSFER_DISPATCHED", entity: "StockTransfer", entityId: saved.id, requestId: input.requestId, before: json({ status: transfer.status }), after: json({ status: saved.status }) } });
    return saved;
  });
}

export async function receiveStockTransfer(input: { companyId: string; transferId: string; userId: string; requestId: string }) {
  return prisma.$transaction(async (tx) => {
    const transfer = await tx.stockTransfer.findFirst({ where: { id: input.transferId, companyId: input.companyId }, include: { items: { include: { lot: true } } } });
    if (!transfer) throw new Error("TRANSFERENCIA_NAO_ENCONTRADA");
    if (transfer.status !== "IN_TRANSIT") throw new Error("TRANSFERENCIA_NAO_ESTA_EM_TRANSITO");
    if (transfer.dispatchedById === input.userId) throw new Error("RECEBIMENTO_EXIGE_SEGUNDO_USUARIO");
    const claimed = await tx.stockTransfer.updateMany({ where: { id: transfer.id, status: "IN_TRANSIT" }, data: { status: "RECEIVED", receivedById: input.userId, receivedAt: new Date() } });
    if (claimed.count !== 1) throw new Error("TRANSFERENCIA_NAO_ESTA_EM_TRANSITO");
    for (const item of transfer.items) {
      await changeLocationBalance(tx, { companyId: input.companyId, storeId: transfer.destinationStoreId, productId: item.productId, lotId: item.lotId, delta: Number(item.quantity), respectReservations: false });
      await tx.stockMovement.create({ data: { companyId: input.companyId, storeId: transfer.destinationStoreId, productId: item.productId, lotId: item.lotId, type: "TRANSFER", quantity: Number(item.quantity), unitCost: item.lot.unitCost, originType: "TRANSFER_RECEIPT", originId: transfer.id } });
    }
    const saved = await tx.stockTransfer.findUniqueOrThrow({ where: { id: transfer.id }, include: { items: true } });
    await tx.auditLog.create({ data: { companyId: input.companyId, userId: input.userId, action: "STOCK_TRANSFER_RECEIVED", entity: "StockTransfer", entityId: saved.id, requestId: input.requestId, before: json({ status: transfer.status }), after: json({ status: saved.status }) } });
    return saved;
  });
}

export async function createInventoryCount(input: { companyId: string; storeId: string; notes?: string | null; userId: string; requestId: string }) {
  return prisma.$transaction(async (tx) => {
    await activeStore(tx, input.companyId, input.storeId);
    const balances = await tx.storeStockBalance.findMany({ where: { companyId: input.companyId, storeId: input.storeId, onHand: { gt: 0 } } });
    if (!balances.length) throw new Error("LOJA_SEM_SALDO_PARA_INVENTARIO");
    const count = await tx.inventoryCount.create({ data: {
      companyId: input.companyId, storeId: input.storeId, createdById: input.userId, code: code("INV"), notes: input.notes,
      items: { create: balances.map((balance) => ({ productId: balance.productId, lotId: balance.lotId, expectedQuantity: balance.onHand })) },
    }, include: { items: true } });
    await tx.auditLog.create({ data: { companyId: input.companyId, userId: input.userId, action: "INVENTORY_COUNT_CREATED", entity: "InventoryCount", entityId: count.id, requestId: input.requestId, after: json({ code: count.code, storeId: count.storeId, items: count.items.length }) } });
    return count;
  });
}

export async function updateInventoryCountItem(input: { companyId: string; countId: string; itemId: string; countedQuantity: number; notes?: string | null }) {
  const count = await prisma.inventoryCount.findFirst({ where: { id: input.countId, companyId: input.companyId, status: "OPEN" } });
  if (!count) throw new Error("INVENTARIO_NAO_ESTA_ABERTO");
  const item = await prisma.inventoryCountItem.findFirst({ where: { id: input.itemId, inventoryCountId: count.id } });
  if (!item) throw new Error("ITEM_DE_INVENTARIO_NAO_ENCONTRADO");
  return prisma.inventoryCountItem.update({ where: { id: item.id }, data: { countedQuantity: q(input.countedQuantity), differenceQuantity: inventoryDifference(Number(item.expectedQuantity), input.countedQuantity), notes: input.notes } });
}

export async function submitInventoryCount(input: { companyId: string; countId: string; userId: string; requestId: string }) {
  return prisma.$transaction(async (tx) => {
    const count = await tx.inventoryCount.findFirst({ where: { id: input.countId, companyId: input.companyId }, include: { items: true } });
    if (!count) throw new Error("INVENTARIO_NAO_ENCONTRADO");
    if (count.status !== "OPEN") throw new Error("INVENTARIO_NAO_ESTA_ABERTO");
    if (count.items.some((item) => item.countedQuantity === null)) throw new Error("INVENTARIO_POSSUI_ITENS_NAO_CONTADOS");
    const claimed = await tx.inventoryCount.updateMany({ where: { id: count.id, status: "OPEN" }, data: { status: "PENDING_APPROVAL", submittedById: input.userId, submittedAt: new Date() } });
    if (claimed.count !== 1) throw new Error("INVENTARIO_NAO_ESTA_ABERTO");
    const saved = await tx.inventoryCount.findUniqueOrThrow({ where: { id: count.id }, include: { items: true } });
    await tx.auditLog.create({ data: { companyId: input.companyId, userId: input.userId, action: "INVENTORY_COUNT_SUBMITTED", entity: "InventoryCount", entityId: saved.id, requestId: input.requestId, after: json({ differences: saved.items.filter((item) => Number(item.differenceQuantity) !== 0).length }) } });
    return saved;
  });
}

async function applyPhysicalDelta(tx: Tx, input: { companyId: string; storeId: string; productId: string; lotId: string; delta: number; originType: string; originId: string; reason: "LOSS" | "DAMAGE" | "EXPIRED" | "CORRECTION" }) {
  if (!input.delta) return;
  const lot = await lotInCompany(tx, input.companyId, input.lotId);
  await changeLocationBalance(tx, { companyId: input.companyId, storeId: input.storeId, productId: input.productId, lotId: input.lotId, delta: input.delta });
  const lotChanged = await tx.inventoryLot.updateMany({ where: { id: input.lotId, ...(input.delta < 0 ? { quantity: { gte: Math.abs(input.delta) } } : {}) }, data: { quantity: { increment: input.delta } } });
  const productChanged = await tx.product.updateMany({ where: { id: input.productId, companyId: input.companyId, ...(input.delta < 0 ? { stockQuantity: { gte: Math.abs(input.delta) } } : {}) }, data: { stockQuantity: { increment: input.delta } } });
  if (lotChanged.count !== 1 || productChanged.count !== 1) throw new Error("SALDO_CONSOLIDADO_INSUFICIENTE");
  await tx.stockMovement.create({ data: { companyId: input.companyId, storeId: input.storeId, productId: input.productId, lotId: input.lotId, type: movementTypeForAdjustment(input.reason), quantity: input.delta, unitCost: lot.unitCost, originType: input.originType, originId: input.originId, notes: input.reason } });
}

export async function decideInventoryCount(input: { companyId: string; countId: string; decision: "APPROVED" | "REJECTED"; userId: string; requestId: string }) {
  return prisma.$transaction(async (tx) => {
    const count = await tx.inventoryCount.findFirst({ where: { id: input.countId, companyId: input.companyId }, include: { items: true } });
    if (!count) throw new Error("INVENTARIO_NAO_ENCONTRADO");
    if (count.status !== "PENDING_APPROVAL") throw new Error("INVENTARIO_NAO_AGUARDA_APROVACAO");
    if (count.submittedById === input.userId || count.createdById === input.userId) throw new Error("APROVACAO_EXIGE_SEGUNDO_USUARIO");
    const claimed = await tx.inventoryCount.updateMany({ where: { id: count.id, status: "PENDING_APPROVAL" }, data: { status: input.decision, approvedById: input.userId, approvedAt: new Date() } });
    if (claimed.count !== 1) throw new Error("INVENTARIO_NAO_AGUARDA_APROVACAO");
    if (input.decision === "APPROVED") for (const item of count.items) {
      const delta = Number(item.differenceQuantity ?? 0);
      await applyPhysicalDelta(tx, { companyId: input.companyId, storeId: count.storeId, productId: item.productId, lotId: item.lotId, delta, originType: "INVENTORY_COUNT", originId: count.id, reason: delta < 0 ? "LOSS" : "CORRECTION" });
    }
    const saved = await tx.inventoryCount.findUniqueOrThrow({ where: { id: count.id }, include: { items: true } });
    await tx.auditLog.create({ data: { companyId: input.companyId, userId: input.userId, action: `INVENTORY_COUNT_${input.decision}`, entity: "InventoryCount", entityId: saved.id, requestId: input.requestId, before: json({ status: count.status }), after: json({ status: saved.status }) } });
    return saved;
  });
}

export async function createStockAdjustment(input: { companyId: string; storeId: string; lotId: string; reason: "LOSS" | "DAMAGE" | "EXPIRED" | "CORRECTION"; quantityDelta: number; justification: string; userId: string; requestId: string }) {
  return prisma.$transaction(async (tx) => {
    await activeStore(tx, input.companyId, input.storeId);
    const lot = await lotInCompany(tx, input.companyId, input.lotId);
    if (input.reason !== "CORRECTION" && input.quantityDelta >= 0) throw new Error("PERDA_AVARIA_OU_VENCIMENTO_EXIGE_BAIXA");
    const adjustment = await tx.stockAdjustment.create({ data: { companyId: input.companyId, storeId: input.storeId, productId: lot.productId, lotId: lot.id, createdById: input.userId, reason: input.reason, quantityDelta: q(input.quantityDelta), justification: input.justification } });
    await tx.auditLog.create({ data: { companyId: input.companyId, userId: input.userId, action: "STOCK_ADJUSTMENT_REQUESTED", entity: "StockAdjustment", entityId: adjustment.id, requestId: input.requestId, after: json(adjustment) } });
    return adjustment;
  });
}

export async function decideStockAdjustment(input: { companyId: string; adjustmentId: string; decision: "APPROVED" | "REJECTED"; userId: string; requestId: string }) {
  return prisma.$transaction(async (tx) => {
    const adjustment = await tx.stockAdjustment.findFirst({ where: { id: input.adjustmentId, companyId: input.companyId } });
    if (!adjustment) throw new Error("AJUSTE_DE_ESTOQUE_NAO_ENCONTRADO");
    if (adjustment.status !== "PENDING_APPROVAL") throw new Error("AJUSTE_NAO_AGUARDA_APROVACAO");
    if (adjustment.createdById === input.userId) throw new Error("APROVACAO_EXIGE_SEGUNDO_USUARIO");
    const claimed = await tx.stockAdjustment.updateMany({ where: { id: adjustment.id, status: "PENDING_APPROVAL" }, data: { status: input.decision, approvedById: input.userId, approvedAt: new Date() } });
    if (claimed.count !== 1) throw new Error("AJUSTE_NAO_AGUARDA_APROVACAO");
    if (input.decision === "APPROVED") await applyPhysicalDelta(tx, { companyId: input.companyId, storeId: adjustment.storeId, productId: adjustment.productId, lotId: adjustment.lotId, delta: Number(adjustment.quantityDelta), originType: "STOCK_ADJUSTMENT", originId: adjustment.id, reason: adjustment.reason });
    const saved = await tx.stockAdjustment.findUniqueOrThrow({ where: { id: adjustment.id } });
    await tx.auditLog.create({ data: { companyId: input.companyId, userId: input.userId, action: `STOCK_ADJUSTMENT_${input.decision}`, entity: "StockAdjustment", entityId: saved.id, requestId: input.requestId, before: json({ status: adjustment.status }), after: json({ status: saved.status }) } });
    return saved;
  });
}
