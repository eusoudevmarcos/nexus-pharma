import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
});

type XmlNode = Record<string, unknown>;

export type ParsedNfeItem = {
  itemNumber: number;
  supplierCode: string | null;
  ean: string | null;
  description: string;
  ncm: string;
  cest: string | null;
  cfop: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  cstIcms: string | null;
  csosn: string | null;
  cstPis: string | null;
  cstCofins: string | null;
  originalTax: Record<string, unknown>;
};

export type ParsedNfeDocument = {
  documentType: "NFE" | "NFE_SUMMARY" | "EVENT" | "UNKNOWN";
  accessKey: string | null;
  schemaName: string;
  issuerTaxId: string | null;
  issuerName: string | null;
  recipientTaxId: string | null;
  originState: string | null;
  destinationState: string | null;
  documentNumber: string | null;
  issuedAt: Date | null;
  totalAmount: number;
  summary: Record<string, unknown>;
  items: ParsedNfeItem[];
};

const asObject = (value: unknown): XmlNode =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as XmlNode)
    : {};

const asArray = (value: unknown): unknown[] =>
  value === undefined || value === null
    ? []
    : Array.isArray(value)
      ? value
      : [value];

const text = (value: unknown): string | null => {
  if (typeof value === "string" || typeof value === "number") {
    const normalized = String(value).trim();
    return normalized || null;
  }
  return null;
};

const digits = (value: unknown, length?: number): string | null => {
  const normalized = (text(value) ?? "").replace(/\D/g, "");
  if (!normalized || (length && normalized.length !== length)) return null;
  return normalized;
};

const numberValue = (value: unknown): number => {
  const normalized = text(value)?.replace(",", ".");
  const parsed = normalized ? Number(normalized) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
};

