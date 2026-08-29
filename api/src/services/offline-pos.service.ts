import { createHash } from "node:crypto";
import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../infra/prisma.js";
import { processarVenda } from "./processar-venda.service.js";

const toJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

type OfflineProduct = {
  ean: string;
  name: string;
  available: number;
  listPrice: number;
  commercialPrice: number;
  fiscalFingerprint: string;
  allowedOffline: boolean;
  blockReason: string | null;
  category: { code: string; name: string; ncm: string; ruleVersion: string };
};

export type OfflineSnapshotPayload = {
  schema: "NEXUS_POS_OFFLINE_V1";
  generatedAt: string;
  expiresAt: string;
  companyId: string;
  pointOfSaleId: string;
  cashSessionId: string;
  operatorId: string;
  products: OfflineProduct[];
};

export type OfflineSalePayload = {
  modelo_nota: "65";
  sessao_caixa_id: string;
  desconto_percentual: number;
  vendedor_id: string | null;
  consumidor: { documento: string; nome: string | null; data_nascimento: string | null } | null;
  itens: Array<{ ean: string; quantidade: number }>;
  pagamentos: Array<{ metodo: "CASH"; valor: number; referencia_externa: string | null }>;
};

function configuredTtlMinutes(settings: unknown) {
  const raw = settings && typeof settings === "object" ? Number((settings as { offlineSnapshotTtlMinutes?: unknown }).offlineSnapshotTtlMinutes) : 60;
  return Number.isFinite(raw) ? Math.max(15, Math.min(480, Math.trunc(raw))) : 60;
}

async function buildProducts(companyId: string, storeId: string, at: Date) {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { taxRegime: true } });
  const balances = await prisma.storeStockBalance.findMany({
    where: { storeId, product: { companyId, active: true } },
    include: { product: { include: { category: { include: { rules: true } } } } },
    orderBy: { product: { name: "asc" } },
  });
  return balances.map((balance): OfflineProduct => {
    const product = balance.product;
    const category = product.category;
    const rule = category.rules.find((entry) => entry.regime === company.taxRegime);
    const available = Math.max(0, Number(balance.onHand) - Number(balance.reserved));
    const promotionActive = product.salesStrategy === "PROMOTION" && product.promotionPrice !== null
      && (!product.strategyStartsAt || product.strategyStartsAt <= at)
      && (!product.strategyEndsAt || product.strategyEndsAt >= at);
    const commercialPrice = promotionActive ? Number(product.promotionPrice) : Number(product.salePrice);
    const controlled = product.controlLevel !== "NONE" || product.requiresBuyerId || product.requiresPrescription || product.requiresPharmacist;
    const categoryValid = category.active && category.status === "APPROVED" && category.validFrom <= at && (!category.validUntil || category.validUntil >= at);
    const blockReason = controlled ? "PRODUTO_CONTROLADO_EXIGE_CONEXAO" : !categoryValid ? "CATEGORIA_FISCAL_FORA_DA_VIGENCIA" : !rule ? "REGRA_FISCAL_INCOMPLETA" : available <= 0 ? "SEM_SALDO_OFFLINE" : null;
    const fiscalFingerprint = hash({
      ean: product.ean,
      listPrice: Number(product.salePrice),
      commercialPrice,
      strategy: product.salesStrategy,
      category: { id: category.id, code: category.code, ncm: category.ncm, ruleVersion: category.ruleVersion },
      rule: rule ? { regime: rule.regime, cfop: rule.cfop, cstIcms: rule.cstIcms, csosn: rule.csosn, icmsRate: Number(rule.icmsRate), cstPis: rule.cstPis, cstCofins: rule.cstCofins, revenueNature: rule.revenueNature, pisRate: Number(rule.pisRate), cofinsRate: Number(rule.cofinsRate), cstIbsCbs: rule.cstIbsCbs, cClassTrib: rule.cClassTrib, cbsRate: Number(rule.cbsRate), ibsRate: Number(rule.ibsRate), cbsReduction: Number(rule.cbsReduction), ibsReduction: Number(rule.ibsReduction) } : null,
    });
    return { ean: product.ean, name: product.name, available, listPrice: money(Number(product.salePrice)), commercialPrice: money(commercialPrice), fiscalFingerprint, allowedOffline: blockReason === null, blockReason, category: { code: category.code, name: category.name, ncm: category.ncm, ruleVersion: category.ruleVersion } };
  });
}

