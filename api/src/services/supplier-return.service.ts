import { randomUUID } from "node:crypto";
import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../infra/prisma.js";
import { decrementStoreBalance } from "./inventory-workflow.service.js";

type Tx = Prisma.TransactionClient;

const quantity = (value: unknown) => Number(value ?? 0);
const q = (value: number) => Math.round((value + Number.EPSILON) * 1000) / 1000;
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

async function loadReturnSource(tx: Tx, companyId: string, receiptId: string) {
  const receipt = await tx.purchaseOrderReceipt.findFirst({
    where: { id: receiptId, purchaseOrder: { companyId } },
    include: {
      purchaseOrder: {
        include: {
          supplier: { select: { id: true, taxId: true, tradeName: true } },
          store: { select: { id: true, name: true } },
          items: true,
        },
      },
      accountPayable: { include: { installments: { orderBy: { dueAt: "desc" } } } },
      dfeReceiving: {
        include: {
          document: true,
          items: {
            include: {
              product: { select: { id: true, ean: true, name: true, stockQuantity: true } },
              inventoryLot: true,
              documentItem: true,
              supplierReturnItems: true,
            },
            orderBy: { documentItem: { itemNumber: "asc" } },
          },
        },
      },
    },
  });
  if (!receipt) throw new Error("RECEBIMENTO_DE_COMPRA_NAO_ENCONTRADO");
  if (receipt.dfeReceiving.status !== "COMPLETED") throw new Error("NFE_AINDA_NAO_FOI_RECEBIDA");
  if (!receipt.dfeReceiving.document.accessKey) throw new Error("CHAVE_DE_ACESSO_NAO_ENCONTRADA");

  const items = [];
  for (const item of receipt.dfeReceiving.items) {
    if (!item.product || !item.inventoryLot) throw new Error(`ITEM_${item.documentItem.itemNumber}_SEM_ESTOQUE_VINCULADO`);
    const [balance, provenance] = await Promise.all([
      tx.storeStockBalance.findUnique({ where: { storeId_lotId: { storeId: receipt.purchaseOrder.storeId, lotId: item.inventoryLot.id } } }),
      tx.taxProvenance.findFirst({
        where: {
          companyId,
          productId: item.product.id,
          lotId: item.inventoryLot.id,
          sourceAccessKey: receipt.dfeReceiving.document.accessKey,
          sourceItemNumber: item.documentItem.itemNumber,
        },
      }),
    ]);
    if (!provenance) throw new Error(`ITEM_${item.documentItem.itemNumber}_SEM_PROVENIENCIA_FISCAL`);
    const returnedQuantity = q(item.supplierReturnItems.reduce((sum, entry) => sum + quantity(entry.quantity), 0));
    const remainingFromReceipt = q(Math.max(0, quantity(item.receivedQuantity) - returnedQuantity));
    const availableAtStore = q(Math.max(0, quantity(balance?.onHand) - quantity(balance?.reserved)));
    const availableConsolidated = q(Math.min(quantity(item.inventoryLot.quantity), quantity(item.product.stockQuantity)));
    const fiscalAvailable = q(Math.max(0, quantity(provenance.remainingQuantity)));
    const maxReturnableQuantity = q(Math.max(0, Math.min(remainingFromReceipt, availableAtStore, availableConsolidated, fiscalAvailable)));
    const blockedReason = remainingFromReceipt <= 0
      ? "Item já devolvido integralmente."
      : availableAtStore <= 0
        ? "Sem saldo livre nesta loja ou quantidade reservada."
        : fiscalAvailable <= 0
          ? "Quantidade da origem fiscal já consumida."
          : maxReturnableQuantity < remainingFromReceipt
            ? "Parte da quantidade já foi vendida, transferida, reservada ou baixada."
            : null;
    items.push({
      id: item.id,
      documentItemId: item.documentItemId,
      sourceItemNumber: item.documentItem.itemNumber,
      product: item.product,
      lot: { id: item.inventoryLot.id, code: item.inventoryLot.code, expiresAt: item.inventoryLot.expiresAt },
      provenanceId: provenance.id,
      sourceReceivedQuantity: quantity(item.receivedQuantity),
      alreadyReturnedQuantity: returnedQuantity,
      remainingFromReceipt,
      availableAtStore,
      fiscalAvailable,
      maxReturnableQuantity,
      unitCost: quantity(item.unitCost),
      maxReturnValue: money(maxReturnableQuantity * quantity(item.unitCost)),
      blockedReason,
      taxSnapshot: {
        original: item.documentItem.originalTax,
        suggested: item.documentItem.suggestedTax,
        ncm: item.documentItem.ncm,
        cest: item.documentItem.cest,
        cfop: item.documentItem.cfop,
        cstIcms: item.documentItem.cstIcms,
        csosn: item.documentItem.csosn,
        cstPis: item.documentItem.cstPis,
        cstCofins: item.documentItem.cstCofins,
      },
    });
  }

  const payableOutstanding = receipt.accountPayable && ["DRAFT", "OPEN", "PARTIAL", "DISPUTED"].includes(receipt.accountPayable.status)
    ? money(Math.max(0, quantity(receipt.accountPayable.totalAmount) - quantity(receipt.accountPayable.paidAmount)))
    : 0;
  return {
    receipt,
    public: {
      receiptId: receipt.id,
      order: { id: receipt.purchaseOrder.id, code: receipt.purchaseOrder.code },
      supplier: receipt.purchaseOrder.supplier,
      store: receipt.purchaseOrder.store,
      document: {
        id: receipt.dfeReceiving.document.id,
        accessKey: receipt.dfeReceiving.document.accessKey,
        number: receipt.dfeReceiving.document.documentNumber,
        issuedAt: receipt.dfeReceiving.document.issuedAt,
        totalAmount: quantity(receipt.dfeReceiving.document.totalAmount),
      },
      financial: {
        payableId: receipt.accountPayable?.id ?? null,
        payableStatus: receipt.accountPayable?.status ?? null,
        payableOutstanding,
        paidAmount: quantity(receipt.accountPayable?.paidAmount),
      },
      items,
    },
  };
}

