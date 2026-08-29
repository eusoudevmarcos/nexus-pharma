import { createHash } from "node:crypto";
import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../infra/prisma.js";
import { parseNfeXml, type ParsedNfeItem } from "./nfe-xml.service.js";

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

const matchesPattern = (value: string | null, pattern: string | null) =>
  !pattern || Boolean(value?.startsWith(pattern));

type MatrixRule = Awaited<ReturnType<typeof prisma.fiscalMatrixRule.findMany>>[number];

function suggestionFromMatrix(rule: MatrixRule | undefined) {
  if (!rule) return {};
  const outcome = objectValue(rule.outcome);
  return {
    ...outcome,
    matrixRule: {
      id: rule.id,
      code: rule.code,
      version: rule.ruleVersion,
      validFrom: rule.validFrom.toISOString().slice(0, 10),
      sources: rule.sourceReferences,
    },
  };
}

function discrepancyCandidates(item: ParsedNfeItem, suggestion: Record<string, unknown>) {
  const matrix = objectValue(suggestion.matrixRule as Prisma.JsonValue);
  const sources = Array.isArray(matrix.sources) ? matrix.sources : [];
  const values = [
    ["CFOP_ENTRADA_DIVERGENTE", "cfop", item.cfop, suggestion.entryCfop],
    ["CST_ICMS_DIVERGENTE", "cstIcms", item.cstIcms, suggestion.cstIcms],
    ["CSOSN_DIVERGENTE", "csosn", item.csosn, suggestion.csosn],
    ["CST_PIS_DIVERGENTE", "cstPis", item.cstPis, suggestion.cstPisCofins],
    ["CST_COFINS_DIVERGENTE", "cstCofins", item.cstCofins, suggestion.cstPisCofins],
  ] as const;
  const discrepancies: Array<{
    code: string;
    severity: string;
    field: string;
    receivedValue: string | null;
    suggestedValue: string | null;
    explanation: string;
    sourceReferences: Prisma.InputJsonValue;
  }> = [];
  for (const [code, field, received, suggested] of values) {
    const suggestedValue = stringValue(suggested);
    if (!suggestedValue || received === suggestedValue) continue;
    discrepancies.push({
      code,
      severity: code.startsWith("CFOP") || code.startsWith("CST_ICMS") ? "HIGH" : "MEDIUM",
      field,
      receivedValue: received,
      suggestedValue,
      explanation: `O XML informa ${received ?? "valor ausente"}; a matriz fiscal vigente sugere ${suggestedValue}. A sugestão não altera o documento original e exige conferência.`,
      sourceReferences: toJson(sources),
    });
  }
  return discrepancies;
}