export async function registerPosDevice(input: { companyId: string; pointOfSaleId: string; installationId: string; name: string; userId: string; requestId: string }) {
  const pointOfSale = await prisma.pointOfSale.findFirst({ where: { id: input.pointOfSaleId, active: true, store: { companyId: input.companyId, active: true } } });
  if (!pointOfSale) throw new Error("PDV_ATIVO_NAO_ENCONTRADO");
  const existing = await prisma.posDevice.findUnique({ where: { companyId_installationId: { companyId: input.companyId, installationId: input.installationId } } });
  if (existing && existing.status !== "ACTIVE") throw new Error("DISPOSITIVO_OFFLINE_BLOQUEADO");
  const device = existing
    ? await prisma.posDevice.update({ where: { id: existing.id }, data: { pointOfSaleId: pointOfSale.id, name: input.name, lastSeenAt: new Date() } })
    : await prisma.posDevice.create({ data: { companyId: input.companyId, pointOfSaleId: pointOfSale.id, installationId: input.installationId, name: input.name, registeredById: input.userId } });
  await prisma.auditLog.create({ data: { companyId: input.companyId, userId: input.userId, action: existing ? "UPDATE" : "CREATE", entity: "POS_DEVICE", entityId: device.id, requestId: input.requestId, after: toJson({ pointOfSaleId: device.pointOfSaleId, name: device.name, status: device.status }) } });
  return device;
}

export async function createOfflineSnapshot(input: { companyId: string; pointOfSaleId: string; deviceId: string; userId: string; requestId: string }) {
  const device = await prisma.posDevice.findFirst({ where: { id: input.deviceId, companyId: input.companyId, pointOfSaleId: input.pointOfSaleId, status: "ACTIVE" }, include: { pointOfSale: { include: { store: true } }, company: { select: { settings: true } } } });
  if (!device) throw new Error("DISPOSITIVO_OFFLINE_NAO_AUTORIZADO");
  const cashSession = await prisma.cashSession.findFirst({ where: { companyId: input.companyId, pointOfSaleId: input.pointOfSaleId, status: "OPEN" } });
  if (!cashSession) throw new Error("SESSAO_CAIXA_NAO_ENCONTRADA_OU_FECHADA");
  const generatedAt = new Date();
  const plannedBoundaries = await prisma.product.findMany({ where: { companyId: input.companyId, active: true }, select: { strategyStartsAt: true, strategyEndsAt: true, category: { select: { validUntil: true } } } });
  const defaultExpiry = new Date(generatedAt.getTime() + configuredTtlMinutes(device.company.settings) * 60_000);
  const nextBoundary = plannedBoundaries.flatMap((entry) => [entry.strategyStartsAt, entry.strategyEndsAt, entry.category.validUntil]).filter((value): value is Date => Boolean(value && value > generatedAt)).sort((left, right) => left.getTime() - right.getTime())[0];
  const expiresAt = nextBoundary && nextBoundary < defaultExpiry ? nextBoundary : defaultExpiry;
  const products = await buildProducts(input.companyId, device.pointOfSale.storeId, generatedAt);
  const payload: OfflineSnapshotPayload = { schema: "NEXUS_POS_OFFLINE_V1", generatedAt: generatedAt.toISOString(), expiresAt: expiresAt.toISOString(), companyId: input.companyId, pointOfSaleId: input.pointOfSaleId, cashSessionId: cashSession.id, operatorId: input.userId, products };
  const payloadHash = hash(payload);
  const snapshot = await prisma.offlinePosSnapshot.create({ data: { companyId: input.companyId, pointOfSaleId: input.pointOfSaleId, cashSessionId: cashSession.id, deviceId: device.id, createdById: input.userId, version: payloadHash, payload: toJson(payload), payloadHash, validFrom: generatedAt, expiresAt } });
  await prisma.posDevice.update({ where: { id: device.id }, data: { lastSeenAt: generatedAt } });
  await prisma.auditLog.create({ data: { companyId: input.companyId, userId: input.userId, action: "CREATE", entity: "OFFLINE_POS_SNAPSHOT", entityId: snapshot.id, requestId: input.requestId, after: toJson({ version: payloadHash, expiresAt, products: products.length, allowed: products.filter((entry) => entry.allowedOffline).length }) } });
  return { snapshot: { id: snapshot.id, version: snapshot.version, validFrom: snapshot.validFrom, expiresAt: snapshot.expiresAt }, payload };
}