export async function getSupplierReturnPreview(input: { companyId: string; receiptId: string }) {
  return prisma.$transaction(async (tx) => (await loadReturnSource(tx, input.companyId, input.receiptId)).public);
}

async function applyPayableAdjustment(tx: Tx, payable: Awaited<ReturnType<typeof loadReturnSource>>["receipt"]["accountPayable"], amount: number) {
  if (!payable || amount <= 0) return;
  let remaining = money(amount);
  for (const installment of payable.installments) {
    if (remaining <= 0) break;
    const reducible = money(Math.max(0, quantity(installment.amount) - quantity(installment.paidAmount)));
    const reduction = money(Math.min(remaining, reducible));
    if (reduction <= 0) continue;
    const nextAmount = money(quantity(installment.amount) - reduction);
    const paidAmount = quantity(installment.paidAmount);
    const status = nextAmount <= 0.009 ? "CANCELLED" : paidAmount >= nextAmount - 0.009 ? "PAID" : paidAmount > 0 ? "PARTIAL" : "OPEN";
    await tx.payableInstallment.update({ where: { id: installment.id }, data: { amount: nextAmount, status } });
    remaining = money(remaining - reduction);
  }
  if (payable.installments.length && remaining > 0.009) throw new Error("SALDO_DAS_PARCELAS_DIVERGE_DO_TITULO");
  const nextTotal = money(Math.max(quantity(payable.paidAmount), quantity(payable.totalAmount) - amount));
  const status = nextTotal <= 0.009
    ? "CANCELLED"
    : quantity(payable.paidAmount) >= nextTotal - 0.009
      ? "PAID"
      : quantity(payable.paidAmount) > 0
        ? "PARTIAL"
        : payable.installments.length ? "OPEN" : "DRAFT";
  await tx.accountPayable.update({
    where: { id: payable.id },
    data: {
      totalAmount: nextTotal,
      status,
      ...(status === "CANCELLED" ? { cancelledAt: new Date() } : {}),
      notes: [payable.notes, `Abatimento de devolução ao fornecedor: R$ ${amount.toFixed(2)}.`].filter(Boolean).join("\n"),
    },
  });
}

