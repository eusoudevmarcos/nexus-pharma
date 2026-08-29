import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import https from "node:https";
import { SignedXml } from "xml-crypto";
import { config } from "../config.js";
import { prisma } from "../infra/prisma.js";
import {
  certificateEncryptionKey,
  decryptCertificatePayload,
  inspectPfx,
} from "./dfe-certificate.service.js";
import { importDfeXml } from "./dfe.service.js";
import { parseDistributionResponse } from "./nfe-xml.service.js";

const ufCode: Record<string, string> = {
  RO: "11", AC: "12", AM: "13", RR: "14", PA: "15", AP: "16", TO: "17",
  MA: "21", PI: "22", CE: "23", RN: "24", PB: "25", PE: "26", AL: "27",
  SE: "28", BA: "29", MG: "31", ES: "32", RJ: "33", SP: "35", PR: "41",
  SC: "42", RS: "43", MS: "50", MT: "51", GO: "52", DF: "53",
};

const environmentCode = (environment: "HOMOLOGATION" | "PRODUCTION") =>
  environment === "PRODUCTION" ? "1" : "2";

const xmlEscape = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

function endpoint(kind: "distribution" | "event", environment: "HOMOLOGATION" | "PRODUCTION") {
  const value = kind === "distribution"
    ? environment === "PRODUCTION"
      ? config.DFE_DISTRIBUTION_URL_PRODUCTION
      : config.DFE_DISTRIBUTION_URL_HOMOLOGATION
    : environment === "PRODUCTION"
      ? config.DFE_EVENT_URL_PRODUCTION
      : config.DFE_EVENT_URL_HOMOLOGATION;
  if (!value) throw new Error(`DFE_ENDPOINT_${kind.toUpperCase()}_${environment}_NAO_CONFIGURADO`);
  return new URL(value);
}

async function postSoap(input: {
  url: URL;
  action: string;
  body: string;
  pfx: Buffer;
  passphrase: string;
}) {
  return new Promise<string>((resolve, reject) => {
    const request = https.request({
      protocol: input.url.protocol,
      hostname: input.url.hostname,
      port: input.url.port || 443,
      path: `${input.url.pathname}${input.url.search}`,
      method: "POST",
      pfx: input.pfx,
      passphrase: input.passphrase,
      rejectUnauthorized: true,
      timeout: 25_000,
      headers: {
        "content-type": `application/soap+xml; charset=utf-8; action="${input.action}"`,
        "content-length": Buffer.byteLength(input.body),
        "user-agent": "Nexus-Pharma-DFE/1.0",
      },
    }, (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > config.DFE_MAX_RESPONSE_BYTES) {
          request.destroy(new Error("RESPOSTA_SEFAZ_MUITO_GRANDE"));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        const responseBody = Buffer.concat(chunks).toString("utf8");
        if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`SEFAZ_HTTP_${response.statusCode ?? "SEM_STATUS"}`));
          return;
        }
        resolve(responseBody);
      });
    });
    request.on("timeout", () => request.destroy(new Error("SEFAZ_TIMEOUT")));
    request.on("error", reject);
    request.end(input.body);
  });
}

async function certificateForCompany(companyId: string, environment: "HOMOLOGATION" | "PRODUCTION") {
  const certificate = await prisma.dfeCertificate.findFirst({
    where: { companyId, environment, status: "ACTIVE", validUntil: { gt: new Date() } },
    orderBy: { validUntil: "desc" },
  });
  if (!certificate) throw new Error("CERTIFICADO_A1_ATIVO_NAO_ENCONTRADO");
  const payload = decryptCertificatePayload(
    certificate.encryptedPayload,
    certificateEncryptionKey(config.DFE_CERTIFICATE_ENCRYPTION_KEY),
  );
  const pfx = Buffer.from(payload.pfxBase64, "base64");
  return { certificate, payload, pfx, material: inspectPfx(pfx, payload.passphrase) };
}

