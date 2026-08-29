import { randomUUID } from "node:crypto";
import { prisma } from "../infra/prisma.js";

const numeric = (input: unknown) => Number(input ?? 0);
const roundMoney = (input: number) => Math.round((input + Number.EPSILON) * 100) / 100;
const roundCost = (input: number) => Math.round((input + Number.EPSILON) * 10_000) / 10_000;

type QuotedItemInput = { quoteItemId: string; offeredQuantity: number; bonusQuantity: number; unitCost: number; discountPercent: number; nonRecoverableTaxAmount: number };
type QuoteItemReference = { id: string; requestedQuantity: unknown; currentCost: unknown; salePrice: unknown };

export function calculateNetProposal(input: { items: QuotedItemInput[]; quoteItems: QuoteItemReference[]; freightAmount: number; commercialDiscountAmount: number; financialDiscountAmount: number }) {
  const reference = new Map(input.quoteItems.map((item) => [item.id, item]));
  if (input.items.length !== reference.size || input.items.some((item) => !reference.has(item.quoteItemId))) throw new Error("PROPOSTA_DEVE_CONTER_TODOS_OS_ITENS_DA_COTACAO");
  const prepared = input.items.map((item) => {
    const quoteItem = reference.get(item.quoteItemId)!;
    const grossAmount = roundMoney(item.offeredQuantity * item.unitCost);
    const itemDiscount = roundMoney(grossAmount * item.discountPercent / 100);
    return { ...item, quoteItem, grossAmount, baseAmount: roundMoney(grossAmount - itemDiscount) };
  });
  const baseTotal = roundMoney(prepared.reduce((sum, item) => sum + item.baseAmount, 0));
  const headerDiscount = roundMoney(input.commercialDiscountAmount + input.financialDiscountAmount);
  if (headerDiscount > baseTotal + 0.009) throw new Error("DESCONTOS_SUPERAM_O_VALOR_DA_PROPOSTA");
  let allocatedFreight = 0;
  let allocatedDiscount = 0;
  const items = prepared.map((item, index) => {
    const last = index === prepared.length - 1;
    const ratio = baseTotal > 0 ? item.baseAmount / baseTotal : 1 / prepared.length;
    const freightShare = last ? roundMoney(input.freightAmount - allocatedFreight) : roundMoney(input.freightAmount * ratio);
    const discountShare = last ? roundMoney(headerDiscount - allocatedDiscount) : roundMoney(headerDiscount * ratio);
    allocatedFreight += freightShare;
    allocatedDiscount += discountShare;
    const netTotal = roundMoney(item.baseAmount + item.nonRecoverableTaxAmount + freightShare - discountShare);
    const effectiveQuantity = item.offeredQuantity + item.bonusQuantity;
    const netUnitCost = roundCost(netTotal / effectiveQuantity);
    const potentialGrossProfit = roundMoney(numeric(item.quoteItem.salePrice) * effectiveQuantity - netTotal);
    return { quoteItemId: item.quoteItemId, offeredQuantity: item.offeredQuantity, bonusQuantity: item.bonusQuantity, unitCost: item.unitCost, discountPercent: item.discountPercent, nonRecoverableTaxAmount: item.nonRecoverableTaxAmount, grossAmount: item.grossAmount, allocatedFreight: freightShare, allocatedDiscount: discountShare, netTotal, netUnitCost, effectiveQuantity, potentialGrossProfit };
  });
  return {
    grossAmount: roundMoney(items.reduce((sum, item) => sum + item.grossAmount, 0)),
    netAmount: roundMoney(items.reduce((sum, item) => sum + item.netTotal, 0)),
    potentialGrossProfit: roundMoney(items.reduce((sum, item) => sum + item.potentialGrossProfit, 0)),
    items,
  };
}

