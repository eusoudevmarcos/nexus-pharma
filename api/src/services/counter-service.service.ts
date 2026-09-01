import { randomUUID } from "node:crypto";
import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../infra/prisma.js";
import { availableQuantity } from "./inventory-workflow.service.js";
import { validateBrazilianTaxId } from "./nfce.service.js";
import { discountLimitForRole } from "./processar-venda.service.js";
import { onlyDigits, validateControlledSaleLine, type PrescriptionContext } from "./sale-control.service.js";

type CounterItemInput = { ean: string; quantity: number; prescription?: PrescriptionContext | null };
type BuyerInput = { taxId: string; name?: string | null; birthDate?: Date | null } | null;

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const counterOrderInclude = {
  attendant: { select: { id: true, name: true } },
  claimedBy: { select: { id: true, name: true } },
  store: { select: { id: true, code: true, name: true } },
  pharmacistCredential: { select: { id: true, council: true, registration: true, state: true, user: { select: { id: true, name: true } } } },
  cashSession: { select: { id: true, pointOfSale: { select: { id: true, name: true } } } },
  sale: { select: { id: true, soldAt: true, grossAmount: true } },
  items: { orderBy: { createdAt: "asc" as const }, include: { product: { select: { id: true, controlLevel: true, requiresBuyerId: true, requiresPrescription: true, requiresPharmacist: true } } } },
} satisfies Prisma.CounterOrderInclude;

function commercialPrice(product: { salePrice: unknown; promotionPrice: unknown | null; salesStrategy: string; strategyStartsAt: Date | null; strategyEndsAt: Date | null }, now: Date) {
  const list = Number(product.salePrice);
  const promotion = product.salesStrategy === "PROMOTION" && product.promotionPrice !== null
    && (!product.strategyStartsAt || product.strategyStartsAt <= now)
    && (!product.strategyEndsAt || product.strategyEndsAt >= now);
  return { list, current: promotion ? Number(product.promotionPrice) : list, promotion };
}

async function expireCounterOrders(companyId: string) {
  await prisma.counterOrder.updateMany({
    where: { companyId, status: { in: ["WAITING_CASHIER", "IN_CHECKOUT"] }, expiresAt: { lte: new Date() } },
    data: { status: "EXPIRED" },
  });
}

