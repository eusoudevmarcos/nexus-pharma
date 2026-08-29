import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../infra/prisma.js";
import { incrementStoreBalance } from "./inventory-workflow.service.js";

const toJson = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

const objectValue = (value: Prisma.JsonValue | null): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const stringValue = (value: unknown): string | null =>
  typeof value === "string" || typeof value === "number"
    ? String(value).trim() || null
    : null;

export async function startDfeReceiving(input: {
  companyId: string;
  documentId: string;
  storeId?: string | null;
  userId: string;
}) {
  const document = await prisma.dfeDocument.findFirst({
    where: { id: input.documentId, companyId: input.companyId },
    include: { items: true, receiving: true },
  });
  if (!document) throw new Error("DFE_NAO_ENCONTRADO");
  if (document.documentType !== "NFE" || !document.accessKey) throw new Error("XML_COMPLETO_DA_NFE_OBRIGATORIO");
  if (!document.items.length) throw new Error("NFE_SEM_ITENS");
  if (document.receiving) return document.receiving;
  if (input.storeId) {
    const store = await prisma.store.findFirst({ where: { id: input.storeId, companyId: input.companyId, active: true } });
    if (!store) throw new Error("LOJA_ATIVA_NAO_ENCONTRADA");
  }
  return prisma.$transaction(async (tx) => {
    const receiving = await tx.dfeReceiving.create({
      data: {
        companyId: input.companyId,
        documentId: document.id,
        storeId: input.storeId ?? null,
        startedById: input.userId,
        status: "IN_PROGRESS",
        startedAt: new Date(),
        items: {
          create: document.items.map((item) => ({
            documentItemId: item.id,
            productId: item.productId,
            expectedQuantity: item.quantity,
            receivedQuantity: 0,
            unitCost: item.unitPrice,
          })),
        },
      },
      include: { items: true },
    });
    await tx.dfeDocument.update({ where: { id: document.id }, data: { status: "CONFERENCING" } });
    await tx.dfeManifestation.upsert({
      where: { documentId_type_sequence: { documentId: document.id, type: "SCIENCE", sequence: 1 } },
      create: { documentId: document.id, createdById: input.userId, type: "SCIENCE", sequence: 1 },
      update: {},
    });
    await tx.auditLog.create({
      data: {
        companyId: input.companyId,
        userId: input.userId,
        action: "DFE_RECEIVING_STARTED",
        entity: "DfeReceiving",
        entityId: receiving.id,
        after: { documentId: document.id, storeId: input.storeId ?? null },
      },
    });
    return receiving;
  });
}

