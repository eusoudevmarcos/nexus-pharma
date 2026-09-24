/**
 * Construção do XML da NFC-e (modelo 65) no leiaute OFICIAL 4.00 da NF-e
 * (namespace http://www.portalfiscal.inf.br/nfe), grupo infNFe.
 *
 * Este módulo produz o documento NÃO ASSINADO e SEM infNFeSupl (QR Code):
 *
 *   <NFe><infNFe versao="4.00" Id="NFe{chave}">…</infNFe></NFe>
 *
 * A ordem de montagem do documento final é:
 *   1) buildNfceInfXml()  -> infNFe
 *   2) signNfceXml()      -> insere <Signature> após infNFe
 *   3) injectNfceSupl()   -> insere <infNFeSupl> (QR) ENTRE infNFe e Signature
 *
 * O grupo IBS/CBS (Reforma Tributária, NT 2025.002) fica desligado por padrão
 * (includeReformGroups=false) porque o seu XSD ainda está em versionamento;
 * os dados já trafegam e o grupo é ativado quando o schema oficial for fixado.
 *
 * Módulo puro e determinístico: não acessa banco, rede nem segredos.
 */

export type NfceLayoutEnvironment = "HOMOLOGATION" | "PRODUCTION";
export type NfceEmissionType = "NORMAL" | "OFFLINE_CONTINGENCY";

export type NfceIssuer = {
  cnpj: string;
  legalName: string;
  tradeName?: string | null;
  /** Inscrição Estadual (IE) — apenas dígitos. */
  stateRegistration: string;
  /** CRT: "1" Simples Nacional, "2" Simples (excesso sublimite), "3" Regime Normal. */
  taxRegimeCode: "1" | "2" | "3";
  address: {
    street: string;
    number: string;
    complement?: string | null;
    district: string;
    /** Código IBGE do município (7 dígitos). */
    cityCode: string;
    cityName: string;
    state: string;
    /** CEP (8 dígitos). */
    zipCode: string;
    phone?: string | null;
  };
};

export type NfceCustomer = { taxId?: string | null; name?: string | null } | null;

export type NfceItemTaxes = {
  /** Origem da mercadoria (0-8). Padrão "0" (nacional). */
  origin?: string | null;
  cstIcms?: string | null;
  csosn?: string | null;
  icmsBase?: number | null;
  icmsRate?: number | null;
  icmsAmount?: number | null;
  icmsStBaseRetained?: number | null;
  icmsStRetained?: number | null;
  cstPis: string;
  pisBase?: number | null;
  pisRate?: number | null;
  pisAmount?: number | null;
  cstCofins: string;
  cofinsBase?: number | null;
  cofinsRate?: number | null;
  cofinsAmount?: number | null;
};

export type NfceItem = {
  /** Código interno do produto (cProd). */
  code: string;
  /** GTIN/EAN; quando ausente ou inválido usa "SEM GTIN". */
  ean?: string | null;
  description: string;
  ncm: string;
  cest?: string | null;
  cfop: string;
  /** Unidade comercial/tributável (uCom/uTrib). Padrão "UN". */
  unit?: string | null;
  quantity: number;
  unitPrice: number;
  /** Valor bruto do item (vProd), antes do desconto. */
  grossAmount: number;
  discount?: number | null;
  taxes: NfceItemTaxes;
};

export type NfcePayment = {
  /** Código tPag do meio de pagamento (ex.: "01" dinheiro, "17" PIX). */
  method: string;
  amount: number;
  /** Troco (vTroco), quando houver. */
  change?: number | null;
};

export type NfceLayoutInput = {
  /** Chave de acesso já calculada (44 dígitos). */
  accessKey: string;
  environment: NfceLayoutEnvironment;
  emissionType: NfceEmissionType;
  series: number;
  number: number;
  /** Código numérico aleatório da nota (cNF, 8 dígitos). */
  numericCode: string;
  issuedAt: Date;
  operationNature?: string;
  issuer: NfceIssuer;
  customer?: NfceCustomer;
  items: NfceItem[];
  payments: NfcePayment[];
  additionalInfo?: string | null;
  processVersion?: string;
  /** Ativa o grupo IBS/CBS (default false até o XSD oficial ser fixado). */
  includeReformGroups?: boolean;
};

export const HOMOLOGATION_ITEM_DESCRIPTION =
  "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL";

const onlyDigits = (value: string) => (value ?? "").replace(/\D/g, "");
const money = (value: number | null | undefined) =>
  (Math.round(((value ?? 0) + Number.EPSILON) * 100) / 100).toFixed(2);
