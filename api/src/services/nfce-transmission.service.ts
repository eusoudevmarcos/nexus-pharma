import { createHash } from "node:crypto";
import { config } from "../config.js";
import { prisma } from "../infra/prisma.js";
import { certificateForCompany, postSoap } from "./sefaz-dfe.service.js";
import { certificateEncryptionKey, decryptSensitivePayload } from "./dfe-certificate.service.js";
import { signNfceXml } from "./nfce-signature.service.js";
import { buildNfceQrCode } from "./nfce-qrcode.service.js";
import { injectNfceSupl } from "./nfce-layout.service.js";
import { buildNfceAuthorizationSoap, parseNfceAuthorizationResponse } from "./nfce-sefaz.service.js";
import { signSefazXml } from "./nfce-signature.service.js";
import { buildNfceCancelamentoXml, buildEventSoap, parseEventResponse } from "./nfce-events.service.js";

/**
 * Transmissão da NFC-e ao webservice NFeAutorizacao4, orquestrando as peças
 * puras (assinatura, QR, SOAP, parser) com o cofre de certificado A1.
 *
 * SEMPRE gated por config.NFCE_ENABLE_SEFAZ_TRANSMISSION: enquanto a flag
 * estiver desligada (padrão), nada é enviado ao SEFAZ. Espelha o padrão de
 * segurança de sefaz-dfe.service (mTLS, timeout, tamanho máximo de resposta).
 */

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

function extractProtNFe(xml: string): string | null {
  return xml.match(/<protNFe[\s\S]*?<\/protNFe>/)?.[0] ?? null;
}

function payloadTotalGross(fiscalPayload: unknown): number {
  const totals = (fiscalPayload as { totals?: { gross?: number | string } } | null)?.totals;
  return Number(totals?.gross ?? 0);
}

export type NfceAuthorizationOutcome = {
  authorized: boolean;
  idempotent: boolean;
  status: string | null;
  message: string | null;
  protocol: string | null;
};

