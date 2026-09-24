import { XMLParser } from "fast-xml-parser";

/**
 * Montagem do lote e leitura da resposta do webservice NFeAutorizacao4
 * (autorização de NFC-e / NF-e, leiaute 4.00).
 *
 * Estas funções são PURAS (não fazem I/O nem tocam segredos): montam o SOAP a
 * partir do XML já assinado e interpretam a resposta do SEFAZ. A transmissão
 * de fato (mTLS com o certificado A1) fica na camada de serviço, atrás da flag
 * NFCE_ENABLE_SEFAZ_TRANSMISSION, espelhando o padrão de sefaz-dfe.service.
 */

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
});

const NFE_NS = "http://www.portalfiscal.inf.br/nfe";
export const NFCE_AUTHORIZATION_ACTION =
  "http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4/nfeAutorizacaoLote";

export type BuildNfceLoteInput = {
  /** XML da NFe já assinada: <NFe ...>…<Signature/></NFe>. */
  signedNfeXml: string;
  /** Identificador do lote (numérico, até 15 posições). */
  idLote: string;
  /** true (padrão) processa de forma síncrona (indSinc=1). */
  synchronous?: boolean;
};

/** Monta o corpo SOAP 1.2 para o nfeAutorizacaoLote. */
export function buildNfceAuthorizationSoap(input: BuildNfceLoteInput): { body: string; action: string } {
  if (!/<NFe[\s>]/.test(input.signedNfeXml)) throw new Error("NFCE_SEFAZ_XML_SEM_NFE");
  if (!/<Signature[\s>]/.test(input.signedNfeXml)) throw new Error("NFCE_SEFAZ_XML_NAO_ASSINADO");
  const idLote = input.idLote.replace(/\D/g, "");
  if (!idLote) throw new Error("NFCE_SEFAZ_ID_LOTE_INVALIDO");
  const indSinc = input.synchronous === false ? "0" : "1";
  // O XML da NFe já carrega o namespace padrão; não repetimos xmlns no NFe.
  const enviNFe = `<enviNFe versao="4.00" xmlns="${NFE_NS}"><idLote>${idLote}</idLote><indSinc>${indSinc}</indSinc>${input.signedNfeXml}</enviNFe>`;
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">` +
    `<soap12:Body>` +
    `<nfeAutorizacaoLote xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4">` +
    `<nfeDadosMsg>${enviNFe}</nfeDadosMsg>` +
    `</nfeAutorizacaoLote>` +
    `</soap12:Body></soap12:Envelope>`;
  return { body, action: NFCE_AUTHORIZATION_ACTION };
}

export type NfceAuthorizationResult = {
  /** cStat do lote (103 recebido, 104 processado, ou erro). */
  batchStatus: string | null;
  batchMessage: string | null;
  /** cStat do protocolo da nota (100 autorizado; caso contrário, rejeição). */
  protocolStatus: string | null;
  protocolMessage: string | null;
  accessKey: string | null;
  protocol: string | null;
  receivedAt: string | null;
  digestValue: string | null;
  environmentCode: string | null;
  /** true somente quando o protocolo da nota é 100 (autorizado). */
  authorized: boolean;
  /** true para códigos transitórios em que se deve consultar o recibo. */
  pending: boolean;
};

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const text = (value: unknown): string | null => {
  if (typeof value === "string" || typeof value === "number") {
    const normalized = String(value).trim();
    return normalized || null;
  }
  return null;
};

/**
 * Interpreta a resposta do NFeAutorizacao4 (envelope SOAP ou retEnviNFe cru).
 * Sempre retorna um objeto — nunca lança por status de rejeição — para que a
 * camada de serviço decida como persistir (autorizado, rejeitado, pendente).
 */
export function parseNfceAuthorizationResponse(xml: string): NfceAuthorizationResult {
  const root = asObject(parser.parse(xml));
  const envelope = asObject(root.Envelope);
  const body = asObject(envelope.Body);
  const response = asObject(body.nfeAutorizacaoLoteResponse ?? body);
  const result = asObject(response.nfeResultMsg ?? response);
  const ret = asObject(result.retEnviNFe ?? root.retEnviNFe ?? result);

  const protocolNode = asObject(ret.protNFe);
  const infProt = asObject(protocolNode.infProt);

  const protocolStatus = text(infProt.cStat);
  const batchStatus = text(ret.cStat);

  return {
    batchStatus,
    batchMessage: text(ret.xMotivo),
    protocolStatus,
    protocolMessage: text(infProt.xMotivo),
    accessKey: text(infProt.chNFe),
    protocol: text(infProt.nProt),
    receivedAt: text(infProt.dhRecbto) ?? text(ret.dhRecbto),
    digestValue: text(infProt.digVal),
    environmentCode: text(infProt.tpAmb) ?? text(ret.tpAmb),
    authorized: protocolStatus === "100" || protocolStatus === "150",
    pending: batchStatus === "103" || batchStatus === "105",
  };
}