export async function synchronizeDfeDistribution(input: {
  companyId: string;
  environment: "HOMOLOGATION" | "PRODUCTION";
}) {
  if (!config.DFE_ENABLE_SEFAZ_TRANSMISSION) throw new Error("TRANSMISSAO_SEFAZ_DESABILITADA");
  const company = await prisma.company.findUnique({ where: { id: input.companyId } });
  if (!company?.cnpj || !company.state) throw new Error("CNPJ_E_UF_DA_EMPRESA_OBRIGATORIOS");
  const stateCode = ufCode[company.state];
  if (!stateCode) throw new Error("UF_DA_EMPRESA_INVALIDA");
  const cursor = await prisma.dfeDistributionCursor.upsert({
    where: { companyId_environment: { companyId: company.id, environment: input.environment } },
    create: { companyId: company.id, environment: input.environment },
    update: {},
  });
  if (cursor.nextAllowedAt && cursor.nextAllowedAt > new Date()) {
    throw new Error(`CONSULTA_SEFAZ_AGUARDE_ATE_${cursor.nextAllowedAt.toISOString()}`);
  }
  const certificate = await certificateForCompany(company.id, input.environment);
  const distXml = `<distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01"><tpAmb>${environmentCode(input.environment)}</tpAmb><cUFAutor>${stateCode}</cUFAutor><CNPJ>${company.cnpj}</CNPJ><distNSU><ultNSU>${cursor.lastNsu}</ultNSU></distNSU></distDFeInt>`;
  const soap = `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe"><nfeDadosMsg>${distXml}</nfeDadosMsg></nfeDistDFeInteresse></soap12:Body></soap12:Envelope>`;
  const responseXml = await postSoap({
    url: endpoint("distribution", input.environment),
    action: "http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse",
    body: soap,
    pfx: certificate.pfx,
    passphrase: certificate.payload.passphrase,
  });
  const response = parseDistributionResponse(responseXml);
  let imported = 0;
  for (const document of response.documents) {
    if (!document.zippedBase64) continue;
    const rawXml = gunzipSync(Buffer.from(document.zippedBase64, "base64")).toString("utf8");
    await importDfeXml({
      companyId: company.id,
      environment: input.environment,
      rawXml,
      nsu: document.nsu,
      schemaName: document.schemaName,
    });
    imported += 1;
  }
  const shouldThrottle = response.statusCode === "137" || response.statusCode === "656";
  await prisma.dfeDistributionCursor.update({
    where: { id: cursor.id },
    data: {
      lastNsu: response.lastNsu,
      maxNsu: response.maxNsu,
      lastStatusCode: response.statusCode,
      lastStatusMessage: response.statusMessage,
      lastQueryAt: new Date(),
      nextAllowedAt: shouldThrottle ? new Date(Date.now() + 60 * 60 * 1000) : null,
    },
  });
  return { ...response, imported, documents: undefined };
}

const eventCode = {
  SCIENCE: "210210",
  CONFIRMATION: "210200",
  UNKNOWN_OPERATION: "210220",
  OPERATION_NOT_PERFORMED: "210240",
} as const;

const eventDescription = {
  SCIENCE: "Ciencia da Operacao",
  CONFIRMATION: "Confirmacao da Operacao",
  UNKNOWN_OPERATION: "Desconhecimento da Operacao",
  OPERATION_NOT_PERFORMED: "Operacao nao Realizada",
} as const;

export function buildSignedManifestationXml(input: {
  environment: "HOMOLOGATION" | "PRODUCTION";
  cnpj: string;
  accessKey: string;
  type: keyof typeof eventCode;
  sequence: number;
  justification?: string | null;
  privateKeyPem: string;
  certificatePem: string;
}) {
  const code = eventCode[input.type];
  const sequence = String(input.sequence).padStart(2, "0");
  const eventId = `ID${code}${input.accessKey}${sequence}`;
  const justification = input.type === "OPERATION_NOT_PERFORMED"
    ? `<xJust>${xmlEscape(input.justification ?? "")}</xJust>`
    : "";
  const xml = `<evento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><infEvento Id="${eventId}"><cOrgao>91</cOrgao><tpAmb>${environmentCode(input.environment)}</tpAmb><CNPJ>${input.cnpj}</CNPJ><chNFe>${input.accessKey}</chNFe><dhEvento>${new Date().toISOString()}</dhEvento><tpEvento>${code}</tpEvento><nSeqEvento>${input.sequence}</nSeqEvento><verEvento>1.00</verEvento><detEvento versao="1.00"><descEvento>${eventDescription[input.type]}</descEvento>${justification}</detEvento></infEvento></evento>`;
  const signature = new SignedXml({
    privateKey: input.privateKeyPem,
    publicCert: input.certificatePem,
    getKeyInfoContent: SignedXml.getKeyInfoContent,
  });
  signature.addReference({
    xpath: `//*[local-name(.)='infEvento' and @Id='${eventId}']`,
    transforms: [
      "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
      "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
    ],
    digestAlgorithm: "http://www.w3.org/2000/09/xmldsig#sha1",
  });
  signature.canonicalizationAlgorithm = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
  signature.signatureAlgorithm = "http://www.w3.org/2000/09/xmldsig#rsa-sha1";
  signature.computeSignature(xml, {
    location: { reference: "//*[local-name(.)='infEvento']", action: "after" },
  });
  return signature.getSignedXml();
}