export async function completeDfeReceiving(input: {
  companyId: string;
  receivingId: string;
  userId: string;
}) {
  const receiving = await prisma.dfeReceiving.findFirst({
    where: { id: input.receivingId, companyId: input.companyId },
    include: {
      document: { include: { discrepancies: true } },
      items: {
        include: {
          documentItem: { include: { matchedRule: true } },
          product: { include: { category: { include: { rules: true } }, company: true } },
        },
      },
    },
  });
  if (!receiving) throw new Error("CONFERENCIA_NAO_ENCONTRADA");
  if (receiving.status === "COMPLETED") return receiving;
  if (receiving.status !== "IN_PROGRESS") throw new Error("CONFERENCIA_NAO_ESTA_EM_ANDAMENTO");
  const openCritical = receiving.document.discrepancies.filter(
    (entry) => entry.status === "OPEN" && ["HIGH", "CRITICAL"].includes(entry.severity),
  );
  if (openCritical.length) throw new Error("DIVERGENCIAS_CRITICAS_PENDENTES");
  if (!receiving.document.accessKey) throw new Error("CHAVE_DE_ACESSO_NAO_ENCONTRADA");

  const acceptedValue = (documentItemId: string, field: string) =>
    receiving.document.discrepancies.find(
      (entry) => entry.documentItemId === documentItemId && entry.field === field && entry.status === "ACCEPTED_SUGGESTION",
    )?.suggestedValue ?? null;

  for (const item of receiving.items) {
    if (!item.product) throw new Error(`ITEM_${item.documentItem.itemNumber}_SEM_PRODUTO_VINCULADO`);
    if (Number(item.receivedQuantity) <= 0) throw new Error(`ITEM_${item.documentItem.itemNumber}_SEM_QUANTIDADE_RECEBIDA`);
    if (!item.lotCode || !item.manufacturedAt || !item.expiresAt) throw new Error(`ITEM_${item.documentItem.itemNumber}_SEM_LOTE_FABRICACAO_OU_VALIDADE`);
    if (item.expiresAt <= item.manufacturedAt || item.expiresAt <= new Date()) throw new Error(`ITEM_${item.documentItem.itemNumber}_COM_VALIDADE_INVALIDA`);
    if (item.status !== "ACCEPTED") throw new Error(`ITEM_${item.documentItem.itemNumber}_NAO_CONFERIDO`);
    const suggestion = objectValue(item.documentItem.suggestedTax);
    const cstIcms = acceptedValue(item.documentItem.id, "cstIcms") ?? item.documentItem.cstIcms ?? stringValue(suggestion.cstIcms);
    const cstPisCofins = acceptedValue(item.documentItem.id, "cstPis") ?? acceptedValue(item.documentItem.id, "cstCofins") ?? item.documentItem.cstPis ?? stringValue(suggestion.cstPisCofins);
    if (!cstIcms || !cstPisCofins) throw new Error(`ITEM_${item.documentItem.itemNumber}_SEM_CLASSIFICACAO_FISCAL_MINIMA`);
  }

  return prisma.$transaction(async (tx) => {
    const destinationStore = receiving.storeId
      ? await tx.store.findFirst({ where: { id: receiving.storeId, companyId: input.companyId, active: true } })
      : await tx.store.findFirst({ where: { companyId: input.companyId, active: true, type: "MAIN" }, orderBy: { createdAt: "asc" } })
        ?? await tx.store.findFirst({ where: { companyId: input.companyId, active: true }, orderBy: { createdAt: "asc" } });
    if (!destinationStore) throw new Error("LOJA_ATIVA_NAO_ENCONTRADA");
    for (const item of receiving.items) {
      const product = item.product!;
      const documentItem = item.documentItem;
      const suggestion = objectValue(documentItem.suggestedTax);
      const quantity = Number(item.receivedQuantity);
      const existingLot = await tx.inventoryLot.findUnique({
        where: { productId_code: { productId: product.id, code: item.lotCode! } },
      });
      const lot = existingLot
        ? await tx.inventoryLot.update({
            where: { id: existingLot.id },
            data: {
              quantity: { increment: quantity },
              unitCost: item.unitCost,
              manufacturedAt: item.manufacturedAt!,
              expiresAt: item.expiresAt!,
            },
          })
        : await tx.inventoryLot.create({
            data: {
              productId: product.id,
              code: item.lotCode!,
              quantity,
              unitCost: item.unitCost,
              manufacturedAt: item.manufacturedAt!,
              expiresAt: item.expiresAt!,
            },
          });
      await tx.product.update({
        where: { id: product.id },
        data: { stockQuantity: { increment: quantity }, currentCost: item.unitCost },
      });
      await incrementStoreBalance(tx, { companyId: input.companyId, storeId: destinationStore.id, productId: product.id, lotId: lot.id, quantity });
      await tx.stockMovement.create({
        data: {
          companyId: input.companyId,
          storeId: destinationStore.id,
          productId: product.id,
          lotId: lot.id,
          type: "ENTRY",
          quantity,
          unitCost: item.unitCost,
          originType: "DFE_RECEIVING",
          originId: receiving.id,
          notes: `NF-e ${receiving.document.documentNumber ?? receiving.document.accessKey}`,
        },
      });
      const categoryRule = product.category.rules.find((rule) => rule.regime === product.company.taxRegime);
      const cstIcms = acceptedValue(documentItem.id, "cstIcms") ?? documentItem.cstIcms ?? stringValue(suggestion.cstIcms)!;
      const csosn = acceptedValue(documentItem.id, "csosn") ?? documentItem.csosn ?? stringValue(suggestion.csosn);
      const cstPisCofins = acceptedValue(documentItem.id, "cstPis") ?? acceptedValue(documentItem.id, "cstCofins") ?? documentItem.cstPis ?? stringValue(suggestion.cstPisCofins)!;
      const inputCfop = acceptedValue(documentItem.id, "cfop") ?? documentItem.cfop;
      await tx.taxProvenance.create({
        data: {
          companyId: input.companyId,
          productId: product.id,
          lotId: lot.id,
          sourceAccessKey: receiving.document.accessKey,
          sourceItemNumber: documentItem.itemNumber,
          sourceDocumentNumber: receiving.document.documentNumber,
          supplierTaxId: receiving.document.issuerTaxId,
          originState: receiving.document.originState ?? product.company.state ?? "DF",
          destinationState: receiving.document.destinationState ?? product.company.state ?? "DF",
          operationDate: receiving.document.issuedAt ?? new Date(),
          quantity,
          remainingQuantity: quantity,
          inputCfop,
          inputCstIcms: cstIcms,
          inputCsosn: csosn,
          inputCstPisCofins: cstPisCofins,
          monophaseApplicable: cstPisCofins === "04",
          revenueNature: stringValue(suggestion.revenueNature) ?? categoryRule?.revenueNature,
          inputCstIbsCbs: stringValue(suggestion.cstIbsCbs) ?? categoryRule?.cstIbsCbs,
          inputCClassTrib: stringValue(suggestion.cClassTrib) ?? categoryRule?.cClassTrib,
          rawTaxSnapshot: toJson(documentItem.originalTax),
          evidence: toJson({
            dfeDocumentId: receiving.document.id,
            xmlHash: receiving.document.xmlHash,
            suggestedTax: documentItem.suggestedTax,
            matchedMatrixRuleId: documentItem.matchedRuleId,
            discrepancyDecisions: receiving.document.discrepancies.filter((entry) => entry.documentItemId === documentItem.id).map((entry) => ({ field: entry.field, status: entry.status, received: entry.receivedValue, suggested: entry.suggestedValue })),
          }),
          sourceHash: receiving.document.xmlHash,
          ruleVersion: documentItem.matchedRule?.ruleVersion ?? product.category.ruleVersion,
        },
      });
      await tx.dfeReceivingItem.update({
        where: { id: item.id },
        data: { inventoryLotId: lot.id, productId: product.id },
      });
    }
    const updated = await tx.dfeReceiving.update({
      where: { id: receiving.id },
      data: { status: "COMPLETED", completedById: input.userId, completedAt: new Date() },
      include: { items: true },
    });
    await tx.dfeDocument.update({ where: { id: receiving.document.id }, data: { status: "ACCEPTED" } });
    await tx.dfeManifestation.upsert({
      where: { documentId_type_sequence: { documentId: receiving.document.id, type: "CONFIRMATION", sequence: 1 } },
      create: { documentId: receiving.document.id, createdById: input.userId, type: "CONFIRMATION", sequence: 1 },
      update: {},
    });
    await tx.auditLog.create({
      data: {
        companyId: input.companyId,
        userId: input.userId,
        action: "DFE_RECEIVING_COMPLETED",
        entity: "DfeReceiving",
        entityId: receiving.id,
        after: { documentId: receiving.document.id, items: receiving.items.length },
      },
    });
    return updated;
  });
}