export async function createSupplierReturn(input: {
  companyId: string;
  receiptId: string;
  idempotencyKey: string;
  scope: "ONE" | "SOME" | "ALL";
  reason: string;
  items: Array<{ receivingItemId: string; quantity: number }>;
  userId: string;
  requestId?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.supplierReturn.findUnique({
      where: { companyId_idempotencyKey: { companyId: input.companyId, idempotencyKey: input.idempotencyKey } },
      include: { items: true },
    });
    if (existing) return existing;
    const source = await loadReturnSource(tx, input.companyId, input.receiptId);
    const selected = new Map(input.items.map((item) => [item.receivingItemId, q(item.quantity)]));
    if (selected.size !== input.items.length) throw new Error("ITEM_DE_DEVOLUCAO_DUPLICADO");
    const eligible = source.public.items.filter((item) => item.maxReturnableQuantity > 0);
    if (!selected.size) throw new Error("DEVOLUCAO_SEM_ITENS");
    if (input.scope === "ONE" && selected.size !== 1) throw new Error("DEVOLUCAO_DE_UM_ITEM_EXIGE_APENAS_UM_ITEM");
    if (input.scope === "SOME" && selected.size < 2) throw new Error("DEVOLUCAO_DE_ALGUNS_ITENS_EXIGE_DOIS_OU_MAIS");
    if (input.scope === "ALL" && selected.size !== eligible.length) throw new Error("DEVOLUCAO_TOTAL_EXIGE_TODOS_OS_ITENS_DISPONIVEIS");

    const prepared = [];
    for (const [receivingItemId, returnQuantity] of selected) {
      const item = source.public.items.find((entry) => entry.id === receivingItemId);
      if (!item) throw new Error("ITEM_NAO_PERTENCE_A_NFE_SELECIONADA");
      if (returnQuantity <= 0 || returnQuantity > item.maxReturnableQuantity + 0.0009) throw new Error("QUANTIDADE_DE_DEVOLUCAO_SUPERA_O_SALDO_DISPONIVEL");
      prepared.push({ ...item, returnQuantity, totalAmount: money(returnQuantity * item.unitCost) });
    }
    const totalAmount = money(prepared.reduce((sum, item) => sum + item.totalAmount, 0));
    if (totalAmount <= 0) throw new Error("DEVOLUCAO_SEM_VALOR");
    const payableAdjustmentAmount = money(Math.min(totalAmount, source.public.financial.payableOutstanding));
    const supplierCreditAmount = money(totalAmount - payableAdjustmentAmount);
    const financialEffect = payableAdjustmentAmount > 0 && supplierCreditAmount > 0
      ? "MIXED"
      : payableAdjustmentAmount > 0
        ? "PAYABLE_REDUCED"
        : supplierCreditAmount > 0
          ? "SUPPLIER_CREDIT"
          : "NONE";
    const code = `DEV-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 6).toUpperCase()}`;
    const fiscalDraft = {
      documentModel: 55,
      purpose: 4,
      operation: "SUPPLIER_RETURN",
      status: "PENDING_TAX_REVIEW_AND_SEFAZ_AUTHORIZATION",
      sourceReference: { accessKey: source.public.document.accessKey, documentNumber: source.public.document.number },
      issuerCompanyId: input.companyId,
      recipientSupplierId: source.public.supplier.id,
      requiresCfopAndTaxRecalculation: true,
      items: prepared.map((item) => ({ sourceItemNumber: item.sourceItemNumber, productId: item.product.id, quantity: item.returnQuantity, unitCost: item.unitCost, taxSnapshot: item.taxSnapshot })),
    };
    const created = await tx.supplierReturn.create({
      data: {
        companyId: input.companyId,
        supplierId: source.public.supplier.id,
        storeId: source.public.store.id,
        purchaseReceiptId: source.public.receiptId,
        dfeDocumentId: source.public.document.id,
        accountPayableId: source.public.financial.payableId,
        createdById: input.userId,
        idempotencyKey: input.idempotencyKey,
        code,
        scope: input.scope,
        status: "PENDING_FISCAL",
        financialEffect,
        reason: input.reason,
        sourceAccessKey: source.public.document.accessKey,
        sourceDocumentNumber: source.public.document.number,
        totalAmount,
        payableAdjustmentAmount,
        supplierCreditAmount,
        fiscalDraft: json(fiscalDraft),
        items: {
          create: prepared.map((item) => ({
            receivingItemId: item.id,
            productId: item.product.id,
            lotId: item.lot.id,
            provenanceId: item.provenanceId,
            sourceItemNumber: item.sourceItemNumber,
            sourceReceivedQuantity: item.sourceReceivedQuantity,
            quantity: item.returnQuantity,
            unitCost: item.unitCost,
            totalAmount: item.totalAmount,
            taxSnapshot: json(item.taxSnapshot),
          })),
        },
      },
      include: { items: true },
    });

    const returnedByProduct = new Map<string, number>();
    for (const item of prepared) {
      await decrementStoreBalance(tx, { companyId: input.companyId, storeId: source.public.store.id, productId: item.product.id, lotId: item.lot.id, quantity: item.returnQuantity });
      const [lotChanged, productChanged, provenanceChanged] = await Promise.all([
        tx.inventoryLot.updateMany({ where: { id: item.lot.id, quantity: { gte: item.returnQuantity } }, data: { quantity: { decrement: item.returnQuantity } } }),
        tx.product.updateMany({ where: { id: item.product.id, companyId: input.companyId, stockQuantity: { gte: item.returnQuantity } }, data: { stockQuantity: { decrement: item.returnQuantity } } }),
        tx.taxProvenance.updateMany({ where: { id: item.provenanceId, companyId: input.companyId, remainingQuantity: { gte: item.returnQuantity } }, data: { remainingQuantity: { decrement: item.returnQuantity } } }),
      ]);
      if (lotChanged.count !== 1 || productChanged.count !== 1) throw new Error("SALDO_CONSOLIDADO_INSUFICIENTE_PARA_DEVOLUCAO");
      if (provenanceChanged.count !== 1) throw new Error("SALDO_FISCAL_INSUFICIENTE_PARA_DEVOLUCAO");
      await tx.stockMovement.create({
        data: {
          companyId: input.companyId,
          storeId: source.public.store.id,
          productId: item.product.id,
          lotId: item.lot.id,
          type: "RETURN",
          quantity: -item.returnQuantity,
          unitCost: item.unitCost,
          originType: "SUPPLIER_RETURN",
          originId: created.id,
          notes: `${code} · NF-e de origem ${source.public.document.number ?? source.public.document.accessKey}`,
        },
      });
      returnedByProduct.set(item.product.id, q((returnedByProduct.get(item.product.id) ?? 0) + item.returnQuantity));
    }

    for (const orderItem of source.receipt.purchaseOrder.items) {
      const returned = returnedByProduct.get(orderItem.productId) ?? 0;
      if (!returned) continue;
      await tx.purchaseOrderItem.update({
        where: { id: orderItem.id },
        data: { receivedQuantity: Math.max(0, q(quantity(orderItem.receivedQuantity) - returned)) },
      });
    }
    const orderItems = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: source.receipt.purchaseOrder.id } });
    const orderStatus = orderItems.every((item) => quantity(item.receivedQuantity) >= quantity(item.requestedQuantity) - 0.0009)
      ? "RECEIVED"
      : orderItems.some((item) => quantity(item.receivedQuantity) > 0)
        ? "PARTIALLY_RECEIVED"
        : "APPROVED";
    await tx.purchaseOrder.update({ where: { id: source.receipt.purchaseOrder.id }, data: { status: orderStatus } });
    await applyPayableAdjustment(tx, source.receipt.accountPayable, payableAdjustmentAmount);
    await tx.auditLog.create({
      data: {
        companyId: input.companyId,
        userId: input.userId,
        action: "SUPPLIER_RETURN_INTERNAL_REVERSED",
        entity: "SupplierReturn",
        entityId: created.id,
        requestId: input.requestId,
        after: json({
          code,
          sourceAccessKey: source.public.document.accessKey,
          scope: input.scope,
          itemCount: prepared.length,
          totalAmount,
          payableAdjustmentAmount,
          supplierCreditAmount,
          orderStatus,
          fiscalStatus: "PENDING_FISCAL",
        }),
      },
    });
    return created;
  }, { isolationLevel: "Serializable", timeout: 20_000 });
}