export async function synchronizeOfflineSales(input: { companyId: string; deviceId: string; snapshotId: string; userId: string; actorRole: string; requestId: string; commands: Array<{ id: string; occurredAt: Date; payload: OfflineSalePayload }> }) {
  const snapshot = await prisma.offlinePosSnapshot.findFirst({ where: { id: input.snapshotId, companyId: input.companyId, deviceId: input.deviceId }, include: { device: true, cashSession: true } });
  if (!snapshot || snapshot.device.status !== "ACTIVE") throw new Error("SNAPSHOT_OFFLINE_NAO_AUTORIZADO");
  const storedPayload = snapshot.payload as unknown as OfflineSnapshotPayload;
  if (hash(storedPayload) !== snapshot.payloadHash) throw new Error("SNAPSHOT_OFFLINE_CORROMPIDO");
  const snapshotProducts = new Map(storedPayload.products.map((entry) => [entry.ean, entry]));
  const results: Array<{ id: string; status: string; saleId?: string; error?: string }> = [];
  for (const command of input.commands) {
    const payloadHash = hash(command.payload);
    const existing = await prisma.offlinePosCommand.findUnique({ where: { id: command.id } });
    if (existing) {
      results.push({ id: command.id, status: existing.payloadHash === payloadHash ? existing.status : "REJECTED", saleId: existing.saleId ?? undefined, error: existing.payloadHash === payloadHash ? existing.errorCode ?? undefined : "IDEMPOTENCY_PAYLOAD_DIVERGENTE" });
      continue;
    }
    let errorCode: string | null = null;
    if (command.occurredAt < snapshot.validFrom || command.occurredAt > snapshot.expiresAt || command.occurredAt > new Date(Date.now() + 300_000)) errorCode = "COMANDO_FORA_DA_VIGENCIA_DO_SNAPSHOT";
    if (command.payload.sessao_caixa_id !== snapshot.cashSessionId) errorCode = "SESSAO_DIVERGE_DO_SNAPSHOT";
    if (command.payload.pagamentos.some((payment) => payment.metodo !== "CASH")) errorCode = "PAGAMENTO_OFFLINE_NAO_SUPORTADO";
    const chosen = command.payload.itens.map((item) => ({ item, snapshot: snapshotProducts.get(item.ean) }));
    if (chosen.some((entry) => !entry.snapshot?.allowedOffline)) errorCode = "PRODUTO_NAO_HABILITADO_OFFLINE";
    const currentProducts = await buildProducts(input.companyId, snapshot.cashSession.storeId, command.occurredAt);
    const currentByEan = new Map(currentProducts.map((entry) => [entry.ean, entry]));
    if (chosen.some((entry) => entry.snapshot?.fiscalFingerprint !== currentByEan.get(entry.item.ean)?.fiscalFingerprint)) errorCode = "CATALOGO_OU_REGRA_ALTERADA_DESDE_O_SNAPSHOT";
    await prisma.offlinePosCommand.create({ data: { id: command.id, companyId: input.companyId, deviceId: input.deviceId, snapshotId: snapshot.id, cashSessionId: snapshot.cashSessionId, submittedById: input.userId, type: "SALE", status: errorCode ? "REJECTED" : "PROCESSING", payload: toJson(command.payload), payloadHash, errorCode, occurredAt: command.occurredAt, processedAt: errorCode ? new Date() : null } });
    if (errorCode) { results.push({ id: command.id, status: "REJECTED", error: errorCode }); continue; }
    try {
      const sale = await processarVenda({ empresaId: input.companyId, usuarioId: input.userId, requestId: `${input.requestId}:${command.id}`, idempotencyKey: command.id, modeloNota: "65", tipoOperacao: "REVENDA_INTERNA", itens: command.payload.itens, cashSessionId: snapshot.cashSessionId, pagamentos: command.payload.pagamentos.map((entry) => ({ metodo: entry.metodo, valor: entry.valor, referenciaExterna: entry.referencia_externa })), actorRole: input.actorRole, discountPercent: command.payload.desconto_percentual, sellerId: command.payload.vendedor_id, buyer: command.payload.consumidor ? { taxId: command.payload.consumidor.documento, name: command.payload.consumidor.nome, birthDate: command.payload.consumidor.data_nascimento ? new Date(command.payload.consumidor.data_nascimento) : null } : null, operationAt: command.occurredAt });
      await prisma.offlinePosCommand.update({ where: { id: command.id }, data: { status: "APPLIED", saleId: sale.vendaId, processedAt: new Date(), errorCode: null } });
      results.push({ id: command.id, status: "APPLIED", saleId: sale.vendaId });
    } catch (cause) {
      const message = (cause instanceof Error ? cause.message : "CONFLITO_OFFLINE").slice(0, 500);
      await prisma.offlinePosCommand.update({ where: { id: command.id }, data: { status: "CONFLICT", errorCode: message, processedAt: new Date() } });
      results.push({ id: command.id, status: "CONFLICT", error: message });
    }
  }
  await prisma.posDevice.update({ where: { id: input.deviceId }, data: { lastSeenAt: new Date(), lastSynchronizedAt: new Date() } });
  await prisma.auditLog.create({ data: { companyId: input.companyId, userId: input.userId, action: "SYNC", entity: "OFFLINE_POS_COMMAND", requestId: input.requestId, after: toJson({ snapshotId: snapshot.id, received: input.commands.length, results }) } });
  return { synchronizedAt: new Date(), results };
}
