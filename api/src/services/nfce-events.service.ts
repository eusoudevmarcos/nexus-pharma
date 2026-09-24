import { XMLParser } from "fast-xml-parser";

/**
 * Eventos fiscais da NFC-e: cancelamento (tpEvento 110111) via
 * NFeRecepcaoEvento4 e inutilização de numeração via NFeInutilizacao4.
 *
 * Módulo PURO: monta o XML (a assinar por signSefazXml) e interpreta a
 * resposta. A transmissão mTLS fica em nfce-transmission.service, gated pela
 * flag NFCE_ENABLE_SEFAZ_TRANSMISSION.
 */

const NFE_NS = "http://www.portalfiscal.inf.br/nfe";
export const NFCE_EVENT_ACTION = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4/nfeRecepcaoEvento";
export const NFCE_INUTILIZACAO_ACTION = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeInutilizacao4/nfeInutilizacaoNF";
export const CANCELAMENTO_TP_EVENTO = "110111";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", removeNSPrefix: true, parseTagValue: false, trimValues: true });

const onlyDigits = (value: string) => (value ?? "").replace(/\D/g, "");
const xmlEscape = (value: unknown) =>
  String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const text = (value: unknown): string | null => {
  if (typeof value === "string" || typeof value === "number") return String(value).trim() || null;
  return null;
};

function formatEventDateTime(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(date);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  const hour = pick("hour") === "24" ? "00" : pick("hour");
  return `${pick("year")}-${pick("month")}-${pick("day")}T${hour}:${pick("minute")}:${pick("second")}-03:00`;
}

// ---------------------------------------------------------------- Cancelamento

export type BuildCancelamentoInput = {
  accessKey: string;
  cnpj: string;
  protocol: string;
  justification: string;
  environment: "HOMOLOGATION" | "PRODUCTION";
  sequence?: number;
  eventDateTime?: Date;
};

/** XML do evento de cancelamento (NÃO assinado). Assinar em infEvento. */
export function buildNfceCancelamentoXml(input: BuildCancelamentoInput): { xml: string; eventId: string } {
  const accessKey = onlyDigits(input.accessKey);
  if (!/^\d{44}$/.test(accessKey)) throw new Error("NFCE_EVENTO_CHAVE_INVALIDA");
  const cnpj = onlyDigits(input.cnpj);
  if (!/^\d{14}$/.test(cnpj)) throw new Error("NFCE_EVENTO_CNPJ_INVALIDO");
  const protocol = onlyDigits(input.protocol);
  if (!protocol) throw new Error("NFCE_EVENTO_PROTOCOLO_INVALIDO");
  const justification = input.justification?.trim() ?? "";
  if (justification.length < 15 || justification.length > 255) throw new Error("NFCE_EVENTO_JUSTIFICATIVA_INVALIDA");

  const sequence = input.sequence ?? 1;
  const seq = String(sequence).padStart(2, "0");
  const eventId = `ID${CANCELAMENTO_TP_EVENTO}${accessKey}${seq}`;
  const cOrgao = accessKey.slice(0, 2);
  const tpAmb = input.environment === "PRODUCTION" ? "1" : "2";
  const dhEvento = formatEventDateTime(input.eventDateTime ?? new Date());

  const infEvento =
    `<infEvento Id="${eventId}">` +
    `<cOrgao>${cOrgao}</cOrgao><tpAmb>${tpAmb}</tpAmb><CNPJ>${cnpj}</CNPJ><chNFe>${accessKey}</chNFe>` +
    `<dhEvento>${dhEvento}</dhEvento><tpEvento>${CANCELAMENTO_TP_EVENTO}</tpEvento><nSeqEvento>${sequence}</nSeqEvento><verEvento>1.00</verEvento>` +
    `<detEvento versao="1.00"><descEvento>Cancelamento</descEvento><nProt>${protocol}</nProt><xJust>${xmlEscape(justification)}</xJust></detEvento>` +
    `</infEvento>`;
  const xml = `<evento versao="1.00" xmlns="${NFE_NS}">${infEvento}</evento>`;
  return { xml, eventId };
}

/** Monta o SOAP do lote de eventos a partir do evento já assinado. */
export function buildEventSoap(signedEventXml: string, idLote: string): { body: string; action: string } {
  if (!/<evento[\s>]/.test(signedEventXml)) throw new Error("NFCE_EVENTO_XML_SEM_EVENTO");
  if (!/<Signature[\s>]/.test(signedEventXml)) throw new Error("NFCE_EVENTO_XML_NAO_ASSINADO");
  const lote = onlyDigits(idLote) || "1";
  const envEvento = `<envEvento versao="1.00" xmlns="${NFE_NS}"><idLote>${lote}</idLote>${signedEventXml}</envEvento>`;
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body>` +
    `<nfeRecepcaoEvento xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4"><nfeDadosMsg>${envEvento}</nfeDadosMsg></nfeRecepcaoEvento>` +
    `</soap12:Body></soap12:Envelope>`;
  return { body, action: NFCE_EVENT_ACTION };
}

