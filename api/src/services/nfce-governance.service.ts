import { createHash } from "node:crypto";
import type { Prisma } from "../generated/prisma/client.js";
import { config } from "../config.js";
import { prisma } from "../infra/prisma.js";
import { certificateEncryptionKey, encryptSensitivePayload } from "./dfe-certificate.service.js";

export const requiredOfficialCatalogs = ["CCLASS_TRIB", "ALIQUOTAS_CBS", "MEIOS_PAGAMENTO"] as const;
export const managedOfficialCatalogs = [
  "NCM",
  "CEST",
  "CST_ICMS",
  "CSOSN",
  "CST_PIS_COFINS",
  "PIS_COFINS",
  "NATUREZA_RECEITA",
  "CCLASS_TRIB",
  "ALIQUOTAS_IBS_CBS",
  "ALIQUOTAS_CBS",
  "MEIOS_PAGAMENTO",
  "DF_ICMS_ST",
  "DF_MVA",
  "DF_FCP",
  "DF_REDUCOES",
  "DF_BENEFICIOS",
  "SCHEMA_NFCE",
] as const;

const officialCatalogHosts = new Set([
  "www.nfe.fazenda.gov.br",
  "nfe.fazenda.gov.br",
  "www.confaz.fazenda.gov.br",
  "confaz.fazenda.gov.br",
  "www.sinj.df.gov.br",
  "sinj.df.gov.br",
  "www.gov.br",
  "gov.br",
  "classif.siscomex.gov.br",
]);

export type CatalogImportItem = {
  code: string;
  parentCode?: string | null;
  description: string;
  ncmPatterns?: string[];
  parameters?: Record<string, unknown>;
  validFrom?: string | null;
  validUntil?: string | null;
};

export type NfceConfigurationInput = {
  environment: "HOMOLOGATION" | "PRODUCTION";
  state: string;
  series: number;
  qrCodeVersion: 2 | 3;
  cscIdentifier?: string | null;
  cscSecret?: string | null;
  authorizationUrl?: string | null;
  statusServiceUrl?: string | null;
  eventUrl?: string | null;
  qrCodeBaseUrl?: string | null;
  consultationUrl?: string | null;
  officialSchemaVersion?: string | null;
  active: boolean;
};

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stable(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function officialSourceUrl(value: string) {
  const parsed = new URL(value);
  const hostname = parsed.hostname.toLowerCase();
  const governmentHost = hostname.endsWith(".gov.br") || officialCatalogHosts.has(hostname);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || !governmentHost) {
    throw new Error("CATALOGO_FONTE_OFICIAL_INVALIDA");
  }
  return parsed.toString();
}

function endpoint(value?: string | null) {
  if (!value) return null;
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error("NFCE_ENDPOINT_HTTPS_INVALIDO");
  return parsed.toString();
}

function date(value?: string | null) {
  if (!value) return null;
  return new Date(`${value}T00:00:00.000Z`);
}

export async function listOfficialCatalogReleases() {
  const releases = await prisma.fiscalCatalogRelease.findMany({
    include: { _count: { select: { entries: true } }, reviewedBy: { select: { name: true } } },
    orderBy: [{ catalog: "asc" }, { sourcePublishedAt: "desc" }, { createdAt: "desc" }],
  });
  return managedOfficialCatalogs.map((catalog) => ({
    catalog,
    active: releases.find((release) => release.catalog === catalog && release.status === "ACTIVE") ?? null,
    releases: releases.filter((release) => release.catalog === catalog),
  }));
}