const qty = (value: number | null | undefined) => (value ?? 0).toFixed(4);
const unitValue = (value: number | null | undefined) => (value ?? 0).toFixed(2);
const rate = (value: number | null | undefined) =>
  (Math.round(((value ?? 0) + Number.EPSILON) * 10000) / 10000).toFixed(4);

const xmlEscape = (value: unknown) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

function tag(name: string, value: unknown): string {
  return `<${name}>${xmlEscape(value)}</${name}>`;
}

/** dhEmi no formato AAAA-MM-DDThh:mm:ss-03:00 (horário de Brasília, fixo). */
function formatDhEmi(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  const hour = pick("hour") === "24" ? "00" : pick("hour");
  return `${pick("year")}-${pick("month")}-${pick("day")}T${hour}:${pick("minute")}:${pick("second")}-03:00`;
}

function gtin(ean: string | null | undefined): string {
  const digits = onlyDigits(ean ?? "");
  return [8, 12, 13, 14].includes(digits.length) ? digits : "SEM GTIN";
}

function buildIcmsGroup(taxes: NfceItemTaxes, regimeCode: string): string {
  const origin = taxes.origin ?? "0";
  const isSimples = regimeCode === "1" || regimeCode === "2";
  if (isSimples) {
    const csosn = taxes.csosn ?? "102";
    if (csosn === "500") {
      return `<ICMSSN500>${tag("orig", origin)}${tag("CSOSN", csosn)}${tag("vBCSTRet", money(taxes.icmsStBaseRetained))}${tag("vICMSSTRet", money(taxes.icmsStRetained))}</ICMSSN500>`;
    }
    if (csosn === "900") {
      return `<ICMSSN900>${tag("orig", origin)}${tag("CSOSN", csosn)}${tag("modBC", "3")}${tag("vBC", money(taxes.icmsBase))}${tag("pICMS", rate(taxes.icmsRate))}${tag("vICMS", money(taxes.icmsAmount))}</ICMSSN900>`;
    }
    if (csosn === "101") {
      return `<ICMSSN101>${tag("orig", origin)}${tag("CSOSN", csosn)}${tag("pCredSN", rate(taxes.icmsRate))}${tag("vCredICMSSN", money(taxes.icmsAmount))}</ICMSSN101>`;
    }
    // 102, 103, 300, 400 e similares: sem valores de ICMS.
    return `<ICMSSN102>${tag("orig", origin)}${tag("CSOSN", csosn)}</ICMSSN102>`;
  }
  const cst = taxes.cstIcms ?? "00";
  if (cst === "00") {
    return `<ICMS00>${tag("orig", origin)}${tag("CST", cst)}${tag("modBC", "3")}${tag("vBC", money(taxes.icmsBase))}${tag("pICMS", rate(taxes.icmsRate))}${tag("vICMS", money(taxes.icmsAmount))}</ICMS00>`;
  }
  if (cst === "60") {
    return `<ICMS60>${tag("orig", origin)}${tag("CST", cst)}${tag("vBCSTRet", money(taxes.icmsStBaseRetained))}${tag("vICMSSTRet", money(taxes.icmsStRetained))}</ICMS60>`;
  }
  // 40, 41, 50 e demais isentos/não tributados.
  return `<ICMS40>${tag("orig", origin)}${tag("CST", cst)}</ICMS40>`;
}

function buildPisGroup(taxes: NfceItemTaxes): string {
  const cst = taxes.cstPis;
  if (["01", "02"].includes(cst)) {
    return `<PIS><PISAliq>${tag("CST", cst)}${tag("vBC", money(taxes.pisBase))}${tag("pPIS", rate(taxes.pisRate))}${tag("vPIS", money(taxes.pisAmount))}</PISAliq></PIS>`;
  }
  if (["04", "05", "06", "07", "08", "09"].includes(cst)) {
    return `<PIS><PISNT>${tag("CST", cst)}</PISNT></PIS>`;
  }
  return `<PIS><PISOutr>${tag("CST", cst)}${tag("vBC", money(taxes.pisBase))}${tag("pPIS", rate(taxes.pisRate))}${tag("vPIS", money(taxes.pisAmount))}</PISOutr></PIS>`;
}