export async function importDfeXml(input: {
  companyId: string;
  environment: "HOMOLOGATION" | "PRODUCTION";
  rawXml: string;
  nsu?: string | null;
  schemaName?: string | null;
}) {
  const parsed = parseNfeXml(input.rawXml);
  const xmlHash = createHash("sha256").update(input.rawXml, "utf8").digest("hex");
  const company = await prisma.company.findUnique({
    where: { id: input.companyId },
    select: { id: true, cnpj: true, state: true, taxRegime: true },
  });
  if (!company) throw new Error("EMPRESA_NAO_ENCONTRADA");
  if (parsed.recipientTaxId && company.cnpj && parsed.recipientTaxId !== company.cnpj) {
    throw new Error("XML_NAO_DESTINADO_A_EMPRESA");
  }

  const existing = await prisma.dfeDocument.findFirst({
    where: { companyId: company.id, environment: input.environment, xmlHash },
    include: { items: true, discrepancies: true },
  });
  if (existing) return existing;

  const now = new Date();
  const fiscalDate = parsed.issuedAt ?? now;
  const destinationState = parsed.destinationState ?? company.state;
  const [products, matrixRules] = await Promise.all([
    prisma.product.findMany({
      where: {
        companyId: company.id,
        active: true,
        ean: { in: parsed.items.flatMap((item) => item.ean ? [item.ean] : []) },
      },
      include: { category: { include: { rules: true } } },
    }),
    destinationState
      ? prisma.fiscalMatrixRule.findMany({
          where: {
            OR: [{ companyId: null }, { companyId: company.id }],
            destinationState,
            regime: company.taxRegime,
            operationType: "ENTRADA_REVENDA",
            status: "APPROVED",
            validFrom: { lte: fiscalDate },
            AND: [{ OR: [{ validUntil: null }, { validUntil: { gte: fiscalDate } }] }],
          },
          orderBy: [{ priority: "desc" }, { ncmPattern: "desc" }],
        })
      : [],
  ]);
  const productByEan = new Map(products.map((product) => [product.ean, product]));

  return prisma.$transaction(async (tx) => {
    const document = await tx.dfeDocument.create({
      data: {
        companyId: company.id,
        environment: input.environment,
        nsu: input.nsu ?? null,
        accessKey: parsed.accessKey,
        schemaName: input.schemaName ?? parsed.schemaName,
        documentType: parsed.documentType,
        status: parsed.documentType === "NFE" ? "XML_AVAILABLE" : "DISCOVERED",
        rawXml: input.rawXml,
        xmlHash,
        issuerTaxId: parsed.issuerTaxId,
        issuerName: parsed.issuerName,
        recipientTaxId: parsed.recipientTaxId,
        originState: parsed.originState,
        destinationState,
        documentNumber: parsed.documentNumber,
        issuedAt: parsed.issuedAt,
        totalAmount: parsed.totalAmount,
        summary: toJson(parsed.summary),
      },
    });

    for (const item of parsed.items) {
      const product = item.ean ? productByEan.get(item.ean) : undefined;
      const matrixRule = matrixRules.find((rule) =>
        matchesPattern(item.ncm, rule.ncmPattern) &&
        matchesPattern(item.cest, rule.cestPattern) &&
        (!rule.originState || !parsed.originState || rule.originState === parsed.originState),
      );
      const categoryRule = product?.category.rules.find((rule) => rule.regime === company.taxRegime);
      const suggestedTax = matrixRule
        ? suggestionFromMatrix(matrixRule)
        : categoryRule
          ? {
              source: "FISCAL_CATEGORY",
              categoryId: product?.category.id,
              ruleVersion: product?.category.ruleVersion,
              entryCfop: categoryRule.cfop,
              cstIcms: categoryRule.cstIcms,
              csosn: categoryRule.csosn,
              cstPisCofins: categoryRule.cstPisCofins,
              revenueNature: categoryRule.revenueNature,
              cstIbsCbs: categoryRule.cstIbsCbs,
              cClassTrib: categoryRule.cClassTrib,
            }
          : {};
      const createdItem = await tx.dfeDocumentItem.create({
        data: {
          documentId: document.id,
          productId: product?.id,
          itemNumber: item.itemNumber,
          supplierCode: item.supplierCode,
          ean: item.ean,
          description: item.description,
          ncm: item.ncm,
          cest: item.cest,
          cfop: item.cfop,
          cstIcms: item.cstIcms,
          csosn: item.csosn,
          cstPis: item.cstPis,
          cstCofins: item.cstCofins,
          unit: item.unit,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalAmount: item.totalAmount,
          originalTax: toJson(item.originalTax),
          suggestedTax: toJson(suggestedTax),
          matchedRuleId: matrixRule?.id,
          status: product ? "MATCHED" : "PENDING",
        },
      });
      const discrepancies = discrepancyCandidates(item, suggestedTax);
      if (!product) {
        discrepancies.push({
          code: "PRODUTO_NAO_VINCULADO",
          severity: "HIGH",
          field: "ean",
          receivedValue: item.ean,
          suggestedValue: null,
          explanation: "Nenhum produto ativo da empresa corresponde ao EAN do item. Vincule-o antes de concluir a entrada.",
          sourceReferences: toJson([]),
        });
      }
      if (discrepancies.length) {
        await tx.dfeDiscrepancy.createMany({
          data: discrepancies.map((entry) => ({
            documentId: document.id,
            documentItemId: createdItem.id,
            ...entry,
          })),
        });
      }
    }
    await tx.auditLog.create({
      data: {
        companyId: company.id,
        action: "DFE_XML_IMPORTED",
        entity: "DfeDocument",
        entityId: document.id,
        after: { xmlHash, documentType: parsed.documentType, accessKey: parsed.accessKey, itemCount: parsed.items.length },
      },
    });
    return tx.dfeDocument.findUniqueOrThrow({
      where: { id: document.id },
      include: { items: true, discrepancies: true },
    });
  });
}

export function withoutRawXml<T extends { rawXml: string }>(document: T) {
  const { rawXml: _rawXml, ...safe } = document;
  return safe;
}