export async function importOfficialCatalog(input: {
  catalog: string;
  sourceVersion: string;
  sourceUrl: string;
  sourcePublishedAt?: string | null;
  notes?: string | null;
  items: CatalogImportItem[];
  userId: string;
  requestId: string;
}) {
  const url = officialSourceUrl(input.sourceUrl);
  const existingRelease = await prisma.fiscalCatalogRelease.findUnique({ where: { catalog_sourceVersion: { catalog: input.catalog, sourceVersion: input.sourceVersion } }, select: { status: true } });
  if (existingRelease?.status === "ACTIVE") throw new Error("CATALOGO_VERSAO_ATIVA_IMUTAVEL");
  const normalized = [...input.items].map((item) => ({
    code: item.code.trim().toUpperCase(),
    parentCode: item.parentCode?.trim().toUpperCase() || null,
    description: item.description.trim(),
    ncmPatterns: [...new Set(item.ncmPatterns?.map((value) => value.replace(/\D/g, "")).filter(Boolean) ?? [])].sort(),
    parameters: item.parameters ?? {},
    validFrom: item.validFrom ?? null,
    validUntil: item.validUntil ?? null,
  })).sort((left, right) => left.code.localeCompare(right.code));
  if (normalized.some((item) => !item.code || !item.description)) throw new Error("CATALOGO_ITEM_INCOMPLETO");
  if (normalized.some((item) => item.validFrom && item.validUntil && item.validUntil < item.validFrom)) throw new Error("CATALOGO_VIGENCIA_INVALIDA");
  if (new Set(normalized.map((item) => item.code)).size !== normalized.length) throw new Error("CATALOGO_CODIGO_DUPLICADO");
  const payloadHash = createHash("sha256").update(stable(normalized)).digest("hex");
  return prisma.$transaction(async (tx) => {
    const release = await tx.fiscalCatalogRelease.upsert({
      where: { catalog_sourceVersion: { catalog: input.catalog, sourceVersion: input.sourceVersion } },
      create: {
        catalog: input.catalog, sourceVersion: input.sourceVersion, sourceUrl: url,
        sourcePublishedAt: date(input.sourcePublishedAt), payloadHash, itemCount: normalized.length,
        status: "UNDER_REVIEW", notes: input.notes, importedById: input.userId, importedAt: new Date(),
      },
      update: {
        sourceUrl: url, sourcePublishedAt: date(input.sourcePublishedAt), payloadHash, itemCount: normalized.length,
        status: "UNDER_REVIEW", notes: input.notes, importedById: input.userId, importedAt: new Date(),
        reviewedById: null, reviewedAt: null, activatedAt: null,
      },
    });
    await tx.fiscalCatalogEntry.deleteMany({ where: { releaseId: release.id } });
    for (const item of normalized) {
      await tx.fiscalCatalogEntry.upsert({
        where: { catalog_code_sourceVersion: { catalog: input.catalog, code: item.code, sourceVersion: input.sourceVersion } },
        create: {
          catalog: input.catalog, code: item.code, parentCode: item.parentCode, description: item.description,
          ncmPatterns: item.ncmPatterns, parameters: item.parameters as Prisma.InputJsonValue, sourceUrl: url,
          sourceVersion: input.sourceVersion, validFrom: date(item.validFrom), validUntil: date(item.validUntil), active: false, releaseId: release.id,
        },
        update: {
          parentCode: item.parentCode, description: item.description, ncmPatterns: item.ncmPatterns,
          parameters: item.parameters as Prisma.InputJsonValue, sourceUrl: url, validFrom: date(item.validFrom),
          validUntil: date(item.validUntil), active: false, releaseId: release.id,
        },
      });
    }
    await tx.auditLog.create({ data: {
      userId: input.userId, action: "IMPORT", entity: "FISCAL_CATALOG_RELEASE", entityId: release.id, requestId: input.requestId,
      after: { catalog: input.catalog, sourceVersion: input.sourceVersion, sourceUrl: url, payloadHash, itemCount: normalized.length },
    } });
    return release;
  }, { timeout: 30_000 });
}

