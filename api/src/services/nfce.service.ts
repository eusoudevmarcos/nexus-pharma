import { createHash } from "node:crypto";
import type { Prisma } from "../generated/prisma/client.js";
import { config } from "../config.js";
import { prisma } from "../infra/prisma.js";

export type NfcePreparationInput = {
  companyId: string;
  saleId: string;
  userId: string;
  requestId: string;
  environment: "HOMOLOGATION" | "PRODUCTION";
  emissionType: "NORMAL" | "OFFLINE_CONTINGENCY";
  series: number;
  paymentMethod: string;
  customerTaxId?: string | null;
};

type CompanyFiscalSettings = {
  stateRegistration?: string;
  inscricaoEstadual?: string;
  municipalityCode?: string;
  codigoMunicipio?: string;
};

export type NfceValidationIssue = {
  code: string;
  field: string;
  message: string;
};

const stateCodes: Record<string, string> = {
  AC: "12", AL: "27", AP: "16", AM: "13", BA: "29", CE: "23", DF: "53",
  ES: "32", GO: "52", MA: "21", MT: "51", MS: "50", MG: "31", PA: "15",
  PB: "25", PR: "41", PE: "26", PI: "22", RJ: "33", RN: "24", RS: "43",
  RO: "11", RR: "14", SC: "42", SP: "35", SE: "28", TO: "17",
};

