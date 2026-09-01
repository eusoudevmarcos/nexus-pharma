import { createHash } from "node:crypto";
import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../infra/prisma.js";

const asJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const number = (value: unknown) => Number(value ?? 0);

type CategoryWithRules = Awaited<ReturnType<typeof loadCategory>>;

async function loadCategory(companyId: string, categoryId: string) {
  return prisma.fiscalCategory.findFirst({
    where: { id: categoryId, companyId },
    include: { rules: { orderBy: { regime: "asc" } }, products: { select: { id: true, ean: true, name: true, stockQuantity: true, currentCost: true, salePrice: true }, orderBy: { id: "asc" } } },
  });
}

function snapshot(category: NonNullable<CategoryWithRules>) {
  return {
    id: category.id, code: category.code, name: category.name, ncm: category.ncm, cest: category.cest, classification: category.classification,
    ruleVersion: category.ruleVersion, validFrom: category.validFrom, validUntil: category.validUntil, status: category.status,
    rules: category.rules.map((rule) => ({
      regime: rule.regime, cfop: rule.cfop, cstIcms: rule.cstIcms, csosn: rule.csosn, icmsRate: number(rule.icmsRate), mvaRate: number(rule.mvaRate),
      cstPisCofins: rule.cstPisCofins, revenueNature: rule.revenueNature, pisRate: number(rule.pisRate), cofinsRate: number(rule.cofinsRate),
      cstIbsCbs: rule.cstIbsCbs, cClassTrib: rule.cClassTrib, cbsRate: number(rule.cbsRate), ibsRate: number(rule.ibsRate), cbsReduction: number(rule.cbsReduction), ibsReduction: number(rule.ibsReduction),
    })),
  };
}

function differences(source: ReturnType<typeof snapshot>, target: ReturnType<typeof snapshot>) {
  const result: Array<{ scope: string; field: string; before: unknown; after: unknown }> = [];
  for (const field of ["ncm", "cest", "classification", "ruleVersion", "validFrom", "validUntil"] as const) {
    if (String(source[field] ?? "") !== String(target[field] ?? "")) result.push({ scope: "Categoria", field, before: source[field], after: target[field] });
  }
  const targetRules = new Map(target.rules.map((rule) => [rule.regime, rule]));
  for (const current of source.rules) {
    const next = targetRules.get(current.regime); if (!next) continue;
    for (const field of ["cfop", "cstIcms", "csosn", "icmsRate", "mvaRate", "cstPisCofins", "revenueNature", "pisRate", "cofinsRate", "cstIbsCbs", "cClassTrib", "cbsRate", "ibsRate", "cbsReduction", "ibsReduction"] as const) {
      if (String(current[field] ?? "") !== String(next[field] ?? "")) result.push({ scope: current.regime, field, before: current[field], after: next[field] });
    }
  }
  return result;
}

export async function simulateFiscalPropagation(input: { companyId: string; sourceCategoryId: string; targetCategoryId: string; userId: string; requestId?: string }) {
  if (input.sourceCategoryId === input.targetCategoryId) throw new Error("CATEGORIAS_DE_ORIGEM_E_DESTINO_DEVEM_SER_DIFERENTES");
  const [source, target] = await Promise.all([loadCategory(input.companyId, input.sourceCategoryId), loadCategory(input.companyId, input.targetCategoryId)]);
  if (!source || !target) throw new Error("CATEGORIA_DA_SIMULACAO_NAO_ENCONTRADA");
  if (!target.active || target.status !== "APPROVED") throw new Error("REGRA_DE_DESTINO_PRECISA_ESTAR_ATIVA_E_APROVADA");
  if (!source.products.length) throw new Error("CATEGORIA_DE_ORIGEM_NAO_POSSUI_PRODUTOS");
  const sourceSnapshot = snapshot(source); const targetSnapshot = snapshot(target); const diff = differences(sourceSnapshot, targetSnapshot);
  if (!diff.length) throw new Error("VERSOES_FISCAIS_NAO_POSSUEM_DIFERENCAS");
  const productIds = source.products.map((product) => product.id);
  const baseHash = hash({ source: sourceSnapshot, target: targetSnapshot, productIds });
  const impact = {
    productCount: source.products.length,
    stockQuantity: source.products.reduce((total, product) => total + number(product.stockQuantity), 0),
    inventoryCost: source.products.reduce((total, product) => total + number(product.stockQuantity) * number(product.currentCost), 0),
    inventorySaleValue: source.products.reduce((total, product) => total + number(product.stockQuantity) * number(product.salePrice), 0),
    fieldsChanged: diff.length,
    sampleProducts: source.products.slice(0, 20).map((product) => ({ id: product.id, ean: product.ean, name: product.name })),
  };
  return prisma.$transaction(async (tx) => {
    const proposal = await tx.fiscalPropagationProposal.create({ data: { companyId: input.companyId, sourceCategoryId: source.id, targetCategoryId: target.id, createdById: input.userId, baseHash, sourceSnapshot: asJson(sourceSnapshot), targetSnapshot: asJson(targetSnapshot), differences: asJson(diff), impactSummary: asJson(impact) }, include: { sourceCategory: true, targetCategory: true, createdBy: { select: { id: true, name: true } } } });
    await tx.auditLog.create({ data: { companyId: input.companyId, userId: input.userId, action: "FISCAL_PROPAGATION_SIMULATED", entity: "FiscalPropagationProposal", entityId: proposal.id, requestId: input.requestId, after: asJson({ sourceCategoryId: source.id, targetCategoryId: target.id, baseHash, impact }) } });
    return proposal;
  });
}