export async function catalogReleaseDiff(releaseId: string) {
  const release = await prisma.fiscalCatalogRelease.findUnique({ where: { id: releaseId }, include: { entries: true } });
  if (!release) throw new Error("CATALOGO_VERSAO_NAO_ENCONTRADA");
  const active = await prisma.fiscalCatalogRelease.findFirst({
    where: { catalog: release.catalog, status: "ACTIVE", id: { not: release.id } }, include: { entries: true }, orderBy: { activatedAt: "desc" },
  });
  const previous = new Map(active?.entries.map((entry) => [entry.code, stable({ description: entry.description, parentCode: entry.parentCode, ncmPatterns: entry.ncmPatterns, parameters: entry.parameters, validFrom: entry.validFrom, validUntil: entry.validUntil })]) ?? []);
  const next = new Map(release.entries.map((entry) => [entry.code, stable({ description: entry.description, parentCode: entry.parentCode, ncmPatterns: entry.ncmPatterns, parameters: entry.parameters, validFrom: entry.validFrom, validUntil: entry.validUntil })]));
  return {
    release: { id: release.id, catalog: release.catalog, sourceVersion: release.sourceVersion, status: release.status, itemCount: release.itemCount },
    comparedWith: active ? { id: active.id, sourceVersion: active.sourceVersion } : null,
    added: [...next.keys()].filter((code) => !previous.has(code)),
    changed: [...next.keys()].filter((code) => previous.has(code) && previous.get(code) !== next.get(code)),
    removed: [...previous.keys()].filter((code) => !next.has(code)),
  };
}

export async function activateOfficialCatalog(input: { releaseId: string; userId: string; requestId: string }) {
  const diff = await catalogReleaseDiff(input.releaseId);
  if (diff.release.itemCount === 0) throw new Error("CATALOGO_SEM_ITENS_NAO_PODE_SER_ATIVADO");
  if (diff.release.status !== "UNDER_REVIEW") throw new Error("CATALOGO_PRECISA_ESTAR_EM_REVISAO");
  const candidate = await prisma.fiscalCatalogRelease.findUnique({
    where: { id: input.releaseId },
    include: { entries: { select: { validFrom: true, validUntil: true } } },
  });
  if (!candidate) throw new Error("CATALOGO_VERSAO_NAO_ENCONTRADA");
  if (!candidate.sourcePublishedAt || !candidate.payloadHash || !candidate.importedById) throw new Error("CATALOGO_EVIDENCIA_INCOMPLETA");
  if (candidate.importedById === input.userId) throw new Error("CATALOGO_APROVACAO_QUATRO_OLHOS");
  if (candidate.entries.length !== candidate.itemCount) throw new Error("CATALOGO_CONTAGEM_DIVERGENTE");
  if (candidate.entries.some((entry) => entry.validFrom && entry.validUntil && entry.validUntil < entry.validFrom)) throw new Error("CATALOGO_VIGENCIA_INVALIDA");
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const previous = await tx.fiscalCatalogRelease.findMany({ where: { catalog: diff.release.catalog, status: "ACTIVE", id: { not: input.releaseId } }, select: { id: true } });
    if (previous.length) {
      await tx.fiscalCatalogRelease.updateMany({ where: { id: { in: previous.map((item) => item.id) } }, data: { status: "SUPERSEDED" } });
      await tx.fiscalCatalogEntry.updateMany({ where: { releaseId: { in: previous.map((item) => item.id) } }, data: { active: false } });
    }
    const release = await tx.fiscalCatalogRelease.update({
      where: { id: input.releaseId },
      data: { status: "ACTIVE", reviewedById: input.userId, reviewedAt: now, activatedAt: now },
    });
    await tx.fiscalCatalogEntry.updateMany({ where: { releaseId: input.releaseId }, data: { active: true } });
    await tx.auditLog.create({ data: {
      userId: input.userId, action: "ACTIVATE", entity: "FISCAL_CATALOG_RELEASE", entityId: input.releaseId, requestId: input.requestId,
      after: { catalog: diff.release.catalog, sourceVersion: diff.release.sourceVersion, added: diff.added.length, changed: diff.changed.length, removed: diff.removed.length },
    } });
    return { release, diff };
  });
}