const findTag = (xml: string, tag: string) => {
  const match = xml.match(new RegExp(`<(?:\\w+:)?${tag}[^>]*>([^<]*)</(?:\\w+:)?${tag}>`, "i"));
  return match?.[1]?.trim() ?? null;
};

export async function transmitManifestation(manifestationId: string, companyId: string) {
  if (!config.DFE_ENABLE_SEFAZ_TRANSMISSION) throw new Error("TRANSMISSAO_SEFAZ_DESABILITADA");
  const manifestation = await prisma.dfeManifestation.findFirst({
    where: { id: manifestationId, document: { companyId } },
    include: { document: true },
  });
  if (!manifestation?.document.accessKey) throw new Error("MANIFESTACAO_OU_CHAVE_NFE_NAO_ENCONTRADA");
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company?.cnpj) throw new Error("CNPJ_DA_EMPRESA_OBRIGATORIO");
  if (manifestation.type === "OPERATION_NOT_PERFORMED" && (manifestation.justification?.length ?? 0) < 15) {
    throw new Error("JUSTIFICATIVA_DA_OPERACAO_NAO_REALIZADA_INVALIDA");
  }
  const certificate = await certificateForCompany(company.id, manifestation.document.environment);
  const signedEvent = buildSignedManifestationXml({
    environment: manifestation.document.environment,
    cnpj: company.cnpj,
    accessKey: manifestation.document.accessKey,
    type: manifestation.type,
    sequence: manifestation.sequence,
    justification: manifestation.justification,
    privateKeyPem: certificate.material.privateKeyPem,
    certificatePem: certificate.material.certificatePem,
  });
  const batchId = String(Date.now()).slice(-15).padStart(15, "0");
  const requestXml = `<envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><idLote>${batchId}</idLote>${signedEvent}</envEvento>`;
  const soap = `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><nfeRecepcaoEvento xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4"><nfeDadosMsg>${requestXml}</nfeDadosMsg></nfeRecepcaoEvento></soap12:Body></soap12:Envelope>`;
  await prisma.dfeManifestation.update({
    where: { id: manifestation.id },
    data: { status: "PROCESSING", requestXml, requestHash: createHash("sha256").update(requestXml).digest("hex"), attemptedAt: new Date() },
  });
  try {
    const responseXml = await postSoap({
      url: endpoint("event", manifestation.document.environment),
      action: "http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4/nfeRecepcaoEvento",
      body: soap,
      pfx: certificate.pfx,
      passphrase: certificate.payload.passphrase,
    });
    const code = findTag(responseXml, "cStat");
    const message = findTag(responseXml, "xMotivo");
    const accepted = code === "128" || code === "135" || code === "136";
    return prisma.dfeManifestation.update({
      where: { id: manifestation.id },
      data: {
        status: accepted ? "ACCEPTED" : "REJECTED",
        responseXml,
        responseCode: code,
        responseMessage: message,
        protocol: findTag(responseXml, "nProt"),
        completedAt: new Date(),
      },
    });
  } catch (error) {
    await prisma.dfeManifestation.update({
      where: { id: manifestation.id },
      data: { status: "FAILED", responseMessage: error instanceof Error ? error.message : "FALHA_SEFAZ", completedAt: new Date() },
    });
    throw error;
  }
}
