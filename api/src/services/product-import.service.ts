import { createHash } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../infra/prisma.js";

const asJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const text = (value: unknown) => String(value ?? "").trim();
const number = (value: unknown) => {
  if (typeof value === "number") return value;
  const normalized = text(value).replace(/\s/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  return normalized === "" ? 0 : Number(normalized);
};
const boolean = (value: unknown) => !["0", "false", "não", "nao", "inativo"].includes(text(value).toLowerCase());

const normalizedRowSchema = z.object({
  gtin: z.string(), nome: z.string(), categoriaCodigo: z.string(), fabricante: z.string(), fornecedorCnpj: z.string(),
  registroAnvisa: z.string(), composicao: z.string(), principioAtivo: z.string(), custo: z.number(), precoVenda: z.number(),
  estoqueMinimo: z.number(), mediaVendaDiaria: z.number(), ativo: z.boolean(),
});
type NormalizedRow = z.infer<typeof normalizedRowSchema>;

function validGtin(value: string) {
  if (![8, 12, 13, 14].includes(value.length) || !/^\d+$/.test(value)) return false;
  const body = value.slice(0, -1).split("").reverse();
  const sum = body.reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === Number(value.at(-1));
}

function normalizeRow(row: Record<string, unknown>): NormalizedRow {
  return {
    gtin: digits(row.gtin), nome: text(row.nome), categoriaCodigo: text(row.categoria_codigo).toUpperCase(),
    fabricante: text(row.fabricante), fornecedorCnpj: digits(row.fornecedor_cnpj), registroAnvisa: digits(row.registro_anvisa),
    composicao: text(row.composicao), principioAtivo: text(row.principio_ativo), custo: number(row.custo),
    precoVenda: number(row.preco_venda), estoqueMinimo: number(row.estoque_minimo), mediaVendaDiaria: number(row.media_venda_diaria),
    ativo: boolean(row.ativo),
  };
}

export const productImportTemplateHeaders = [
  "gtin", "nome", "categoria_codigo", "fabricante", "fornecedor_cnpj", "registro_anvisa", "composicao",
  "principio_ativo", "custo", "preco_venda", "estoque_minimo", "media_venda_diaria", "ativo",
];

export async function previewProductImport(input: {
  companyId: string; userId: string; fileName: string; fileType: string; rows: Array<Record<string, unknown>>; requestId?: string;
}) {
  if (input.rows.length < 1 || input.rows.length > 1000) throw new Error("IMPORTACAO_DEVE_TER_ENTRE_1_E_1000_LINHAS");
  const payloadHash = createHash("sha256").update(JSON.stringify(input.rows)).digest("hex");
  const duplicateBatch = await prisma.productImportBatch.findFirst({
    where: { companyId: input.companyId, payloadHash, status: { in: ["PENDING_APPROVAL", "APPLIED"] } }, select: { id: true, status: true },
  });
  if (duplicateBatch) throw new Error(`IMPORTACAO_DUPLICADA_${duplicateBatch.status}`);

  const [categories, suppliers, products] = await Promise.all([
    prisma.fiscalCategory.findMany({ where: { companyId: input.companyId }, select: { id: true, code: true, name: true, ncm: true, status: true, active: true, ruleVersion: true } }),
    prisma.supplier.findMany({ where: { companyId: input.companyId }, select: { id: true, taxId: true, tradeName: true, status: true } }),
    prisma.product.findMany({ where: { companyId: input.companyId }, select: { id: true, ean: true, name: true, categoryId: true, currentCost: true, salePrice: true } }),
  ]);
  const categoryByCode = new Map(categories.map((entry) => [entry.code.toUpperCase(), entry]));
  const supplierByTaxId = new Map(suppliers.map((entry) => [entry.taxId, entry]));
  const productByGtin = new Map(products.map((entry) => [entry.ean, entry]));
  const seenGtins = new Set<string>();
  const analyzed = input.rows.map((raw, index) => {
    const normalized = normalizeRow(raw);
    const errors: string[] = [];
    const warnings: string[] = [];
    const category = categoryByCode.get(normalized.categoriaCodigo);
    const supplier = normalized.fornecedorCnpj ? supplierByTaxId.get(normalized.fornecedorCnpj) : null;
    const existing = productByGtin.get(normalized.gtin);
    if (!validGtin(normalized.gtin)) errors.push("GTIN inválido ou com dígito verificador incorreto");
    if (seenGtins.has(normalized.gtin)) errors.push("GTIN repetido no mesmo arquivo");
    seenGtins.add(normalized.gtin);
    if (normalized.nome.length < 2 || normalized.nome.length > 180) errors.push("Nome deve ter entre 2 e 180 caracteres");
    if (!category) errors.push("Categoria fiscal não encontrada pelo código");
    else if (!category.active || category.status !== "APPROVED") errors.push("Categoria fiscal precisa estar ativa e aprovada");
    if (normalized.fornecedorCnpj && !supplier) errors.push("Fornecedor não encontrado pelo CNPJ");
    else if (supplier && supplier.status !== "ACTIVE") errors.push("Fornecedor informado não está ativo");
    if (![normalized.custo, normalized.precoVenda, normalized.estoqueMinimo, normalized.mediaVendaDiaria].every(Number.isFinite)) errors.push("Campos numéricos possuem valor inválido");
    if (normalized.custo < 0 || normalized.precoVenda < 0 || normalized.estoqueMinimo < 0 || normalized.mediaVendaDiaria < 0) errors.push("Custo, preço e quantidades não podem ser negativos");
    if (normalized.precoVenda > 0 && normalized.precoVenda <= normalized.custo) warnings.push("Preço de venda não produz margem bruta positiva");
    if (!normalized.registroAnvisa && category && /medic/i.test(`${category.name} ${normalized.nome}`)) warnings.push("Produto com indício de medicamento sem registro ANVISA informado");
    if (!normalized.composicao) warnings.push("Composição não informada");
    return { rowNumber: index + 2, raw, normalized, errors, warnings, action: existing ? "UPDATE" as const : "CREATE" as const, existing, category, supplier };
  });
  const validRowCount = analyzed.filter((entry) => entry.errors.length === 0).length;
  const errorRowCount = analyzed.length - validRowCount;
  const creates = analyzed.filter((entry) => entry.action === "CREATE").length;
  const updates = analyzed.length - creates;
  const marginBefore = analyzed.reduce((total, entry) => total + Math.max(0, Number(entry.existing?.salePrice ?? 0) - Number(entry.existing?.currentCost ?? 0)), 0);
  const marginAfter = analyzed.reduce((total, entry) => total + Math.max(0, entry.normalized.precoVenda - entry.normalized.custo), 0);

  return prisma.$transaction(async (tx) => {
    const batch = await tx.productImportBatch.create({
      data: {
        companyId: input.companyId, createdById: input.userId, fileName: input.fileName.slice(0, 255), fileType: input.fileType.slice(0, 12),
        payloadHash, rowCount: analyzed.length, validRowCount, errorRowCount,
        summary: asJson({ creates, updates, categoriesAffected: new Set(analyzed.map((entry) => entry.category?.id).filter(Boolean)).size, suppliersAffected: new Set(analyzed.map((entry) => entry.supplier?.id).filter(Boolean)).size, estimatedUnitMarginBefore: marginBefore, estimatedUnitMarginAfter: marginAfter }),
        rows: { create: analyzed.map((entry) => ({ rowNumber: entry.rowNumber, action: entry.action, existingProductId: entry.existing?.id, rawData: asJson(entry.raw), normalizedData: asJson(entry.normalized), errors: asJson(entry.errors), warnings: asJson(entry.warnings) })) },
      },
      include: { rows: { orderBy: { rowNumber: "asc" } }, createdBy: { select: { name: true } } },
    });
    await tx.auditLog.create({ data: { companyId: input.companyId, userId: input.userId, action: "PRODUCT_IMPORT_PREVIEWED", entity: "ProductImportBatch", entityId: batch.id, requestId: input.requestId, after: asJson({ payloadHash, rowCount: analyzed.length, validRowCount, errorRowCount, creates, updates }) } });
    return batch;
  });
}

export async function listProductImports(companyId: string) {
  return prisma.productImportBatch.findMany({
    where: { companyId },
    include: {
      createdBy: { select: { id: true, name: true } }, reviewedBy: { select: { id: true, name: true } },
      rows: { orderBy: { rowNumber: "asc" }, take: 100 },
    },
    orderBy: { createdAt: "desc" }, take: 30,
  });
}

export async function submitProductImport(input: { companyId: string; batchId: string; userId: string; requestId?: string }) {
  const batch = await prisma.productImportBatch.findFirst({ where: { id: input.batchId, companyId: input.companyId } });
  if (!batch) throw new Error("IMPORTACAO_NAO_ENCONTRADA");
  if (batch.createdById !== input.userId) throw new Error("SOMENTE_O_CRIADOR_PODE_ENVIAR_A_IMPORTACAO");
  if (batch.status !== "VALIDATED") throw new Error("IMPORTACAO_NAO_ESTA_VALIDADA");
  if (batch.errorRowCount > 0) throw new Error("IMPORTACAO_POSSUI_LINHAS_COM_ERRO");
  return prisma.$transaction(async (tx) => {
    const updated = await tx.productImportBatch.update({ where: { id: batch.id }, data: { status: "PENDING_APPROVAL", submittedAt: new Date() } });
    await tx.auditLog.create({ data: { companyId: input.companyId, userId: input.userId, action: "PRODUCT_IMPORT_SUBMITTED", entity: "ProductImportBatch", entityId: batch.id, requestId: input.requestId } });
    return updated;
  });
}

export async function reviewProductImport(input: { companyId: string; batchId: string; userId: string; decision: "APPROVED" | "REJECTED"; reason?: string | null; requestId?: string }) {
  const batch = await prisma.productImportBatch.findFirst({ where: { id: input.batchId, companyId: input.companyId }, include: { rows: { orderBy: { rowNumber: "asc" } } } });
  if (!batch) throw new Error("IMPORTACAO_NAO_ENCONTRADA");
  if (batch.status !== "PENDING_APPROVAL") throw new Error("IMPORTACAO_NAO_AGUARDA_APROVACAO");
  if (batch.createdById === input.userId) throw new Error("QUATRO_OLHOS_EXIGE_OUTRO_USUARIO");
  if (input.decision === "REJECTED") {
    if ((input.reason?.trim().length ?? 0) < 10) throw new Error("REJEICAO_EXIGE_JUSTIFICATIVA");
    return prisma.$transaction(async (tx) => {
      const rejected = await tx.productImportBatch.update({ where: { id: batch.id }, data: { status: "REJECTED", reviewedById: input.userId, reviewedAt: new Date(), rejectionReason: input.reason } });
      await tx.auditLog.create({ data: { companyId: input.companyId, userId: input.userId, action: "PRODUCT_IMPORT_REJECTED", entity: "ProductImportBatch", entityId: batch.id, requestId: input.requestId, after: asJson({ reason: input.reason }) } });
      return rejected;
    });
  }

  const normalizedRows = batch.rows.map((row) => ({ row, data: normalizedRowSchema.parse(row.normalizedData) }));
  const categoryCodes = [...new Set(normalizedRows.map((entry) => entry.data.categoriaCodigo))];
  const supplierTaxIds = [...new Set(normalizedRows.map((entry) => entry.data.fornecedorCnpj).filter(Boolean))];
  const [categories, suppliers] = await Promise.all([
    prisma.fiscalCategory.findMany({ where: { companyId: input.companyId, code: { in: categoryCodes }, active: true, status: "APPROVED" }, select: { id: true, code: true } }),
    prisma.supplier.findMany({ where: { companyId: input.companyId, taxId: { in: supplierTaxIds }, status: "ACTIVE" }, select: { id: true, taxId: true } }),
  ]);
  if (categories.length !== categoryCodes.length) throw new Error("CATEGORIA_DA_IMPORTACAO_MUDOU_DESDE_A_VALIDACAO");
  if (suppliers.length !== supplierTaxIds.length) throw new Error("FORNECEDOR_DA_IMPORTACAO_MUDOU_DESDE_A_VALIDACAO");
  const categoryByCode = new Map(categories.map((entry) => [entry.code.toUpperCase(), entry.id]));
  const supplierByTaxId = new Map(suppliers.map((entry) => [entry.taxId, entry.id]));

  return prisma.$transaction(async (tx) => {
    for (const entry of normalizedRows) {
      const data = entry.data;
      const productData = {
        categoryId: categoryByCode.get(data.categoriaCodigo)!, ean: data.gtin, name: data.nome, activeIngredient: data.principioAtivo,
        composition: data.composicao, laboratory: data.fabricante, anvisaRegistration: data.registroAnvisa || null,
        currentCost: data.custo, salePrice: data.precoVenda, minimumStock: data.estoqueMinimo, dailySalesAverage: data.mediaVendaDiaria, active: data.ativo,
      };
      const product = entry.row.existingProductId
        ? await tx.product.update({ where: { id: entry.row.existingProductId }, data: productData })
        : await tx.product.create({ data: { companyId: input.companyId, stockQuantity: 0, ...productData } });
      await tx.productImportRow.update({ where: { id: entry.row.id }, data: { existingProductId: product.id } });
      if (data.fornecedorCnpj) {
        await tx.supplierProduct.upsert({
          where: { supplierId_productId: { supplierId: supplierByTaxId.get(data.fornecedorCnpj)!, productId: product.id } },
          create: { supplierId: supplierByTaxId.get(data.fornecedorCnpj)!, productId: product.id, lastUnitCost: data.custo, minimumOrderQuantity: 1, packageQuantity: 1 },
          update: { lastUnitCost: data.custo, active: true },
        });
      }
    }
    const applied = await tx.productImportBatch.update({ where: { id: batch.id }, data: { status: "APPLIED", reviewedById: input.userId, reviewedAt: new Date(), appliedAt: new Date() } });
    await tx.auditLog.create({ data: { companyId: input.companyId, userId: input.userId, action: "PRODUCT_IMPORT_APPROVED_AND_APPLIED", entity: "ProductImportBatch", entityId: batch.id, requestId: input.requestId, after: asJson({ rowCount: batch.rowCount, creatorId: batch.createdById }) } });
    return applied;
  }, { timeout: 30_000 });
}