const quoteInclude = {
  store: { select: { id: true, name: true } }, createdBy: { select: { name: true } }, awardedBy: { select: { name: true } }, purchaseOrder: { select: { id: true, code: true, status: true } },
  items: { include: { product: { select: { id: true, ean: true, name: true } } }, orderBy: { createdAt: "asc" as const } },
  proposals: { include: { supplier: { select: { id: true, tradeName: true, taxId: true, minimumOrderValue: true } }, items: { include: { quoteItem: { include: { product: { select: { name: true, ean: true } } } } }, orderBy: { createdAt: "asc" as const } } }, orderBy: { netAmount: "asc" as const } },
};

export async function getQuotationDashboard(companyId: string) {
  const [stores, products, suppliers, quotes] = await Promise.all([
    prisma.store.findMany({ where: { companyId, active: true }, select: { id: true, name: true, code: true }, orderBy: { name: "asc" } }),
    prisma.product.findMany({ where: { companyId, active: true }, select: { id: true, ean: true, name: true, currentCost: true, salePrice: true }, orderBy: { name: "asc" } }),
    prisma.supplier.findMany({ where: { companyId, status: "ACTIVE" }, select: { id: true, tradeName: true, taxId: true, leadTimeDays: true, minimumOrderValue: true }, orderBy: { tradeName: "asc" } }),
    prisma.purchaseQuote.findMany({ where: { companyId }, include: quoteInclude, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  const enriched = quotes.map((quote) => {
    const proposals = quote.proposals.map((proposal) => ({
      ...proposal,
      comparableAmount: roundMoney(proposal.items.reduce((sum, item) => sum + numeric(item.netUnitCost) * numeric(item.quoteItem.requestedQuantity), 0)),
    }));
    const received = proposals.filter((proposal) => ["RECEIVED", "AWARDED"].includes(proposal.status));
    const baseline = roundMoney(quote.items.reduce((sum, item) => sum + numeric(item.currentCost) * numeric(item.requestedQuantity), 0));
    const best = [...received].sort((a, b) => a.comparableAmount - b.comparableAmount)[0];
    return { ...quote, proposals, baselineAmount: baseline, bestProposalId: best?.id ?? null, bestNetAmount: best ? numeric(best.netAmount) : null, potentialSavings: best ? roundMoney(Math.max(0, baseline - best.comparableAmount)) : 0 };
  });
  return {
    indicators: {
      openQuotes: enriched.filter((quote) => ["DRAFT", "OPEN", "ANALYSIS"].includes(quote.status)).length,
      pendingResponses: enriched.flatMap((quote) => quote.proposals).filter((proposal) => proposal.status === "INVITED").length,
      proposalsReceived: enriched.flatMap((quote) => quote.proposals).filter((proposal) => ["RECEIVED", "AWARDED"].includes(proposal.status)).length,
      potentialSavings: roundMoney(enriched.filter((quote) => quote.status !== "AWARDED").reduce((sum, quote) => sum + quote.potentialSavings, 0)),
    }, stores, products, suppliers, quotes: enriched,
  };
}

export async function createPurchaseQuote(input: { companyId: string; storeId: string; responseDueAt?: Date | null; notes?: string | null; items: Array<{ productId: string; quantity: number }>; userId: string; requestId?: string }) {
  const unique = new Map(input.items.map((item) => [item.productId, item]));
  if (unique.size !== input.items.length) throw new Error("COTACAO_COM_PRODUTO_DUPLICADO");
  const [store, products] = await Promise.all([
    prisma.store.findFirst({ where: { id: input.storeId, companyId: input.companyId, active: true } }),
    prisma.product.findMany({ where: { companyId: input.companyId, active: true, id: { in: [...unique.keys()] } }, select: { id: true, currentCost: true, salePrice: true } }),
  ]);
  if (!store) throw new Error("LOJA_ATIVA_NAO_ENCONTRADA");
  if (products.length !== unique.size) throw new Error("PRODUTO_DA_COTACAO_NAO_ENCONTRADO");
  const code = `COT-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 6).toUpperCase()}`;
  return prisma.$transaction(async (tx) => {
    const quote = await tx.purchaseQuote.create({ data: { companyId: input.companyId, storeId: input.storeId, createdById: input.userId, code, responseDueAt: input.responseDueAt ?? null, notes: input.notes ?? null, items: { create: products.map((product) => ({ productId: product.id, requestedQuantity: unique.get(product.id)!.quantity, currentCost: product.currentCost, salePrice: product.salePrice })) } }, include: quoteInclude });
    await tx.auditLog.create({ data: { companyId: input.companyId, userId: input.userId, action: "PURCHASE_QUOTE_CREATED", entity: "PurchaseQuote", entityId: quote.id, requestId: input.requestId, after: { code, storeId: input.storeId, itemCount: products.length, responseDueAt: input.responseDueAt ?? null } } });
    return quote;
  });
}

export async function inviteSupplier(input: { companyId: string; quoteId: string; supplierId: string; userId: string; requestId?: string }) {
  const [quote, supplier] = await Promise.all([
    prisma.purchaseQuote.findFirst({ where: { id: input.quoteId, companyId: input.companyId } }),
    prisma.supplier.findFirst({ where: { id: input.supplierId, companyId: input.companyId, status: "ACTIVE" } }),
  ]);
  if (!quote || !supplier) throw new Error("COTACAO_OU_FORNECEDOR_NAO_ENCONTRADO");
  if (quote.status !== "DRAFT") throw new Error("FORNECEDOR_SO_PODE_SER_INCLUIDO_NO_RASCUNHO");
  return prisma.$transaction(async (tx) => {
    const proposal = await tx.supplierProposal.create({ data: { quoteId: quote.id, supplierId: supplier.id, paymentTerms: supplier.paymentTerms, deliveryDays: supplier.leadTimeDays } });
    await tx.auditLog.create({ data: { companyId: input.companyId, userId: input.userId, action: "QUOTE_SUPPLIER_INVITED", entity: "SupplierProposal", entityId: proposal.id, requestId: input.requestId, after: { quoteId: quote.id, supplierId: supplier.id } } });
    return proposal;
  });
}

export async function openPurchaseQuote(input: { companyId: string; quoteId: string; userId: string; requestId?: string }) {
  const quote = await prisma.purchaseQuote.findFirst({ where: { id: input.quoteId, companyId: input.companyId }, include: { items: true, proposals: true } });
  if (!quote) throw new Error("COTACAO_NAO_ENCONTRADA");
  if (quote.status === "OPEN") return quote;
  if (quote.status !== "DRAFT") throw new Error("COTACAO_NAO_PODE_SER_ABERTA");
  if (!quote.items.length) throw new Error("COTACAO_SEM_ITENS");
  if (quote.proposals.length < 2) throw new Error("COTACAO_EXIGE_AO_MENOS_DOIS_FORNECEDORES");
  return prisma.$transaction(async (tx) => {
    const saved = await tx.purchaseQuote.update({ where: { id: quote.id }, data: { status: "OPEN", openedAt: new Date() } });
    await tx.auditLog.create({ data: { companyId: input.companyId, userId: input.userId, action: "PURCHASE_QUOTE_OPENED", entity: "PurchaseQuote", entityId: quote.id, requestId: input.requestId, before: { status: quote.status }, after: { status: saved.status, supplierCount: quote.proposals.length } } });
    return saved;
  });
}

export async function saveSupplierProposal(input: { companyId: string; proposalId: string; freightAmount: number; commercialDiscountAmount: number; financialDiscountAmount: number; paymentTerms?: string | null; deliveryDays: number; validUntil?: Date | null; notes?: string | null; items: QuotedItemInput[]; userId: string; requestId?: string }) {
  const proposal = await prisma.supplierProposal.findFirst({ where: { id: input.proposalId, quote: { companyId: input.companyId } }, include: { quote: { include: { items: true } } } });
  if (!proposal) throw new Error("PROPOSTA_NAO_ENCONTRADA");
  if (!["OPEN", "ANALYSIS"].includes(proposal.quote.status) || !["INVITED", "RECEIVED"].includes(proposal.status)) throw new Error("PROPOSTA_NAO_PODE_SER_ALTERADA");
  const calculated = calculateNetProposal({ items: input.items, quoteItems: proposal.quote.items, freightAmount: input.freightAmount, commercialDiscountAmount: input.commercialDiscountAmount, financialDiscountAmount: input.financialDiscountAmount });
  return prisma.$transaction(async (tx) => {
    await tx.supplierProposalItem.deleteMany({ where: { proposalId: proposal.id } });
    await tx.supplierProposalItem.createMany({ data: calculated.items.map((item) => ({ proposalId: proposal.id, quoteItemId: item.quoteItemId, offeredQuantity: item.offeredQuantity, bonusQuantity: item.bonusQuantity, unitCost: item.unitCost, discountPercent: item.discountPercent, nonRecoverableTaxAmount: item.nonRecoverableTaxAmount, grossAmount: item.grossAmount, allocatedFreight: item.allocatedFreight, allocatedDiscount: item.allocatedDiscount, netTotal: item.netTotal, netUnitCost: item.netUnitCost })) });
    const saved = await tx.supplierProposal.update({ where: { id: proposal.id }, data: { status: "RECEIVED", freightAmount: input.freightAmount, commercialDiscountAmount: input.commercialDiscountAmount, financialDiscountAmount: input.financialDiscountAmount, paymentTerms: input.paymentTerms ?? null, deliveryDays: input.deliveryDays, validUntil: input.validUntil ?? null, notes: input.notes ?? null, grossAmount: calculated.grossAmount, netAmount: calculated.netAmount, potentialGrossProfit: calculated.potentialGrossProfit, submittedAt: new Date() }, include: { items: true } });
    if (proposal.quote.status === "OPEN") await tx.purchaseQuote.update({ where: { id: proposal.quote.id }, data: { status: "ANALYSIS" } });
    await tx.auditLog.create({ data: { companyId: input.companyId, userId: input.userId, action: "SUPPLIER_PROPOSAL_SAVED", entity: "SupplierProposal", entityId: proposal.id, requestId: input.requestId, after: { grossAmount: calculated.grossAmount, netAmount: calculated.netAmount, potentialGrossProfit: calculated.potentialGrossProfit, freightAmount: input.freightAmount, commercialDiscountAmount: input.commercialDiscountAmount, financialDiscountAmount: input.financialDiscountAmount } } });
    return saved;
  });
}

export async function awardSupplierProposal(input: { companyId: string; quoteId: string; proposalId: string; userId: string; requestId?: string }) {
  const quote = await prisma.purchaseQuote.findFirst({ where: { id: input.quoteId, companyId: input.companyId }, include: { items: true, proposals: { include: { supplier: true, items: true } } } });
  if (!quote) throw new Error("COTACAO_NAO_ENCONTRADA");
  if (!['OPEN', 'ANALYSIS'].includes(quote.status)) throw new Error("COTACAO_NAO_PODE_SER_ADJUDICADA");
  const proposal = quote.proposals.find((entry) => entry.id === input.proposalId);
  if (!proposal || proposal.status !== "RECEIVED") throw new Error("PROPOSTA_RECEBIDA_NAO_ENCONTRADA");
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  if (proposal.validUntil && proposal.validUntil < today) throw new Error("PROPOSTA_FORA_DA_VALIDADE");
  if (numeric(proposal.netAmount) < numeric(proposal.supplier.minimumOrderValue)) throw new Error("PROPOSTA_ABAIXO_DO_MINIMO_DO_FORNECEDOR");
  if (proposal.items.length !== quote.items.length || quote.items.some((item) => {
    const offered = proposal.items.find((entry) => entry.quoteItemId === item.id);
    return !offered || numeric(offered.offeredQuantity) + numeric(offered.bonusQuantity) < numeric(item.requestedQuantity);
  })) throw new Error("PROPOSTA_NAO_ATENDE_TODAS_AS_QUANTIDADES");
  const code = `PC-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 6).toUpperCase()}`;
  return prisma.$transaction(async (tx) => {
    const order = await tx.purchaseOrder.create({ data: { companyId: input.companyId, supplierId: proposal.supplierId, storeId: quote.storeId, createdById: input.userId, approvedById: input.userId, code, status: "APPROVED", expectedAt: proposal.deliveryDays === null ? null : new Date(Date.now() + proposal.deliveryDays * 86_400_000), approvedAt: new Date(), totalAmount: proposal.netAmount, notes: `Gerado pela cotação ${quote.code}. Condição: ${proposal.paymentTerms ?? "não informada"}.`, items: { create: proposal.items.map((item) => ({ productId: quote.items.find((entry) => entry.id === item.quoteItemId)!.productId, requestedQuantity: numeric(item.offeredQuantity) + numeric(item.bonusQuantity), unitCost: item.netUnitCost, totalAmount: item.netTotal, notes: numeric(item.bonusQuantity) > 0 ? `Inclui ${numeric(item.bonusQuantity)} unidade(s) bonificada(s).` : null })) } }, include: { items: true } });
    for (const item of proposal.items) {
      const productId = quote.items.find((entry) => entry.id === item.quoteItemId)!.productId;
      await tx.supplierProduct.upsert({ where: { supplierId_productId: { supplierId: proposal.supplierId, productId } }, create: { supplierId: proposal.supplierId, productId, lastUnitCost: item.netUnitCost }, update: { lastUnitCost: item.netUnitCost, active: true } });
    }
    await tx.supplierProposal.updateMany({ where: { quoteId: quote.id, id: { not: proposal.id } }, data: { status: "NOT_SELECTED" } });
    await tx.supplierProposal.update({ where: { id: proposal.id }, data: { status: "AWARDED", awardedAt: new Date() } });
    await tx.purchaseQuote.update({ where: { id: quote.id }, data: { status: "AWARDED", awardedById: input.userId, awardedAt: new Date(), purchaseOrderId: order.id } });
    await tx.auditLog.create({ data: { companyId: input.companyId, userId: input.userId, action: "PURCHASE_QUOTE_AWARDED", entity: "PurchaseQuote", entityId: quote.id, requestId: input.requestId, after: { proposalId: proposal.id, supplierId: proposal.supplierId, purchaseOrderId: order.id, grossAmount: proposal.grossAmount, netAmount: proposal.netAmount, potentialGrossProfit: proposal.potentialGrossProfit } } });
    return order;
  }, { isolationLevel: "Serializable", timeout: 15_000 });
}

export async function cancelPurchaseQuote(input: { companyId: string; quoteId: string; reason: string; userId: string; requestId?: string }) {
  const quote = await prisma.purchaseQuote.findFirst({ where: { id: input.quoteId, companyId: input.companyId } });
  if (!quote) throw new Error("COTACAO_NAO_ENCONTRADA");
  if (["AWARDED", "CANCELLED"].includes(quote.status)) throw new Error("COTACAO_NAO_PODE_SER_CANCELADA");
  return prisma.$transaction(async (tx) => {
    const saved = await tx.purchaseQuote.update({ where: { id: quote.id }, data: { status: "CANCELLED", cancelledAt: new Date(), notes: [quote.notes, `Cancelamento: ${input.reason}`].filter(Boolean).join("\n") } });
    await tx.auditLog.create({ data: { companyId: input.companyId, userId: input.userId, action: "PURCHASE_QUOTE_CANCELLED", entity: "PurchaseQuote", entityId: quote.id, requestId: input.requestId, before: { status: quote.status }, after: { status: saved.status, reason: input.reason } } });
    return saved;
  });
}