export async function saveNfceConfiguration(input: NfceConfigurationInput & { companyId: string; userId: string; requestId: string }) {
  const state = input.state.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(state)) throw new Error("NFCE_UF_INVALIDA");
  const existing = await prisma.nfceConfiguration.findUnique({ where: { companyId_environment: { companyId: input.companyId, environment: input.environment } } });
  let encryptedCsc = input.qrCodeVersion === 3 ? null : existing?.encryptedCsc ?? null;
  if (input.qrCodeVersion === 2 && input.cscSecret) {
    encryptedCsc = encryptSensitivePayload({ csc: input.cscSecret }, certificateEncryptionKey(config.DFE_CERTIFICATE_ENCRYPTION_KEY));
  }
  const cscIdentifier = input.qrCodeVersion === 3 ? null : input.cscIdentifier?.trim() || existing?.cscIdentifier || null;
  if (input.qrCodeVersion === 2 && (!cscIdentifier || !encryptedCsc)) throw new Error("NFCE_CSC_OBRIGATORIO_PARA_QRCODE_V2");
  const activeCatalogs = await prisma.fiscalCatalogRelease.findMany({ where: { catalog: { in: [...requiredOfficialCatalogs] }, status: "ACTIVE" }, select: { catalog: true, sourceVersion: true, payloadHash: true, activatedAt: true } });
  const catalogSnapshot = Object.fromEntries(activeCatalogs.map((catalog) => [catalog.catalog, { sourceVersion: catalog.sourceVersion, payloadHash: catalog.payloadHash, activatedAt: catalog.activatedAt?.toISOString() ?? null }]));
  const data = {
    editedById: input.userId, state, series: input.series, qrCodeVersion: input.qrCodeVersion,
    cscIdentifier, encryptedCsc, authorizationUrl: endpoint(input.authorizationUrl),
    statusServiceUrl: endpoint(input.statusServiceUrl), eventUrl: endpoint(input.eventUrl),
    qrCodeBaseUrl: endpoint(input.qrCodeBaseUrl), consultationUrl: endpoint(input.consultationUrl),
    officialSchemaVersion: input.officialSchemaVersion?.trim() || null, catalogSnapshot, active: input.active,
  };
  const saved = await prisma.nfceConfiguration.upsert({
    where: { companyId_environment: { companyId: input.companyId, environment: input.environment } },
    create: { companyId: input.companyId, environment: input.environment, ...data }, update: data,
  });
  await prisma.auditLog.create({ data: {
    companyId: input.companyId, userId: input.userId, action: "UPSERT", entity: "NFCE_CONFIGURATION", entityId: saved.id, requestId: input.requestId,
    after: { environment: saved.environment, state: saved.state, series: saved.series, qrCodeVersion: saved.qrCodeVersion, cscConfigured: Boolean(saved.encryptedCsc), officialSchemaVersion: saved.officialSchemaVersion, active: saved.active },
  } });
  return publicNfceConfiguration(saved);
}

export function publicNfceConfiguration<T extends { encryptedCsc: string | null }>(value: T) {
  const { encryptedCsc, ...safe } = value;
  return { ...safe, cscConfigured: Boolean(encryptedCsc) };
}