function buildCofinsGroup(taxes: NfceItemTaxes): string {
  const cst = taxes.cstCofins;
  if (["01", "02"].includes(cst)) {
    return `<COFINS><COFINSAliq>${tag("CST", cst)}${tag("vBC", money(taxes.cofinsBase))}${tag("pCOFINS", rate(taxes.cofinsRate))}${tag("vCOFINS", money(taxes.cofinsAmount))}</COFINSAliq></COFINS>`;
  }
  if (["04", "05", "06", "07", "08", "09"].includes(cst)) {
    return `<COFINS><COFINSNT>${tag("CST", cst)}</COFINSNT></COFINS>`;
  }
  return `<COFINS><COFINSOutr>${tag("CST", cst)}${tag("vBC", money(taxes.cofinsBase))}${tag("pCOFINS", rate(taxes.cofinsRate))}${tag("vCOFINS", money(taxes.cofinsAmount))}</COFINSOutr></COFINS>`;
}

function buildItem(item: NfceItem, index: number, regimeCode: string, homologation: boolean): string {
  const description = homologation && index === 0 ? HOMOLOGATION_ITEM_DESCRIPTION : item.description;
  const code = gtin(item.ean);
  const unit = (item.unit ?? "UN").trim() || "UN";
  const prod =
    tag("cProd", item.code) +
    tag("cEAN", code) +
    tag("xProd", description) +
    tag("NCM", item.ncm) +
    (item.cest ? tag("CEST", onlyDigits(item.cest)) : "") +
    tag("CFOP", item.cfop) +
    tag("uCom", unit) +
    tag("qCom", qty(item.quantity)) +
    tag("vUnCom", unitValue(item.unitPrice)) +
    tag("vProd", money(item.grossAmount)) +
    tag("cEANTrib", code) +
    tag("uTrib", unit) +
    tag("qTrib", qty(item.quantity)) +
    tag("vUnTrib", unitValue(item.unitPrice)) +
    (item.discount && item.discount > 0 ? tag("vDesc", money(item.discount)) : "") +
    tag("indTot", "1");
  const imposto =
    buildIcmsGroup(item.taxes, regimeCode) + buildPisGroup(item.taxes) + buildCofinsGroup(item.taxes);
  return `<det nItem="${index + 1}"><prod>${prod}</prod><imposto>${imposto}</imposto></det>`;
}

function buildTotals(items: NfceItem[]): string {
  const sum = (fn: (item: NfceItem) => number) => items.reduce((total, item) => total + fn(item), 0);
  const vBC = sum((item) => Number(item.taxes.icmsBase ?? 0));
  const vICMS = sum((item) => Number(item.taxes.icmsAmount ?? 0));
  const vProd = sum((item) => Number(item.grossAmount));
  const vDesc = sum((item) => Number(item.discount ?? 0));
  const vPIS = sum((item) => Number(item.taxes.pisAmount ?? 0));
  const vCOFINS = sum((item) => Number(item.taxes.cofinsAmount ?? 0));
  const vNF = vProd - vDesc;
  return (
    "<total><ICMSTot>" +
    tag("vBC", money(vBC)) +
    tag("vICMS", money(vICMS)) +
    tag("vICMSDeson", money(0)) +
    tag("vFCP", money(0)) +
    tag("vBCST", money(0)) +
    tag("vST", money(0)) +
    tag("vFCPST", money(0)) +
    tag("vFCPSTRet", money(0)) +
    tag("vProd", money(vProd)) +
    tag("vFrete", money(0)) +
    tag("vSeg", money(0)) +
    tag("vDesc", money(vDesc)) +
    tag("vII", money(0)) +
    tag("vIPI", money(0)) +
    tag("vIPIDevol", money(0)) +
    tag("vPIS", money(vPIS)) +
    tag("vCOFINS", money(vCOFINS)) +
    tag("vOutro", money(0)) +
    tag("vNF", money(vNF)) +
    "</ICMSTot></total>"
  );
}

function buildPayments(payments: NfcePayment[]): string {
  const details = payments
    .map((payment) => `<detPag>${tag("tPag", payment.method)}${tag("vPag", money(payment.amount))}</detPag>`)
    .join("");
  const change = payments.reduce((total, payment) => total + Number(payment.change ?? 0), 0);
  return `<pag>${details}${change > 0 ? tag("vTroco", money(change)) : ""}</pag>`;
}

function buildDest(customer: NfceCustomer, homologation: boolean): string {
  const taxId = customer?.taxId ? onlyDigits(customer.taxId) : "";
  if (!taxId) return "";
  const identifier = taxId.length === 14 ? tag("CNPJ", taxId) : tag("CPF", taxId);
  const name = homologation
    ? tag("xNome", "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL")
    : customer?.name
      ? tag("xNome", customer.name)
      : "";
  return `<dest>${identifier}${name}${tag("indIEDest", "9")}</dest>`;
}