export async function listFiscalPropagations(companyId: string) {
  return prisma.fiscalPropagationProposal.findMany({
    where: { companyId }, include: { sourceCategory: { select: { id: true, code: true, name: true, ruleVersion: true, ncm: true } }, targetCategory: { select: { id: true, code: true, name: true, ruleVersion: true, ncm: true } }, createdBy: { select: { id: true, name: true } }, reviewedBy: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" }, take: 50,
  });
}

export async function submitFiscalPropagation(input: { companyId: string; proposalId: string; userId: string; requestId?: string }) {
  const proposal = await prisma.fiscalPropagationProposal.findFirst({ where: { id: input.proposalId, companyId: input.companyId } });
  if (!proposal) throw new Error("SIMULACAO_FISCAL_NAO_ENCONTRADA");
  if (proposal.createdById !== input.userId) throw new Error("SOMENTE_O_CRIADOR_PODE_ENVIAR_A_SIMULACAO");
  if (proposal.status !== "VALIDATED") throw new Error("SIMULACAO_FISCAL_NAO_ESTA_VALIDADA");
  return prisma.$transaction(async (tx) => {
    const updated = await tx.fiscalPropagationProposal.update({ where: { id: proposal.id }, data: { status: "PENDING_APPROVAL", submittedAt: new Date() } });
    await tx.auditLog.create({ data: { companyId: input.companyId, userId: input.userId, action: "FISCAL_PROPAGATION_SUBMITTED", entity: "FiscalPropagationProposal", entityId: proposal.id, requestId: input.requestId } }); return updated;
  });
}

export async function reviewFiscalPropagation(input: { companyId: string; proposalId: string; userId: string; decision: "APPROVED" | "REJECTED"; reason?: string | null; requestId?: string }) {
  const proposal = await prisma.fiscalPropagationProposal.findFirst({ where: { id: input.proposalId, companyId: input.companyId } });
  if (!proposal) throw new Error("SIMULACAO_FISCAL_NAO_ENCONTRADA");
  if (proposal.status !== "PENDING_APPROVAL") throw new Error("SIMULACAO_FISCAL_NAO_AGUARDA_APROVACAO");
  if (proposal.createdById === input.userId) throw new Error("QUATRO_OLHOS_EXIGE_OUTRO_USUARIO");
  if (input.decision === "REJECTED") {
    if ((input.reason?.trim().length ?? 0) < 10) throw new Error("REJEICAO_EXIGE_JUSTIFICATIVA");
    return prisma.$transaction(async (tx) => {
      const rejected = await tx.fiscalPropagationProposal.update({ where: { id: proposal.id }, data: { status: "REJECTED", reviewedById: input.userId, reviewedAt: new Date(), rejectionReason: input.reason } });
      await tx.auditLog.create({ data: { companyId: input.companyId, userId: input.userId, action: "FISCAL_PROPAGATION_REJECTED", entity: "FiscalPropagationProposal", entityId: proposal.id, requestId: input.requestId, after: asJson({ reason: input.reason }) } }); return rejected;
    });
  }
  const [source, target] = await Promise.all([loadCategory(input.companyId, proposal.sourceCategoryId), loadCategory(input.companyId, proposal.targetCategoryId)]);
  if (!source || !target || !target.active || target.status !== "APPROVED") throw new Error("CATEGORIAS_MUDARAM_DESDE_A_SIMULACAO");
  const currentHash = hash({ source: snapshot(source), target: snapshot(target), productIds: source.products.map((product) => product.id) });
  if (currentHash !== proposal.baseHash) throw new Error("BASE_FISCAL_OU_PRODUTOS_MUDARAM_REFAÇA_A_SIMULACAO");
  return prisma.$transaction(async (tx) => {
    const changed = await tx.product.updateMany({ where: { companyId: input.companyId, categoryId: source.id }, data: { categoryId: target.id } });
    const applied = await tx.fiscalPropagationProposal.update({ where: { id: proposal.id }, data: { status: "APPLIED", reviewedById: input.userId, reviewedAt: new Date(), appliedAt: new Date() } });
    await tx.auditLog.create({ data: { companyId: input.companyId, userId: input.userId, action: "FISCAL_PROPAGATION_APPROVED_AND_APPLIED", entity: "FiscalPropagationProposal", entityId: proposal.id, requestId: input.requestId, after: asJson({ changedProducts: changed.count, sourceCategoryId: source.id, targetCategoryId: target.id, creatorId: proposal.createdById }) } }); return applied;
  });
}