export async function nfceReadiness(companyId: string, environment: "HOMOLOGATION" | "PRODUCTION" = "HOMOLOGATION") {
  const [company, nfceConfiguration, certificate, catalogs] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { cnpj: true, state: true, settings: true } }),
    prisma.nfceConfiguration.findUnique({ where: { companyId_environment: { companyId, environment } } }),
    prisma.dfeCertificate.findFirst({ where: { companyId, environment, status: "ACTIVE", validUntil: { gt: new Date() } }, orderBy: { validUntil: "desc" }, select: { fingerprint: true, validUntil: true } }),
    prisma.fiscalCatalogRelease.findMany({ where: { catalog: { in: [...requiredOfficialCatalogs] }, status: "ACTIVE" }, select: { catalog: true, sourceVersion: true, sourcePublishedAt: true, payloadHash: true, itemCount: true } }),
  ]);
  const settings = (company?.settings && typeof company.settings === "object" ? company.settings : {}) as Record<string, unknown>;
  const baseReady = Boolean(company?.cnpj && company.state && (settings.stateRegistration ?? settings.inscricaoEstadual) && (settings.municipalityCode ?? settings.codigoMunicipio));
  const configReady = Boolean(nfceConfiguration?.active && nfceConfiguration.state === company?.state && nfceConfiguration.authorizationUrl && nfceConfiguration.statusServiceUrl && nfceConfiguration.qrCodeBaseUrl && nfceConfiguration.consultationUrl && nfceConfiguration.officialSchemaVersion && (nfceConfiguration.qrCodeVersion === 3 || (nfceConfiguration.cscIdentifier && nfceConfiguration.encryptedCsc)));
  const activeCatalogs = new Map(catalogs.map((catalog) => [catalog.catalog, catalog]));
  const catalogsReady = requiredOfficialCatalogs.every((catalog) => activeCatalogs.has(catalog));
  const savedSnapshot = (nfceConfiguration?.catalogSnapshot && typeof nfceConfiguration.catalogSnapshot === "object" ? nfceConfiguration.catalogSnapshot : {}) as Record<string, { payloadHash?: string | null }>;
  const snapshotMatches = catalogsReady && requiredOfficialCatalogs.every((catalog) => savedSnapshot[catalog]?.payloadHash === activeCatalogs.get(catalog)?.payloadHash);
  const stages = [
    { code: "COMPANY", label: "Cadastro fiscal da empresa", ready: baseReady, detail: baseReady ? "CNPJ, UF, IE e município disponíveis." : "Complete CNPJ, UF, inscrição estadual e município." },
    { code: "CONFIGURATION", label: `Autorizador e QR Code · ${environment === "HOMOLOGATION" ? "homologação" : "produção"}`, ready: configReady, detail: configReady ? `QR Code v${nfceConfiguration!.qrCodeVersion} e endpoints HTTPS configurados.` : "Informe autorizador, consulta, QR Code e versão oficial do leiaute." },
    { code: "CERTIFICATE", label: "Certificado A1", ready: Boolean(certificate), detail: certificate ? `Válido até ${certificate.validUntil.toISOString().slice(0, 10)}.` : "Instale um certificado A1 ativo para este ambiente." },
    { code: "CATALOGS", label: "Catálogos oficiais", ready: snapshotMatches, detail: !catalogsReady ? `Pendentes: ${requiredOfficialCatalogs.filter((catalog) => !activeCatalogs.has(catalog)).join(", ")}.` : snapshotMatches ? "Versões ativas conferem com o snapshot da configuração." : "Os catálogos mudaram; revise e salve novamente a configuração." },
    { code: "HOMOLOGATION", label: "Homologação da empresa", ready: Boolean(nfceConfiguration?.homologatedAt), detail: nfceConfiguration?.homologatedAt ? `Registrada em ${nfceConfiguration.homologatedAt.toISOString().slice(0, 10)}.` : "Ainda não registrada; produção continua bloqueada." },
  ];
  return {
    localDraftReady: baseReady,
    operationalReady: baseReady && configReady && Boolean(certificate) && snapshotMatches,
    transmissionReady: baseReady && configReady && Boolean(certificate) && snapshotMatches && Boolean(nfceConfiguration?.homologatedAt) && config.NFCE_ENABLE_SEFAZ_TRANSMISSION,
    productionPreparationEnabled: config.NFCE_ALLOW_PRODUCTION_PREPARATION,
    sefazTransmissionEnabled: config.NFCE_ENABLE_SEFAZ_TRANSMISSION,
    officialXsdValidationEnabled: false,
    digitalSignatureEnabled: false,
    schemaVersion: config.NFCE_SCHEMA_VERSION,
    environment,
    companyState: company?.state ?? null,
    configuration: nfceConfiguration ? publicNfceConfiguration(nfceConfiguration) : null,
    certificate,
    catalogs: requiredOfficialCatalogs.map((catalog) => ({ catalog, release: activeCatalogs.get(catalog) ?? null })),
    stages,
    requirements: ["CNPJ e UF", "inscrição estadual", "código IBGE do município", "venda modelo 65 concluída", "snapshot tributário completo"],
    pendingExternal: ["credenciamento NFC-e na UF", "endpoints oficiais do autorizador da UF", "XSD oficial vigente", "assinatura XML e homologação operacional"],
  };
}