/**
 * Constrói o XML NÃO ASSINADO da NFC-e no leiaute 4.00.
 * Lança erro com prefixo NFCE_LAYOUT_ para entradas inválidas.
 */
export function buildNfceInfXml(input: NfceLayoutInput): { xml: string; accessKey: string } {
  const accessKey = onlyDigits(input.accessKey);
  if (!/^\d{44}$/.test(accessKey)) throw new Error("NFCE_LAYOUT_CHAVE_INVALIDA");
  if (!input.items.length) throw new Error("NFCE_LAYOUT_SEM_ITENS");
  if (!input.payments.length) throw new Error("NFCE_LAYOUT_SEM_PAGAMENTO");

  const cnpj = onlyDigits(input.issuer.cnpj);
  if (!/^\d{14}$/.test(cnpj)) throw new Error("NFCE_LAYOUT_CNPJ_INVALIDO");

  const homologation = input.environment === "HOMOLOGATION";
  const cUF = accessKey.slice(0, 2);
  const cDV = accessKey.slice(-1);
  const regimeCode = input.issuer.taxRegimeCode;
  const address = input.issuer.address;

  const ide =
    tag("cUF", cUF) +
    tag("cNF", input.numericCode) +
    tag("natOp", input.operationNature ?? "VENDA AO CONSUMIDOR") +
    tag("mod", "65") +
    tag("serie", input.series) +
    tag("nNF", input.number) +
    tag("dhEmi", formatDhEmi(input.issuedAt)) +
    tag("tpNF", "1") +
    tag("idDest", "1") +
    tag("cMunFG", onlyDigits(address.cityCode)) +
    tag("tpImp", "4") +
    tag("tpEmis", input.emissionType === "OFFLINE_CONTINGENCY" ? "9" : "1") +
    tag("cDV", cDV) +
    tag("tpAmb", homologation ? "2" : "1") +
    tag("finNFe", "1") +
    tag("indFinal", "1") +
    tag("indPres", "1") +
    tag("procEmi", "0") +
    tag("verProc", input.processVersion ?? "NEXUS-PHARMA-1.0");

  const enderEmit =
    tag("xLgr", address.street) +
    tag("nro", address.number) +
    (address.complement ? tag("xCpl", address.complement) : "") +
    tag("xBairro", address.district) +
    tag("cMun", onlyDigits(address.cityCode)) +
    tag("xMun", address.cityName) +
    tag("UF", address.state) +
    tag("CEP", onlyDigits(address.zipCode)) +
    tag("cPais", "1058") +
    tag("xPais", "BRASIL") +
    (address.phone ? tag("fone", onlyDigits(address.phone)) : "");

  const emit =
    tag("CNPJ", cnpj) +
    tag("xNome", input.issuer.legalName) +
    (input.issuer.tradeName ? tag("xFant", input.issuer.tradeName) : "") +
    `<enderEmit>${enderEmit}</enderEmit>` +
    tag("IE", onlyDigits(input.issuer.stateRegistration)) +
    tag("CRT", regimeCode);

  const dest = buildDest(input.customer ?? null, homologation);
  const det = input.items.map((item, index) => buildItem(item, index, regimeCode, homologation)).join("");
  const totals = buildTotals(input.items);
  const transp = "<transp>" + tag("modFrete", "9") + "</transp>";
  const pag = buildPayments(input.payments);
  const infAdic = input.additionalInfo ? `<infAdic>${tag("infCpl", input.additionalInfo)}</infAdic>` : "";

  const infNFe =
    `<infNFe versao="4.00" Id="NFe${accessKey}">` +
    `<ide>${ide}</ide>` +
    `<emit>${emit}</emit>` +
    dest +
    det +
    totals +
    transp +
    pag +
    infAdic +
    "</infNFe>";

  const xml = `<NFe xmlns="http://www.portalfiscal.inf.br/nfe">${infNFe}</NFe>`;
  return { xml, accessKey };
}

/**
 * Insere o grupo infNFeSupl (QR Code + urlChave) na posição correta: ENTRE
 * infNFe e Signature. Deve ser chamado APÓS a assinatura.
 */
export function injectNfceSupl(signedXml: string, supl: { qrCode: string; urlChave?: string | null }): string {
  const block =
    `<infNFeSupl>${tag("qrCode", supl.qrCode)}${supl.urlChave ? tag("urlChave", supl.urlChave) : ""}</infNFeSupl>`;
  if (signedXml.includes("<Signature")) {
    return signedXml.replace(/(<\/infNFe>)(\s*)(<Signature)/, `$1${block}$3`);
  }
  return signedXml.replace("</infNFe>", `</infNFe>${block}`);
}