export async function getCounterDashboard(input: { companyId: string; userId: string; role: string }) {
  await expireCounterOrders(input.companyId);
  const [company, stores, products, pharmacists, orders] = await Promise.all([
    prisma.company.findUniqueOrThrow({ where: { id: input.companyId }, select: { settings: true } }),
    prisma.store.findMany({ where: { companyId: input.companyId, active: true }, select: { id: true, code: true, name: true, type: true }, orderBy: [{ type: "asc" }, { code: "asc" }] }),
    prisma.product.findMany({
      where: { companyId: input.companyId, active: true },
      select: {
        id: true, ean: true, name: true, laboratory: true, activeIngredient: true, salePrice: true, stockQuantity: true,
        salesStrategy: true, promotionPrice: true, strategyStartsAt: true, strategyEndsAt: true,
        controlLevel: true, requiresBuyerId: true, requiresPrescription: true, requiresPharmacist: true, retainsPrescription: true, minimumBuyerAge: true, controlRuleVersion: true, controlLegalBasis: true,
        category: { select: { name: true, ncm: true } },
        storeStockBalances: { select: { storeId: true, onHand: true, reserved: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.pharmacistCredential.findMany({
      where: { companyId: input.companyId, status: "VERIFIED", validFrom: { lte: new Date() }, OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }] },
      select: { id: true, council: true, registration: true, state: true, user: { select: { id: true, name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.counterOrder.findMany({
      where: { companyId: input.companyId, ...(input.role === "ATTENDANT" ? { attendantId: input.userId } : {}), createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      include: counterOrderInclude, orderBy: { sentAt: "desc" }, take: 80,
    }),
  ]);
  return {
    stores,
    products: products.map((product) => ({
      ...product,
      salePrice: Number(product.salePrice), promotionPrice: product.promotionPrice === null ? null : Number(product.promotionPrice), stockQuantity: Number(product.stockQuantity),
      availability: stores.map((store) => {
        const balances = product.storeStockBalances.filter((entry) => entry.storeId === store.id);
        const available = balances.length ? balances.reduce((sum, entry) => sum + availableQuantity(Number(entry.onHand), Number(entry.reserved)), 0) : Number(product.stockQuantity);
        return { storeId: store.id, available: Number(available.toFixed(3)) };
      }),
      storeStockBalances: undefined,
    })),
    pharmacists,
    orders,
    discountLimit: discountLimitForRole(input.role, company.settings),
  };
}

export async function createCounterOrder(input: {
  companyId: string; userId: string; role: string; requestId: string; storeId: string; items: CounterItemInput[];
  discountPercent: number; pharmacistCredentialId?: string | null; buyer: BuyerInput; notes?: string | null;
}) {
  const now = new Date();
  const normalizedBuyer = input.buyer?.taxId ? { taxId: onlyDigits(input.buyer.taxId), name: input.buyer.name?.trim() || null, birthDate: input.buyer.birthDate ?? null } : null;
  if (normalizedBuyer && !validateBrazilianTaxId(normalizedBuyer.taxId)) throw new Error("DOCUMENTO_DO_COMPRADOR_INVALIDO");
  return prisma.$transaction(async (tx) => {
    const [company, store, membership, pharmacistCredential] = await Promise.all([
      tx.company.findUnique({ where: { id: input.companyId }, select: { settings: true } }),
      tx.store.findFirst({ where: { id: input.storeId, companyId: input.companyId, active: true } }),
      tx.membership.findFirst({ where: { companyId: input.companyId, userId: input.userId, active: true, role: { in: ["OWNER", "ADMIN", "MANAGER", "PHARMACIST", "ATTENDANT"] }, user: { status: "ACTIVE" } }, include: { user: { select: { name: true } } } }),
      input.pharmacistCredentialId ? tx.pharmacistCredential.findFirst({ where: { id: input.pharmacistCredentialId, companyId: input.companyId, status: "VERIFIED", validFrom: { lte: now }, OR: [{ validUntil: null }, { validUntil: { gte: now } }] } }) : null,
    ]);
    if (!company || !store || !membership) throw new Error("ATENDIMENTO_DE_BALCAO_NAO_AUTORIZADO");
    if (input.pharmacistCredentialId && !pharmacistCredential) throw new Error("CREDENCIAL_FARMACEUTICA_NAO_VERIFICADA_OU_FORA_DA_VIGENCIA");
    const discountLimit = discountLimitForRole(input.role, company.settings);
    if (input.discountPercent < 0 || input.discountPercent > discountLimit) throw new Error(`DESCONTO_ACIMA_DO_LIMITE:${discountLimit.toFixed(2)}`);
    const products = await tx.product.findMany({
      where: { companyId: input.companyId, active: true, ean: { in: input.items.map((item) => item.ean) } },
      include: { storeStockBalances: { where: { storeId: input.storeId } } },
    });
    const byEan = new Map(products.map((product) => [product.ean, product]));
    const lines = input.items.map((item) => {
      const product = byEan.get(item.ean);
      if (!product) throw new Error(`PRODUTO_NAO_ENCONTRADO:${item.ean}`);
      const available = product.storeStockBalances.length
        ? product.storeStockBalances.reduce((sum, balance) => sum + availableQuantity(Number(balance.onHand), Number(balance.reserved)), 0)
        : Number(product.stockQuantity);
      if (available < item.quantity) throw new Error(`ESTOQUE_INSUFICIENTE:${item.ean}`);
      const controlPolicy = { controlLevel: product.controlLevel, requiresBuyerId: product.requiresBuyerId, requiresPrescription: product.requiresPrescription, requiresPharmacist: product.requiresPharmacist, retainsPrescription: product.retainsPrescription, minimumBuyerAge: product.minimumBuyerAge, controlRuleVersion: product.controlRuleVersion, controlLegalBasis: product.controlLegalBasis };
      const controlErrors = validateControlledSaleLine({ policy: controlPolicy, buyer: normalizedBuyer, prescription: item.prescription, hasVerifiedPharmacist: Boolean(pharmacistCredential), now });
      if (controlErrors.length) throw new Error(`ATENDIMENTO_CONTROLADO_INCOMPLETO:${item.ean}:${controlErrors.join(",")}`);
      const price = commercialPrice(product, now);
      return { product, quantity: item.quantity, prescription: item.prescription ?? null, controlPolicy, price };
    });
    const originalGross = money(lines.reduce((sum, line) => sum + line.price.list * line.quantity, 0));
    const commercialGross = money(lines.reduce((sum, line) => sum + line.price.current * line.quantity, 0));
    const gross = money(commercialGross * (1 - input.discountPercent / 100));
    const date = now.toISOString().slice(0, 10).replaceAll("-", "");
    const code = `BLC-${date}-${randomUUID().slice(0, 6).toUpperCase()}`;
    const order = await tx.counterOrder.create({
      data: {
        companyId: input.companyId, storeId: store.id, attendantId: input.userId, pharmacistCredentialId: pharmacistCredential?.id,
        code, status: "WAITING_CASHIER", customerTaxId: normalizedBuyer?.taxId, customerName: normalizedBuyer?.name, customerBirthDate: normalizedBuyer?.birthDate,
        discountPercent: input.discountPercent, originalGrossAmount: originalGross, grossAmount: gross, notes: input.notes?.trim() || null,
        expiresAt: new Date(now.getTime() + 2 * 60 * 60 * 1000),
        items: { create: lines.map((line) => ({
          productId: line.product.id, ean: line.product.ean, productName: line.product.name, quantity: line.quantity,
          listUnitPrice: line.price.list, commercialUnitPrice: line.price.current,
          prescription: json(line.prescription ?? {}), controlSnapshot: json(line.controlPolicy),
        })) },
      },
      include: counterOrderInclude,
    });
    await tx.auditLog.create({ data: { companyId: input.companyId, userId: input.userId, action: "SEND", entity: "COUNTER_ORDER", entityId: order.id, requestId: input.requestId, after: json({ code, storeId: store.id, itemCount: lines.length, grossAmount: gross, discountPercent: input.discountPercent, customerIdentified: Boolean(normalizedBuyer), pharmacistCredentialId: pharmacistCredential?.id ?? null }) } });
    return order;
  }, { isolationLevel: "Serializable" });
}

export async function listCashierQueue(companyId: string) {
  await expireCounterOrders(companyId);
  return prisma.counterOrder.findMany({
    where: { companyId, status: { in: ["WAITING_CASHIER", "IN_CHECKOUT"] }, expiresAt: { gt: new Date() } },
    include: counterOrderInclude, orderBy: [{ status: "asc" }, { sentAt: "asc" }], take: 100,
  });
}

export async function claimCounterOrder(input: { companyId: string; orderId: string; cashSessionId: string; userId: string; requestId: string }) {
  return prisma.$transaction(async (tx) => {
    const session = await tx.cashSession.findFirst({ where: { id: input.cashSessionId, companyId: input.companyId, status: "OPEN" } });
    if (!session) throw new Error("SESSAO_CAIXA_NAO_ENCONTRADA_OU_FECHADA");
    const order = await tx.counterOrder.findFirst({ where: { id: input.orderId, companyId: input.companyId, status: { in: ["WAITING_CASHIER", "IN_CHECKOUT"] }, expiresAt: { gt: new Date() } }, include: counterOrderInclude });
    if (!order) throw new Error("PRE_VENDA_NAO_ENCONTRADA_OU_EXPIRADA");
    if (order.storeId !== session.storeId) throw new Error("PRE_VENDA_DE_OUTRA_LOJA");
    if (order.status === "IN_CHECKOUT" && order.cashSessionId !== session.id) throw new Error("PRE_VENDA_JA_ASSUMIDA_EM_OUTRO_CAIXA");
    const saved = order.status === "IN_CHECKOUT" ? order : await tx.counterOrder.update({ where: { id: order.id }, data: { status: "IN_CHECKOUT", cashSessionId: session.id, claimedById: input.userId, claimedAt: new Date() }, include: counterOrderInclude });
    if (order.status !== "IN_CHECKOUT") await tx.auditLog.create({ data: { companyId: input.companyId, userId: input.userId, action: "CLAIM", entity: "COUNTER_ORDER", entityId: order.id, requestId: input.requestId, after: { cashSessionId: session.id } } });
    return saved;
  });
}

export async function cancelCounterOrder(input: { companyId: string; orderId: string; userId: string; role: string; requestId: string }) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.counterOrder.findFirst({ where: { id: input.orderId, companyId: input.companyId, status: { in: ["WAITING_CASHIER", "IN_CHECKOUT"] } } });
    if (!order) throw new Error("PRE_VENDA_NAO_ENCONTRADA");
    if (order.attendantId !== input.userId && !["OWNER", "ADMIN", "MANAGER"].includes(input.role)) throw new Error("PRE_VENDA_NAO_PODE_SER_CANCELADA_POR_ESTE_USUARIO");
    const saved = await tx.counterOrder.update({ where: { id: order.id }, data: { status: "CANCELLED", cancelledAt: new Date() }, include: counterOrderInclude });
    await tx.auditLog.create({ data: { companyId: input.companyId, userId: input.userId, action: "CANCEL", entity: "COUNTER_ORDER", entityId: order.id, requestId: input.requestId } });
    return saved;
  });
}

export async function getCounterOrderSalePayload(input: { companyId: string; orderId: string; cashSessionId: string }) {
  const order = await prisma.counterOrder.findFirst({
    where: { id: input.orderId, companyId: input.companyId, cashSessionId: input.cashSessionId, status: "IN_CHECKOUT", expiresAt: { gt: new Date() } },
    include: { items: true },
  });
  if (!order) throw new Error("PRE_VENDA_NAO_ASSUMIDA_NESTE_CAIXA");
  return {
    counterOrderId: order.id,
    sellerId: order.attendantId,
    pharmacistCredentialId: order.pharmacistCredentialId,
    discountPercent: Number(order.discountPercent),
    buyer: order.customerTaxId ? { taxId: order.customerTaxId, name: order.customerName, birthDate: order.customerBirthDate } : null,
    items: order.items.map((item) => {
      const prescription = item.prescription && typeof item.prescription === "object" && Object.keys(item.prescription as object).length ? item.prescription as unknown as PrescriptionContext : null;
      return { ean: item.ean, quantidade: Number(item.quantity), prescricao: prescription };
    }),
  };
}