export async function authorizeNfceDocument(input: {
  companyId: string;
  documentId: string;
  userId: string;
  requestId: string;
}): Promise<NfceAuthorizationOutcome> {
  if (!config.NFCE_ENABLE_SEFAZ_TRANSMISSION) throw new Error("NFCE_TRANSMISSAO_SEFAZ_DESABILITADA");

  const document = await prisma.nfceDocument.findFirst({
    where: { id: input.documentId, companyId: input.companyId },
  });
  if (!document) throw new Error("NFCE_DOCUMENTO_NAO_ENCONTRADO");
  if (document.status === "AUTHORIZED") {
    return { authorized: true, idempotent: true, status: "100", message: null, protocol: document.protocol };
  }
  if (document.status === "CANCELLED") throw new Error("NFCE_DOCUMENTO_CANCELADO");

  const cfg = await prisma.nfceConfiguration.findUnique({
    where: { companyId_environment: { companyId: input.companyId, environment: document.environment } },
  });
  if (!cfg?.active) throw new Error("NFCE_CONFIGURACAO_NAO_ATIVA");
  if (!cfg.authorizationUrl) throw new Error("NFCE_ENDPOINT_AUTORIZACAO_NAO_CONFIGURADO");
  if (!cfg.qrCodeBaseUrl) throw new Error("NFCE_URL_QRCODE_NAO_CONFIGURADA");
  if (!cfg.cscIdentifier || !cfg.encryptedCsc) throw new Error("NFCE_CSC_NAO_CONFIGURADO");

  const csc = decryptSensitivePayload<{ csc: string }>(
    cfg.encryptedCsc,
    certificateEncryptionKey(config.DFE_CERTIFICATE_ENCRYPTION_KEY),
  ).csc;
  const cert = await certificateForCompany(input.companyId, document.environment);

  // 1) Assinatura do XML oficial (não assinado) armazenado no preparo.
  const signed = signNfceXml({
    xml: document.xmlDraft,
    certificatePem: cert.material.certificatePem,
    privateKeyPem: cert.material.privateKeyPem,
  });

  // 2) QR Code (online, ou offline com digest quando em contingência).
  const offline = document.emissionType === "OFFLINE_CONTINGENCY"
    ? {
        emissionDay: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", day: "2-digit" }).format(document.issuedAt),
        totalAmount: payloadTotalGross(document.fiscalPayload),
        digestValueHex: signed.digestValueHex,
      }
    : undefined;
  const qr = buildNfceQrCode({
    accessKey: document.accessKey,
    environment: document.environment,
    cscId: cfg.cscIdentifier,
    csc,
    baseUrl: cfg.qrCodeBaseUrl,
    consultationUrl: cfg.consultationUrl ?? undefined,
    offline,
  });

  // 3) Documento final com o QR na posição correta (entre infNFe e Signature).
  const finalXml = injectNfceSupl(signed.signedXml, { qrCode: qr.qrCode, urlChave: qr.urlChave });

  // 4) Montagem do lote e transmissão mTLS.
  const { body, action } = buildNfceAuthorizationSoap({ signedNfeXml: finalXml, idLote: String(document.number) });
  const attempt = await prisma.nfceTransmissionAttempt.create({
    data: { documentId: document.id, status: "PROCESSING", requestHash: hash(finalXml), startedAt: new Date() },
  });

  let responseXml: string;
  try {
    responseXml = await postSoap({
      url: new URL(cfg.authorizationUrl),
      action,
      body,
      pfx: cert.pfx,
      passphrase: cert.payload.passphrase,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "ERRO_DESCONHECIDO";
    await prisma.nfceTransmissionAttempt.update({
      where: { id: attempt.id },
      data: { status: "FAILED", responseMessage: message, completedAt: new Date() },
    });
    throw new Error(`NFCE_TRANSMISSAO_FALHOU:${message}`);
  }

  // 5) Interpretação e persistência do resultado.
  const result = parseNfceAuthorizationResponse(responseXml);
  const protNFe = extractProtNFe(responseXml);
  const authorizedXml = result.authorized && protNFe
    ? `<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">${finalXml}${protNFe}</nfeProc>`
    : null;

  await prisma.$transaction(async (tx) => {
    await tx.nfceTransmissionAttempt.update({
      where: { id: attempt.id },
      data: {
        status: result.authorized ? "ACCEPTED" : "REJECTED",
        responseCode: result.protocolStatus ?? result.batchStatus,
        responseMessage: (result.protocolMessage ?? result.batchMessage)?.slice(0, 500) ?? null,
        protocol: result.protocol,
        completedAt: new Date(),
      },
    });
    await tx.nfceDocument.update({
      where: { id: document.id },
      data: {
        status: result.authorized ? "AUTHORIZED" : "REJECTED",
        authorizedXml,
        protocol: result.protocol,
        authorizedAt: result.authorized ? new Date() : null,
      },
    });
    await tx.auditLog.create({
      data: {
        companyId: input.companyId,
        userId: input.userId,
        action: result.authorized ? "AUTHORIZE" : "REJECT",
        entity: "NFCE_DOCUMENT",
        entityId: document.id,
        requestId: input.requestId,
        after: { cStat: result.protocolStatus, batch: result.batchStatus, motivo: result.protocolMessage, protocolo: result.protocol },
      },
    });
  });

  return {
    authorized: result.authorized,
    idempotent: false,
    status: result.protocolStatus,
    message: result.protocolMessage,
    protocol: result.protocol,
  };
}

export type NfceCancellationOutcome = {
  cancelled: boolean;
  idempotent: boolean;
  status: string | null;
  message: string | null;
  protocol: string | null;
};

/**
 * Cancela uma NFC-e autorizada via evento 110111 (NFeRecepcaoEvento4).
 * Gated por NFCE_ENABLE_SEFAZ_TRANSMISSION.
 */
export async function cancelNfceDocument(input: {
  companyId: string;
  documentId: string;
  userId: string;
  requestId: string;
  justification: string;
  sequence?: number;
}): Promise<NfceCancellationOutcome> {
  if (!config.NFCE_ENABLE_SEFAZ_TRANSMISSION) throw new Error("NFCE_TRANSMISSAO_SEFAZ_DESABILITADA");

  const document = await prisma.nfceDocument.findFirst({
    where: { id: input.documentId, companyId: input.companyId },
    include: { company: { select: { cnpj: true } } },
  });
  if (!document) throw new Error("NFCE_DOCUMENTO_NAO_ENCONTRADO");
  if (document.status === "CANCELLED") {
    return { cancelled: true, idempotent: true, status: "135", message: null, protocol: document.protocol };
  }
  if (document.status !== "AUTHORIZED" || !document.protocol) throw new Error("NFCE_DOCUMENTO_NAO_AUTORIZADO_PARA_CANCELAMENTO");

  const cfg = await prisma.nfceConfiguration.findUnique({
    where: { companyId_environment: { companyId: input.companyId, environment: document.environment } },
  });
  if (!cfg?.active) throw new Error("NFCE_CONFIGURACAO_NAO_ATIVA");
  if (!cfg.eventUrl) throw new Error("NFCE_ENDPOINT_EVENTO_NAO_CONFIGURADO");

  const cert = await certificateForCompany(input.companyId, document.environment);
  const { xml } = buildNfceCancelamentoXml({
    accessKey: document.accessKey,
    cnpj: document.company.cnpj ?? "",
    protocol: document.protocol,
    justification: input.justification,
    environment: document.environment,
    sequence: input.sequence,
  });
  const signed = signSefazXml({ xml, tagName: "infEvento", certificatePem: cert.material.certificatePem, privateKeyPem: cert.material.privateKeyPem });
  const { body, action } = buildEventSoap(signed.signedXml, String(document.number));

  const attempt = await prisma.nfceTransmissionAttempt.create({
    data: { documentId: document.id, status: "PROCESSING", requestHash: hash(signed.signedXml), startedAt: new Date() },
  });

  let responseXml: string;
  try {
    responseXml = await postSoap({ url: new URL(cfg.eventUrl), action, body, pfx: cert.pfx, passphrase: cert.payload.passphrase });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "ERRO_DESCONHECIDO";
    await prisma.nfceTransmissionAttempt.update({ where: { id: attempt.id }, data: { status: "FAILED", responseMessage: message, completedAt: new Date() } });
    throw new Error(`NFCE_CANCELAMENTO_FALHOU:${message}`);
  }

  const result = parseEventResponse(responseXml);

  await prisma.$transaction(async (tx) => {
    await tx.nfceTransmissionAttempt.update({
      where: { id: attempt.id },
      data: { status: result.registered ? "ACCEPTED" : "REJECTED", responseCode: result.eventStatus ?? result.batchStatus, responseMessage: (result.eventMessage)?.slice(0, 500) ?? null, protocol: result.protocol, completedAt: new Date() },
    });
    if (result.registered) {
      await tx.nfceDocument.update({ where: { id: document.id }, data: { status: "CANCELLED" } });
    }
    await tx.auditLog.create({
      data: { companyId: input.companyId, userId: input.userId, action: result.registered ? "CANCEL" : "CANCEL_REJECTED", entity: "NFCE_DOCUMENT", entityId: document.id, requestId: input.requestId, after: { cStat: result.eventStatus, motivo: result.eventMessage, protocolo: result.protocol, justificativa: input.justification } },
    });
  });

  return { cancelled: result.registered, idempotent: false, status: result.eventStatus, message: result.eventMessage, protocol: result.protocol };
}