export type NfceEventResult = {
  batchStatus: string | null;
  eventStatus: string | null;
  eventMessage: string | null;
  protocol: string | null;
  accessKey: string | null;
  registered: boolean;
};

/** Interpreta a resposta de NFeRecepcaoEvento4 (135/136/155 = registrado). */
export function parseEventResponse(xml: string): NfceEventResult {
  const root = asObject(parser.parse(xml));
  const ret = asObject(
    asObject(asObject(asObject(asObject(root.Envelope).Body).nfeRecepcaoEventoResponse ?? asObject(root.Envelope).Body).nfeResultMsg ?? {}).retEnvEvento ?? root.retEnvEvento,
  );
  const retEvento = asObject(ret.retEvento);
  const infEvento = asObject(retEvento.infEvento);
  const eventStatus = text(infEvento.cStat);
  return {
    batchStatus: text(ret.cStat),
    eventStatus,
    eventMessage: text(infEvento.xMotivo),
    protocol: text(infEvento.nProt),
    accessKey: text(infEvento.chNFe),
    registered: eventStatus === "135" || eventStatus === "136" || eventStatus === "155",
  };
}

// --------------------------------------------------------------- Inutilização

export type BuildInutilizacaoInput = {
  cnpj: string;
  stateCode: string;
  year: number;
  model?: string;
  series: number;
  numberFrom: number;
  numberTo: number;
  justification: string;
  environment: "HOMOLOGATION" | "PRODUCTION";
};

/** XML de inutilização (NÃO assinado). Assinar em infInut. */
export function buildNfceInutilizacaoXml(input: BuildInutilizacaoInput): { xml: string; inutId: string } {
  const cnpj = onlyDigits(input.cnpj);
  if (!/^\d{14}$/.test(cnpj)) throw new Error("NFCE_INUTILIZACAO_CNPJ_INVALIDO");
  const cUF = onlyDigits(input.stateCode).padStart(2, "0").slice(-2);
  const justification = input.justification?.trim() ?? "";
  if (justification.length < 15 || justification.length > 255) throw new Error("NFCE_INUTILIZACAO_JUSTIFICATIVA_INVALIDA");
  if (input.numberFrom < 1 || input.numberTo < input.numberFrom) throw new Error("NFCE_INUTILIZACAO_FAIXA_INVALIDA");

  const model = input.model ?? "65";
  const ano = String(input.year).slice(-2);
  const serie = String(input.series).padStart(3, "0");
  const nIni = String(input.numberFrom).padStart(9, "0");
  const nFin = String(input.numberTo).padStart(9, "0");
  const inutId = `ID${cUF}${ano}${cnpj}${model}${serie}${nIni}${nFin}`;
  const tpAmb = input.environment === "PRODUCTION" ? "1" : "2";

  const infInut =
    `<infInut Id="${inutId}">` +
    `<tpAmb>${tpAmb}</tpAmb><xServ>INUTILIZAR</xServ><cUF>${cUF}</cUF><ano>${ano}</ano><CNPJ>${cnpj}</CNPJ>` +
    `<mod>${model}</mod><serie>${input.series}</serie><nNFIni>${input.numberFrom}</nNFIni><nNFFin>${input.numberTo}</nNFFin><xJust>${xmlEscape(justification)}</xJust>` +
    `</infInut>`;
  const xml = `<inutNFe versao="4.00" xmlns="${NFE_NS}">${infInut}</inutNFe>`;
  return { xml, inutId };
}

/** Monta o SOAP a partir do XML de inutilização já assinado. */
export function buildInutilizacaoSoap(signedInutXml: string): { body: string; action: string } {
  if (!/<inutNFe[\s>]/.test(signedInutXml)) throw new Error("NFCE_INUTILIZACAO_XML_SEM_INUTNFE");
  if (!/<Signature[\s>]/.test(signedInutXml)) throw new Error("NFCE_INUTILIZACAO_XML_NAO_ASSINADO");
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body>` +
    `<nfeInutilizacaoNF xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeInutilizacao4"><nfeDadosMsg>${signedInutXml}</nfeDadosMsg></nfeInutilizacaoNF>` +
    `</soap12:Body></soap12:Envelope>`;
  return { body, action: NFCE_INUTILIZACAO_ACTION };
}

export type NfceInutilizacaoResult = {
  status: string | null;
  message: string | null;
  protocol: string | null;
  homologated: boolean;
};

/** Interpreta a resposta de NFeInutilizacao4 (102 = inutilização homologada). */
export function parseInutilizacaoResponse(xml: string): NfceInutilizacaoResult {
  const root = asObject(parser.parse(xml));
  const ret = asObject(
    asObject(asObject(asObject(asObject(root.Envelope).Body).nfeInutilizacaoNFResponse ?? asObject(root.Envelope).Body).nfeResultMsg ?? {}).retInutNFe ?? root.retInutNFe,
  );
  const infInut = asObject(ret.infInut);
  const status = text(infInut.cStat);
  return {
    status,
    message: text(infInut.xMotivo),
    protocol: text(infInut.nProt),
    homologated: status === "102",
  };
}