const onlyDigits = (value: string) => value.replace(/\D/g, "");
const money = (value: number) => (Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2);
const quantity = (value: number) => value.toFixed(4);
const rate = (value: number) => (value * 100).toFixed(4);
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const xmlEscape = (value: unknown) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&apos;");

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stable(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function localYearMonth(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "2-digit", month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  if (!year || !month) throw new Error("NFCE_DATA_DE_EMISSAO_INVALIDA");
  return `${year}${month}`;
}

export function calculateNfceCheckDigit(base43: string) {
  if (!/^\d{43}$/.test(base43)) throw new Error("NFCE_CHAVE_BASE_INVALIDA");
  let weight = 2;
  let sum = 0;
  for (let index = base43.length - 1; index >= 0; index -= 1) {
    sum += Number(base43[index]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const remainder = sum % 11;
  const digit = 11 - remainder;
  return digit === 10 || digit === 11 ? 0 : digit;
}

export function buildNfceAccessKey(input: {
  state: string; issuedAt: Date; cnpj: string; series: number; number: number;
  emissionType: "NORMAL" | "OFFLINE_CONTINGENCY"; numericCode: string;
}) {
  const stateCode = stateCodes[input.state];
  if (!stateCode) throw new Error("NFCE_UF_INVALIDA");
  if (!/^\d{14}$/.test(input.cnpj)) throw new Error("NFCE_CNPJ_INVALIDO");
  if (!/^\d{8}$/.test(input.numericCode)) throw new Error("NFCE_CODIGO_NUMERICO_INVALIDO");
  if (input.series < 1 || input.series > 999 || input.number < 1 || input.number > 999_999_999) {
    throw new Error("NFCE_NUMERACAO_INVALIDA");
  }
  const base = `${stateCode}${localYearMonth(input.issuedAt)}${input.cnpj}65${String(input.series).padStart(3, "0")}${String(input.number).padStart(9, "0")}${input.emissionType === "NORMAL" ? "1" : "9"}${input.numericCode}`;
  return `${base}${calculateNfceCheckDigit(base)}`;
}

export function validateBrazilianTaxId(value: string) {
  const digits = onlyDigits(value);
  if (![11, 14].includes(digits.length) || /^(\d)\1+$/.test(digits)) return false;
  const validateDigit = (base: string, weights: number[]) => {
    const sum = weights.reduce((total, weight, index) => total + Number(base[index]) * weight, 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  if (digits.length === 11) {
    const first = validateDigit(digits.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
    const second = validateDigit(`${digits.slice(0, 9)}${first}`, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
    return digits.endsWith(`${first}${second}`);
  }
  const first = validateDigit(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = validateDigit(`${digits.slice(0, 12)}${first}`, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return digits.endsWith(`${first}${second}`);
}

export function validateNfcePreparation(input: {
  company: { cnpj: string | null; state: string | null; legalName: string; settings: unknown };
  sale: { status: string; invoiceModel: string; grossAmount: unknown; items: Array<{ ncm: string; cfop: string; cstIcms: string; cstPis: string; cstCofins: string; cstIbsCbs: string; taxClassification: string; quantity: unknown; unitPrice: unknown }> };
  environment: "HOMOLOGATION" | "PRODUCTION";
  customerTaxId?: string | null;
}) {
  const issues: NfceValidationIssue[] = [];
  const settings = (input.company.settings && typeof input.company.settings === "object" ? input.company.settings : {}) as CompanyFiscalSettings;
  const stateRegistration = settings.stateRegistration ?? settings.inscricaoEstadual;
  const municipalityCode = settings.municipalityCode ?? settings.codigoMunicipio;
  if (!input.company.cnpj || !/^\d{14}$/.test(input.company.cnpj)) issues.push({ code: "CNPJ_REQUIRED", field: "empresa.cnpj", message: "Informe o CNPJ numérico de 14 posições da empresa." });
  if (!input.company.state || !stateCodes[input.company.state]) issues.push({ code: "STATE_REQUIRED", field: "empresa.uf", message: "Informe uma UF brasileira válida." });
  if (!stateRegistration || !/^[0-9A-Z]{2,14}$/i.test(stateRegistration)) issues.push({ code: "STATE_REGISTRATION_REQUIRED", field: "empresa.settings.stateRegistration", message: "Informe a inscrição estadual no cadastro fiscal da empresa." });
  if (!municipalityCode || !/^\d{7}$/.test(municipalityCode)) issues.push({ code: "MUNICIPALITY_CODE_REQUIRED", field: "empresa.settings.municipalityCode", message: "Informe o código IBGE de 7 posições do município." });
  if (input.environment === "PRODUCTION" && !config.NFCE_ALLOW_PRODUCTION_PREPARATION) issues.push({ code: "PRODUCTION_LOCKED", field: "ambiente", message: "A preparação em produção está bloqueada até a homologação operacional." });
  if (input.sale.status !== "COMPLETED") issues.push({ code: "SALE_NOT_COMPLETED", field: "venda.status", message: "A venda precisa estar concluída." });
  if (input.sale.invoiceModel !== "NFC65") issues.push({ code: "WRONG_INVOICE_MODEL", field: "venda.modelo", message: "A venda não foi registrada como modelo 65." });
  if (!input.sale.items.length) issues.push({ code: "SALE_WITHOUT_ITEMS", field: "venda.itens", message: "A venda não possui itens." });
  if (input.customerTaxId && !validateBrazilianTaxId(input.customerTaxId)) issues.push({ code: "CUSTOMER_TAX_ID_INVALID", field: "consumidor.documento", message: "O CPF/CNPJ do consumidor é inválido." });
  input.sale.items.forEach((item, index) => {
    const field = `venda.itens.${index}`;
    if (!/^\d{8}$/.test(item.ncm)) issues.push({ code: "NCM_INVALID", field: `${field}.ncm`, message: "NCM deve ter 8 dígitos." });
    if (!/^\d{4}$/.test(item.cfop)) issues.push({ code: "CFOP_INVALID", field: `${field}.cfop`, message: "CFOP deve ter 4 dígitos." });
    if (!item.cstIcms || !item.cstPis || !item.cstCofins || !item.cstIbsCbs || !item.taxClassification) issues.push({ code: "TAX_SNAPSHOT_INCOMPLETE", field, message: "O snapshot tributário do item está incompleto." });
    if (Number(item.quantity) <= 0 || Number(item.unitPrice) < 0) issues.push({ code: "ITEM_VALUE_INVALID", field, message: "Quantidade ou valor unitário inválido." });
  });
  return issues;
}

export function buildNfceXmlDraft(payload: Record<string, unknown>) {
  const issuer = payload.issuer as Record<string, unknown>;
  const header = payload.header as Record<string, unknown>;
  const totals = payload.totals as Record<string, unknown>;
  const payment = payload.payment as Record<string, unknown>;
  const items = payload.items as Array<Record<string, unknown>>;
  const itemXml = items.map((item) => {
    const taxes = item.taxes as Record<string, unknown>;
    return `<item nItem="${xmlEscape(item.number)}"><cProd>${xmlEscape(item.ean)}</cProd><xProd>${xmlEscape(item.name)}</xProd><NCM>${xmlEscape(item.ncm)}</NCM><CFOP>${xmlEscape(item.cfop)}</CFOP><qCom>${xmlEscape(item.quantity)}</qCom><vUnCom>${xmlEscape(item.originalUnitPrice ?? item.unitPrice)}</vUnCom><vProd>${xmlEscape(item.grossBeforeDiscount ?? item.total)}</vProd><vDesc>${xmlEscape(item.discount ?? 0)}</vDesc><tributacao><CSTICMS>${xmlEscape(taxes.cstIcms)}</CSTICMS><CSOSN>${xmlEscape(taxes.csosn)}</CSOSN><CSTPIS>${xmlEscape(taxes.cstPis)}</CSTPIS><CSTCOFINS>${xmlEscape(taxes.cstCofins)}</CSTCOFINS><CSTIBSCBS>${xmlEscape(taxes.cstIbsCbs)}</CSTIBSCBS><cClassTrib>${xmlEscape(taxes.taxClassification)}</cClassTrib></tributacao></item>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><NfceLocalDraft versao="${xmlEscape(payload.schemaVersion)}" transmissaoPermitida="false"><infNFCe Id="NFCe${xmlEscape(header.accessKey)}"><ide><cUF>${xmlEscape(header.stateCode)}</cUF><mod>65</mod><serie>${xmlEscape(header.series)}</serie><nNF>${xmlEscape(header.number)}</nNF><dhEmi>${xmlEscape(header.issuedAt)}</dhEmi><tpEmis>${xmlEscape(header.emissionCode)}</tpEmis><tpAmb>${xmlEscape(header.environmentCode)}</tpAmb></ide><emit><CNPJ>${xmlEscape(issuer.cnpj)}</CNPJ><xNome>${xmlEscape(issuer.legalName)}</xNome><IE>${xmlEscape(issuer.stateRegistration)}</IE><cMun>${xmlEscape(issuer.municipalityCode)}</cMun></emit><detalhes>${itemXml}</detalhes><total><vProd>${xmlEscape(totals.originalGross ?? totals.gross)}</vProd><vDesc>${xmlEscape(totals.discount ?? 0)}</vDesc><vICMS>${xmlEscape(totals.icms)}</vICMS><vPIS>${xmlEscape(totals.pis)}</vPIS><vCOFINS>${xmlEscape(totals.cofins)}</vCOFINS><vCBS>${xmlEscape(totals.cbs)}</vCBS><vIBS>${xmlEscape(totals.ibs)}</vIBS><vNF>${xmlEscape(totals.gross)}</vNF></total><pag><tPag>${xmlEscape(payment.method)}</tPag><vPag>${xmlEscape(payment.amount)}</vPag></pag></infNFCe></NfceLocalDraft>`;
}

function numericCode(seed: string) {
  return (BigInt(`0x${hash(seed).slice(0, 14)}`) % 100_000_000n).toString().padStart(8, "0");
}

function publicDocument<T extends { xmlDraft?: string; authorizedXml?: string | null }>(document: T) {
  const { xmlDraft: _xmlDraft, authorizedXml: _authorizedXml, ...safe } = document;
  return safe;
}

async function prepareOnce(input: NfcePreparationInput) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.nfceDocument.findUnique({
      where: { companyId_saleId_environment: { companyId: input.companyId, saleId: input.saleId, environment: input.environment } },
      include: { transmissions: { orderBy: { createdAt: "desc" }, take: 5 } },
    });
    if (existing) return { document: publicDocument(existing), idempotent: true };
    const [company, sale] = await Promise.all([
      tx.company.findUnique({ where: { id: input.companyId } }),
      tx.sale.findFirst({ where: { id: input.saleId, companyId: input.companyId }, include: { items: { orderBy: { createdAt: "asc" }, include: { controlledRecord: true } }, seller: { select: { id: true, name: true } }, pharmacistCredential: { include: { user: { select: { id: true, name: true } } } } } }),
    ]);
    if (!company) throw new Error("NFCE_EMPRESA_NAO_ENCONTRADA");
    if (!sale) throw new Error("NFCE_VENDA_NAO_ENCONTRADA");
    const requestedCustomerTaxId = input.customerTaxId ? onlyDigits(input.customerTaxId) : null;
    if (sale.customerTaxId && requestedCustomerTaxId && sale.customerTaxId !== requestedCustomerTaxId) throw new Error("NFCE_DOCUMENTO_DO_CONSUMIDOR_DIVERGE_DA_VENDA");
    const customerTaxId = sale.customerTaxId ?? requestedCustomerTaxId;
    const issues = validateNfcePreparation({ company, sale, environment: input.environment, customerTaxId });
    if (issues.length) {
      const error = new Error("NFCE_PREPARACAO_BLOQUEADA") as Error & { issues?: NfceValidationIssue[] };
      error.issues = issues;
      throw error;
    }
    const sequence = await tx.nfceNumberSequence.upsert({
      where: { companyId_environment_series: { companyId: input.companyId, environment: input.environment, series: input.series } },
      create: { companyId: input.companyId, environment: input.environment, series: input.series, lastNumber: 1 },
      update: { lastNumber: { increment: 1 } },
    });
    const issuedAt = new Date();
    const code = numericCode(`${input.companyId}:${input.saleId}:${input.environment}:${input.emissionType}:${input.series}`);
    const accessKey = buildNfceAccessKey({ state: company.state!, issuedAt, cnpj: company.cnpj!, series: input.series, number: sequence.lastNumber, emissionType: input.emissionType, numericCode: code });
    const settings = company.settings as CompanyFiscalSettings;
    const payload: Record<string, unknown> = {
      kind: "NFC65_LOCAL_DRAFT", schemaVersion: config.NFCE_SCHEMA_VERSION,
      source: { saleId: sale.id, saleIdempotencyKey: sale.idempotencyKey, soldAt: sale.soldAt.toISOString() },
      header: {
        accessKey, stateCode: stateCodes[company.state!], series: input.series, number: sequence.lastNumber,
        numericCode: code, issuedAt: issuedAt.toISOString(), emissionType: input.emissionType,
        emissionCode: input.emissionType === "NORMAL" ? "1" : "9",
        environment: input.environment, environmentCode: input.environment === "PRODUCTION" ? "1" : "2",
      },
      issuer: {
        cnpj: company.cnpj, legalName: company.legalName, tradeName: company.tradeName,
        state: company.state, stateRegistration: settings.stateRegistration ?? settings.inscricaoEstadual,
        municipalityCode: settings.municipalityCode ?? settings.codigoMunicipio,
      },
      customer: customerTaxId ? { taxId: customerTaxId, name: sale.customerName, birthDate: sale.customerBirthDate?.toISOString().slice(0, 10) ?? null } : null,
      operationContext: {
        seller: sale.sellerId ? { id: sale.sellerId, name: sale.sellerName } : sale.seller,
        pharmacist: sale.pharmacistCredentialId ? sale.pharmacistSnapshot : null,
      },
      items: sale.items.map((item, index) => ({
        number: index + 1, ean: item.ean, name: item.productName, ncm: item.ncm,
        quantity: quantity(Number(item.quantity)), unitPrice: money(Number(item.unitPrice)), originalUnitPrice: money(Number(item.originalUnitPrice)),
        grossBeforeDiscount: money(Number(item.quantity) * Number(item.originalUnitPrice)), discount: money(Number(item.discountAmount)),
        total: money(Number(item.quantity) * Number(item.unitPrice)), cfop: item.cfop,
        taxes: {
          cstIcms: item.cstIcms, csosn: item.csosn, cstPis: item.cstPis, cstCofins: item.cstCofins,
          revenueNature: item.revenueNature, cstIbsCbs: item.cstIbsCbs, taxClassification: item.taxClassification,
          icmsAmount: money(Number(item.icmsAmount)), pisAmount: money(Number(item.pisAmount)), cofinsAmount: money(Number(item.cofinsAmount)),
          cbsAmount: money(Number(item.cbsAmount)), ibsAmount: money(Number(item.ibsAmount)), totalTax: money(Number(item.taxAmount)),
          sourceSnapshot: item.fiscalSnapshot, ruleVersion: item.ruleVersion,
        },
        saleControl: { level: item.controlLevel, ruleVersion: item.controlRuleVersion, snapshot: item.controlSnapshot, recordId: item.controlledRecord?.id ?? null },
      })),
      totals: {
        originalGross: money(Number(sale.originalGrossAmount)), discount: money(Number(sale.discountAmount)),
        gross: money(Number(sale.grossAmount)), cost: money(Number(sale.costAmount)), icms: money(Number(sale.icmsAmount)),
        pis: money(Number(sale.pisAmount)), cofins: money(Number(sale.cofinsAmount)), cbs: money(Number(sale.cbsAmount)),
        ibs: money(Number(sale.ibsAmount)), tax: money(Number(sale.taxAmount)), netProfit: money(Number(sale.netProfit)),
      },
      payment: { method: input.paymentMethod, amount: money(Number(sale.grossAmount)) },
      metadata: { generatedBy: "nexus-pharma", format: "local-draft", officialXsdValidated: false, signed: false },
    };
    const serialized = stable(payload);
    const xmlDraft = buildNfceXmlDraft(payload);
    const document = await tx.nfceDocument.create({ data: {
      companyId: input.companyId, saleId: sale.id, createdById: input.userId,
      environment: input.environment, emissionType: input.emissionType, status: "VALIDATED",
      schemaVersion: config.NFCE_SCHEMA_VERSION, series: input.series, number: sequence.lastNumber,
      numericCode: code, accessKey, issuedAt, paymentMethod: input.paymentMethod, customerTaxId,
      fiscalPayload: payload as Prisma.InputJsonValue, payloadHash: hash(serialized), xmlDraft,
      validationErrors: [] as Prisma.InputJsonValue,
    } });
    await tx.auditLog.create({ data: {
      companyId: input.companyId, userId: input.userId, action: "PREPARE", entity: "NFCE_LOCAL_DRAFT",
      entityId: document.id, requestId: input.requestId,
      after: { saleId: sale.id, environment: input.environment, emissionType: input.emissionType, series: input.series, number: sequence.lastNumber, accessKey, payloadHash: document.payloadHash },
    } });
    return { document: publicDocument(document), idempotent: false };
  }, { isolationLevel: "Serializable", timeout: 15_000 });
}

export async function prepareNfceDocument(input: NfcePreparationInput) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try { return await prepareOnce(input); }
    catch (error) {
      const code = (error as { code?: string }).code;
      if (attempt < 3 && (code === "P2002" || code === "P2034")) continue;
      throw error;
    }
  }
  throw new Error("NFCE_CONCORRENCIA_NAO_RESOLVIDA");
}

export async function blockNfceTransmission(input: { companyId: string; documentId: string; userId: string; requestId: string }) {
  const document = await prisma.nfceDocument.findFirst({ where: { id: input.documentId, companyId: input.companyId } });
  if (!document) throw new Error("NFCE_DOCUMENTO_NAO_ENCONTRADO");
  const reason = config.NFCE_ENABLE_SEFAZ_TRANSMISSION ? "NFCE_ADAPTADOR_SEFAZ_NAO_HOMOLOGADO" : "NFCE_TRANSMISSAO_SEFAZ_DESABILITADA";
  await prisma.$transaction(async (tx) => {
    await tx.nfceTransmissionAttempt.create({ data: {
      documentId: document.id, status: "BLOCKED", requestHash: document.payloadHash,
      responseCode: "LOCAL_BLOCK", responseMessage: reason, completedAt: new Date(),
    } });
    await tx.nfceDocument.update({ where: { id: document.id }, data: { status: "TRANSMISSION_BLOCKED" } });
    await tx.auditLog.create({ data: {
      companyId: input.companyId, userId: input.userId, action: "BLOCK", entity: "NFCE_TRANSMISSION",
      entityId: document.id, requestId: input.requestId, after: { reason, payloadHash: document.payloadHash },
    } });
  });
  throw new Error(reason);
}

export const nfcePublicDocument = publicDocument;
export const nfceRate = rate;