const dateValue = (value: unknown): Date | null => {
  const normalized = text(value);
  if (!normalized) return null;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const firstTaxGroup = (node: unknown): XmlNode => {
  const object = asObject(node);
  for (const value of Object.values(object)) {
    if (value && typeof value === "object") return asObject(value);
  }
  return object;
};

const safeEan = (value: unknown): string | null => {
  const normalized = digits(value);
  return normalized && normalized.length >= 8 && normalized.length <= 14
    ? normalized
    : null;
};

function parseFullNfe(root: XmlNode): ParsedNfeDocument {
  const nfeProc = asObject(root.nfeProc);
  const nfe = asObject(nfeProc.NFe ?? root.NFe);
  const infNfe = asObject(nfe.infNFe);
  const ide = asObject(infNfe.ide);
  const emit = asObject(infNfe.emit);
  const dest = asObject(infNfe.dest);
  const total = asObject(asObject(infNfe.total).ICMSTot);
  const protocol = asObject(asObject(nfeProc.protNFe).infProt);
  const id = text(infNfe.Id);
  const accessKey =
    digits(protocol.chNFe, 44) ?? digits(id?.replace(/^NFe/i, ""), 44);

  const items = asArray(infNfe.det).map((entry, index): ParsedNfeItem => {
    const det = asObject(entry);
    const product = asObject(det.prod);
    const tax = asObject(det.imposto);
    const icms = firstTaxGroup(tax.ICMS);
    const pis = firstTaxGroup(tax.PIS);
    const cofins = firstTaxGroup(tax.COFINS);
    const itemNumber = Number.parseInt(text(det.nItem) ?? "", 10);
    return {
      itemNumber: Number.isFinite(itemNumber) ? itemNumber : index + 1,
      supplierCode: text(product.cProd),
      ean: safeEan(product.cEANTrib ?? product.cEAN),
      description: text(product.xProd) ?? `Item ${index + 1}`,
      ncm: digits(product.NCM, 8) ?? "00000000",
      cest: digits(product.CEST, 7),
      cfop: digits(product.CFOP, 4) ?? "0000",
      unit: text(product.uTrib ?? product.uCom) ?? "UN",
      quantity: numberValue(product.qTrib ?? product.qCom),
      unitPrice: numberValue(product.vUnTrib ?? product.vUnCom),
      totalAmount: numberValue(product.vProd),
      cstIcms: digits(icms.CST),
      csosn: digits(icms.CSOSN, 3),
      cstPis: digits(pis.CST, 2),
      cstCofins: digits(cofins.CST, 2),
      originalTax: {
        icms,
        pis,
        cofins,
        ipi: tax.IPI ?? null,
        ibsCbs: tax.IBSCBS ?? tax.IBSCBSMono ?? null,
      },
    };
  });

  return {
    documentType: "NFE",
    accessKey,
    schemaName: text(nfeProc.versao ?? infNfe.versao) ?? "nfe",
    issuerTaxId: digits(emit.CNPJ, 14) ?? digits(emit.CPF, 11),
    issuerName: text(emit.xNome),
    recipientTaxId: digits(dest.CNPJ, 14) ?? digits(dest.CPF, 11),
    originState: text(asObject(emit.enderEmit).UF),
    destinationState: text(asObject(dest.enderDest).UF),
    documentNumber: text(ide.nNF),
    issuedAt: dateValue(ide.dhEmi ?? ide.dEmi),
    totalAmount: numberValue(total.vNF),
    summary: {
      model: text(ide.mod),
      series: text(ide.serie),
      purpose: text(ide.finNFe),
      protocol: text(protocol.nProt),
    },
    items,
  };
}

function parseSummary(root: XmlNode): ParsedNfeDocument {
  const summary = asObject(root.resNFe);
  return {
    documentType: "NFE_SUMMARY",
    accessKey: digits(summary.chNFe, 44),
    schemaName: text(summary.versao) ?? "resNFe",
    issuerTaxId: digits(summary.CNPJ, 14) ?? digits(summary.CPF, 11),
    issuerName: text(summary.xNome),
    recipientTaxId: null,
    originState: null,
    destinationState: null,
    documentNumber: null,
    issuedAt: dateValue(summary.dhEmi),
    totalAmount: numberValue(summary.vNF),
    summary: {
      ie: text(summary.IE),
      operation: text(summary.tpNF),
      digest: text(summary.digVal),
      situation: text(summary.cSitNFe),
    },
    items: [],
  };
}

export function parseNfeXml(xml: string): ParsedNfeDocument {
  if (!xml.trim().startsWith("<") || xml.length > 10_000_000) {
    throw new Error("XML_DFE_INVALIDO");
  }
  const parsed = asObject(parser.parse(xml));
  if (parsed.nfeProc || parsed.NFe) return parseFullNfe(parsed);
  if (parsed.resNFe) return parseSummary(parsed);
  if (parsed.procEventoNFe || parsed.resEvento || parsed.evento) {
    const event = asObject(parsed.procEventoNFe ?? parsed.resEvento ?? parsed.evento);
    const eventInfo = asObject(event.infEvento ?? asObject(event.evento).infEvento);
    return {
      documentType: "EVENT",
      accessKey: digits(eventInfo.chNFe, 44),
      schemaName: text(event.versao) ?? "evento",
      issuerTaxId: digits(eventInfo.CNPJ, 14) ?? digits(eventInfo.CPF, 11),
      issuerName: null,
      recipientTaxId: null,
      originState: null,
      destinationState: null,
      documentNumber: null,
      issuedAt: dateValue(eventInfo.dhEvento),
      totalAmount: 0,
      summary: { eventType: text(eventInfo.tpEvento), sequence: text(eventInfo.nSeqEvento) },
      items: [],
    };
  }
  throw new Error("TIPO_XML_DFE_NAO_SUPORTADO");
}

export function parseDistributionResponse(xml: string) {
  const parsed = asObject(parser.parse(xml));
  const envelope = asObject(parsed.Envelope);
  const body = asObject(envelope.Body);
  const response = asObject(body.nfeDistDFeInteresseResponse ?? body);
  const result = asObject(response.nfeDistDFeInteresseResult ?? response);
  const ret = asObject(result.retDistDFeInt ?? result);
  const batch = asObject(ret.loteDistDFeInt);
  return {
    statusCode: text(ret.cStat),
    statusMessage: text(ret.xMotivo),
    lastNsu: digits(ret.ultNSU, 15) ?? "000000000000000",
    maxNsu: digits(ret.maxNSU, 15) ?? "000000000000000",
    documents: asArray(batch.docZip).map((entry) => {
      const doc = asObject(entry);
      return {
        nsu: digits(doc.NSU, 15),
        schemaName: text(doc.schema) ?? "desconhecido",
        zippedBase64: text(doc["#text"] ?? doc._text ?? entry) ?? "",
      };
    }),
  };
}
